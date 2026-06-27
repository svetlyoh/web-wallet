#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bitcoin from 'bitcoinjs-lib';

const command = process.argv[2] || 'help';
const apiBase = (process.env.LINGRY_API_BASE_URL || 'http://localhost:8787').replace(/\/+$/, '');
const sugarApiBase = (process.env.SUGAR_API_BASE_URL || process.env.SUGAR_API_URL || 'https://api.sugar.wtf').replace(/\/+$/, '');
const keystorePath = process.env.LINGRY_KEYSTORE_PATH || path.join(process.cwd(), '.lingry-keystore.json');
const passphrase = process.env.LINGRY_WALLET_PASSPHRASE || '';
const defaultLanguage = process.env.LINGRY_DEFAULT_LANGUAGE_CODE || 'W';
const maxAutoCoinFee = Number(process.env.LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS || 0);
const coinFeeSatoshis = Number(process.env.LINGRY_COIN_FEE_SATOSHIS || process.env.LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS || 1000);
const requestTimeoutMs = Math.max(1000, Number(process.env.LINGRY_AGENT_REQUEST_TIMEOUT_MS || 180000));
const dailyPickLanguageCodes = new Set(
	String(process.env.LINGRY_DAILY_PICK_LANGUAGE_CODES || 'W,E')
		.split(/[,\s]+/)
		.map(code => code.trim().toUpperCase().charAt(0))
		.filter(Boolean)
);
const sugarNetwork = {
	messagePrefix: '\x19Sugarchain Signed Message:\n',
	bip32: { public: 0x0488b21e, private: 0x0488ade4 },
	bech32: 'sugar',
	pubKeyHash: 0x3F,
	scriptHash: 0x7D,
	wif: 0x80
};

function requirePassphrase() {
	if (!passphrase) {
		throw new Error('LINGRY_WALLET_PASSPHRASE is required.');
	}
}

function walletFromKey(key) {
	const payment = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork });
	return { address: payment.address, public_key: key.publicKey.toString('hex'), wif: key.toWIF() };
}

function keysFromWallet(wallet) {
	return bitcoin.ECPair.fromWIF(wallet.wif, sugarNetwork);
}

function derive(pass, salt) {
	return crypto.scryptSync(pass, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function saveWallet(wallet) {
	requirePassphrase();
	const salt = crypto.randomBytes(16);
	const iv = crypto.randomBytes(12);
	const key = derive(passphrase, salt);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(wallet.wif, 'utf8'), cipher.final()]);
	const store = {
		version: 1,
		kdf: 'scrypt',
		cipher: 'aes-256-gcm',
		address: wallet.address,
		public_key: wallet.public_key,
		salt: salt.toString('base64'),
		iv: iv.toString('base64'),
		tag: cipher.getAuthTag().toString('base64'),
		ciphertext: ciphertext.toString('base64')
	};
	fs.mkdirSync(path.dirname(keystorePath), { recursive: true });
	fs.writeFileSync(keystorePath, JSON.stringify(store, null, 2), { mode: 0o600 });
	return store;
}

function loadWallet() {
	requirePassphrase();
	const store = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
	const key = derive(passphrase, Buffer.from(store.salt, 'base64'));
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(store.iv, 'base64'));
	decipher.setAuthTag(Buffer.from(store.tag, 'base64'));
	const wif = Buffer.concat([decipher.update(Buffer.from(store.ciphertext, 'base64')), decipher.final()]).toString('utf8');
	return { ...store, wif };
}

async function fetchJsonWithTimeout(url, options = {}, label = 'Lingry request') {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error(`${label} timed out after ${requestTimeoutMs} ms.`)), requestTimeoutMs);
	try {
		const response = await fetch(url, { ...options, signal: controller.signal });
		const text = await response.text();
		let json = null;
		if (text) {
			try {
				json = JSON.parse(text);
			} catch (error) {
				throw new Error(`${label} returned HTTP ${response.status} with non-JSON response.`);
			}
		}
		if (!response.ok) {
			const apiMessage = json?.error?.message || json?.error || response.statusText || 'request failed';
			throw new Error(`${label} returned HTTP ${response.status}: ${apiMessage}`);
		}
		return json;
	} catch (error) {
		if (error.name === 'AbortError') {
			throw new Error(`${label} timed out after ${requestTimeoutMs} ms.`);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

async function api(pathname, options = {}) {
	const headers = new Headers(options.headers || {});
	headers.set('content-type', headers.get('content-type') || 'application/json');
	if (process.env.LINGRY_SESSION_TOKEN) {
		headers.set('authorization', 'Bearer ' + process.env.LINGRY_SESSION_TOKEN);
	}
	if (options.method && options.method !== 'GET' && !headers.has('idempotency-key')) {
		headers.set('idempotency-key', 'openclaw-' + crypto.randomUUID());
	}
	const json = await fetchJsonWithTimeout(apiBase + pathname, { ...options, headers }, `Lingry API ${pathname}`);
	if (!json?.ok) {
		throw new Error(json?.error?.message || `Lingry API ${pathname} failed.`);
	}
	return json.data;
}

async function legacyApi(pathname, options = {}) {
	const headers = new Headers(options.headers || {});
	if (options.body && !headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}
	const json = await fetchJsonWithTimeout(apiBase + pathname, { ...options, headers }, `Lingry ${pathname}`);
	if (json?.error) {
		throw new Error(json?.error?.message || json?.error || `Lingry ${pathname} failed.`);
	}
	return json;
}

async function sugarApi(pathname, options = {}) {
	const response = await fetch(sugarApiBase + pathname, options);
	const json = await response.json().catch(() => null);
	if (!response.ok || !json || json.error) {
		throw new Error(json?.error?.message || 'Sugarchain API request failed.');
	}
	return json.result;
}

function languageInstruction(languageCode) {
	if (languageCode === 'E') {
		return 'The selected Lingry language is British English. Return the Generated Word, Meaning, and Etymology Meaning in British English. The section headings must stay exactly as requested.';
	}
	return '';
}

function lingryPayload(record, languageCode = defaultLanguage) {
	const code = String(languageCode || 'W').trim().toUpperCase().charAt(0) || 'W';
	return `S${code}|${record.word}|${record.part_of_speech}|${record.meaning}`;
}

function getP2WPKHScript(pubkey) {
	return bitcoin.payments.p2wpkh({ pubkey, network: sugarNetwork });
}

function getP2SHScript(redeem) {
	return bitcoin.payments.p2sh({ redeem, network: sugarNetwork });
}

function getScriptType(script) {
	if (script[0] === bitcoin.opcodes.OP_0 && script[1] === 0x14) {
		return 'bech32';
	}
	if (script[0] === bitcoin.opcodes.OP_HASH160 && script[1] === 0x14 && script[22] === bitcoin.opcodes.OP_EQUAL) {
		return 'segwit';
	}
	if (script[0] === bitcoin.opcodes.OP_DUP && script[1] === bitcoin.opcodes.OP_HASH160 && script[2] === 0x14 && script[23] === bitcoin.opcodes.OP_EQUALVERIFY && script[24] === bitcoin.opcodes.OP_CHECKSIG) {
		return 'legacy';
	}
	return '';
}

function getUtxoScriptHex(utxo) {
	if (typeof utxo.script === 'string') {
		return utxo.script;
	}
	if (typeof utxo.scriptPubKey === 'string') {
		return utxo.scriptPubKey;
	}
	if (utxo.scriptPubKey && typeof utxo.scriptPubKey.hex === 'string') {
		return utxo.scriptPubKey.hex;
	}
	return '';
}

function chooseUtxos(utxos, feeSatoshis) {
	const chosen = [];
	let total = 0;
	for (const utxo of utxos) {
		chosen.push(utxo);
		total += Number(utxo.value || 0);
		if (total > feeSatoshis) {
			break;
		}
	}
	return { chosen, total };
}

function buildCoinTransaction(keys, address, payload, utxos, feeSatoshis) {
	const txb = new bitcoin.TransactionBuilder(sugarNetwork);
	const scripts = [];
	let totalValue = 0;
	const opReturnScript = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from(payload, 'utf8')]);
	txb.setVersion(2);
	txb.addOutput(opReturnScript, 0);
	for (const utxo of utxos) {
		const txid = utxo.txid;
		const index = utxo.index !== undefined ? utxo.index : utxo.vout;
		const scriptHex = getUtxoScriptHex(utxo);
		const script = Buffer.from(scriptHex, 'hex');
		const type = getScriptType(script);
		const value = Number(utxo.value || 0);
		totalValue += value;
		if (type === 'bech32') {
			const p2wpkh = getP2WPKHScript(keys.publicKey);
			txb.addInput(txid, index, null, p2wpkh.output);
		} else {
			txb.addInput(txid, index);
		}
		scripts.push({ type, value });
	}
	if (totalValue <= feeSatoshis) {
		throw new Error('Wallet has insufficient spendable Sugarchain for the coin fee.');
	}
	txb.addOutput(address, totalValue - feeSatoshis);
	for (let index = 0; index < scripts.length; index++) {
		switch (scripts[index].type) {
			case 'bech32':
				txb.sign(index, keys, null, null, scripts[index].value, null);
				break;
			case 'segwit': {
				const redeem = getP2WPKHScript(keys.publicKey);
				const p2sh = getP2SHScript(redeem);
				txb.sign(index, keys, p2sh.redeem.output, null, scripts[index].value, null);
				break;
			}
			case 'legacy':
				txb.sign(index, keys);
				break;
			default:
				throw new Error('Unsupported UTXO script type.');
		}
	}
	return txb.build().toHex();
}

async function broadcastCoin(record, languageCode) {
	if (maxAutoCoinFee > 0 && coinFeeSatoshis > maxAutoCoinFee) {
		throw new Error('Coin fee exceeds LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS.');
	}
	const wallet = loadWallet();
	const keys = keysFromWallet(wallet);
	const payload = lingryPayload(record, languageCode);
	const utxos = await sugarApi('/unspent/' + encodeURIComponent(wallet.address) + '?amount=' + encodeURIComponent(coinFeeSatoshis + 1));
	const selection = chooseUtxos(Array.isArray(utxos) ? utxos : [], coinFeeSatoshis);
	const raw = buildCoinTransaction(keys, wallet.address, payload, selection.chosen, coinFeeSatoshis);
	const response = await fetch(sugarApiBase + '/broadcast', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ raw })
	});
	const json = await response.json().catch(() => null);
	if (!response.ok || !json || json.error) {
		throw new Error(json?.error?.message || 'Sugarchain broadcast failed.');
	}
	return {
		txid: json.result,
		address: wallet.address,
		fee_satoshis: coinFeeSatoshis,
		payload
	};
}

function pickPopularWord(leaderboard) {
	const words = Array.isArray(leaderboard.words) ? leaderboard.words : [];
	const candidates = words.filter(word => {
		const code = String(word.language_code || '').toUpperCase();
		const payload = String(word.op_return_payload || '').toUpperCase();
		const payloadCode = payload.startsWith('S') ? payload.charAt(1) : '';
		return dailyPickLanguageCodes.has(code) || dailyPickLanguageCodes.has(payloadCode);
	});
	if (!candidates.length) {
		throw new Error(`No popular words were available for language codes ${Array.from(dailyPickLanguageCodes).join(', ')}.`);
	}
	return candidates[Math.floor(Math.random() * candidates.length)];
}

function printUserEvent(type, data) {
	console.log(JSON.stringify({
		type,
		message: data.message,
		data
	}, null, 2));
}

function installDailyCron() {
	const nodePath = process.execPath;
	const agentPath = path.resolve(process.argv[1]);
	const scriptDir = path.join(process.env.HOME || process.cwd(), '.lingry');
	const scriptPath = path.join(scriptDir, 'lingry-daily-popular-pick.sh');
	const logPath = path.join(scriptDir, 'lingry-daily-popular-pick.log');
	fs.mkdirSync(scriptDir, { recursive: true });
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		`export LINGRY_API_BASE_URL=${JSON.stringify(apiBase)}`,
		`export LINGRY_KEYSTORE_PATH=${JSON.stringify(keystorePath)}`,
		`export LINGRY_WALLET_PASSPHRASE=${JSON.stringify(passphrase)}`,
		`export LINGRY_DEFAULT_LANGUAGE_CODE=${JSON.stringify(defaultLanguage)}`,
		`export LINGRY_DAILY_PICK_LANGUAGE_CODES=${JSON.stringify(Array.from(dailyPickLanguageCodes).join(','))}`,
		`export LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS=${JSON.stringify(String(maxAutoCoinFee || ''))}`,
		`export LINGRY_MAX_AUTO_TIP_SATOSHIS=${JSON.stringify(process.env.LINGRY_MAX_AUTO_TIP_SATOSHIS || '')}`,
		`cd ${JSON.stringify(path.dirname(agentPath))}`,
		`${JSON.stringify(nodePath)} ${JSON.stringify(agentPath)} daily-popular-pick`
	];
	fs.writeFileSync(scriptPath, lines.join('\n') + '\n', { mode: 0o700 });
	const cronLine = `0 8 * * * ${scriptPath} >> ${logPath} 2>&1 # lingry-openclaw-daily-pick`;
	return { scriptPath, logPath, cronLine };
}

async function main() {
	if (command === 'create-wallet') {
		const wallet = walletFromKey(bitcoin.ECPair.makeRandom({ network: sugarNetwork }));
		const store = saveWallet(wallet);
		console.log(JSON.stringify({ address: store.address, public_key: store.public_key, keystore_path: keystorePath }, null, 2));
		return;
	}
	if (command === 'import-wallet') {
		const wif = process.argv[3] || '';
		if (!wif) {
			throw new Error('Pass the WIF as the third argument. It will be encrypted locally and not printed.');
		}
		const wallet = walletFromKey(bitcoin.ECPair.fromWIF(wif, sugarNetwork));
		const store = saveWallet(wallet);
		console.log(JSON.stringify({ address: store.address, public_key: store.public_key, keystore_path: keystorePath }, null, 2));
		return;
	}
	if (command === 'address') {
		const wallet = loadWallet();
		console.log(JSON.stringify({ address: wallet.address, public_key: wallet.public_key }, null, 2));
		return;
	}
	if (command === 'list-words') {
		const language = process.argv[3] || defaultLanguage;
		console.log(JSON.stringify(await api('/v1/words?language_code=' + encodeURIComponent(language), { method: 'GET' }), null, 2));
		return;
	}
	if (command === 'daily-popular-pick') {
		const leaderboard = await legacyApi('/api/leaderboard?limit=100', { method: 'GET' });
		const word = pickPopularWord(leaderboard);
		const prefix = String(word.op_return_payload || ('S' + (word.language_code || 'W') + '|')).slice(0, 2);
		printUserEvent('lingry.daily_popular_pick', {
			message: `Daily Lingry pick (${prefix}): ${word.word} - ${word.meaning}`,
			word,
			picked_at: new Date().toISOString()
		});
		return;
	}
	if (command === 'install-daily-cron') {
		const cron = installDailyCron();
		const child = await import('node:child_process');
		const existing = child.execSync('crontab -l 2>/dev/null || true', { encoding: 'utf8' });
		const filtered = existing.split(/\r?\n/).filter(line => line && !line.includes('# lingry-openclaw-daily-pick'));
		child.execSync('crontab -', { input: filtered.concat(cron.cronLine).join('\n') + '\n' });
		printUserEvent('lingry.cron_installed', {
			message: 'Installed Lingry daily popular SW/SE pick for 8:00 AM local time.',
			cron_line: cron.cronLine,
			script_path: cron.scriptPath,
			log_path: cron.logPath
		});
		return;
	}
	if (command === 'prompt-word' || command === 'prompt-and-coin') {
		const concept = process.argv.slice(3).join(' ').trim();
		if (!concept) {
			throw new Error('Provide a prompt, for example: prompt-word "a word for cozy late-night coding"');
		}
		const generated = await legacyApi('/api/invent-word-from-prompt', {
			method: 'POST',
			body: JSON.stringify({
				generation_mode: 'prompt',
				concept_prompt: concept,
				used_words: [],
				used_meanings: [],
				language_code: defaultLanguage,
				language_instruction: languageInstruction(defaultLanguage)
			})
		});
		if (command === 'prompt-word') {
			printUserEvent('lingry.word_prompted', {
				message: `Generated Lingry word candidate: ${generated.word} - ${generated.meaning}`,
				word: generated,
				language_code: defaultLanguage
			});
			return;
		}
		const coin = await broadcastCoin(generated, defaultLanguage);
		printUserEvent('lingry.word_coined', {
			message: `Coined ${generated.word} on Sugarchain as ${coin.txid}.`,
			word: generated,
			txid: coin.txid,
			address: coin.address,
			fee_satoshis: coin.fee_satoshis,
			op_return_payload: coin.payload
		});
		return;
	}
	if (command === 'create-word-draft') {
		const [, , , term, partOfSpeech, ...meaningParts] = process.argv;
		const meaning = meaningParts.join(' ');
		console.log(JSON.stringify(await api('/v1/words', {
			method: 'POST',
			body: JSON.stringify({ language_code: defaultLanguage, term, part_of_speech: partOfSpeech, meaning, source: 'openclaw' })
		}), null, 2));
		return;
	}
	console.log('Usage: lingry-agent create-wallet | import-wallet <wif> | address | list-words [language] | daily-popular-pick | install-daily-cron | prompt-word <prompt> | prompt-and-coin <prompt> | create-word-draft <term> <pos> <meaning>');
}

main().catch(error => {
	console.error(error.message || error);
	process.exitCode = 1;
});
