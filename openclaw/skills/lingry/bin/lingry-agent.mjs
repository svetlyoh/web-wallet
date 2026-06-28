#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bitcoin from 'bitcoinjs-lib';

const command = process.argv[2] || 'status';
const apiBase = (process.env.LINGRY_API_BASE_URL || 'http://localhost:8787').replace(/\/+$/, '');
const sugarApiBase = (process.env.SUGAR_API_BASE_URL || process.env.SUGAR_API_URL || 'https://api.sugar.wtf').replace(/\/+$/, '');
const keystorePath = process.env.LINGRY_KEYSTORE_PATH || path.join(process.cwd(), '.lingry-keystore.json');
const statePath = process.env.LINGRY_AGENT_STATE_PATH || path.join(path.dirname(keystorePath), 'lingry-agent-state.json');
const passphrase = process.env.LINGRY_WALLET_PASSPHRASE || '';
const sessionToken = process.env.LINGRY_SESSION_TOKEN || '';
const defaultLanguage = process.env.LINGRY_DEFAULT_LANGUAGE_CODE || 'W';
const maxAutoCoinFee = Number(process.env.LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS || 0);
const coinFeeSatoshis = Number(process.env.LINGRY_COIN_FEE_SATOSHIS || process.env.LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS || 1000);
const requestTimeoutMs = Math.max(1000, Number(process.env.LINGRY_AGENT_REQUEST_TIMEOUT_MS || 180000));
const sugarNetwork = {
	messagePrefix: '\x19Sugarchain Signed Message:\n',
	bip32: { public: 0x0488b21e, private: 0x0488ade4 },
	bech32: 'sugar',
	pubKeyHash: 0x3F,
	scriptHash: 0x7D,
	wif: 0x80
};

function commandArgs() {
	return process.argv.slice(3).filter(arg => arg !== '--confirm-broadcast');
}

function requirePassphrase() {
	if (!passphrase) {
		throw new Error('LINGRY_WALLET_PASSPHRASE is required.');
	}
}

function requireSessionToken() {
	if (!sessionToken) {
		throw new Error('LINGRY_SESSION_TOKEN is required for this account-bound Lingry command. Obtain it through the deliberate Lingry browser/account session flow and set it only in your local OpenClaw environment.');
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

function loadAgentState() {
	try {
		return JSON.parse(fs.readFileSync(statePath, 'utf8'));
	} catch (error) {
		return {};
	}
}

function saveAgentState(update) {
	const current = loadAgentState();
	const next = { ...current, ...update, updated_at: new Date().toISOString() };
	fs.mkdirSync(path.dirname(statePath), { recursive: true });
	fs.writeFileSync(statePath, JSON.stringify(next, null, 2), { mode: 0o600 });
	return next;
}

function signGrantChallenge(keys, challengeText) {
	const digest = crypto.createHash('sha256').update(challengeText).digest();
	return keys.sign(digest).toString('hex');
}

async function claimStarterGrant(walletInput = null) {
	const wallet = walletInput || loadWallet();
	const keys = keysFromWallet(wallet);
	const installationId = crypto.createHash('sha256')
		.update(wallet.address + ':' + keystorePath)
		.digest('hex')
		.slice(0, 32);
	try {
		const challenge = await legacyApi('/api/wallet-grants/challenge', {
			method: 'POST',
			body: JSON.stringify({
				address: wallet.address,
				public_key: wallet.public_key,
				installation_id: installationId
			})
		});
		if (challenge.startup_grant?.status === 'broadcasted') {
			return challenge.startup_grant;
		}
		const signature = signGrantChallenge(keys, challenge.challenge);
		const claim = await legacyApi('/api/wallet-grants/claim', {
			method: 'POST',
			headers: {
				'idempotency-key': challenge.claim_id || crypto.randomUUID()
			},
			body: JSON.stringify({
				claim_id: challenge.claim_id,
				address: wallet.address,
				public_key: wallet.public_key,
				nonce: challenge.nonce,
				signature,
				installation_id: installationId
			})
		});
		return claim.startup_grant || {
			requested_amount_sugar: '0.025',
			status: 'pending_or_unavailable',
			safe_message: 'Wallet was created successfully. The first-funding grant could not be completed yet.'
		};
	} catch (error) {
		return {
			requested_amount_sugar: '0.025',
			status: 'pending_or_unavailable',
			safe_message: 'Wallet was created successfully. The first-funding grant could not be completed yet.'
		};
	}
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

async function fetchJsonProbe(url, options = {}, label = 'Lingry request') {
	try {
		const json = await fetchJsonWithTimeout(url, options, label);
		return { ok: true, status: 200, json };
	} catch (error) {
		const match = String(error.message || '').match(/HTTP\s+(\d+)/);
		return {
			ok: false,
			status: match ? Number(match[1]) : 0,
			safe_message: error.message || `${label} failed.`
		};
	}
}

async function api(pathname, options = {}) {
	const headers = new Headers(options.headers || {});
	headers.set('content-type', headers.get('content-type') || 'application/json');
	if (sessionToken) {
		headers.set('authorization', 'Bearer ' + sessionToken);
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

async function apiProbe(pathname, options = {}) {
	const headers = new Headers(options.headers || {});
	headers.set('content-type', headers.get('content-type') || 'application/json');
	if (sessionToken) {
		headers.set('authorization', 'Bearer ' + sessionToken);
	}
	if (options.method && options.method !== 'GET' && !headers.has('idempotency-key')) {
		headers.set('idempotency-key', 'openclaw-probe-' + crypto.randomUUID());
	}
	return fetchJsonProbe(apiBase + pathname, { ...options, headers }, `Lingry API ${pathname}`);
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
	const response = await fetchJsonWithTimeout(sugarApiBase + pathname, options, `Sugarchain API ${pathname}`);
	if (response?.error) {
		throw new Error(response.error?.message || response.error || 'Sugarchain API request failed.');
	}
	return response.result;
}

function decodeSessionTokenExpiry() {
	if (!sessionToken || !sessionToken.includes('.')) {
		return '';
	}
	try {
		const encoded = sessionToken.split('.')[0];
		const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
		const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
		return payload && payload.exp ? new Date(Number(payload.exp) * 1000).toISOString() : '';
	} catch (error) {
		return '';
	}
}

function safeProbeResult(probe, okWhenStatuses = []) {
	const statusOk = okWhenStatuses.includes(probe.status);
	return {
		ok: Boolean(probe.ok || statusOk),
		status: probe.status || (probe.ok ? 200 : 0),
		safe_message: probe.ok ? 'ok' : (probe.safe_message || 'request failed')
	};
}

async function getAuthStatus() {
	const expiry = decodeSessionTokenExpiry();
	if (!sessionToken) {
		return {
			token_configured: false,
			token_accepted: 'unknown',
			expires_at: expiry
		};
	}
	const me = await apiProbe('/v1/me', { method: 'GET' });
	if (me.ok && me.json?.ok) {
		return {
			token_configured: true,
			token_accepted: 'yes',
			expires_at: expiry,
			address: me.json.data?.address || '',
			scopes: Array.isArray(me.json.data?.scopes) ? me.json.data.scopes : []
		};
	}
	return {
		token_configured: true,
		token_accepted: me.status === 401 || me.status === 403 ? 'no' : 'unknown',
		expires_at: expiry,
		status: me.status || 0,
		safe_message: me.safe_message || 'Token check failed.'
	};
}

async function runDoctor() {
	const health = await apiProbe('/v1/healthz', { method: 'GET' });
	const publicWords = await apiProbe('/v1/words?language_code=' + encodeURIComponent(defaultLanguage) + '&limit=1', { method: 'GET' });
	const authStatus = await getAuthStatus();
	const generationProbe = sessionToken
		? await apiProbe('/v1/generations', {
			method: 'POST',
			body: JSON.stringify({ language_code: defaultLanguage, source: 'openclaw-auth-probe' })
		})
		: { ok: false, status: 0, safe_message: 'LINGRY_SESSION_TOKEN is not configured.' };
	const coinPrepareProbe = sessionToken
		? await apiProbe('/v1/candidates/__openclaw_auth_probe__/coin/prepare', {
			method: 'POST',
			body: JSON.stringify({ language_code: defaultLanguage, fee_satoshis: coinFeeSatoshis, utxos: [] })
		})
		: { ok: false, status: 0, safe_message: 'LINGRY_SESSION_TOKEN is not configured.' };
	const publicWordsData = publicWords.json?.data || {};
	console.log(JSON.stringify({
		ok: true,
		checks: {
			node_version: process.version,
			api_base_url: apiBase,
			keystore_path_configured: Boolean(keystorePath),
			passphrase_configured: Boolean(passphrase),
			session_token_configured: Boolean(sessionToken),
			default_language_code: defaultLanguage
		},
		api_health: safeProbeResult(health),
		public_list_words_access: {
			...safeProbeResult(publicWords),
			available: Boolean(publicWords.ok && publicWords.json?.ok),
			word_count_returned: Array.isArray(publicWordsData.words) ? publicWordsData.words.length : 0
		},
		auth_status: authStatus,
		authenticated_candidate_generation_access: {
			...safeProbeResult(generationProbe, [400]),
			probe_note: sessionToken ? 'Uses an intentionally incomplete request; HTTP 400 means authentication and scope checks were passed without creating a candidate.' : 'Not probed without a session token.'
		},
		authenticated_candidate_coin_preparation_access: {
			...safeProbeResult(coinPrepareProbe, [400, 404, 409]),
			probe_note: sessionToken ? 'Uses a non-existent candidate id; HTTP 400/404/409 after authentication means auth reached the coin-prepare route without creating a transaction.' : 'Not probed without a session token.'
		}
	}, null, 2));
}

function getWalletStatus() {
	if (!fs.existsSync(keystorePath)) {
		return { configured: false, address: '' };
	}
	if (!passphrase) {
		return { configured: true, address: '', safe_message: 'Keystore exists, but passphrase is not configured.' };
	}
	try {
		const wallet = loadWallet();
		return { configured: true, address: wallet.address || '' };
	} catch (error) {
		return { configured: true, address: '', safe_message: 'Wallet could not be opened with the configured passphrase.' };
	}
}

async function runStatus() {
	const state = loadAgentState();
	const health = await apiProbe('/v1/healthz', { method: 'GET' });
	const publicWords = await apiProbe('/v1/words?language_code=' + encodeURIComponent(defaultLanguage) + '&limit=5', { method: 'GET' });
	const publicWordsData = publicWords.json?.data || {};
	const lastCandidate = state.active_candidate_id ? {
		candidate_id: state.active_candidate_id,
		language_code: state.active_candidate_language_code || '',
		generation_id: state.active_generation_id || '',
		candidate_hash: state.active_candidate_hash || '',
		term: state.active_candidate_term || '',
		meaning: state.active_candidate_meaning || ''
	} : null;
	const lastCoin = state.last_coined_candidate_id || state.last_txid || state.last_transaction_intent_id ? {
		candidate_id: state.last_coined_candidate_id || '',
		intent_id: state.last_transaction_intent_id || '',
		txid: state.last_txid || '',
		updated_at: state.updated_at || ''
	} : null;
	console.log(JSON.stringify({
		ok: true,
		wallet: getWalletStatus(),
		api_health: safeProbeResult(health),
		public_words: {
			...safeProbeResult(publicWords),
			available: Boolean(publicWords.ok && publicWords.json?.ok),
			word_count_returned: Array.isArray(publicWordsData.words) ? publicWordsData.words.length : 0,
			next_cursor_available: Boolean(publicWordsData.next_cursor)
		},
		session_token: await getAuthStatus(),
		last_saved_candidate: lastCandidate,
		last_coin_result: lastCoin
	}, null, 2));
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

function generatedToCandidateBody(generated, concept) {
	return {
		language_code: defaultLanguage,
		language_name: generated.language_name || '',
		term: generated.word || generated.term,
		part_of_speech: generated.part_of_speech || generated.pos || 'n',
		meaning: generated.meaning,
		etymology: generated.etymology || generated.etymology_meaning || '',
		newness_confidence: generated.newness_confidence,
		model_name: generated.model_name || 'minimax',
		concept_prompt: concept,
		source: 'openclaw'
	};
}

async function persistGeneratedCandidate(generated, concept) {
	const response = await api('/v1/generations', {
		method: 'POST',
		body: JSON.stringify(generatedToCandidateBody(generated, concept))
	});
	const candidate = response.candidate;
	saveAgentState({
		active_candidate_id: candidate.candidate_id,
		active_candidate_language_code: candidate.language_code,
		active_generation_id: candidate.generation_id,
		active_candidate_hash: candidate.candidate_hash,
		active_candidate_term: candidate.term || '',
		active_candidate_meaning: candidate.meaning || ''
	});
	return candidate;
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

async function coinStoredCandidate(candidate, languageCode = defaultLanguage) {
	if (!process.argv.includes('--confirm-broadcast')) {
		throw new Error('Coining requires --confirm-broadcast after the user has explicitly approved the exact transaction action, fee, network, and payload summary.');
	}
	if (maxAutoCoinFee > 0 && coinFeeSatoshis > maxAutoCoinFee) {
		throw new Error('Coin fee exceeds LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS.');
	}
	const wallet = loadWallet();
	const keys = keysFromWallet(wallet);
	const utxos = await sugarApi('/unspent/' + encodeURIComponent(wallet.address) + '?amount=' + encodeURIComponent(coinFeeSatoshis + 1));
	const selection = chooseUtxos(Array.isArray(utxos) ? utxos : [], coinFeeSatoshis);
	const prepared = await api('/v1/candidates/' + encodeURIComponent(candidate.candidate_id) + '/coin/prepare', {
		method: 'POST',
		body: JSON.stringify({
			language_code: languageCode || candidate.language_code,
			fee_satoshis: coinFeeSatoshis,
			utxos: selection.chosen
		})
	});
	const payload = prepared.required_outputs?.find(output => output.type === 'op_return')?.payload || candidate.op_return_payload;
	const raw = buildCoinTransaction(keys, wallet.address, payload, selection.chosen, coinFeeSatoshis);
	const submitted = await api('/v1/transactions/' + encodeURIComponent(prepared.intent_id) + '/submit', {
		method: 'POST',
		body: JSON.stringify({
			language_code: languageCode || candidate.language_code,
			candidate_id: candidate.candidate_id,
			candidate_hash: candidate.candidate_hash,
			signed_transaction_hex: raw
		})
	});
	saveAgentState({
		active_candidate_id: '',
		active_candidate_language_code: '',
		last_coined_candidate_id: candidate.candidate_id,
		last_transaction_intent_id: prepared.intent_id,
		last_txid: submitted.transaction?.txid || ''
	});
	return {
		txid: submitted.transaction?.txid || '',
		address: wallet.address,
		fee_satoshis: coinFeeSatoshis,
		payload,
		intent_id: prepared.intent_id,
		word_id: prepared.word_id
	};
}

async function resolveCandidateForCoin(termOrId = '') {
	const value = String(termOrId || '').trim();
	const state = loadAgentState();
	const language = state.active_candidate_language_code || defaultLanguage;
	if (!value) {
		if (!state.active_candidate_id) {
			throw new Error('No active generated candidate is saved. Run prompt-word first or pass a candidate id/term.');
		}
		const data = await api('/v1/candidates/' + encodeURIComponent(state.active_candidate_id) + '?language_code=' + encodeURIComponent(language), { method: 'GET' });
		return data.candidate;
	}
	if (value.startsWith('cand_')) {
		const data = await api('/v1/candidates/' + encodeURIComponent(value) + '?language_code=' + encodeURIComponent(language), { method: 'GET' });
		return data.candidate;
	}
	const data = await api('/v1/candidates?language_code=' + encodeURIComponent(language) + '&status=available&term=' + encodeURIComponent(value), { method: 'GET' });
	const candidates = Array.isArray(data.candidates) ? data.candidates : [];
	if (candidates.length !== 1) {
		throw new Error(candidates.length ? `Multiple available candidates matched "${value}". Use the candidate_id.` : `No available candidate matched "${value}".`);
	}
	return candidates[0];
}

function printUserEvent(type, data) {
	console.log(JSON.stringify({
		type,
		message: data.message,
		data
	}, null, 2));
}

async function main() {
	if (command === 'doctor') {
		await runDoctor();
		return;
	}
	if (command === 'status') {
		await runStatus();
		return;
	}
	if (command === 'auth-status') {
		console.log(JSON.stringify(await getAuthStatus(), null, 2));
		return;
	}
	if (command === 'create-wallet') {
		const wallet = walletFromKey(bitcoin.ECPair.makeRandom({ network: sugarNetwork }));
		const store = saveWallet(wallet);
		console.log(JSON.stringify({
			wallet: {
				address: store.address,
				public_key: store.public_key,
				keystore_path: keystorePath
			},
			private_key_backup: {
				warning: 'The WIF private key controls this wallet. This ClawHub skill never prints or exports WIFs.',
				displayed_in_normal_output: false
			},
			next_step: 'Run claim-starter-grant if the user explicitly wants to request the 0.025 SUGAR starter grant.'
		}, null, 2));
		return;
	}
	if (command === 'claim-starter-grant') {
		const wallet = loadWallet();
		console.log(JSON.stringify({
			wallet: {
				address: wallet.address,
				public_key: wallet.public_key,
				keystore_path: keystorePath
			},
			startup_grant: await claimStarterGrant(wallet)
		}, null, 2));
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
	if (command === 'prompt-word' || command === 'generate-word') {
		requireSessionToken();
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
		const candidate = await persistGeneratedCandidate(generated, concept);
		printUserEvent('lingry.word_prompted', {
			message: `Generated Lingry word candidate: ${candidate.term} - ${candidate.meaning}`,
			word: generated,
			candidate,
			language_code: candidate.language_code
		});
		return;
	}
	if (command === 'coin-it' || command === 'coin-candidate' || command === 'coin-word-candidate') {
		requireSessionToken();
		const candidate = await resolveCandidateForCoin(commandArgs().join(' ').trim());
		const coin = await coinStoredCandidate(candidate, candidate.language_code);
		printUserEvent('lingry.word_coined', {
			message: `Coined ${candidate.term} on Sugarchain as ${coin.txid}.`,
			candidate,
			txid: coin.txid,
			intent_id: coin.intent_id,
			word_id: coin.word_id,
			address: coin.address,
			fee_satoshis: coin.fee_satoshis,
			op_return_payload: coin.payload
		});
		return;
	}
	if (command === 'create-word-draft') {
		requireSessionToken();
		const [, , , term, partOfSpeech, ...meaningParts] = process.argv;
		const meaning = meaningParts.join(' ');
		console.log(JSON.stringify(await api('/v1/words', {
			method: 'POST',
			body: JSON.stringify({ language_code: defaultLanguage, term, part_of_speech: partOfSpeech, meaning, source: 'openclaw' })
		}), null, 2));
		return;
	}
	console.log('Usage: lingry-agent status | doctor | auth-status | create-wallet | claim-starter-grant | address | list-words [language] | generate-word <prompt> | prompt-word <prompt> | coin-it [candidate-id-or-term] --confirm-broadcast | create-word-draft <term> <pos> <meaning>');
}

main().catch(error => {
	console.error(error.message || error);
	process.exitCode = 1;
});
