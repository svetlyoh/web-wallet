import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const start = html.indexOf('async function sugarWordsGetSpendableUtxos(');
const end = html.indexOf('function sugarWordsFindOnChainWordClaim(', start);
assert.ok(start > 0 && end > start, 'coin-specific UTXO lookup exists');
const lookupSource = html.slice(start, end).trim();

test('Coin It no longer labels wallet and broadcast failures as feed catch-up', () => {
	const coinFlow = html.slice(start, html.indexOf('function verifySugarWordsRecord(', end));
	assert.doesNotMatch(coinFlow, /The network is still catching up\. Check Stream/);
	assert.match(coinFlow, /The Sugarchain API reported:/);
});

function lookupWith(ajax, primary = 'https://api.sugar.wtf') {
	const context = {
		$: { ajax },
		getBackend: () => primary,
		getConfig: () => ({ api: 'https://api.sugar.wtf' }),
		globalData: { address: 'sugar1qtestaddress' },
		lingryDelay: async () => {}
	};
	return vm.runInNewContext('(' + lookupSource + ')', context);
}

test('Coin It uses a successful full unspent lookup first', async () => {
	const urls = [];
	const lookup = lookupWith(async options => {
		urls.push(options.url);
		return { result: [{ txid: 'a'.repeat(64), value: 2000 }] };
	});
	const result = await lookup(1000);
	assert.equal(result.result[0].value, 2000);
	assert.deepEqual(urls, ['https://api.sugar.wtf/unspent/sugar1qtestaddress']);
});

test('Coin It tries the amount-filtered lookup when the full lookup fails', async () => {
	const urls = [];
	const lookup = lookupWith(async options => {
		urls.push(options.url);
		return options.url.includes('?amount=1001')
			? { result: [{ txid: 'b'.repeat(64), value: 3000 }] }
			: { error: { message: 'Invalid Request' } };
	});
	const result = await lookup(1000);
	assert.equal(result.result[0].value, 3000);
	assert.deepEqual(urls, [
		'https://api.sugar.wtf/unspent/sugar1qtestaddress',
		'https://api.sugar.wtf/unspent/sugar1qtestaddress?amount=1001'
	]);
});

test('Coin It tries the second Sugarchain host after both primary lookup forms fail', async () => {
	const urls = [];
	const lookup = lookupWith(async options => {
		urls.push(options.url);
		return options.url.startsWith('https://api.sugar.wtf')
			? { error: { message: 'Invalid Request' } }
			: { result: [{ txid: 'c'.repeat(64), value: 3000 }] };
	});
	const result = await lookup(1000);
	assert.equal(result.result[0].value, 3000);
	assert.equal(urls.length, 3);
	assert.ok(urls[2].startsWith('https://api.sugarchain.org/unspent/'));
});

test('Coin It distinguishes an empty wallet from unavailable UTXO services', async () => {
	const empty = await lookupWith(async () => ({ result: [] }))(1000);
	assert.equal(empty.error.code, 'lingry_no_spendable_outputs');
	assert.match(empty.error.message, /No transaction was sent/);
	const unavailable = await lookupWith(async () => { throw new Error('offline'); })(1000);
	assert.equal(unavailable.error.code, 'lingry_utxo_service_unavailable');
	assert.match(unavailable.error.message, /No transaction was sent/);
});
