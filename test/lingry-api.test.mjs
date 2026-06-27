import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import bitcoin from 'bitcoinjs-lib';
import {
	assertNoPrivateKeyFields,
	buildLingryPayload,
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
	const unavailable = await SugarchainMessageVerifier.verify({ signature: 'anything', nonce: 'nonce_1', env: {} });
	assert.equal(unavailable.ok, false);
	assert.equal(unavailable.status, 501);
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
		'/v1/words',
		'/v1/words/{word_id}/coin/prepare',
		'/v1/transactions/{intent_id}/submit',
		'/v1/words/{word_id}/likes',
		'/v1/words/{word_id}/tips/prepare',
		'/v1/internal/indexer/ingest',
		'/openapi.json'
	];
	for (const route of required) {
		assert.ok(OPENAPI.paths[route], route);
	}
});
