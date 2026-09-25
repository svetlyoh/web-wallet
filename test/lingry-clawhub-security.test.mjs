import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import bitcoin from 'bitcoinjs-lib';
import worker from '../src/worker.mjs';
import { createClawhubCandidate, handleLingryV1Request, LexiconShardDO } from '../src/lingry-api.mjs';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* Node 18 lacks the test-only SQLite adapter. */ }

const sugarNetwork = {
	messagePrefix: '\x19Sugarchain Signed Message:\n',
	bip32: { public: 0x0488b21e, private: 0x0488ade4 },
	bech32: 'sugar', pubKeyHash: 0x3F, scriptHash: 0x7D, wif: 0x80
};

function testEnvironment() {
	const agentDb = new DatabaseSync(':memory:');
	agentDb.exec(fs.readFileSync(new URL('../migrations/0007_lingry_agent_publishers.sql', import.meta.url), 'utf8'));
	const lexiconDb = new DatabaseSync(':memory:');
	const storage = {
		sql: {
			exec(query, ...bindings) {
			const statement = lexiconDb.prepare(query);
			return /^\s*(?:SELECT|PRAGMA)\b/i.test(query) ? statement.all(...bindings) : (statement.run(...bindings), []);
			}
		}
	};
	const lexicon = new LexiconShardDO({ storage }, { LINGRY_MOCK_BROADCAST_TXID: 'f'.repeat(64) });
	const env = {
		LINGRY_DB: {
			prepare(query) {
				return { bind(...bindings) {
					const statement = agentDb.prepare(query);
					return { first: async () => statement.get(...bindings) || null, run: async () => statement.run(...bindings) };
				} };
			}
		},
		LINGRY_LEXICON: {
			idFromName: name => name,
			get: () => ({ fetch: (url, options) => lexicon.fetch(new Request(url, options)) })
		},
		LINGRY_AGENT_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
		LINGRY_AGENT_CREDENTIAL_PEPPER: 'test-only-server-pepper-with-high-entropy',
		LINGRY_AGENT_FUNDING_ENABLED: 'false'
	};
	return { env, agentDb, lexiconDb };
}

test('public OpenClaw generation runs on the server and creates no publisher', { skip: !DatabaseSync }, async () => {
	const { env, agentDb, lexiconDb } = testEnvironment();
	env.MINIMAX_API_KEY = 'test-only-key';
	const originalFetch = globalThis.fetch;
	let modelCalls = 0;
	globalThis.fetch = async (url, options) => {
		assert.equal(String(url), 'https://api.minimax.io/v1/chat/completions');
		assert.equal(options.method, 'POST');
		modelCalls++;
		return Response.json({ choices: [{ message: { content: 'Generated Word\nairlilt\nPart of Speech\nn\nMeaning\nA gentle desk breeze.\nEtymology Meaning\nair and lilt\nNewness Confidence\n0.92' } }] });
	};
	try {
		const response = await worker.fetch(new Request('https://lingry.net/v1/openclaw/generations', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ concept_prompt: 'a gentle breeze by a desk', language_code: 'W' })
		}), env, {});
		assert.equal(response.status, 201, await response.clone().text());
		const candidate = (await response.json()).data.candidate;
		assert.match(candidate.candidate_id, /^cand_W[a-f0-9]{32}$/);
		assert.equal(candidate.term, 'airlilt');
		assert.equal(candidate.meaning, 'A gentle desk breeze.');
		assert.equal(modelCalls, 1);
		assert.equal(agentDb.prepare('SELECT COUNT(*) AS count FROM lingry_agent_publishers').get().count, 0);
		assert.equal(lexiconDb.prepare('SELECT status FROM generated_candidates WHERE candidate_id = ?').get(candidate.candidate_id).status, 'available');
	} finally { globalThis.fetch = originalFetch; }
});

test('ClawHub candidate publication uses only stored canonical data and is idempotent', { skip: !DatabaseSync }, async () => {
	const { env, agentDb, lexiconDb } = testEnvironment();
	const candidate = await createClawhubCandidate(env, {
		word: 'airlilt', part_of_speech: 'n', meaning: 'A gentle desk breeze.', etymology_meaning: 'air and lilt'
	}, 'a gentle breeze by a desk', 'W');
	assert.match(candidate.candidate_id, /^cand_W[a-f0-9]{32}$/);
	assert.match(candidate.candidate_hash, /^[a-f0-9]{64}$/);
	assert.equal(agentDb.prepare('SELECT COUNT(*) AS count FROM lingry_agent_publishers').get().count, 0);
	const stored = lexiconDb.prepare('SELECT * FROM generated_candidates WHERE candidate_id = ?').get(candidate.candidate_id);
	assert.equal(stored.source, 'openclaw-server');
	assert.equal(stored.actor_address, '');
	assert.equal(stored.op_return_payload, 'SW|airlilt|n|A gentle desk breeze.');

	const coinUrl = `https://lingry.net/v1/openclaw/candidates/${candidate.candidate_id}/coin`;
	const invalidBody = await handleLingryV1Request(new Request(coinUrl, {
		method: 'POST', headers: { 'idempotency-key': 'reject-body' }, body: JSON.stringify({ op_return: 'arbitrary', outputs: [] })
	}), env, {});
	assert.equal(invalidBody.status, 400);
	assert.equal(agentDb.prepare('SELECT COUNT(*) AS count FROM lingry_agent_publishers').get().count, 0);

	const originalFetch = globalThis.fetch;
	let utxoRequests = 0;
	globalThis.fetch = async url => {
		const parsed = new URL(String(url));
		assert.match(parsed.pathname, /^\/unspent\/sugar1/);
		utxoRequests++;
		const address = decodeURIComponent(parsed.pathname.slice('/unspent/'.length));
		return Response.json({ result: [{ txid: '2'.repeat(64), vout: 1, script: bitcoin.address.toOutputScript(address, sugarNetwork).toString('hex'), value: 5000 }] });
	};
	try {
		const request = () => new Request(coinUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `clawhub-${candidate.candidate_id}` }, body: '{}' });
		const first = await handleLingryV1Request(request(), env, {});
		assert.equal(first.status, 200, await first.clone().text());
		const firstResult = (await first.json()).data;
		assert.equal(firstResult.candidate_id, candidate.candidate_id);
		assert.equal(firstResult.txid, 'f'.repeat(64));
		assert.match(firstResult.publisher_address, /^sugar1/);
		assert.equal(utxoRequests, 1);
		const storedAfter = lexiconDb.prepare('SELECT status, actor_address, txid, op_return_payload FROM generated_candidates WHERE candidate_id = ?').get(candidate.candidate_id);
		assert.equal(storedAfter.status, 'submitted');
		assert.equal(storedAfter.actor_address, firstResult.publisher_address);
		assert.equal(storedAfter.op_return_payload, stored.op_return_payload);
		assert.equal(storedAfter.txid, firstResult.txid);
		const second = await handleLingryV1Request(request(), env, {});
		assert.equal(second.status, 200);
		assert.equal((await second.json()).data.txid, firstResult.txid);
		assert.equal(utxoRequests, 1);
		assert.equal(agentDb.prepare('SELECT COUNT(*) AS count FROM lingry_agent_coin_operations').get().count, 1);
	} finally { globalThis.fetch = originalFetch; }
});

test('ClawHub publication rejects malformed IDs before storage or signing', async () => {
	const response = await handleLingryV1Request(new Request('https://lingry.net/v1/openclaw/candidates/cand_x%3Bwhoami/coin', {
		method: 'POST', headers: { 'idempotency-key': 'bad-id' }, body: '{}'
	}), {}, {});
	assert.equal(response.status, 400);
});

test('tampered or expired stored candidates cannot create a publisher or transaction', { skip: !DatabaseSync }, async () => {
	const { env, agentDb, lexiconDb } = testEnvironment();
	const generated = { word: 'airlilt', part_of_speech: 'n', meaning: 'A gentle desk breeze.', etymology_meaning: 'air and lilt' };
	const tampered = await createClawhubCandidate(env, generated, 'desk breeze', 'W');
	lexiconDb.prepare('UPDATE generated_candidates SET meaning = ? WHERE candidate_id = ?').run('Changed after generation', tampered.candidate_id);
	const expired = await createClawhubCandidate(env, generated, 'desk breeze again', 'W');
	lexiconDb.prepare('UPDATE generated_candidates SET expires_at = ? WHERE candidate_id = ?').run('2000-01-01T00:00:00Z', expired.candidate_id);
	for (const id of [tampered.candidate_id, expired.candidate_id]) {
		const response = await handleLingryV1Request(new Request(`https://lingry.net/v1/openclaw/candidates/${id}/coin`, {
			method: 'POST', headers: { 'idempotency-key': `clawhub-${id}` }, body: '{}'
		}), env, {});
		assert.equal(response.status, 409);
	}
	assert.equal(agentDb.prepare('SELECT COUNT(*) AS count FROM lingry_agent_publishers').get().count, 0);
	assert.equal(agentDb.prepare('SELECT COUNT(*) AS count FROM lingry_agent_coin_operations').get().count, 0);
});
