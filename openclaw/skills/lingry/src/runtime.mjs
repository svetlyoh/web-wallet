import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bitcoin from 'bitcoinjs-lib';

export const DEFAULT_API_BASE_URL = 'https://lingry.net';
export const DEFAULT_LANGUAGE_CODE = 'W';
export const SUGAR_API_BASE_URL = (process.env.SUGAR_API_BASE_URL || process.env.SUGAR_API_URL || 'https://api.sugar.wtf').replace(/\/+$/, '');
export const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.LINGRY_AGENT_REQUEST_TIMEOUT_MS || 180000));
export const COIN_FEE_SATOSHIS = Number(process.env.LINGRY_COIN_FEE_SATOSHIS || process.env.LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS || 1000);
export const sugarNetwork = {
	messagePrefix: '\x19Sugarchain Signed Message:\n',
	bip32: { public: 0x0488b21e, private: 0x0488ade4 },
	bech32: 'sugar',
	pubKeyHash: 0x3F,
	scriptHash: 0x7D,
	wif: 0x80
};

const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function lingryHome() {
	return path.join(os.homedir(), '.lingry');
}

export function lingryPaths() {
	const home = lingryHome();
	return {
		home,
		configPath: path.join(home, 'config.json'),
		pendingDir: path.join(home, 'pending'),
		resultsDir: path.join(home, 'results'),
		statePath: process.env.LINGRY_AGENT_STATE_PATH || path.join(home, 'lingry-agent-state.json')
	};
}

export function skillRootFromImportMeta(importMetaUrl) {
	return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), '..');
}

function requireHttpsUrl(value, source) {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${source} must be a valid HTTPS URL.`);
	}
	if (url.protocol !== 'https:') {
		throw new Error(`${source} must use HTTPS. Set LINGRY_API_BASE_URL to a valid HTTPS Lingry API URL.`);
	}
	return url.href.replace(/\/+$/, '');
}

export function resolveLingryApiBaseUrl() {
	if (process.env.LINGRY_API_BASE_URL) {
		return {
			baseUrl: requireHttpsUrl(process.env.LINGRY_API_BASE_URL, 'LINGRY_API_BASE_URL'),
			source: 'LINGRY_API_BASE_URL'
		};
	}
	const { configPath } = lingryPaths();
	try {
		if (fs.existsSync(configPath)) {
			const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
			const configured = config.api_base_url || config.apiBaseUrl;
			if (configured) {
				return {
					baseUrl: requireHttpsUrl(configured, '~/.lingry/config.json api_base_url'),
					source: '~/.lingry/config.json'
				};
			}
		}
	} catch (error) {
		throw new Error(`Could not read Lingry config safely: ${error.message}`);
	}
	return { baseUrl: DEFAULT_API_BASE_URL, source: 'built-in default' };
}

export function resolveKeystorePath() {
	return {
		keystorePath: process.env.LINGRY_KEYSTORE_PATH || path.join(lingryHome(), 'keystore.json'),
		source: process.env.LINGRY_KEYSTORE_PATH ? 'LINGRY_KEYSTORE_PATH' : 'default ~/.lingry/keystore.json'
	};
}

export function defaultLanguageCode() {
	return String(process.env.LINGRY_DEFAULT_LANGUAGE_CODE || DEFAULT_LANGUAGE_CODE).trim().toUpperCase().charAt(0) || DEFAULT_LANGUAGE_CODE;
}

export function sessionTokenConfigured() {
	return Boolean(process.env.LINGRY_SESSION_TOKEN);
}

export function ensurePrivateDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
	try {
		fs.chmodSync(dirPath, 0o700);
	} catch {
		// chmod may be unsupported on some filesystems; creation mode still helps on POSIX.
	}
}

export function writeJsonPrivate(filePath, value) {
	ensurePrivateDir(path.dirname(filePath));
	fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
	try {
		fs.chmodSync(filePath, 0o600);
	} catch {
		// Best effort on non-POSIX filesystems.
	}
}

export function readJsonFile(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadAgentState() {
	try {
		return readJsonFile(lingryPaths().statePath);
	} catch {
		return {};
	}
}

export function saveAgentState(update) {
	const current = loadAgentState();
	const next = { ...current, ...update, updated_at: new Date().toISOString() };
	writeJsonPrivate(lingryPaths().statePath, next);
	return next;
}

export function readKeystoreHeader(filePath = resolveKeystorePath().keystorePath) {
	if (!fs.existsSync(filePath)) {
		return { configured: false, address: '', public_key: '', keystore_path: filePath };
	}
	const store = readJsonFile(filePath);
	return {
		configured: true,
		address: store.address || '',
		public_key: store.public_key || '',
		keystore_path: filePath,
		version: store.version || null
	};
}

function derive(passphrase, salt) {
	return crypto.scryptSync(passphrase, salt, 32, SCRYPT_OPTIONS);
}

export function walletFromKey(key) {
	const payment = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork });
	return { address: payment.address, public_key: key.publicKey.toString('hex'), wif: key.toWIF() };
}

export function createWalletRecord() {
	return walletFromKey(bitcoin.ECPair.makeRandom({ network: sugarNetwork }));
}

export function walletFromWif(wif) {
	const key = bitcoin.ECPair.fromWIF(wif, sugarNetwork);
	return walletFromKey(key);
}

export function saveEncryptedWallet(filePath, passphrase, wallet) {
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
	writeJsonPrivate(filePath, store);
	return readKeystoreHeader(filePath);
}

export function loadEncryptedWallet(filePath, passphrase) {
	const store = readJsonFile(filePath);
	if (store.version !== 1 || store.kdf !== 'scrypt' || store.cipher !== 'aes-256-gcm') {
		throw new Error('Unsupported Lingry keystore format.');
	}
	const key = derive(passphrase, Buffer.from(store.salt, 'base64'));
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(store.iv, 'base64'));
	decipher.setAuthTag(Buffer.from(store.tag, 'base64'));
	const wif = Buffer.concat([decipher.update(Buffer.from(store.ciphertext, 'base64')), decipher.final()]).toString('utf8');
	return { address: store.address, public_key: store.public_key, wif };
}

export async function fetchJsonWithTimeout(url, options = {}, label = 'Lingry request') {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS} ms.`)), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(url, { ...options, signal: controller.signal });
		const text = await response.text();
		let json = null;
		if (text) {
			try {
				json = JSON.parse(text);
			} catch {
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
			throw new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS} ms.`);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

export async function fetchJsonProbe(url, options = {}, label = 'Lingry request') {
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

export function authHeaders(extra = {}) {
	const headers = new Headers(extra);
	headers.set('content-type', headers.get('content-type') || 'application/json');
	if (process.env.LINGRY_SESSION_TOKEN) {
		headers.set('authorization', 'Bearer ' + process.env.LINGRY_SESSION_TOKEN);
	}
	return headers;
}

export async function api(pathname, options = {}) {
	const { baseUrl } = resolveLingryApiBaseUrl();
	const headers = authHeaders(options.headers || {});
	if (options.method && options.method !== 'GET' && !headers.has('idempotency-key')) {
		headers.set('idempotency-key', 'clawhub-' + crypto.randomUUID());
	}
	const json = await fetchJsonWithTimeout(baseUrl + pathname, { ...options, headers }, `Lingry API ${pathname}`);
	if (!json?.ok) {
		throw new Error(json?.error?.message || `Lingry API ${pathname} failed.`);
	}
	return json.data;
}

export async function legacyApi(pathname, options = {}) {
	const { baseUrl } = resolveLingryApiBaseUrl();
	const headers = new Headers(options.headers || {});
	if (options.body && !headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}
	const json = await fetchJsonWithTimeout(baseUrl + pathname, { ...options, headers }, `Lingry ${pathname}`);
	if (json?.error) {
		throw new Error(json?.error?.message || json?.error || `Lingry ${pathname} failed.`);
	}
	return json;
}

export async function apiProbe(pathname, options = {}) {
	const { baseUrl } = resolveLingryApiBaseUrl();
	const headers = authHeaders(options.headers || {});
	if (options.method && options.method !== 'GET' && !headers.has('idempotency-key')) {
		headers.set('idempotency-key', 'clawhub-probe-' + crypto.randomUUID());
	}
	return fetchJsonProbe(baseUrl + pathname, { ...options, headers }, `Lingry API ${pathname}`);
}

export async function sugarApi(pathname, options = {}) {
	const response = await fetchJsonWithTimeout(SUGAR_API_BASE_URL + pathname, options, `Sugarchain API ${pathname}`);
	if (response?.error) {
		throw new Error(response.error?.message || response.error || 'Sugarchain API request failed.');
	}
	return response.result;
}

export function decodeSessionTokenExpiry() {
	const token = process.env.LINGRY_SESSION_TOKEN || '';
	if (!token || !token.includes('.')) {
		return '';
	}
	try {
		const encoded = token.split('.')[0];
		const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
		const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
		return payload && payload.exp ? new Date(Number(payload.exp) * 1000).toISOString() : '';
	} catch {
		return '';
	}
}

export async function getAuthStatus() {
	const expiry = decodeSessionTokenExpiry();
	if (!process.env.LINGRY_SESSION_TOKEN) {
		return { token_configured: false, token_accepted: 'unknown', expires_at: expiry };
	}
	const me = await apiProbe('/v1/me', { method: 'GET' });
	if (me.ok && me.json?.ok) {
		return { token_configured: true, token_accepted: 'yes', expires_at: expiry };
	}
	return {
		token_configured: true,
		token_accepted: me.status === 401 || me.status === 403 ? 'no' : 'unknown',
		expires_at: expiry,
		status: me.status || 0,
		safe_message: me.safe_message || 'Token check failed.'
	};
}

export function requireSessionToken() {
	if (!process.env.LINGRY_SESSION_TOKEN) {
		throw new Error('LINGRY_SESSION_TOKEN is required for this account-bound Lingry command. Obtain it through the deliberate Lingry browser/account session flow and set it only in a private local environment.');
	}
}

export function safeProbeResult(probe, okWhenStatuses = []) {
	const statusOk = okWhenStatuses.includes(probe.status);
	return {
		ok: Boolean(probe.ok || statusOk),
		status: probe.status || (probe.ok ? 200 : 0),
		safe_message: probe.ok ? 'ok' : (probe.safe_message || 'request failed')
	};
}

export function createPendingRequest(type, data) {
	const { pendingDir } = lingryPaths();
	const requestId = `${type}_${crypto.randomUUID()}`;
	const request = {
		request_id: requestId,
		type,
		created_at: new Date().toISOString(),
		expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
		...data
	};
	writeJsonPrivate(path.join(pendingDir, `${requestId}.json`), request);
	return request;
}

export function readPendingRequest(requestId) {
	if (!/^[a-z][a-z0-9_-]*_[0-9a-f-]{36}$/i.test(requestId)) {
		throw new Error('Invalid Lingry request id.');
	}
	return readJsonFile(path.join(lingryPaths().pendingDir, `${requestId}.json`));
}

export function saveRequestResult(requestId, result) {
	const safeResult = { request_id: requestId, saved_at: new Date().toISOString(), ...result };
	writeJsonPrivate(path.join(lingryPaths().resultsDir, `${requestId}.json`), safeResult);
	saveAgentState({ last_local_result: safeResult });
	return safeResult;
}

export function readRequestResult(requestId) {
	return readJsonFile(path.join(lingryPaths().resultsDir, `${requestId}.json`));
}

export function installationIdFor(address, keystorePath) {
	return crypto.createHash('sha256').update(`${address}:${keystorePath}`).digest('hex').slice(0, 32);
}

export function signGrantChallenge(keys, challengeText) {
	const digest = crypto.createHash('sha256').update(challengeText).digest();
	return keys.sign(digest).toString('hex');
}

export function keysFromWallet(wallet) {
	return bitcoin.ECPair.fromWIF(wallet.wif, sugarNetwork);
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
	if (typeof utxo.script === 'string') return utxo.script;
	if (typeof utxo.scriptPubKey === 'string') return utxo.scriptPubKey;
	if (utxo.scriptPubKey && typeof utxo.scriptPubKey.hex === 'string') return utxo.scriptPubKey.hex;
	return '';
}

export function chooseUtxos(utxos, feeSatoshis) {
	const chosen = [];
	let total = 0;
	for (const utxo of utxos) {
		chosen.push(utxo);
		total += Number(utxo.value || 0);
		if (total > feeSatoshis) break;
	}
	return { chosen, total };
}

export function buildCoinTransaction(keys, address, payload, utxos, feeSatoshis) {
	const txb = new bitcoin.TransactionBuilder(sugarNetwork);
	const scripts = [];
	let totalValue = 0;
	const opReturnScript = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from(payload, 'utf8')]);
	txb.setVersion(2);
	txb.addOutput(opReturnScript, 0);
	for (const utxo of utxos) {
		const txid = utxo.txid;
		const index = utxo.index !== undefined ? utxo.index : utxo.vout;
		const script = Buffer.from(getUtxoScriptHex(utxo), 'hex');
		const type = getScriptType(script);
		const value = Number(utxo.value || 0);
		totalValue += value;
		if (type === 'bech32') {
			txb.addInput(txid, index, null, getP2WPKHScript(keys.publicKey).output);
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

export function verifyInstall(skillRoot) {
	const requiredFiles = [
		'SKILL.md',
		'README.md',
		'package.json',
		'package-lock.json',
		'bin/lingry-agent.mjs',
		'bin/lingry-wallet.mjs',
		'src/runtime.mjs',
		'LICENSE',
		'CHANGELOG.md',
		'SECURITY.md',
		'SUPPORT.md'
	];
	const files = requiredFiles.map((relativePath) => {
		const fullPath = path.join(skillRoot, relativePath);
		return {
			path: relativePath,
			present: fs.existsSync(fullPath) && fs.statSync(fullPath).isFile(),
			size: fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0
		};
	});
	const missing = files.filter((file) => !file.present || file.size <= 0).map((file) => file.path);
	const pkg = readJsonFile(path.join(skillRoot, 'package.json'));
	const bins = pkg.bin || {};
	const binOk = bins['lingry-agent'] === 'bin/lingry-agent.mjs' && bins['lingry-wallet'] === 'bin/lingry-wallet.mjs';
	return {
		ok: missing.length === 0 && binOk && pkg.name === '@svetlyoh/lingry',
		package_name: pkg.name,
		version: pkg.version,
		required_files: files,
		missing,
		bins,
		standalone: true,
		plugin_fallback_enabled: false
	};
}
