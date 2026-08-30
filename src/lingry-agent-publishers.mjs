import bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';
import { buildStarterGrantTransaction, LINGRY_NEW_WALLET_GRANT_SATOSHIS, sugarNetwork } from './lingry-grants.mjs';

const encoder = new TextEncoder();
const AGENT_SESSION_TTL_SECONDS = 20 * 60;
const AGENT_SCOPES = ['stream:read', 'words:generate', 'words:create', 'words:coin', 'publisher:read'];
const SUGAR_API_BASES = ['https://api.sugar.wtf', 'https://api.sugarchain.org'];

function agentError(code, message, status = 400, retryable = false) {
	const error = new Error(message);
	error.code = code;
	error.status = status;
	error.retryable = retryable;
	return error;
}

function nowIso() {
	return new Date().toISOString();
}

function randomId(prefix) {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function normalize(value) {
	return String(value || '').trim();
}

function base64(bytes) {
	return Buffer.from(bytes).toString('base64');
}

function fromBase64(value) {
	return new Uint8Array(Buffer.from(String(value || ''), 'base64'));
}

function base64Url(bytes) {
	return Buffer.from(bytes).toString('base64url');
}

function parsePositiveInt(value, fallback, minimum = 1) {
	const parsed = Math.floor(Number(value));
	return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

async function sha256Bytes(value) {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value || ''))));
}

export async function sha256Hex(value) {
	return Buffer.from(await sha256Bytes(value)).toString('hex');
}

async function hmacBytes(secret, value) {
	const key = await crypto.subtle.importKey('raw', encoder.encode(String(secret || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(String(value || ''))));
}

async function credentialHash(env, clientInstanceId, agentSecret) {
	const pepper = normalize(env.LINGRY_AGENT_CREDENTIAL_PEPPER || env.LINGRY_AGENT_KEY_ENCRYPTION_KEY);
	if (!pepper) {
		throw agentError('server_not_configured', 'Agent credential protection is not configured.', 503);
	}
	return Buffer.from(await hmacBytes(pepper, `${clientInstanceId}\n${agentSecret}`)).toString('hex');
}

function safeEqualHex(left, right) {
	const a = Buffer.from(String(left || ''), 'hex');
	const b = Buffer.from(String(right || ''), 'hex');
	if (!a.length || a.length !== b.length) return false;
	let difference = 0;
	for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
	return difference === 0;
}

async function rootEncryptionKey(env) {
	const configured = normalize(env.LINGRY_AGENT_KEY_ENCRYPTION_KEY);
	if (!configured) {
		throw agentError('server_not_configured', 'LINGRY_AGENT_KEY_ENCRYPTION_KEY is required for Agent Publishers.', 503);
	}
	let raw;
	try {
		raw = fromBase64(configured);
	} catch {
		raw = new Uint8Array();
	}
	if (raw.byteLength !== 32) raw = await sha256Bytes(configured);
	return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptAgentPublisherWif(env, agentId, wif) {
	const kek = await rootEncryptionKey(env);
	const dekRaw = crypto.getRandomValues(new Uint8Array(32));
	const dek = await crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['encrypt']);
	const wifNonce = crypto.getRandomValues(new Uint8Array(12));
	const dekNonce = crypto.getRandomValues(new Uint8Array(12));
	const aad = encoder.encode(`lingry-agent-publisher:${agentId}:v1`);
	const encryptedWif = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wifNonce, additionalData: aad }, dek, encoder.encode(wif));
	const wrappedDek = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: dekNonce, additionalData: aad }, kek, dekRaw);
	return {
		encrypted_private_key: base64(encryptedWif),
		private_key_nonce: base64(wifNonce),
		wrapped_dek: base64(wrappedDek),
		dek_nonce: base64(dekNonce),
		key_encryption_version: normalize(env.LINGRY_AGENT_KEY_ENCRYPTION_VERSION || 'v1')
	};
}

export async function decryptAgentPublisherWif(env, publisher) {
	if (publisher.key_encryption_version !== normalize(env.LINGRY_AGENT_KEY_ENCRYPTION_VERSION || 'v1')) {
		throw agentError('key_version_unavailable', 'The Agent Publisher key version is not available.', 503, true);
	}
	const kek = await rootEncryptionKey(env);
	const aad = encoder.encode(`lingry-agent-publisher:${publisher.agent_id}:v1`);
	const dekRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(publisher.dek_nonce), additionalData: aad }, kek, fromBase64(publisher.wrapped_dek));
	const dek = await crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['decrypt']);
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(publisher.private_key_nonce), additionalData: aad }, dek, fromBase64(publisher.encrypted_private_key));
	return new TextDecoder().decode(plaintext);
}

function requireAgentDb(env) {
	if (!env.LINGRY_DB || typeof env.LINGRY_DB.prepare !== 'function') {
		throw agentError('server_not_configured', 'Agent Publisher storage is not configured.', 503, true);
	}
	return env.LINGRY_DB;
}

async function first(db, query, ...bindings) {
	return db.prepare(query).bind(...bindings).first();
}

async function run(db, query, ...bindings) {
	return db.prepare(query).bind(...bindings).run();
}

function publicPublisher(row) {
	return {
		agent_id: row.agent_id,
		client_type: row.client_type,
		publisher_address: row.publisher_address,
		publisher_public_key: row.publisher_public_key,
		status: row.status,
		funding_status: row.funding_status || 'pending',
		created_at: row.created_at,
		last_seen_at: row.last_seen_at || row.created_at,
		last_coin_at: row.last_coin_at || ''
	};
}

function validateBootstrapInput(body) {
	if (normalize(body.client_type).toLowerCase() !== 'openclaw') {
		throw agentError('validation_error', 'Only client_type "openclaw" is supported.', 400);
	}
	const clientInstanceId = normalize(body.client_instance_id);
	const agentSecret = normalize(body.agent_secret);
	if (!/^[A-Za-z0-9_-]{20,200}$/.test(clientInstanceId)) {
		throw agentError('validation_error', 'client_instance_id must be a persistent random identifier.', 400);
	}
	if (!/^[A-Za-z0-9_-]{32,300}$/.test(agentSecret)) {
		throw agentError('validation_error', 'agent_secret must contain at least 32 URL-safe characters.', 400);
	}
	return { clientType: 'openclaw', clientInstanceId, agentSecret };
}

export async function getAgentPublisher(env, agentId) {
	return first(requireAgentDb(env), 'SELECT * FROM lingry_agent_publishers WHERE agent_id = ?', normalize(agentId));
}

export async function bootstrapAgentPublisher(env, body, options = {}) {
	const db = requireAgentDb(env);
	const { clientType, clientInstanceId, agentSecret } = validateBootstrapInput(body || {});
	const clientHash = await sha256Hex(`${clientType}:${clientInstanceId}`);
	const expectedCredentialHash = await credentialHash(env, clientInstanceId, agentSecret);
	const bootstrapIpHash = Buffer.from(await hmacBytes(normalize(env.LINGRY_AGENT_CREDENTIAL_PEPPER || env.LINGRY_AGENT_KEY_ENCRYPTION_KEY), normalize(options.ipAddress || 'unknown'))).toString('hex');
	let existing = await first(db, 'SELECT * FROM lingry_agent_publishers WHERE client_type = ? AND client_instance_id_hash = ?', clientType, clientHash);
	if (existing) {
		if (!safeEqualHex(existing.credential_hash, expectedCredentialHash)) {
			throw agentError('invalid_agent_credential', 'Agent Publisher credential is invalid.', 401);
		}
		if (existing.status !== 'active') throw agentError('agent_inactive', 'Agent Publisher is not active.', 403);
		await run(db, 'UPDATE lingry_agent_publishers SET last_seen_at = ?, updated_at = ? WHERE agent_id = ?', nowIso(), nowIso(), existing.agent_id);
		existing.last_seen_at = nowIso();
		return { publisher: publicPublisher(existing), created: false };
	}
	const velocityStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const velocity = await first(db, 'SELECT COUNT(*) AS total FROM lingry_agent_publishers WHERE bootstrap_ip_hash = ? AND created_at >= ?', bootstrapIpHash, velocityStart);
	if (Number(velocity?.total || 0) >= parsePositiveInt(env.LINGRY_AGENT_MAX_BOOTSTRAPS_PER_IP_DAY, 5)) {
		throw agentError('agent_bootstrap_rate_limited', 'Too many Agent Publisher bootstrap requests.', 429, true);
	}

	const key = bitcoin.ECPair.makeRandom({ network: sugarNetwork });
	const payment = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork });
	const agentId = randomId('agt');
	const encrypted = await encryptAgentPublisherWif(env, agentId, key.toWIF());
	const timestamp = nowIso();
	try {
		await run(db, `INSERT INTO lingry_agent_publishers (
			agent_id, client_type, client_instance_id_hash, publisher_address, publisher_public_key,
			encrypted_private_key, private_key_nonce, wrapped_dek, dek_nonce, key_encryption_version,
			credential_hash, bootstrap_ip_hash, status, funding_status, created_at, updated_at, last_seen_at, last_coin_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'pending', ?, ?, ?, '')`,
			agentId, clientType, clientHash, payment.address, key.publicKey.toString('hex'),
			encrypted.encrypted_private_key, encrypted.private_key_nonce, encrypted.wrapped_dek, encrypted.dek_nonce,
			encrypted.key_encryption_version, expectedCredentialHash, bootstrapIpHash, timestamp, timestamp, timestamp);
	} catch (error) {
		if (!/unique|constraint/i.test(String(error && error.message || error))) throw error;
		existing = await first(db, 'SELECT * FROM lingry_agent_publishers WHERE client_type = ? AND client_instance_id_hash = ?', clientType, clientHash);
		if (!existing || !safeEqualHex(existing.credential_hash, expectedCredentialHash)) {
			throw agentError('bootstrap_conflict', 'Agent Publisher bootstrap conflicted with another request.', 409, true);
		}
		return { publisher: publicPublisher(existing), created: false };
	}

	let row = await getAgentPublisher(env, agentId);
	if (options.fund !== false) {
		try {
			const funding = await fundAgentPublisher(env, row, options);
			await run(db, 'UPDATE lingry_agent_publishers SET funding_status = ?, updated_at = ? WHERE agent_id = ?', funding.status, nowIso(), agentId);
			row = { ...row, funding_status: funding.status };
		} catch (error) {
			await run(db, 'UPDATE lingry_agent_publishers SET funding_status = ?, updated_at = ? WHERE agent_id = ?', 'unavailable', nowIso(), agentId);
			row = { ...row, funding_status: 'unavailable' };
		}
	}
	return { publisher: publicPublisher(row), created: true };
}

export async function verifyAgentCredential(env, body) {
	const db = requireAgentDb(env);
	const { clientType, clientInstanceId, agentSecret } = validateBootstrapInput(body || {});
	const clientHash = await sha256Hex(`${clientType}:${clientInstanceId}`);
	const publisher = await first(db, 'SELECT * FROM lingry_agent_publishers WHERE client_type = ? AND client_instance_id_hash = ?', clientType, clientHash);
	const suppliedHash = await credentialHash(env, clientInstanceId, agentSecret);
	if (!publisher || !safeEqualHex(publisher.credential_hash, suppliedHash)) {
		throw agentError('invalid_agent_credential', 'Agent Publisher credential is invalid.', 401);
	}
	if (publisher.status !== 'active') throw agentError('agent_inactive', 'Agent Publisher is not active.', 403);
	await run(db, 'UPDATE lingry_agent_publishers SET last_seen_at = ?, updated_at = ? WHERE agent_id = ?', nowIso(), nowIso(), publisher.agent_id);
	return publisher;
}

export async function mintAgentAccessToken(env, publisher) {
	const secret = normalize(env.LINGRY_SESSION_SECRET);
	if (!secret) throw agentError('server_not_configured', 'LINGRY_SESSION_SECRET is required.', 503);
	const payload = {
		typ: 'lingry-agent',
		sub: publisher.agent_id,
		address: publisher.publisher_address,
		client_type: publisher.client_type,
		scopes: AGENT_SCOPES,
		exp: Math.floor(Date.now() / 1000) + parsePositiveInt(env.LINGRY_AGENT_SESSION_TTL_SECONDS, AGENT_SESSION_TTL_SECONDS, 60)
	};
	const encoded = base64Url(encoder.encode(JSON.stringify(payload)));
	const signature = base64Url(await hmacBytes(secret, encoded));
	return { access_token: `${encoded}.${signature}`, expires_at: new Date(payload.exp * 1000).toISOString(), scopes: payload.scopes };
}

export async function verifyAgentAccessToken(env, token) {
	if (!normalize(env.LINGRY_SESSION_SECRET)) return null;
	const [encoded, signature, extra] = String(token || '').split('.');
	if (!encoded || !signature || extra) return null;
	const expected = base64Url(await hmacBytes(normalize(env.LINGRY_SESSION_SECRET), encoded));
	if (!safeEqualHex(Buffer.from(signature).toString('hex'), Buffer.from(expected).toString('hex'))) return null;
	let payload;
	try {
		payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (payload.typ !== 'lingry-agent' || !payload.sub || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
	const publisher = await getAgentPublisher(env, payload.sub);
	if (!publisher || publisher.status !== 'active' || publisher.publisher_address !== payload.address) return null;
	return { ...payload, agent_id: payload.sub, publisher };
}

async function fetchSugar(pathname) {
	let lastError;
	for (const base of SUGAR_API_BASES) {
		try {
			const response = await fetch(base + pathname);
			const json = await response.json().catch(() => null);
			if (response.ok && json && !json.error) return json.result;
			lastError = new Error(json?.error?.message || json?.error || 'Sugarchain API request failed.');
		} catch (error) {
			lastError = error;
		}
	}
	throw agentError('sugarchain_unavailable', lastError?.message || 'Sugarchain API is unavailable.', 502, true);
}

async function broadcastFunding(env, rawHex) {
	if (env.LINGRY_MOCK_BROADCAST_TXID) return normalize(env.LINGRY_MOCK_BROADCAST_TXID);
	if (env.SUGARCHAIN_RPC_URL) {
		const auth = env.SUGARCHAIN_RPC_USERNAME ? `Basic ${btoa(`${env.SUGARCHAIN_RPC_USERNAME}:${env.SUGARCHAIN_RPC_PASSWORD || ''}`)}` : '';
		const response = await fetch(env.SUGARCHAIN_RPC_URL, {
			method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
			body: JSON.stringify({ jsonrpc: '1.0', id: randomId('rpc'), method: 'sendrawtransaction', params: [rawHex] })
		});
		const json = await response.json().catch(() => null);
		if (!response.ok || !json || json.error) throw agentError('funding_broadcast_failed', json?.error?.message || 'Agent funding broadcast failed.', 502, true);
		return normalize(json.result);
	}
	for (const base of SUGAR_API_BASES) {
		const response = await fetch(base + '/broadcast', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `raw=${encodeURIComponent(rawHex)}` });
		const json = await response.json().catch(() => null);
		if (response.ok && json && !json.error) return normalize(json.result);
	}
	throw agentError('funding_broadcast_failed', 'Agent funding broadcast failed.', 502, true);
}

export async function fundAgentPublisher(env, publisher, options = {}) {
	const db = requireAgentDb(env);
	if (String(env.LINGRY_AGENT_FUNDING_ENABLED || env.LINGRY_SUGAR_GRANTS_ENABLED).toLowerCase() !== 'true') return { status: 'disabled' };
	if (String(env.LINGRY_AGENT_FUNDING_CIRCUIT_BREAKER || '').toLowerCase() === 'true') return { status: 'paused' };
	const existing = await first(db, 'SELECT * FROM lingry_agent_funding_events WHERE agent_id = ? LIMIT 1', publisher.agent_id);
	if (existing) return { status: existing.status, txid: existing.txid || '' };
	const fundingWif = normalize(env.LINGRY_GRANT_WALLET_WIF || env.LINGRY_FUNDING_WIF || env.LINGRY_FAUCET_WIF);
	if (!fundingWif) return { status: 'not_configured' };
	const amount = Math.min(LINGRY_NEW_WALLET_GRANT_SATOSHIS, parsePositiveInt(env.LINGRY_AGENT_MAX_INITIAL_FUNDING_SATOSHIS, LINGRY_NEW_WALLET_GRANT_SATOSHIS));
	const fee = parsePositiveInt(env.LINGRY_AGENT_FUNDING_FEE_SATOSHIS, 1000);
	const ipHash = await sha256Hex(normalize(options.ipAddress || 'unknown'));
	const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
	const dailyBudget = parsePositiveInt(env.LINGRY_AGENT_GLOBAL_DAILY_FUNDING_SATOSHIS, 10000000);
	const spent = await first(db, `SELECT COALESCE(SUM(amount_satoshis), 0) AS total FROM lingry_agent_funding_events WHERE status = 'broadcasted' AND created_at >= ?`, dayStart.toISOString());
	if (Number(spent?.total || 0) + amount > dailyBudget) throw agentError('agent_funding_budget_exhausted', 'Agent funding is temporarily unavailable.', 429, true);
	const ipCount = await first(db, 'SELECT COUNT(*) AS total FROM lingry_agent_funding_events WHERE ip_hash = ? AND created_at >= ?', ipHash, dayStart.toISOString());
	if (Number(ipCount?.total || 0) >= parsePositiveInt(env.LINGRY_AGENT_MAX_BOOTSTRAPS_PER_IP_DAY, 5)) throw agentError('agent_bootstrap_rate_limited', 'Too many Agent Publisher funding requests.', 429, true);
	const fundingKey = bitcoin.ECPair.fromWIF(fundingWif, sugarNetwork);
	const fundingAddress = bitcoin.payments.p2wpkh({ pubkey: fundingKey.publicKey, network: sugarNetwork }).address;
	const configuredAddress = normalize(env.LINGRY_GRANT_FUNDING_ADDRESS || env.LINGRY_FUNDING_ADDRESS || env.LINGRY_FAUCET_ADDRESS);
	if (configuredAddress && configuredAddress !== fundingAddress) throw agentError('funding_address_mismatch', 'Agent funding wallet configuration is invalid.', 503);
	const utxos = await fetchSugar(`/unspent/${encodeURIComponent(fundingAddress)}?amount=${amount + fee}`);
	const rawHex = buildStarterGrantTransaction(fundingKey, publisher.publisher_address, Array.isArray(utxos) ? utxos : [], amount, fee);
	const txid = await broadcastFunding(env, rawHex);
	const timestamp = nowIso();
	await run(db, 'INSERT INTO lingry_agent_funding_events (funding_id, agent_id, publisher_address, ip_hash, amount_satoshis, status, txid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', randomId('afund'), publisher.agent_id, publisher.publisher_address, ipHash, amount, 'broadcasted', txid, timestamp, timestamp);
	await run(db, 'UPDATE lingry_agent_publishers SET funding_status = ?, updated_at = ? WHERE agent_id = ?', 'ready', timestamp, publisher.agent_id);
	return { status: 'ready', txid };
}

function utxoScriptHex(utxo) {
	if (typeof utxo.script === 'string') return utxo.script;
	if (typeof utxo.scriptPubKey === 'string') return utxo.scriptPubKey;
	return utxo.scriptPubKey?.hex || '';
}

function scriptType(script) {
	if (script[0] === bitcoin.opcodes.OP_0 && script[1] === 0x14) return 'bech32';
	if (script[0] === bitcoin.opcodes.OP_HASH160 && script[1] === 0x14 && script[22] === bitcoin.opcodes.OP_EQUAL) return 'segwit';
	if (script[0] === bitcoin.opcodes.OP_DUP && script[1] === bitcoin.opcodes.OP_HASH160 && script[2] === 0x14 && script[23] === bitcoin.opcodes.OP_EQUALVERIFY) return 'legacy';
	return '';
}

export function buildAgentCoinTransaction(key, publisherAddress, payload, utxos, feeSatoshis) {
	const txb = new bitcoin.TransactionBuilder(sugarNetwork);
	const inputs = [];
	let total = 0;
	const publisherScriptHex = bitcoin.address.toOutputScript(publisherAddress, sugarNetwork).toString('hex');
	txb.setVersion(2);
	for (const utxo of utxos) {
		const script = Buffer.from(utxoScriptHex(utxo), 'hex');
		const type = scriptType(script);
		const value = Number(utxo.value || 0);
		if (!type || !Number.isSafeInteger(value) || value <= 0) throw agentError('unsupported_utxo', 'Agent Publisher has an unsupported UTXO.', 409);
		if (script.toString('hex') !== publisherScriptHex) throw agentError('agent_transaction_policy_violation', 'Every Agent Publisher input must belong to its publishing address.', 409);
		total += value;
		if (type === 'bech32') txb.addInput(utxo.txid, utxo.vout ?? utxo.index, null, bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork }).output);
		else txb.addInput(utxo.txid, utxo.vout ?? utxo.index);
		inputs.push({ type, value });
	}
	if (total <= feeSatoshis) throw agentError('agent_low_balance', 'Agent Publisher needs additional fee funding before coining.', 409, true);
	txb.addOutput(bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from(payload, 'utf8')]), 0);
	txb.addOutput(publisherAddress, total - feeSatoshis);
	for (let index = 0; index < inputs.length; index++) {
		if (inputs[index].type === 'bech32') txb.sign(index, key, null, null, inputs[index].value, null);
		else if (inputs[index].type === 'segwit') {
			const redeem = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork });
			txb.sign(index, key, bitcoin.payments.p2sh({ redeem, network: sugarNetwork }).redeem.output, null, inputs[index].value, null);
		} else txb.sign(index, key);
	}
	return txb.build().toHex();
}

export function validateAgentCoinTransaction(rawHex, publisherAddress, payload, utxos, maxFeeSatoshis) {
	const tx = bitcoin.Transaction.fromHex(rawHex);
	if (tx.version !== 2 || tx.outs.length !== 2 || tx.ins.length !== utxos.length) throw agentError('agent_transaction_policy_violation', 'Agent coin transaction shape is not allowed.', 409);
	for (let index = 0; index < utxos.length; index++) {
		const expectedHash = Buffer.from(String(utxos[index].txid || ''), 'hex').reverse().toString('hex');
		const expectedIndex = Number(utxos[index].vout ?? utxos[index].index);
		if (tx.ins[index].hash.toString('hex') !== expectedHash || tx.ins[index].index !== expectedIndex) throw agentError('agent_transaction_policy_violation', 'Agent coin transaction inputs do not match the selected Publisher UTXOs.', 409);
	}
	const requiredOpReturn = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from(payload, 'utf8')]).toString('hex');
	const opReturns = tx.outs.filter(output => output.script[0] === bitcoin.opcodes.OP_RETURN);
	if (opReturns.length !== 1 || opReturns[0].value !== 0 || opReturns[0].script.toString('hex') !== requiredOpReturn) throw agentError('agent_transaction_policy_violation', 'Only the exact canonical Lingry OP_RETURN is allowed.', 409);
	const spendable = tx.outs.filter(output => output.script[0] !== bitcoin.opcodes.OP_RETURN);
	let changeAddress = '';
	try { changeAddress = bitcoin.address.fromOutputScript(spendable[0].script, sugarNetwork); } catch {}
	if (spendable.length !== 1 || changeAddress !== publisherAddress) throw agentError('agent_transaction_policy_violation', 'All spendable change must return to the Agent Publisher.', 409);
	const inputTotal = utxos.reduce((sum, utxo) => sum + Number(utxo.value || 0), 0);
	const fee = inputTotal - tx.outs.reduce((sum, output) => sum + Number(output.value || 0), 0);
	if (fee < 0 || fee > maxFeeSatoshis) throw agentError('agent_fee_limit_exceeded', 'Agent coin fee exceeds the configured maximum.', 409);
	return { fee_satoshis: fee, transaction: tx };
}

async function enforceCoinPolicy(env, publisher, fee) {
	const db = requireAgentDb(env);
	const now = Date.now();
	const hour = new Date(now - 60 * 60 * 1000).toISOString();
	const day = new Date(now - 24 * 60 * 60 * 1000).toISOString();
	const hourCount = await first(db, `SELECT COUNT(*) AS total FROM lingry_agent_coin_operations WHERE agent_id = ? AND status IN ('pending','broadcasted') AND created_at >= ?`, publisher.agent_id, hour);
	const dayStats = await first(db, `SELECT COUNT(*) AS total, COALESCE(SUM(fee_satoshis), 0) AS fees FROM lingry_agent_coin_operations WHERE agent_id = ? AND status IN ('pending','broadcasted') AND created_at >= ?`, publisher.agent_id, day);
	const pending = await first(db, `SELECT COUNT(*) AS total FROM lingry_agent_coin_operations WHERE agent_id = ? AND status = 'pending'`, publisher.agent_id);
	assertAgentCoinPolicy({ hour_count: hourCount?.total, day_count: dayStats?.total, day_fees: dayStats?.fees, pending_count: pending?.total }, env, fee);
}

export function assertAgentCoinPolicy(stats, env, fee) {
	if (Number(stats.hour_count || 0) >= parsePositiveInt(env.LINGRY_AGENT_MAX_COINS_PER_HOUR, 6)) throw agentError('agent_coin_rate_limited', 'Agent hourly coining limit reached.', 429, true);
	if (Number(stats.day_count || 0) >= parsePositiveInt(env.LINGRY_AGENT_MAX_COINS_PER_DAY, 20)) throw agentError('agent_coin_rate_limited', 'Agent daily coining limit reached.', 429, true);
	if (Number(stats.day_fees || 0) + fee > parsePositiveInt(env.LINGRY_AGENT_MAX_FEE_SPEND_PER_DAY_SATOSHIS, 20000)) throw agentError('agent_fee_budget_exceeded', 'Agent daily blockchain fee budget reached.', 429, true);
	if (Number(stats.pending_count || 0) >= parsePositiveInt(env.LINGRY_AGENT_MAX_OUTSTANDING_TRANSACTIONS, 3)) throw agentError('agent_outstanding_limit_reached', 'Agent has too many outstanding transactions.', 429, true);
}

export async function coinLingryWord(env, session, input, lexicon) {
	const db = requireAgentDb(env);
	if (!session?.publisher || session.publisher.publisher_address !== session.address) throw agentError('forbidden', 'Agent Publisher session is required.', 403);
	if (Object.keys(input || {}).some(key => ['outputs', 'recipient', 'recipient_address', 'raw_transaction', 'op_return', 'op_return_hex', 'payload'].includes(key))) throw agentError('agent_transaction_policy_violation', 'Agent coin API does not accept transaction outputs or arbitrary payloads.', 400);
	const candidateId = normalize(input.candidate_id);
	const languageCode = normalize(input.language_code || 'W').toUpperCase().charAt(0);
	const idempotencyKey = normalize(input.idempotency_key);
	if (!/^cand_[A-Za-z0-9_-]+$/.test(candidateId)) throw agentError('validation_error', 'candidate_id is required.', 400);
	if (!idempotencyKey || idempotencyKey.length > 200) throw agentError('idempotency_required', 'Idempotency-Key is required.', 400);
	const prior = await first(db, 'SELECT * FROM lingry_agent_coin_operations WHERE agent_id = ? AND idempotency_key = ?', session.agent_id, idempotencyKey);
	if (prior) {
		if (prior.status === 'broadcasted' && prior.response_json) return JSON.parse(prior.response_json);
		throw agentError('agent_coin_in_progress', 'This coin operation is already in progress.', 409, true);
	}
	const candidateResult = await lexicon('get-candidate', { candidate_id: candidateId, language_code: languageCode, actor_address: session.address });
	const candidate = candidateResult.candidate;
	if (!candidate || candidate.actor_address !== session.address) throw agentError('forbidden', 'Candidate does not belong to this Agent Publisher.', 403);
	const maxFee = parsePositiveInt(env.LINGRY_AGENT_MAX_FEE_PER_COIN_SATOSHIS, 2000, 250);
	const requestedFee = parsePositiveInt(input.fee_satoshis, Math.min(1000, maxFee), 250);
	if (requestedFee > maxFee) throw agentError('agent_fee_limit_exceeded', 'Requested fee exceeds the Agent Publisher maximum.', 409);
	await enforceCoinPolicy(env, session.publisher, requestedFee);
	const available = await fetchSugar(`/unspent/${encodeURIComponent(session.address)}?amount=${requestedFee + 1}`);
	const selected = [];
	let total = 0;
	for (const utxo of Array.isArray(available) ? available : []) {
		selected.push(utxo); total += Number(utxo.value || 0); if (total > requestedFee) break;
	}
	if (total <= requestedFee) throw agentError('agent_low_balance', 'Agent Publisher needs additional fee funding before coining.', 409, true);
	const operationId = randomId('acoin');
	const timestamp = nowIso();
	await run(db, 'INSERT INTO lingry_agent_coin_operations (operation_id, agent_id, candidate_id, idempotency_key, status, fee_satoshis, txid, response_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, \'\', \'\', ?, ?)', operationId, session.agent_id, candidateId, idempotencyKey, 'pending', requestedFee, timestamp, timestamp);
	try {
		const prepared = await lexicon('prepare-candidate', { candidate_id: candidateId, language_code: languageCode, actor_address: session.address, fee_satoshis: requestedFee, utxos: selected });
		const wif = await decryptAgentPublisherWif(env, session.publisher);
		let key;
		try { key = bitcoin.ECPair.fromWIF(wif, sugarNetwork); } finally { /* Never log or return decrypted key material. */ }
		const rawHex = buildAgentCoinTransaction(key, session.address, candidate.op_return_payload, selected, requestedFee);
		validateAgentCoinTransaction(rawHex, session.address, candidate.op_return_payload, selected, maxFee);
		const submitted = await lexicon('submit-transaction', { intent_id: prepared.intent_id, language_code: languageCode, actor_address: session.address, candidate_id: candidateId, candidate_hash: candidate.candidate_hash, signed_transaction_hex: rawHex });
		const transaction = submitted.transaction || {};
		const result = {
			candidate_id: candidateId,
			word: candidate.term,
			meaning: candidate.meaning,
			publisher_address: session.address,
			intent_id: prepared.intent_id,
			txid: transaction.txid || '',
			status: transaction.status || 'pending'
		};
		await run(db, 'UPDATE lingry_agent_coin_operations SET status = ?, txid = ?, response_json = ?, updated_at = ? WHERE operation_id = ?', 'broadcasted', result.txid, JSON.stringify(result), nowIso(), operationId);
		await run(db, 'UPDATE lingry_agent_publishers SET last_coin_at = ?, updated_at = ? WHERE agent_id = ?', nowIso(), nowIso(), session.agent_id);
		return result;
	} catch (error) {
		await run(db, 'UPDATE lingry_agent_coin_operations SET status = ?, updated_at = ? WHERE operation_id = ?', 'failed', nowIso(), operationId);
		throw error;
	}
}

export const AGENT_PUBLISHER_SCOPES = Object.freeze([...AGENT_SCOPES]);
