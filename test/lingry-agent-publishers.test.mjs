import test from 'node:test';
import assert from 'node:assert/strict';
import bitcoin from 'bitcoinjs-lib';
import worker from '../src/worker.mjs';
import {
	assertAgentCoinPolicy,
	bootstrapAgentPublisher,
	buildAgentCoinTransaction,
	coinLingryWord,
	decryptAgentPublisherWif,
	mintAgentAccessToken,
	validateAgentCoinTransaction,
	verifyAgentAccessToken,
	verifyAgentCredential
} from '../src/lingry-agent-publishers.mjs';
import { sugarNetwork } from '../src/lingry-grants.mjs';

class MemoryAgentDb {
	constructor() {
		this.publishers = [];
		this.coinOperations = [];
		this.fundingEvents = [];
	}
	prepare(query) {
		const db = this;
		return { bind(...bindings) {
			return {
				async first() {
					if (/FROM lingry_agent_publishers WHERE client_type/.test(query)) return db.publishers.find(row => row.client_type === bindings[0] && row.client_instance_id_hash === bindings[1]) || null;
					if (/FROM lingry_agent_publishers WHERE agent_id/.test(query)) return db.publishers.find(row => row.agent_id === bindings[0]) || null;
					if (/COUNT\(\*\).*FROM lingry_agent_publishers WHERE bootstrap_ip_hash/.test(query)) return { total: db.publishers.filter(row => row.bootstrap_ip_hash === bindings[0]).length };
					if (/FROM lingry_agent_funding_events/.test(query)) return db.fundingEvents.find(row => row.agent_id === bindings[0]) || null;
					if (/FROM lingry_agent_coin_operations WHERE agent_id = \? AND idempotency_key/.test(query)) return db.coinOperations.find(row => row.agent_id === bindings[0] && row.idempotency_key === bindings[1]) || null;
					if (/COUNT\(\*\).*lingry_agent_coin_operations/.test(query)) return { total: 0, fees: 0 };
					if (/SUM\(amount_satoshis\)/.test(query)) return { total: 0 };
					throw new Error(`Unhandled first query: ${query}`);
				},
				async run() {
					if (/INSERT INTO lingry_agent_publishers/.test(query)) {
						if (db.publishers.some(row => row.publisher_address === bindings[3] || (row.client_type === bindings[1] && row.client_instance_id_hash === bindings[2]))) throw new Error('UNIQUE constraint failed');
						db.publishers.push({
							agent_id: bindings[0], client_type: bindings[1], client_instance_id_hash: bindings[2], publisher_address: bindings[3], publisher_public_key: bindings[4],
							encrypted_private_key: bindings[5], private_key_nonce: bindings[6], wrapped_dek: bindings[7], dek_nonce: bindings[8], key_encryption_version: bindings[9], credential_hash: bindings[10],
							bootstrap_ip_hash: bindings[11], status: 'active', funding_status: 'pending', created_at: bindings[12], updated_at: bindings[13], last_seen_at: bindings[14], last_coin_at: ''
						});
						return { success: true };
					}
					if (/UPDATE lingry_agent_publishers SET last_seen_at/.test(query)) {
						const row = db.publishers.find(item => item.agent_id === bindings[2]); if (row) { row.last_seen_at = bindings[0]; row.updated_at = bindings[1]; }
						return { success: true };
					}
					if (/UPDATE lingry_agent_publishers SET funding_status/.test(query)) {
						const row = db.publishers.find(item => item.agent_id === bindings[2]); if (row) row.funding_status = bindings[0]; return { success: true };
					}
					if (/INSERT INTO lingry_agent_coin_operations/.test(query)) {
						db.coinOperations.push({ operation_id: bindings[0], agent_id: bindings[1], candidate_id: bindings[2], idempotency_key: bindings[3], status: bindings[4], fee_satoshis: bindings[5], txid: '', response_json: '', created_at: bindings[6], updated_at: bindings[7] });
						return { success: true };
					}
					if (/UPDATE lingry_agent_coin_operations SET status = \?, txid/.test(query)) {
						const row = db.coinOperations.find(item => item.operation_id === bindings[4]); Object.assign(row, { status: bindings[0], txid: bindings[1], response_json: bindings[2], updated_at: bindings[3] }); return { success: true };
					}
					if (/UPDATE lingry_agent_coin_operations SET status = \?, updated_at/.test(query)) {
						const row = db.coinOperations.find(item => item.operation_id === bindings[2]); if (row) row.status = bindings[0]; return { success: true };
					}
					if (/UPDATE lingry_agent_publishers SET last_coin_at/.test(query)) return { success: true };
					throw new Error(`Unhandled run query: ${query}`);
				}
			};
		} };
	}
}

function env() {
	return {
		LINGRY_DB: new MemoryAgentDb(),
		LINGRY_AGENT_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
		LINGRY_AGENT_CREDENTIAL_PEPPER: 'test-only-agent-pepper-with-high-entropy',
		LINGRY_SESSION_SECRET: 'test-only-session-secret-with-high-entropy',
		LINGRY_AGENT_FUNDING_ENABLED: 'false'
	};
}

function credential(id, secret = 's'.repeat(43)) {
	return { client_type: 'openclaw', client_instance_id: id.padEnd(24, '_'), agent_secret: secret };
}

test('two OpenClaw client identities receive distinct Agent Publisher addresses', async () => {
	const testEnv = env();
	const a = await bootstrapAgentPublisher(testEnv, credential('workspace-a'), { fund: false });
	const b = await bootstrapAgentPublisher(testEnv, credential('workspace-b'), { fund: false });
	assert.notEqual(a.publisher.agent_id, b.publisher.agent_id);
	assert.notEqual(a.publisher.publisher_address, b.publisher.publisher_address);
	assert.match(a.publisher.publisher_address, /^sugar1/);
});

test('reconnecting the same valid bot returns the original address without a second key', async () => {
	const testEnv = env();
	const first = await bootstrapAgentPublisher(testEnv, credential('workspace-a'), { fund: false });
	const second = await bootstrapAgentPublisher(testEnv, credential('workspace-a'), { fund: false });
	assert.equal(second.created, false);
	assert.equal(second.publisher.agent_id, first.publisher.agent_id);
	assert.equal(second.publisher.publisher_address, first.publisher.publisher_address);
	assert.equal(testEnv.LINGRY_DB.publishers.length, 1);
});

test('credentials are hashed, wrong secrets fail, and API-safe identity excludes secrets', async () => {
	const testEnv = env();
	const input = credential('workspace-a');
	const result = await bootstrapAgentPublisher(testEnv, input, { fund: false });
	const stored = testEnv.LINGRY_DB.publishers[0];
	assert.notEqual(stored.credential_hash, input.agent_secret);
	assert.doesNotMatch(JSON.stringify(result), /agent_secret|credential_hash|encrypted_private_key|wrapped_dek/i);
	await assert.rejects(() => verifyAgentCredential(testEnv, credential('workspace-a', 'x'.repeat(43))), error => error.code === 'invalid_agent_credential');
});

test('Agent Publisher WIF is envelope encrypted and never stored in plaintext', async () => {
	const testEnv = env();
	await bootstrapAgentPublisher(testEnv, credential('workspace-a'), { fund: false });
	const stored = testEnv.LINGRY_DB.publishers[0];
	const plaintext = await decryptAgentPublisherWif(testEnv, stored);
	assert.match(plaintext, /^[KL5]/);
	assert.notEqual(stored.encrypted_private_key, plaintext);
	assert.equal(JSON.stringify(stored).includes(plaintext), false);
	assert.ok(stored.wrapped_dek && stored.private_key_nonce && stored.dek_nonce);
});

test('short-lived Agent Publisher token carries constrained scopes and authenticates its publisher', async () => {
	const testEnv = env();
	await bootstrapAgentPublisher(testEnv, credential('workspace-a'), { fund: false });
	const publisher = await verifyAgentCredential(testEnv, credential('workspace-a'));
	const minted = await mintAgentAccessToken(testEnv, publisher);
	const session = await verifyAgentAccessToken(testEnv, minted.access_token);
	assert.equal(session.agent_id, publisher.agent_id);
	assert.ok(session.scopes.includes('words:coin'));
	for (const forbidden of ['wallet:send', 'wallet:export', 'wallet:tip', 'wallet:sign', 'raw-transaction:sign']) assert.equal(session.scopes.includes(forbidden), false);
});

test('Agent Publisher API bootstrap is idempotent and returns no blockchain secret', async () => {
	const testEnv = env();
	const body = credential('route-workspace');
	const request = () => new Request('https://lingry.net/v1/agents/bootstrap', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'boot-1' }, body: JSON.stringify(body) });
	const first = await worker.fetch(request(), testEnv, {});
	const second = await worker.fetch(request(), testEnv, {});
	assert.equal(first.status, 201);
	assert.equal(second.status, 200);
	const one = await first.json(); const two = await second.json();
	assert.equal(one.data.publisher_address, two.data.publisher_address);
	assert.doesNotMatch(JSON.stringify(one), /private_key|\bwif\b|mnemonic|seed|agent_secret/i);
});

test('canonical Agent Publisher transaction has one exact OP_RETURN and change to itself', () => {
	const key = bitcoin.ECPair.makeRandom({ network: sugarNetwork });
	const address = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork }).address;
	const script = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork }).output.toString('hex');
	const utxos = [{ txid: '11'.repeat(32), vout: 0, script, value: 5000 }];
	const payload = 'SW|desknosh|n|Desk snack';
	const raw = buildAgentCoinTransaction(key, address, payload, utxos, 1000);
	const checked = validateAgentCoinTransaction(raw, address, payload, utxos, 2000);
	assert.equal(checked.fee_satoshis, 1000);
	assert.equal(checked.transaction.outs.length, 2);
	const otherKey = bitcoin.ECPair.makeRandom({ network: sugarNetwork });
	const otherScript = bitcoin.payments.p2wpkh({ pubkey: otherKey.publicKey, network: sugarNetwork }).output.toString('hex');
	assert.throws(() => buildAgentCoinTransaction(key, address, payload, [{ ...utxos[0], script: otherScript }], 1000), error => error.code === 'agent_transaction_policy_violation');
	assert.throws(() => validateAgentCoinTransaction(raw, bitcoin.payments.p2wpkh({ pubkey: bitcoin.ECPair.makeRandom({ network: sugarNetwork }).publicKey, network: sugarNetwork }).address, payload, utxos, 2000), error => error.code === 'agent_transaction_policy_violation');
	assert.throws(() => validateAgentCoinTransaction(raw, address, payload, utxos, 500), error => error.code === 'agent_fee_limit_exceeded');
});

test('autonomous coining policy rejects excessive rate, fee spend, and outstanding operations', () => {
	assert.throws(() => assertAgentCoinPolicy({ hour_count: 6 }, {}, 1000), error => error.code === 'agent_coin_rate_limited' && error.status === 429);
	assert.throws(() => assertAgentCoinPolicy({ day_fees: 19500 }, {}, 1000), error => error.code === 'agent_fee_budget_exceeded');
	assert.throws(() => assertAgentCoinPolicy({ pending_count: 3 }, {}, 1000), error => error.code === 'agent_outstanding_limit_reached');
});

test('agent coin API rejects arbitrary outputs and returns a completed idempotent result unchanged', async () => {
	const testEnv = env();
	const publisher = { agent_id: 'agt_test', publisher_address: 'sugar1qpublisher' };
	const session = { agent_id: publisher.agent_id, address: publisher.publisher_address, publisher };
	await assert.rejects(
		() => coinLingryWord(testEnv, session, { candidate_id: 'cand_test', idempotency_key: 'idem-1', recipient_address: 'sugar1qexternal' }, async () => { throw new Error('must not reach signer'); }),
		error => error.code === 'agent_transaction_policy_violation'
	);
	const completed = { candidate_id: 'cand_test', publisher_address: publisher.publisher_address, txid: 'd'.repeat(64), status: 'pending' };
	testEnv.LINGRY_DB.coinOperations.push({ agent_id: publisher.agent_id, idempotency_key: 'idem-2', status: 'broadcasted', response_json: JSON.stringify(completed) });
	const replay = await coinLingryWord(testEnv, session, { candidate_id: 'cand_test', idempotency_key: 'idem-2' }, async () => { throw new Error('must not broadcast twice'); });
	assert.deepEqual(replay, completed);
});

test('coinLingryWord decrypts the dedicated publisher key, signs the canonical candidate, and attributes change to that publisher', async () => {
	const testEnv = env();
	await bootstrapAgentPublisher(testEnv, credential('workspace-signer'), { fund: false });
	const publisher = testEnv.LINGRY_DB.publishers[0];
	const session = { agent_id: publisher.agent_id, address: publisher.publisher_address, publisher };
	const script = bitcoin.address.toOutputScript(publisher.publisher_address, sugarNetwork).toString('hex');
	const utxos = [{ txid: '22'.repeat(32), vout: 1, script, value: 5000 }];
	const candidate = { candidate_id: 'cand_signed', actor_address: publisher.publisher_address, language_code: 'W', candidate_hash: 'e'.repeat(64), term: 'desknosh', meaning: 'Desk snack', op_return_payload: 'SW|desknosh|n|Desk snack' };
	const originalFetch = globalThis.fetch;
	let submittedRaw = '';
	globalThis.fetch = async url => {
		assert.match(String(url), /\/unspent\//);
		return Response.json({ result: utxos });
	};
	try {
		const result = await coinLingryWord(testEnv, session, { candidate_id: candidate.candidate_id, language_code: 'W', idempotency_key: 'sign-once' }, async (operation, input) => {
			if (operation === 'get-candidate') return { candidate };
			if (operation === 'prepare-candidate') return { intent_id: 'intent_signed' };
			if (operation === 'submit-transaction') {
				submittedRaw = input.signed_transaction_hex;
				validateAgentCoinTransaction(submittedRaw, publisher.publisher_address, candidate.op_return_payload, utxos, 2000);
				return { transaction: { txid: 'f'.repeat(64), status: 'pending' } };
			}
			throw new Error('unexpected operation');
		});
		assert.equal(result.publisher_address, publisher.publisher_address);
		assert.equal(result.txid, 'f'.repeat(64));
		assert.ok(submittedRaw.length > 100);
		assert.equal(testEnv.LINGRY_DB.coinOperations[0].status, 'broadcasted');
	} finally {
		globalThis.fetch = originalFetch;
	}
});
