import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, {
	derivePublicIndexCheckpoint,
	fetchSugarBlockBatch,
	publicIndexRewindHeight,
	scanSugarBlockRange
} from '../src/worker.mjs';
import { parseLingryPayload } from '../src/lingry-api.mjs';
import { parseSugarWordPayload } from '../src/lingry-protocol.mjs';

function block(height) {
	return { height, hash: 'hash-' + height, tx: ['coinbase-' + height] };
}

function range(start, end) {
	return Array.from({ length: end - start + 1 }, (_, index) => block(start + index));
}

test('complete range advances the contiguous checkpoint to its final block', async () => {
	const result = await scanSugarBlockRange(100, 199, {
		initialCheckpoint: { height: 99, hash: 'hash-99' },
		blockFetchOptions: { fetchRange: async () => range(100, 199) }
	});
	assert.equal(result.complete, true);
	assert.deepEqual(result.checkpoint, { height: 199, hash: 'hash-199' });
	assert.equal(result.summary.scanned_blocks, 100);
});

test('failed range uses per-height fallback and can still complete contiguously', async () => {
	const result = await fetchSugarBlockBatch(100, 199, true, {
		fetchRange: async () => { throw new Error('range unavailable'); },
		fetchHeight: async height => block(height)
	});
	assert.equal(result.complete, true);
	assert.equal(result.fallbackUsed, true);
	assert.equal(result.blocks.length, 100);
});

test('unresolved height stops the scan and never advances through later blocks', async () => {
	const result = await scanSugarBlockRange(100, 199, {
		initialCheckpoint: { height: 99, hash: 'hash-99' },
		blockFetchOptions: {
			fetchRange: async () => { throw new Error('range unavailable'); },
			fetchHeight: async height => {
				if (height === 143) throw new Error('height unavailable');
				return block(height);
			}
		}
	});
	assert.equal(result.complete, false);
	assert.deepEqual(result.checkpoint, { height: 142, hash: 'hash-142' });
	assert.equal(result.summary.failed_height, 143);
});

test('partial range response cannot be checkpointed past its first missing height', async () => {
	const result = await scanSugarBlockRange(100, 199, {
		initialCheckpoint: { height: 99, hash: 'hash-99' },
		blockFetchOptions: {
			fetchRange: async () => range(100, 150),
			fetchHeight: async height => {
				if (height === 151) throw new Error('missing height');
				return block(height);
			}
		}
	});
	assert.equal(result.complete, false);
	assert.equal(result.checkpoint.height, 150);
});

test('empty range response is not a successful scan', async () => {
	const result = await scanSugarBlockRange(100, 199, {
		initialCheckpoint: { height: 99, hash: 'hash-99' },
		blockFetchOptions: {
			fetchRange: async () => [],
			fetchHeight: async height => {
				if (height === 100) throw new Error('missing height');
				return block(height);
			}
		}
	});
	assert.equal(result.complete, false);
	assert.equal(result.checkpoint.height, 99);
});

test('snapshot checkpoint derives from contiguous success, not requested end height', () => {
	const checkpoint = derivePublicIndexCheckpoint(null, {
		summary: { end_height: 1000 },
		checkpoint: { height: 925, hash: 'hash-925' }
	}, 1000);
	assert.equal(checkpoint.last_scanned_height, 925);
	assert.equal(checkpoint.safe_tip_height, 1000);
});

test('reorg rewind includes confirmation depth and overlap before rescanning', () => {
	assert.equal(publicIndexRewindHeight(43000000), 42999982);
});

test('scheduled refresh logs a sanitized failure and rejects waitUntil', async () => {
	let scheduledPromise;
	const originalError = console.error;
	const logs = [];
	console.error = message => logs.push(String(message));
	try {
		await worker.scheduled({}, {}, { waitUntil(promise) { scheduledPromise = promise; } });
		await assert.rejects(scheduledPromise, /database is not configured/);
		assert.match(logs.join('\n'), /refresh_failed/);
		assert.doesNotMatch(logs.join('\n'), /authorization|private.key|session.token/i);
	} finally {
		console.error = originalError;
	}
});

test('Worker, API, and external indexer share parser acceptance and normalization', async () => {
	const { parsePayload } = await import('../scripts/sugarchain-indexer.ts');
	const fixtures = [
		['SW|desknosh|n|Desk snack', true],
		['SW|desknosh|n|Desk snack|h', true],
		['SW|desknosh|n|Desk snack|desk+nosh|k', true],
		['S1|desknosh|n|Desk snack', false],
		['SW|x|n|Too short', false],
		['SW|desknosh|noun|Bad part|roots|k', false],
		['SW|desknosh|n|Bad etymology|roots|z', false],
		['SW|desknosh|n|' + 'x'.repeat(141), false]
	];
	for (const [payload, accepted] of fixtures) {
		const shared = parseSugarWordPayload(payload);
		const api = parseLingryPayload(payload);
		const indexer = parsePayload(payload);
		assert.equal(Boolean(shared), accepted, payload);
		assert.deepEqual(api, shared, payload);
		assert.deepEqual(indexer, shared, payload);
	}
	const workerSource = fs.readFileSync(new URL('../src/worker.mjs', import.meta.url), 'utf8');
	assert.match(workerSource, /import \{ parseSugarWordPayload \} from '\.\/lingry-protocol\.mjs'/);
});

test('trusted indexer persistence is idempotent by transaction id', async () => {
	const rows = new Map();
	const env = {
		INTERNAL_INDEXER_SECRET: 'test-secret',
		LINGRY_LEXICON: {
			idFromName(name) { return name; },
			get() {
				return { fetch: async () => new Response(JSON.stringify({ ok: true, data: { indexed: 1 } }), { status: 200 }) };
			}
		},
		LINGRY_DB: {
			prepare(sql) {
				return { bind(...values) { return { sql, values }; } };
			},
			async batch(statements) {
				for (const statement of statements) rows.set(statement.values[0], statement.values);
			}
		}
	};
	const body = { records: [{ txid: 'a'.repeat(64), block_height: 100, block_hash: 'hash-100', timestamp: '2026-08-05T00:00:00.000Z', op_return_payload: 'SW|desknosh|n|Desk snack' }] };
	for (let attempt = 0; attempt < 2; attempt++) {
		const response = await worker.fetch(new Request('https://lingry.net/v1/internal/indexer/ingest', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'idempotency-key': 'repair-100', 'x-lingry-indexer-secret': 'test-secret' },
			body: JSON.stringify(body)
		}), env, {});
		assert.equal(response.status, 200);
	}
	assert.equal(rows.size, 1);
});

test('index health compares a legacy snapshot checkpoint with the live safe tip', async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async url => {
		if (String(url).includes('/info')) {
			return new Response(JSON.stringify({ result: { blocks: 200 } }), { status: 200 });
		}
		throw new Error('unexpected request');
	};
	try {
		const snapshot = {
			schema_version: 1,
			generated_at: new Date().toISOString(),
			checkpoint: { last_scanned_height: 150, last_scanned_block_hash: 'hash-150', safe_tip_height: 150 }
		};
		const env = {
			LINGRY_PUBLIC_INDEX: {
				async get() { return { async text() { return JSON.stringify(snapshot); } }; },
				async put() {}
			}
		};
		const response = await worker.fetch(new Request('https://lingry.net/v1/index-health'), env, {});
		const json = await response.json();
		assert.equal(json.status, 'catching_up');
		assert.equal(json.last_scanned_height, 150);
		assert.equal(json.safe_tip_height, 194);
		assert.equal(json.blocks_behind, 44);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
