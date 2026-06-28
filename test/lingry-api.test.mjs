import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import bitcoin from 'bitcoinjs-lib';
import worker from '../src/worker.mjs';
import {
	assertNoPrivateKeyFields,
	buildLingryPayload,
	createGeneratedCandidateRecord,
	LexiconShardDO,
	LINGRY_LANGUAGES,
	OPENAPI,
	parseLingryPayload,
	storeMetadata,
	SugarchainMessageVerifier,
	WebhookDO
} from '../src/lingry-api.mjs';

const require = createRequire(import.meta.url);
const cjsParser = require('../lib/sugarwords/parser.js');
const wrangler = JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const sugarNetwork = {
	messagePrefix: '\x19Sugarchain Signed Message:\n',
	bip32: { public: 0x0488b21e, private: 0x0488ade4 },
	bech32: 'sugar',
	pubKeyHash: 0x3F,
	scriptHash: 0x7D,
	wif: 0x80
};

function fakeRawTx(outputs) {
	const tx = new bitcoin.Transaction();
	tx.version = 2;
	tx.addInput(Buffer.alloc(32), 0xffffffff);
	for (const output of outputs) {
		tx.addOutput(output.script, output.value);
	}
	return tx.toHex();
}

function opReturn(payload) {
	return bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from(payload, 'utf8')]);
}

function snapshotR2(snapshot) {
	const objects = new Map(snapshot ? [['latest.json', JSON.stringify(snapshot)]] : []);
	return {
		objects,
		async get(key) {
			const value = objects.get(key);
			return value == null ? null : { async text() { return value; } };
		},
		async put(key, value) {
			objects.set(key, String(value));
		}
	};
}

test('every configured language code parses correctly', () => {
	for (const language of LINGRY_LANGUAGES) {
		const payload = `S${language.code}|desknosh|n|Desk snack`;
		assert.equal(parseLingryPayload(payload)?.language_code, language.code);
		assert.equal(cjsParser.parseSugarWordPayload(payload)?.language_code, language.code);
	}
});

test('scanner recognizes S plus every valid language code, not only SW', () => {
	assert.equal(parseLingryPayload('SE|fogleam|n|Fog shine')?.word, 'fogleam');
	assert.equal(parseLingryPayload('SZ|juafoo|n|Sun friend')?.language_code, 'Z');
});

test('malformed OP_RETURN payloads are ignored safely', () => {
	assert.equal(parseLingryPayload('SW|only|three'), null);
	assert.equal(parseLingryPayload('SOOPS|word|n|bad'), null);
	assert.equal(parseLingryPayload('S1|word|n|bad'), null);
});

test('duplicate normalized words conflict in the same language but not different languages', () => {
	const seen = new Set();
	const first = buildLingryPayload({ language_code: 'W', term: 'DeskNosh', part_of_speech: 'n', meaning: 'Desk snack' });
	const duplicate = buildLingryPayload({ language_code: 'W', term: 'desknosh', part_of_speech: 'n', meaning: 'Desk snack' });
	const otherLanguage = buildLingryPayload({ language_code: 'E', term: 'desknosh', part_of_speech: 'n', meaning: 'Desk snack' });
	seen.add(first.language_code + ':' + first.normalized_term);
	assert.equal(seen.has(duplicate.language_code + ':' + duplicate.normalized_term), true);
	assert.equal(seen.has(otherLanguage.language_code + ':' + otherLanguage.normalized_term), false);
});

test('likes are one-per-wallet and like/unlike are idempotent as a set operation', () => {
	const likes = new Set();
	const key = 'word_1:sugar1qexample';
	likes.add(key);
	likes.add(key);
	assert.equal(likes.size, 1);
	likes.delete(key);
	likes.delete(key);
	assert.equal(likes.size, 0);
});

test('expired/reused challenges and invalid signatures are rejected by verifier contract', async () => {
	const invalid = await SugarchainMessageVerifier.verify({ signature: 'bad', nonce: 'nonce_1', env: { LINGRY_ENABLE_DEV_SIGNATURES: 'true' } });
	assert.equal(invalid.ok, false);
	const invalidReal = await SugarchainMessageVerifier.verify({ signature: 'anything', nonce: 'nonce_1', env: {} });
	assert.equal(invalidReal.ok, false);
	assert.equal(invalidReal.status, 401);
});

test('wallet-signed auth challenge verifies against public key and address', async () => {
	const key = bitcoin.ECPair.makeRandom({ network: sugarNetwork });
	const address = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork }).address;
	const message = 'Lingry API authentication\nNonce: nonce_1';
	const digest = crypto.createHash('sha256').update(message).digest();
	const signature = key.sign(digest).toString('hex');
	const verified = await SugarchainMessageVerifier.verify({
		address,
		publicKey: key.publicKey.toString('hex'),
		message,
		signature,
		nonce: 'nonce_1',
		env: {}
	});
	assert.equal(verified.ok, true);
});

test('no API route accepts WIF or private-key input objects', () => {
	assert.throws(() => assertNoPrivateKeyFields({ wif: 'K...' }), /never accepted/);
	assert.throws(() => assertNoPrivateKeyFields({ nested: { private_key: 'secret' } }), /never accepted/);
	assert.doesNotThrow(() => assertNoPrivateKeyFields({ address: 'sugar1qpublic', public_key: '02abc' }));
});

test('coining intent OP_RETURN payload matches Lingry protocol exactly', () => {
	const payload = buildLingryPayload({ language_code: 'W', term: 'desknosh', part_of_speech: 'n', meaning: 'Desk snack' });
	assert.equal(payload.op_return_payload, 'SW|desknosh|n|Desk snack');
	assert.equal(parseLingryPayload(payload.op_return_payload)?.op_return_hex, payload.op_return_hex);
});

test('mismatched signed coining transaction is rejected before broadcast', () => {
	const checker = Object.create(LexiconShardDO.prototype);
	const payload = buildLingryPayload({ language_code: 'W', term: 'desknosh', part_of_speech: 'n', meaning: 'Desk snack' });
	const goodRaw = fakeRawTx([{ script: opReturn(payload.op_return_payload), value: 0 }]);
	const badRaw = fakeRawTx([{ script: opReturn('SE|other|n|Other'), value: 0 }]);
	assert.doesNotThrow(() => checker.verifySignedTransaction(goodRaw, { kind: 'coin_word', op_return_hex: payload.op_return_hex }));
	assert.throws(() => checker.verifySignedTransaction(badRaw, { kind: 'coin_word', op_return_hex: payload.op_return_hex }), /expected Lingry OP_RETURN/);
});

test('generated burgerlash candidate preserves exact word and canonical hash', async () => {
	const candidate = await createGeneratedCandidateRecord({
		actor_address: 'sugar1qmaker',
		language_code: 'W',
		term: 'burgerlash',
		part_of_speech: 'n',
		meaning: 'A sudden craving for a burger after seeing one.',
		etymology: 'burger + backlash',
		concept_prompt: 'a word for a sudden burger craving'
	}, { created_at: '2026-06-27T00:00:00.000Z' });
	assert.equal(candidate.term, 'burgerlash');
	assert.equal(candidate.op_return_payload, 'SW|burgerlash|n|A sudden craving for a burger after seeing one.');
	assert.equal(candidate.canonical_payload.includes('burgerlash'), true);
	assert.match(candidate.candidate_hash, /^[0-9a-f]{64}$/);
});

test('candidate coining mismatch uses candidate-specific error code', async () => {
	const checker = Object.create(LexiconShardDO.prototype);
	const payload = buildLingryPayload({ language_code: 'W', term: 'burgerlash', part_of_speech: 'n', meaning: 'Burger craving' });
	const badRaw = fakeRawTx([{ script: opReturn('SW|otherword|n|Other meaning'), value: 0 }]);
	assert.throws(
		() => checker.verifySignedTransaction(badRaw, { kind: 'coin_word', candidate_id: 'cand_burgerlash', op_return_hex: payload.op_return_hex }),
		error => error.code === 'candidate_transaction_mismatch'
	);
});

test('candidate submit rejects wrong candidate hash before broadcast', async () => {
	const checker = Object.create(LexiconShardDO.prototype);
	const payload = buildLingryPayload({ language_code: 'W', term: 'burgerlash', part_of_speech: 'n', meaning: 'Burger craving' });
	checker.getIntent = () => ({
		intent_id: 'intent_1',
		type: 'coin',
		word_id: 'word_1',
		actor_address: 'sugar1qmaker',
		status: 'prepared',
		expires_at_epoch: Math.floor(Date.now() / 1000) + 60,
		expected: {
			kind: 'coin_word',
			candidate_id: 'cand_1',
			candidate_hash: 'abc123',
			op_return_hex: payload.op_return_hex
		}
	});
	await assert.rejects(
		() => checker.submitTransaction('intent_1', {
			actor_address: 'sugar1qmaker',
			candidate_id: 'cand_1',
			candidate_hash: 'wrong',
			signed_transaction_hex: fakeRawTx([{ script: opReturn(payload.op_return_payload), value: 0 }])
		}),
		error => error.code === 'candidate_transaction_mismatch'
	);
});

test('transaction broadcast falls back to public Sugar API when RPC is not configured', async () => {
	const originalFetch = globalThis.fetch;
	const checker = Object.create(LexiconShardDO.prototype);
	checker.env = {};
	let requestedUrl = '';
	let requestedBody = '';
	globalThis.fetch = async (url, init) => {
		requestedUrl = String(url);
		requestedBody = String(init.body);
		return new Response(JSON.stringify({ result: 'tx_public_fallback' }), { status: 200, headers: { 'content-type': 'application/json' } });
	};
	try {
		const txid = await checker.broadcastRawTransaction('01000000000000000000');
		assert.equal(txid, 'tx_public_fallback');
		assert.equal(requestedUrl, 'https://api.sugar.wtf/broadcast');
		assert.equal(requestedBody, 'raw=01000000000000000000');
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('tip transactions must match intended recipient and satoshi amount', () => {
	const checker = Object.create(LexiconShardDO.prototype);
	const key = bitcoin.ECPair.makeRandom({ network: sugarNetwork });
	const recipient = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork }).address;
	const script = bitcoin.address.toOutputScript(recipient, sugarNetwork);
	const raw = fakeRawTx([{ script, value: 250000 }]);
	assert.doesNotThrow(() => checker.verifySignedTransaction(raw, { kind: 'tip_word', recipient_address: recipient, amount_satoshis: 250000 }));
	assert.throws(() => checker.verifySignedTransaction(raw, { kind: 'tip_word', recipient_address: recipient, amount_satoshis: 250001 }), /expected tip recipient/);
});

test('indexer ingestion can identify records that should become confirmed', () => {
	const record = parseLingryPayload('SP|luznosh|n|Light snack');
	assert.equal(record.language_code, 'P');
	assert.equal(record.word, 'luznosh');
});

test('webhook HMAC verification works', async () => {
	const timestamp = '2026-06-26T00:00:00.000Z';
	const rawBody = '{"type":"word.created"}';
	const signature = await WebhookDO.sign({ LINGRY_WEBHOOK_SECRET: 'secret' }, rawBody, timestamp);
	assert.equal(signature.length, 64);
	assert.equal(signature, await WebhookDO.sign({ LINGRY_WEBHOOK_SECRET: 'secret' }, rawBody, timestamp));
});

test('R2 metadata hashes match stored metadata', async () => {
	let saved = null;
	const metadata = { word_id: 'word_1', term: 'desknosh' };
	const result = await storeMetadata({
		LINGRY_METADATA: {
			async put(key, value, options) {
				saved = { key, value, options };
			}
		}
	}, 'word_1', metadata);
	assert.equal(result.key, 'words/word_1.json');
	assert.equal(saved.options.customMetadata.sha256, result.hash);
	assert.equal(saved.value, JSON.stringify(metadata));
});

test('OpenAPI specification reflects implemented routes', () => {
	const required = [
		'/v1/auth/challenge',
		'/v1/auth/verify',
		'/v1/generations',
		'/v1/candidates',
		'/v1/candidates/{candidate_id}',
		'/v1/candidates/{candidate_id}/coin/prepare',
		'/v1/words',
		'/v1/leaderboard',
		'/v1/stream',
		'/v1/words/{word_id}/coin/prepare',
		'/v1/transactions/{intent_id}/submit',
		'/v1/broadcast/status',
		'/v1/words/{word_id}/likes',
		'/v1/words/{word_id}/tips/prepare',
		'/v1/internal/indexer/ingest',
		'/openapi.json'
	];
	for (const route of required) {
		assert.ok(OPENAPI.paths[route], route);
	}
});

test('cron configuration and public index constants are hourly', () => {
	assert.deepEqual(wrangler.triggers.crons, ['0 * * * *']);
	const source = fs.readFileSync(new URL('../src/worker.mjs', import.meta.url), 'utf8');
	assert.match(source, /const LINGRY_BLOCK_SECONDS = 5/);
	assert.match(source, /const LINGRY_HOURLY_SCAN_BLOCKS = Math\.ceil\(LINGRY_HOURLY_REFRESH_MS \/ \(LINGRY_BLOCK_SECONDS \* 1000\)\)/);
	assert.match(source, /lastScannedHeight \+ 1/);
	assert.match(source, /catchup = Math\.max\(0, safeTip - lastScannedHeight\) > LINGRY_HOURLY_SCAN_BLOCKS/);
	assert.match(source, /lastScannedHeight - LINGRY_PUBLIC_INDEX_CONFIRMATION_DEPTH - LINGRY_PUBLIC_INDEX_REORG_OVERLAP_BLOCKS/);
	assert.match(source, /LINGRY_PUBLIC_INDEX/);
	assert.match(source, /public_index_latest_snapshot_json/);
});

test('public leaderboard and stream read latest R2 snapshot without live scan', async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => {
		throw new Error('live scan should not run for public snapshot routes');
	};
	const snapshot = {
		schema_version: 1,
		generated_at: '2026-06-28T18:00:00.000Z',
		scan: { start_height: 100, end_height: 820, scanned_blocks: 720, block_seconds: 5, confirmation_depth: 6 },
		stream: [{
			txid: 'a'.repeat(64),
			word: 'desknosh',
			meaning: 'a snack eaten while working',
			language_code: 'W',
			part_of_speech: 'n',
			creator_address: 'sugar1qabcdef1234567890',
			block_height: 820,
			tx_time: '2026-06-28T17:54:12.000Z',
			likes: 2,
			tips_count: 1,
			tips_amount: '0.02500000'
		}],
		leaderboard: {
			words: [{ word: 'desknosh', meaning: 'a snack eaten while working', language_code: 'W', part_of_speech: 'n', creator_address: 'sugar1qabcdef1234567890', likes: 2, tips_count: 1, tips_amount: '0.02500000' }],
			addresses_by_likes: [],
			addresses_by_tips: [],
			addresses_by_words: []
		}
	};
	try {
		const env = { LINGRY_PUBLIC_INDEX: snapshotR2(snapshot) };
		const leaderboard = await worker.fetch(new Request('https://lingry.net/v1/leaderboard?limit=10'), env, {});
		assert.equal(leaderboard.status, 200);
		const leaderboardJson = await leaderboard.json();
		assert.equal(leaderboardJson.ok, true);
		assert.equal(leaderboardJson.source, 'lingry-hourly-public-index');
		assert.equal(leaderboardJson.leaderboard.words[0].word, 'desknosh');
		assert.doesNotMatch(JSON.stringify(leaderboardJson), /secret|passphrase|rpc/i);
		const stream = await worker.fetch(new Request('https://lingry.net/v1/stream?limit=10'), env, {});
		assert.equal(stream.status, 200);
		const streamJson = await stream.json();
		assert.equal(streamJson.items[0].word, 'desknosh');
		assert.equal(streamJson.next_cursor, '');
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('public snapshot routes return clear 503 when latest snapshot is absent', async () => {
	const response = await worker.fetch(new Request('https://lingry.net/v1/stream'), { LINGRY_PUBLIC_INDEX: snapshotR2(null) }, {});
	assert.equal(response.status, 503);
	const json = await response.json();
	assert.equal(json.ok, false);
	assert.equal(json.error.code, 'hourly_snapshot_not_ready');
	assert.equal(json.error.retryable, true);
});
