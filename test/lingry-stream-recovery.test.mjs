import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, {
	derivePublicIndexCheckpoint,
	fetchSugarBlockBatch,
	publicStreamItem,
	publicIndexScheduleMode,
	publicIndexRewindHeight,
	refreshLingryPublicIndex,
	scanSugarBlockRange
} from '../src/worker.mjs';
import { parseLingryPayload } from '../src/lingry-api.mjs';
import { parseSugarWordPayload } from '../src/lingry-protocol.mjs';
import { createScanBudget } from '../src/lingry-scan-budget.mjs';
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* Test-only adapter requires recent Node. */ }

function indexEnvironment(height = 42900000) {
	const db = new DatabaseSync(':memory:');
	db.exec(fs.readFileSync(new URL('../migrations/0001_lingry_social.sql', import.meta.url), 'utf8'));
	db.exec(fs.readFileSync(new URL('../migrations/0005_lingry_public_index_meta.sql', import.meta.url), 'utf8'));
	db.prepare('INSERT INTO lingry_index_meta (key, value) VALUES (?, ?)').run('public_index_last_scanned_height', String(height));
	db.prepare('INSERT INTO lingry_index_meta (key, value) VALUES (?, ?)').run('public_index_last_scanned_block_hash', 'hash-' + height);
	const env = { LINGRY_DB: {
		prepare(sql) {
			const wrap = (bindings = []) => ({ bind: (...values) => wrap(values),
				first: async () => db.prepare(sql).get(...bindings) || null,
				all: async () => ({ results: db.prepare(sql).all(...bindings) }),
				run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...bindings).changes) } })
			});
			return wrap();
		},
		batch: async statements => Promise.all(statements.map(statement => statement.run()))
	} };
	return { env, db, get: key => db.prepare('SELECT value FROM lingry_index_meta WHERE key = ?').get(key)?.value };
}

function mockBlockProvider(tip, requested = []) {
	return async url => {
		const parsed = new URL(url); requested.push(parsed.pathname);
		if (parsed.pathname === '/info') return Response.json({ result: { blocks: tip + 6 } });
		if (parsed.pathname.startsWith('/height/')) return Response.json({ result: block(Number(parsed.pathname.split('/').pop())) });
		if (parsed.pathname.startsWith('/range/')) {
			const end = Number(parsed.pathname.split('/').pop());
			return Response.json({ result: range(end - Number(parsed.searchParams.get('offset')) + 1, end) });
		}
		throw new Error('Unexpected provider request');
	};
}

test('a bounded batch persists partial history and resumes the first unchecked block', { skip: !DatabaseSync }, async () => {
	const originalFetch = globalThis.fetch;
	const { env, db, get } = indexEnvironment();
	const requested = []; globalThis.fetch = mockBlockProvider(42903000, requested);
	try {
		const first = await refreshLingryPublicIndex(env, { mode: 'recovery', budget: createScanBudget(5) });
		assert.equal(first.snapshot.scan.yielded, true);
		assert.equal(get('public_index_last_scanned_height'), '42900300');
		assert.equal(get('public_index_last_error'), '');
		assert.equal(requested.length, 5);
		const second = await refreshLingryPublicIndex(env, { mode: 'recovery', budget: createScanBudget(5) });
		assert.equal(second.snapshot.scan.start_height, 42900301);
		assert.equal(get('public_index_last_scanned_height'), '42900600');
		assert.equal(db.prepare("SELECT COUNT(*) AS n FROM lingry_index_runs WHERE status = 'yielded' AND upstream_requests = 5").get().n, 2);
	} finally { globalThis.fetch = originalFetch; db.close(); }
});

test('recent batches preserve their own contiguous cursor without moving history', { skip: !DatabaseSync }, async () => {
	const originalFetch = globalThis.fetch;
	const { env, db, get } = indexEnvironment();
	globalThis.fetch = mockBlockProvider(42903000);
	try {
		const first = await refreshLingryPublicIndex(env, { mode: 'recent' });
		assert.equal(first.snapshot.scan.recent.last_scanned_height, 42901700);
		assert.equal(first.snapshot.scan.recent.blocks_behind, 1300);
		assert.equal(get('public_index_last_scanned_height'), '42900000');
		const second = await refreshLingryPublicIndex(env, { mode: 'recent' });
		assert.equal(second.snapshot.scan.recent.start_height, 42901701);
		assert.equal(get('public_index_recent_last_scanned_height'), '42902200');
		assert.equal(get('public_index_last_scanned_height'), '42900000');
	} finally { globalThis.fetch = originalFetch; db.close(); }
});

test('overlapping invocations cannot acquire the same index lease', { skip: !DatabaseSync }, async () => {
	const originalFetch = globalThis.fetch;
	const { env, db } = indexEnvironment();
	globalThis.fetch = mockBlockProvider(42903000);
	try {
		const runs = await Promise.all([refreshLingryPublicIndex(env, { mode: 'recovery' }), refreshLingryPublicIndex(env, { mode: 'recovery' })]);
		assert.equal(runs.filter(run => run.skipped).length, 1);
		assert.equal(db.prepare("SELECT COUNT(*) AS n FROM lingry_index_runs WHERE status = 'skipped'").get().n, 1);
	} finally { globalThis.fetch = originalFetch; db.close(); }
});

function block(height) {
	return { height, hash: 'hash-' + height, tx: ['coinbase-' + height] };
}

function range(start, end) {
	return Array.from({ length: end - start + 1 }, (_, index) => block(start + index));
}

test('minute schedule reserves every fifth run for recent coverage and supports old triggers during propagation', () => {
	assert.equal(publicIndexScheduleMode('5,20,35,50 * * * *'), 'recovery');
	assert.equal(publicIndexScheduleMode('0 * * * *'), 'recent');
	assert.equal(publicIndexScheduleMode(undefined), 'recent');
	assert.equal(publicIndexScheduleMode('* * * * *', Date.parse('2026-10-01T15:05:00Z')), 'recent');
	assert.equal(publicIndexScheduleMode('* * * * *', Date.parse('2026-10-01T15:06:00Z')), 'recovery');
});

test('request budget counts retries and stops without advancing past an unchecked transaction', async () => {
	const budget = createScanBudget(2);
	const results = await scanSugarBlockRange(100, 103, {
		initialCheckpoint: { height: 99, hash: 'hash-99' }, budget,
		blockFetchOptions: { fetchRange: async (start, end) => { budget.take(); return range(start, end).map(item => ({ ...item, tx: [item.tx[0], 'tx-' + item.height] })); } },
		indexTxid: async () => { budget.take(); return []; }
	});
	assert.equal(budget.used, 2);
	assert.equal(results.summary.yielded, true);
	assert.equal(results.checkpoint.height, 100);
	assert.equal(results.summary.failed_height, null);
	assert.deepEqual(results.summary.errors, []);
	const resumed = await scanSugarBlockRange(results.checkpoint.height + 1, 103, { initialCheckpoint: results.checkpoint, blockFetchOptions: { fetchRange: async (start, end) => range(start, end) } });
	assert.equal(resumed.checkpoint.height, 103);
});

test('time budget stops upstream work before starting the next request', () => {
	let now = 1000;
	const budget = createScanBudget(32, 50, () => now);
	budget.take(); now += 51;
	assert.throws(() => budget.take(), error => error.code === 'scan_budget_exhausted');
	assert.equal(budget.used, 1);
});

test('Workers-compatible manual redirects remain counted and use provider fallback', async () => {
	const originalFetch = globalThis.fetch;
	const budget = createScanBudget(2);
	const calls = [];
	globalThis.fetch = async (url, options) => {
		assert.equal(options.redirect, 'manual');
		calls.push(url);
		if (calls.length === 1) return new Response('', { status: 302, headers: { location: 'https://untrusted.example/' } });
		return Response.json({ result: range(100, 100) });
	};
	try {
		const result = await fetchSugarBlockBatch(100, 100, true, { budget });
		assert.equal(result.complete, true);
		assert.equal(budget.used, 2);
		assert.equal(calls.length, 2);
		assert.ok(calls.every(url => !url.includes('untrusted.example')));
	} finally { globalThis.fetch = originalFetch; }
});

test('a busy block finishes across budgets without repeating completed transaction lookups', async () => {
	const cache = new Map();
	const calls = [];
	const busy = { ...block(100), tx: ['coinbase', ...Array.from({ length: 64 }, (_, i) => 'tx-' + i)] };
	const scan = budget => scanSugarBlockRange(100, 100, {
		initialCheckpoint: { height: 99, hash: 'hash-99' }, budget,
		blockFetchOptions: { fetchRange: async () => { budget.take(); return [busy]; } },
		readBlockTransactions: async () => new Map(cache),
		saveBlockTransactions: async (_, results) => { for (const result of results) cache.set(result.txid, result.records); },
		clearBlockTransactions: async () => cache.clear(),
		indexTxid: async txid => { budget.take(); calls.push(txid); return []; }
	});
	assert.equal((await scan(createScanBudget())).checkpoint.height, 99);
	assert.equal(cache.size, 31);
	assert.equal((await scan(createScanBudget())).checkpoint.height, 99);
	assert.equal(cache.size, 62);
	const final = await scan(createScanBudget());
	assert.equal(final.complete, true);
	assert.equal(final.checkpoint.height, 100);
	assert.equal(cache.size, 0);
	assert.equal(calls.length, 64);
	assert.equal(new Set(calls).size, 64);
});

test('partial height fallback preserves completed blocks when its budget is exhausted', async () => {
	const budget = createScanBudget(5);
	const result = await scanSugarBlockRange(100, 104, {
		initialCheckpoint: { height: 99, hash: 'hash-99' }, budget,
		blockFetchOptions: { rangeAttempts: 1, heightAttempts: 1,
			fetchRange: async () => { budget.take(); return []; },
			fetchHeight: async height => { budget.take(); return block(height); }
		}
	});
	assert.equal(budget.used, 5);
	assert.equal(result.summary.yielded, true);
	assert.equal(result.checkpoint.height, 103);
	assert.equal(result.summary.failed_height, null);
});

test('complete range advances the contiguous checkpoint to its final block', async () => {
	const result = await scanSugarBlockRange(100, 199, {
		initialCheckpoint: { height: 99, hash: 'hash-99' },
		blockFetchOptions: { fetchRange: async () => range(100, 199) }
	});
	assert.equal(result.complete, true);
	assert.deepEqual(result.checkpoint, { height: 199, hash: 'hash-199' });
	assert.equal(result.summary.scanned_blocks, 100);
});

test('malformed upstream range is retried before falling back to individual heights', async () => {
	let attempts = 0;
	const result = await fetchSugarBlockBatch(100, 199, true, {
		fetchRange: async () => ++attempts === 1 ? [] : range(100, 199),
		fetchHeight: async () => { throw new Error('height fallback should not be needed'); },
		rangeAttempts: 2
	});
	assert.equal(attempts, 2);
	assert.equal(result.complete, true);
	assert.equal(result.fallbackUsed, false);
});

test('transient height error is retried without skipping its block', async () => {
	let attempts = 0;
	const result = await fetchSugarBlockBatch(100, 100, true, {
		fetchRange: async () => [],
		fetchHeight: async height => {
			if (++attempts === 1) throw new Error('temporary upstream failure');
			return block(height);
		},
		rangeAttempts: 1,
		heightAttempts: 2
	});
	assert.equal(result.complete, true);
	assert.equal(result.blocks[0].height, 100);
	assert.equal(attempts, 2);
});

test('failed 100-block range recovers through smaller verified ranges', async () => {
	const calls = [];
	const result = await fetchSugarBlockBatch(100, 199, true, {
		fetchRange: async (start, end) => {
			calls.push([start, end]);
			return end - start + 1 > 25 ? [] : range(start, end);
		},
		fetchHeight: async () => { throw new Error('individual lookup should not be needed'); },
		rangeAttempts: 1
	});
	assert.equal(result.complete, true);
	assert.equal(result.fallbackUsed, true);
	assert.equal(result.blocks.length, 100);
	assert.equal(calls.length, 5);
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

test('sparse social updates cannot erase verified OP_RETURN data', () => {
	const workerSource = fs.readFileSync(new URL('../src/worker.mjs', import.meta.url), 'utf8');
	assert.match(workerSource, /op_return_payload = CASE WHEN excluded\.op_return_payload != '' THEN excluded\.op_return_payload ELSE lingry_words\.op_return_payload END/);
	assert.match(workerSource, /op_return_hex = CASE WHEN excluded\.op_return_hex != '' THEN excluded\.op_return_hex ELSE lingry_words\.op_return_hex END/);
});

test('public stream snapshot carries the verified protocol payload needed by fresh browsers', () => {
	const item = publicStreamItem({
		txid: 'a'.repeat(64),
		word: 'desknosh',
		meaning: 'Desk snack',
		language_code: 'W',
		part_of_speech: 'n',
		op_return_payload: 'SW|desknosh|n|Desk snack',
		op_return_hex: '53577c6465736b6e6f73687c6e7c4465736b20736e61636b'
	});
	assert.equal(item.op_return_payload, 'SW|desknosh|n|Desk snack');
	assert.equal(item.verified_status, 'verified_on_chain');
	assert.equal(item.source, 'lingry-hourly-public-index');
});

test('browser requests immediate verified indexing after a successful coin broadcast', () => {
	const source = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
	assert.match(source, /wordExplorerApiGet\('\/v1\/stream\?limit=100'/);
	assert.match(source, /function indexCoinedSugarWord\(txid, attempt\)/);
	assert.match(source, /'\/api\/tx\/' \+ encodeURIComponent\(txid\) \+ '\/word'/);
	assert.match(source, /indexCoinedSugarWord\(txid, 0\)/);
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
			checkpoint: { last_scanned_height: 150, last_scanned_block_hash: 'hash-150', safe_tip_height: 150 },
			scan: { recent: { scanned_at: new Date().toISOString(), errors: [], blocks_behind: 0 } }
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
