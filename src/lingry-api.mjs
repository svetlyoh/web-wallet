import bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';

export const LINGRY_LANGUAGES = [
	{ code: 'W', name: 'American English' },
	{ code: 'E', name: 'British English' },
	{ code: 'S', name: 'Spanish' },
	{ code: 'G', name: 'German' },
	{ code: 'F', name: 'French' },
	{ code: 'I', name: 'Italian' },
	{ code: 'R', name: 'Russian written in Cyrillic' },
	{ code: 'P', name: 'Portuguese' },
	{ code: 'C', name: 'Mandarin Chinese written with Simplified Chinese characters' },
	{ code: 'A', name: 'Arabic written in Arabic script' },
	{ code: 'H', name: 'Hindi written in Devanagari' },
	{ code: 'B', name: 'Bengali written in Bengali script' },
	{ code: 'J', name: 'Japanese written with kana and kanji' },
	{ code: 'K', name: 'Korean written in Hangul' },
	{ code: 'T', name: 'Turkish' },
	{ code: 'V', name: 'Vietnamese with standard tone marks' },
	{ code: 'U', name: 'Urdu written in Urdu script' },
	{ code: 'N', name: 'Indonesian' },
	{ code: 'M', name: 'Malay' },
	{ code: 'Y', name: 'Yoruba with standard Yoruba diacritics' },
	{ code: 'L', name: 'Polish with Polish diacritics' },
	{ code: 'D', name: 'Dutch' },
	{ code: 'O', name: 'Persian written in Persian script' },
	{ code: 'Q', name: 'Punjabi written in Gurmukhi script' },
	{ code: 'X', name: 'Thai written in Thai script' },
	{ code: 'Z', name: 'Swahili' }
];

export const LINGRY_LANGUAGE_CODES = new Set(LINGRY_LANGUAGES.map(language => language.code));
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const WRITE_ROUTES_WITHOUT_AUTH = new Set(['/v1/auth/challenge', '/v1/auth/verify', '/v1/internal/indexer/ingest']);
const SUGAR_DECIMALS = 8;
const DEFAULT_CORS_ORIGINS = [
	'http://localhost:8080',
	'http://127.0.0.1:8080',
	'http://localhost:8787',
	'http://127.0.0.1:8787'
];
const sugarNetwork = {
	messagePrefix: '\x19Sugarchain Signed Message:\n',
	bip32: {
		public: 0x0488b21e,
		private: 0x0488ade4
	},
	bech32: 'sugar',
	pubKeyHash: 0x3F,
	scriptHash: 0x7D,
	wif: 0x80
};

function nowIso() {
	return new Date().toISOString();
}

function requestId() {
	return 'req_' + crypto.randomUUID().replace(/-/g, '');
}

function randomId(prefix) {
	return prefix + '_' + crypto.randomUUID().replace(/-/g, '');
}

function normalizeText(value) {
	return String(value || '').replace(/\s+/g, ' ').trim();
}

function sanitizeField(value, maxLength) {
	return normalizeText(value).replace(/\|/g, '/').slice(0, maxLength);
}

function normalizeWord(value) {
	return normalizeText(value).toLowerCase();
}

function normalizeLanguageCode(value) {
	const code = String(value || '').trim().toUpperCase().charAt(0);
	return LINGRY_LANGUAGE_CODES.has(code) ? code : '';
}

function normalizePartOfSpeech(value) {
	const pos = String(value || '').trim().toLowerCase().replace(/\.$/, '');
	const allowed = ['n', 'v', 'adj', 'adv', 'pron', 'prep', 'conj', 'interj'];
	return allowed.includes(pos) ? pos : '';
}

function byteLength(value) {
	return new TextEncoder().encode(String(value || '')).length;
}

function textToHex(text) {
	return Array.from(new TextEncoder().encode(String(text || ''))).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToUtf8(hex) {
	const normalized = normalizeHex(hex);
	if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
		return '';
	}
	const bytes = new Uint8Array(normalized.match(/.{2}/g).map(byte => parseInt(byte, 16)));
	return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\u0000/g, '');
}

function normalizeHex(value) {
	return String(value || '').trim().replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase();
}

function isValidLingryWord(value) {
	return /^[\p{L}\p{M}]{2,32}(?:-[\p{L}\p{M}]{2,32})?$/u.test(String(value || ''));
}

export function parseLingryPayload(payloadText) {
	const payload = normalizeText(payloadText);
	if (!/^S[A-Z]\|/.test(payload)) {
		return null;
	}
	const parts = payload.split('|');
	if (parts.length !== 4) {
		return null;
	}
	const protocol = parts[0];
	const languageCode = normalizeLanguageCode(protocol.slice(1));
	const word = normalizeWord(parts[1]);
	const partOfSpeech = normalizePartOfSpeech(parts[2]);
	const meaning = normalizeText(parts[3]);
	if (!languageCode || protocol !== 'S' + languageCode) {
		return null;
	}
	if (!isValidLingryWord(word) || !partOfSpeech || !meaning || meaning.length > 140 || byteLength(payload) > 80) {
		return null;
	}
	return {
		protocol,
		language_code: languageCode,
		word,
		normalized_word: word,
		part_of_speech: partOfSpeech,
		meaning,
		op_return_payload: payload,
		op_return_hex: textToHex(payload),
		valid: true
	};
}

export function buildLingryPayload(input) {
	const languageCode = normalizeLanguageCode(input && input.language_code);
	const term = normalizeWord(input && input.term);
	const partOfSpeech = normalizePartOfSpeech(input && input.part_of_speech);
	const meaning = sanitizeField(input && input.meaning, 140);
	if (!languageCode) {
		throw apiError('validation_error', 'Unsupported Lingry language code.', 400);
	}
	if (!isValidLingryWord(term)) {
		throw apiError('validation_error', 'Word must be 2-32 letters with at most one hyphen.', 400);
	}
	if (!partOfSpeech) {
		throw apiError('validation_error', 'Unsupported part of speech.', 400);
	}
	if (!meaning) {
		throw apiError('validation_error', 'Meaning is required.', 400);
	}
	const payload = `S${languageCode}|${term}|${partOfSpeech}|${meaning}`;
	if (byteLength(payload) > 80) {
		throw apiError('validation_error', 'Lingry OP_RETURN payload exceeds 80 bytes.', 400);
	}
	return {
		language_code: languageCode,
		term,
		normalized_term: term,
		part_of_speech: partOfSpeech,
		meaning,
		op_return_payload: payload,
		op_return_hex: textToHex(payload),
		payload_bytes: byteLength(payload)
	};
}

function apiError(code, message, status = 400, retryable = false) {
	const error = new Error(message);
	error.code = code;
	error.status = status;
	error.retryable = retryable;
	return error;
}

function envelope(data, status = 200, headers = {}, id = requestId()) {
	return new Response(JSON.stringify({
		ok: true,
		data,
		meta: {
			request_id: id,
			timestamp: nowIso()
		}
	}), {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
			...headers
		}
	});
}

function errorEnvelope(error, headers = {}, id = requestId()) {
	const status = Number(error && error.status) || 500;
	return new Response(JSON.stringify({
		ok: false,
		error: {
			code: error && error.code ? error.code : 'internal_error',
			message: error && error.message ? error.message : 'Unexpected Lingry API error.',
			retryable: Boolean(error && error.retryable)
		},
		meta: { request_id: id }
	}), {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
			...headers
		}
	});
}

function corsHeaders(request, env) {
	const origin = request.headers.get('origin') || '';
	const configured = String(env.LINGRY_CORS_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
	const allowed = new Set(DEFAULT_CORS_ORIGINS.concat(configured));
	const production = String(env.LINGRY_PRODUCTION_ORIGIN || '').trim();
	if (production) {
		allowed.add(production);
	}
	return {
		'access-control-allow-origin': allowed.has(origin) ? origin : 'http://localhost:8080',
		'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
		'access-control-allow-headers': 'authorization,content-type,idempotency-key,x-lingry-indexer-secret',
		'access-control-max-age': '86400',
		vary: 'Origin'
	};
}

async function readJson(request, maxBytes = 65536) {
	const text = await request.text();
	if (text.length > maxBytes) {
		throw apiError('payload_too_large', 'Request body is too large.', 413);
	}
	return text ? JSON.parse(text) : {};
}

export function assertNoPrivateKeyFields(body) {
	const blocked = ['wif', 'private_key', 'privateKey', 'seed', 'seed_phrase', 'mnemonic'];
	const stack = [body];
	while (stack.length) {
		const current = stack.pop();
		if (!current || typeof current !== 'object') {
			continue;
		}
		for (const [key, value] of Object.entries(current)) {
			if (blocked.includes(key)) {
				throw apiError('private_key_rejected', 'Private keys, WIFs, and seed phrases are never accepted by the Lingry API.', 400);
			}
			if (value && typeof value === 'object') {
				stack.push(value);
			}
		}
	}
}

async function sha256Hex(text) {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
	return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes) {
	return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlText(text) {
	return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64UrlText(text) {
	const padded = String(text || '').replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(text || '').length + 3) % 4);
	return atob(padded);
}

async function hmacHex(secret, text) {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(text || '')));
	return Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacBase64Url(secret, text) {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return base64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(text || ''))));
}

async function mintSessionToken(env, address, scopes) {
	const secret = String(env.LINGRY_SESSION_SECRET || '');
	if (!secret) {
		throw apiError('server_not_configured', 'LINGRY_SESSION_SECRET is required.', 503, true);
	}
	const payload = {
		sid: randomId('sess'),
		address,
		scopes: Array.from(new Set(scopes || [])),
		exp: Math.floor(Date.now() / 1000) + 3600
	};
	const encoded = base64UrlText(JSON.stringify(payload));
	const sig = await hmacBase64Url(secret, encoded);
	return { token: `${encoded}.${sig}`, payload };
}

async function verifySessionToken(env, token) {
	const secret = String(env.LINGRY_SESSION_SECRET || '');
	if (!secret || !token || !token.includes('.')) {
		return null;
	}
	const [encoded, sig] = token.split('.');
	const expected = await hmacBase64Url(secret, encoded);
	if (sig !== expected) {
		return null;
	}
	const payload = JSON.parse(fromBase64UrlText(encoded));
	if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
		return null;
	}
	return payload;
}

function requireScopes(session, scopes) {
	const owned = new Set(session && session.scopes || []);
	for (const scope of scopes) {
		if (!owned.has(scope)) {
			throw apiError('forbidden', 'Session does not include required scope: ' + scope, 403);
		}
	}
}

async function callDo(namespace, name, path, init = {}) {
	if (!namespace || typeof namespace.idFromName !== 'function') {
		throw apiError('server_not_configured', 'Required Durable Object binding is not configured.', 503, true);
	}
	const id = namespace.idFromName(name);
	const stub = namespace.get(id);
	const response = await stub.fetch('https://lingry.internal' + path, {
		...init,
		headers: {
			'content-type': 'application/json',
			...(init.headers || {})
		}
	});
	const json = await response.json().catch(() => null);
	if (!response.ok || !json || json.ok === false) {
		throw apiError(json && json.error && json.error.code || 'durable_object_error', json && json.error && json.error.message || 'Durable Object request failed.', response.status || 500, response.status >= 500);
	}
	return json.data;
}

function sqlAll(storage, query, ...bindings) {
	const cursor = storage.sql.exec(query, ...bindings);
	return Array.from(cursor);
}

function sqlFirst(storage, query, ...bindings) {
	return sqlAll(storage, query, ...bindings)[0] || null;
}

function sqlRun(storage, query, ...bindings) {
	storage.sql.exec(query, ...bindings);
}

function responseData(data, status = 200) {
	return envelope(data, status);
}

function responseError(error) {
	return errorEnvelope(error);
}

class SqlDoBase {
	constructor(state, env) {
		this.state = state;
		this.env = env;
		this.initialized = false;
	}

	initOnce(statements) {
		if (this.initialized) {
			return;
		}
		for (const statement of statements) {
			sqlRun(this.state.storage, statement);
		}
		this.initialized = true;
	}
}

export class ActorDO extends SqlDoBase {
	async fetch(request) {
		try {
			this.initOnce([
				`CREATE TABLE IF NOT EXISTS challenges (challenge_id TEXT PRIMARY KEY, address TEXT NOT NULL, nonce TEXT NOT NULL, message TEXT NOT NULL, scopes TEXT NOT NULL, client_name TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at TEXT)`,
				`CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, address TEXT NOT NULL, scopes TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL)`,
				`CREATE TABLE IF NOT EXISTS wallets (address TEXT PRIMARY KEY, public_key TEXT, address_type TEXT, metadata_json TEXT, registered_at TEXT NOT NULL)`,
				`CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY, response_json TEXT NOT NULL, created_at TEXT NOT NULL)`
			]);
			const url = new URL(request.url);
			const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
			if (url.pathname === '/challenge' && request.method === 'POST') {
				return responseData(this.createChallenge(body), 201);
			}
			if (url.pathname === '/verify' && request.method === 'POST') {
				return responseData(await this.verifyChallenge(body));
			}
			if (url.pathname === '/session' && request.method === 'POST') {
				this.storeSession(body);
				return responseData({ stored: true });
			}
			if (url.pathname === '/wallet' && request.method === 'POST') {
				return responseData(this.registerWallet(body), 201);
			}
			if (url.pathname === '/wallet' && request.method === 'GET') {
				const address = url.searchParams.get('address') || '';
				return responseData({ wallet: this.getWallet(address) });
			}
			return responseError(apiError('not_found', 'Actor route not found.', 404));
		} catch (error) {
			return responseError(error);
		}
	}

	createChallenge(body) {
		const address = normalizeText(body.address);
		if (!address) {
			throw apiError('validation_error', 'Address is required.', 400);
		}
		const scopes = Array.isArray(body.requested_scopes) ? body.requested_scopes.map(normalizeText).filter(Boolean) : [];
		const nonce = randomId('nonce');
		const challengeId = randomId('chal');
		const expiresAt = Math.floor(Date.now() / 1000) + 300;
		const clientName = sanitizeField(body.client_name || 'unknown', 80);
		const message = [
			'Lingry API authentication',
			'Address: ' + address,
			'Nonce: ' + nonce,
			'Client: ' + clientName,
			'Scopes: ' + scopes.join(','),
			'Expires: ' + new Date(expiresAt * 1000).toISOString()
		].join('\n');
		sqlRun(this.state.storage, 'INSERT INTO challenges (challenge_id, address, nonce, message, scopes, client_name, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', challengeId, address, nonce, message, JSON.stringify(scopes), clientName, expiresAt);
		return {
			challenge_id: challengeId,
			message,
			nonce,
			expires_at: new Date(expiresAt * 1000).toISOString(),
			requested_scopes: scopes
		};
	}

	async verifyChallenge(body) {
		const row = sqlFirst(this.state.storage, 'SELECT * FROM challenges WHERE challenge_id = ?', String(body.challenge_id || ''));
		if (!row) {
			throw apiError('not_found', 'Challenge was not found.', 404);
		}
		if (row.used_at) {
			throw apiError('nonce_reused', 'Challenge has already been used.', 409);
		}
		if (Number(row.expires_at) < Math.floor(Date.now() / 1000)) {
			throw apiError('challenge_expired', 'Challenge has expired.', 401);
		}
		if (normalizeText(body.address) !== row.address) {
			throw apiError('invalid_signature', 'Challenge address mismatch.', 401);
		}
		const verified = await SugarchainMessageVerifier.verify({
			address: row.address,
			message: row.message,
			nonce: row.nonce,
			signature: normalizeText(body.signature),
			env: this.env
		});
		if (!verified.ok) {
			throw apiError('invalid_signature', verified.message, verified.status || 401);
		}
		sqlRun(this.state.storage, 'UPDATE challenges SET used_at = ? WHERE challenge_id = ?', nowIso(), row.challenge_id);
		return {
			address: row.address,
			scopes: JSON.parse(row.scopes || '[]')
		};
	}

	storeSession(body) {
		const session = body.session || {};
		sqlRun(this.state.storage, 'INSERT OR REPLACE INTO sessions (sid, address, scopes, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', session.sid, session.address, JSON.stringify(session.scopes || []), Number(session.exp || 0), nowIso());
	}

	registerWallet(body) {
		const address = normalizeText(body.address);
		if (!address) {
			throw apiError('validation_error', 'Address is required.', 400);
		}
		sqlRun(this.state.storage, 'INSERT OR REPLACE INTO wallets (address, public_key, address_type, metadata_json, registered_at) VALUES (?, ?, ?, ?, ?)', address, normalizeText(body.public_key), normalizeText(body.address_type || 'segwit'), JSON.stringify(body.metadata || {}), nowIso());
		return this.getWallet(address);
	}

	getWallet(address) {
		const row = sqlFirst(this.state.storage, 'SELECT * FROM wallets WHERE address = ?', normalizeText(address));
		if (!row) {
			return null;
		}
		return {
			address: row.address,
			public_key: row.public_key || '',
			address_type: row.address_type || '',
			metadata: JSON.parse(row.metadata_json || '{}'),
			registered_at: row.registered_at
		};
	}
}

export class LexiconShardDO extends SqlDoBase {
	async fetch(request) {
		try {
			this.initOnce([
				`CREATE TABLE IF NOT EXISTS words (word_id TEXT PRIMARY KEY, language_code TEXT NOT NULL, normalized_term TEXT NOT NULL, term TEXT NOT NULL, part_of_speech TEXT NOT NULL, meaning TEXT NOT NULL, creator_address TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, payload_hex TEXT NOT NULL, metadata_key TEXT, metadata_sha256 TEXT, txid TEXT, confirmation_json TEXT, likes INTEGER NOT NULL DEFAULT 0, tip_count INTEGER NOT NULL DEFAULT 0, tip_total INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(language_code, normalized_term))`,
				`CREATE TABLE IF NOT EXISTS likes (word_id TEXT NOT NULL, liker_address TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (word_id, liker_address))`,
				`CREATE TABLE IF NOT EXISTS intents (intent_id TEXT PRIMARY KEY, type TEXT NOT NULL, word_id TEXT, actor_address TEXT NOT NULL, expected_json TEXT NOT NULL, status TEXT NOT NULL, txid TEXT, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
				`CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, type TEXT NOT NULL, body_json TEXT NOT NULL, created_at TEXT NOT NULL)`
			]);
			const url = new URL(request.url);
			const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
			if (url.pathname === '/words' && request.method === 'POST') {
				return responseData(this.createWord(body), 201);
			}
			if (url.pathname === '/words' && request.method === 'GET') {
				return responseData(this.listWords(url.searchParams));
			}
			const wordMatch = url.pathname.match(/^\/words\/([^/]+)$/);
			if (wordMatch && request.method === 'GET') {
				return responseData({ word: this.getWord(wordMatch[1]) });
			}
			const coinMatch = url.pathname.match(/^\/words\/([^/]+)\/coin\/prepare$/);
			if (coinMatch && request.method === 'POST') {
				return responseData(this.prepareCoin(coinMatch[1], body), 201);
			}
			const tipMatch = url.pathname.match(/^\/words\/([^/]+)\/tips\/prepare$/);
			if (tipMatch && request.method === 'POST') {
				return responseData(this.prepareTip(tipMatch[1], body), 201);
			}
			const likeMatch = url.pathname.match(/^\/words\/([^/]+)\/likes$/);
			if (likeMatch && (request.method === 'POST' || request.method === 'DELETE')) {
				return responseData(this.setLike(likeMatch[1], body, request.method === 'POST'));
			}
			const submitMatch = url.pathname.match(/^\/transactions\/([^/]+)\/submit$/);
			if (submitMatch && request.method === 'POST') {
				return responseData(await this.submitTransaction(submitMatch[1], body));
			}
			const intentMatch = url.pathname.match(/^\/transactions\/([^/]+)$/);
			if (intentMatch && request.method === 'GET') {
				return responseData({ transaction: this.getIntent(intentMatch[1]) });
			}
			if (url.pathname === '/indexer/ingest' && request.method === 'POST') {
				return responseData(this.ingest(body));
			}
			return responseError(apiError('not_found', 'Lexicon route not found.', 404));
		} catch (error) {
			return responseError(error);
		}
	}

	createWord(body) {
		const payload = buildLingryPayload(body);
		const wordId = normalizeText(body.word_id) || randomId('word');
		const timestamp = nowIso();
		try {
			sqlRun(this.state.storage, `INSERT INTO words (word_id, language_code, normalized_term, term, part_of_speech, meaning, creator_address, status, payload, payload_hex, metadata_key, metadata_sha256, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
				wordId,
				payload.language_code,
				payload.normalized_term,
				payload.term,
				payload.part_of_speech,
				payload.meaning,
				normalizeText(body.creator_address),
				payload.op_return_payload,
				payload.op_return_hex,
				body.metadata_key || '',
				body.metadata_sha256 || '',
				timestamp,
				timestamp
			);
		} catch (error) {
			if (String(error && error.message || '').toLowerCase().includes('unique')) {
				throw apiError('conflict', 'This normalized word has already been created for this language.', 409);
			}
			throw error;
		}
		this.emit('word.created', { word_id: wordId, language_code: payload.language_code, normalized_term: payload.normalized_term });
		return { word: this.getWord(wordId) };
	}

	listWords(params) {
		const limit = Math.max(1, Math.min(Number(params.get('limit')) || 25, 100));
		const cursor = Math.max(0, Number(params.get('cursor')) || 0);
		const where = [];
		const bindings = [];
		const languageCode = normalizeLanguageCode(params.get('language_code'));
		if (languageCode) {
			where.push('language_code = ?');
			bindings.push(languageCode);
		}
		const status = normalizeText(params.get('status'));
		if (status) {
			where.push('status = ?');
			bindings.push(status);
		}
		const creator = normalizeText(params.get('creator_address'));
		if (creator) {
			where.push('creator_address = ?');
			bindings.push(creator);
		}
		const q = normalizeWord(params.get('q'));
		if (q) {
			where.push('(normalized_term LIKE ? OR meaning LIKE ?)');
			bindings.push('%' + q + '%', '%' + q + '%');
		}
		const sort = params.get('sort') || 'newest';
		const order = sort === 'popular' ? 'likes DESC, created_at DESC' : sort === 'tipped' ? 'tip_total DESC, created_at DESC' : 'created_at DESC';
		const rows = sqlAll(this.state.storage, `SELECT * FROM words ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT ? OFFSET ?`, ...bindings, limit, cursor);
		return {
			words: rows.map(row => this.rowToWord(row)),
			next_cursor: rows.length === limit ? String(cursor + limit) : ''
		};
	}

	getWord(wordId) {
		const row = sqlFirst(this.state.storage, 'SELECT * FROM words WHERE word_id = ?', wordId);
		if (!row) {
			throw apiError('not_found', 'Word was not found.', 404);
		}
		return this.rowToWord(row);
	}

	prepareCoin(wordId, body) {
		const word = this.getWord(wordId);
		const actorAddress = normalizeText(body.actor_address);
		if (!actorAddress || actorAddress !== word.creator_address) {
			throw apiError('forbidden', 'Only the draft creator can prepare coining.', 403);
		}
		const feeSatoshis = Math.max(250, Math.floor(Number(body.fee_satoshis || 1000)));
		const intentId = randomId('intent');
		const expiresAt = Math.floor(Date.now() / 1000) + 900;
		const expected = {
			network: 'sugarchain',
			kind: 'coin_word',
			word_id: wordId,
			op_return_payload: word.op_return_payload,
			op_return_hex: word.op_return_hex,
			change_address: actorAddress,
			fee_satoshis: feeSatoshis,
			unsigned_transaction: {
				version: 2,
				inputs: Array.isArray(body.utxos) ? body.utxos : [],
				outputs: [
					{ type: 'op_return', value: 0, payload: word.op_return_payload, payload_hex: word.op_return_hex },
					{ type: 'change', address: actorAddress }
				]
			}
		};
		this.storeIntent(intentId, 'coin', wordId, actorAddress, expected, expiresAt);
		sqlRun(this.state.storage, 'UPDATE words SET status = ?, updated_at = ? WHERE word_id = ?', 'pending', nowIso(), wordId);
		this.emit('word.coinage_prepared', { word_id: wordId, intent_id: intentId });
		return {
			intent_id: intentId,
			status: 'pending',
			unsigned_transaction: expected.unsigned_transaction,
			required_outputs: expected.unsigned_transaction.outputs,
			fee_estimate_satoshis: feeSatoshis,
			expires_at: new Date(expiresAt * 1000).toISOString()
		};
	}

	prepareTip(wordId, body) {
		const word = this.getWord(wordId);
		const actorAddress = normalizeText(body.actor_address);
		const amount = Math.floor(Number(body.amount_satoshis || 0));
		const minTip = Math.floor(Number(this.env.LINGRY_MIN_TIP_SATOSHIS || 1));
		const maxTip = Math.floor(Number(this.env.LINGRY_MAX_TIP_SATOSHIS || 100000000));
		if (!actorAddress || actorAddress === word.creator_address) {
			throw apiError('validation_error', 'Tipper address must differ from creator address.', 400);
		}
		if (amount < minTip || amount > maxTip) {
			throw apiError('validation_error', 'Tip amount is outside configured limits.', 400);
		}
		const feeSatoshis = Math.max(250, Math.floor(Number(body.fee_satoshis || 1000)));
		const intentId = randomId('intent');
		const expiresAt = Math.floor(Date.now() / 1000) + 900;
		const expected = {
			network: 'sugarchain',
			kind: 'tip_word',
			word_id: wordId,
			recipient_address: word.creator_address,
			amount_satoshis: amount,
			fee_satoshis: feeSatoshis,
			note: sanitizeField(body.note, 120),
			unsigned_transaction: {
				version: 2,
				inputs: Array.isArray(body.utxos) ? body.utxos : [],
				outputs: [
					{ type: 'payment', address: word.creator_address, value: amount },
					{ type: 'change', address: actorAddress }
				]
			}
		};
		this.storeIntent(intentId, 'tip', wordId, actorAddress, expected, expiresAt);
		this.emit('tip.prepared', { word_id: wordId, intent_id: intentId, amount_satoshis: amount });
		return {
			intent_id: intentId,
			expected_recipient: word.creator_address,
			amount_satoshis: amount,
			fee_estimate_satoshis: feeSatoshis,
			total_cost_satoshis: amount + feeSatoshis,
			unsigned_transaction: expected.unsigned_transaction,
			expires_at: new Date(expiresAt * 1000).toISOString()
		};
	}

	async submitTransaction(intentId, body) {
		const intent = this.getIntent(intentId);
		if (intent.status === 'broadcast' || intent.status === 'pending') {
			return { transaction: intent };
		}
		if (intent.expires_at_epoch < Math.floor(Date.now() / 1000)) {
			throw apiError('intent_expired', 'Transaction intent has expired.', 409);
		}
		const rawHex = normalizeHex(body.signed_transaction_hex);
		if (!rawHex || rawHex.length < 20) {
			throw apiError('validation_error', 'Signed transaction hex is required.', 400);
		}
		const expected = intent.expected;
		this.verifySignedTransaction(rawHex, expected);
		const txid = await this.broadcastRawTransaction(rawHex);
		sqlRun(this.state.storage, 'UPDATE intents SET status = ?, txid = ?, updated_at = ? WHERE intent_id = ?', 'pending', txid, nowIso(), intentId);
		if (intent.type === 'coin') {
			sqlRun(this.state.storage, 'UPDATE words SET status = ?, txid = ?, updated_at = ? WHERE word_id = ?', 'pending', txid, nowIso(), intent.word_id);
			this.emit('word.coinage_submitted', { word_id: intent.word_id, intent_id: intentId, txid });
		}
		if (intent.type === 'tip') {
			sqlRun(this.state.storage, 'UPDATE words SET tip_count = tip_count + 1, tip_total = tip_total + ?, updated_at = ? WHERE word_id = ?', Number(expected.amount_satoshis || 0), nowIso(), intent.word_id);
			this.emit('tip.submitted', { word_id: intent.word_id, intent_id: intentId, txid, amount_satoshis: expected.amount_satoshis });
		}
		return { transaction: this.getIntent(intentId) };
	}

	verifySignedTransaction(rawHex, expected) {
		let tx;
		try {
			tx = bitcoin.Transaction.fromHex(rawHex);
		} catch (error) {
			throw apiError('invalid_transaction', 'Signed transaction hex cannot be parsed.', 400);
		}
		if (expected.kind === 'coin_word') {
			const requiredPayload = normalizeHex(expected.op_return_hex);
			const hasPayload = tx.outs.some(output => {
				const script = output.script || Buffer.alloc(0);
				if (!script.length || script[0] !== bitcoin.opcodes.OP_RETURN) {
					return false;
				}
				return normalizeHex(script.toString('hex')).includes(requiredPayload);
			});
			if (!hasPayload) {
				throw apiError('intent_mismatch', 'Signed transaction does not contain the expected Lingry OP_RETURN payload.', 409);
			}
		}
		if (expected.kind === 'tip_word') {
			const hasTip = tx.outs.some(output => {
				try {
					return output.value === Number(expected.amount_satoshis) && bitcoin.address.fromOutputScript(output.script, sugarNetwork) === expected.recipient_address;
				} catch (error) {
					return false;
				}
			});
			if (!hasTip) {
				throw apiError('intent_mismatch', 'Signed transaction does not pay the expected tip recipient and amount.', 409);
			}
		}
	}

	async broadcastRawTransaction(rawHex) {
		if (this.env.SUGARCHAIN_RPC_URL) {
			const auth = this.env.SUGARCHAIN_RPC_USERNAME ? 'Basic ' + btoa(this.env.SUGARCHAIN_RPC_USERNAME + ':' + (this.env.SUGARCHAIN_RPC_PASSWORD || '')) : '';
			const response = await fetch(this.env.SUGARCHAIN_RPC_URL, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(auth ? { authorization: auth } : {})
				},
				body: JSON.stringify({ jsonrpc: '1.0', id: randomId('rpc'), method: 'sendrawtransaction', params: [rawHex] })
			});
			const json = await response.json().catch(() => null);
			if (!response.ok || !json || json.error) {
				throw apiError('broadcast_failed', json && json.error && json.error.message || 'Sugarchain broadcast failed.', 502, true);
			}
			return String(json.result || '');
		}
		if (this.env.LINGRY_MOCK_BROADCAST_TXID) {
			return String(this.env.LINGRY_MOCK_BROADCAST_TXID);
		}
		throw apiError('server_not_configured', 'Sugarchain RPC is not configured.', 503, true);
	}

	setLike(wordId, body, liked) {
		this.getWord(wordId);
		const address = normalizeText(body.actor_address);
		if (!address) {
			throw apiError('validation_error', 'Authenticated wallet address is required.', 400);
		}
		if (liked) {
			sqlRun(this.state.storage, 'INSERT OR IGNORE INTO likes (word_id, liker_address, created_at) VALUES (?, ?, ?)', wordId, address, nowIso());
		} else {
			sqlRun(this.state.storage, 'DELETE FROM likes WHERE word_id = ? AND liker_address = ?', wordId, address);
		}
		const count = sqlFirst(this.state.storage, 'SELECT COUNT(*) AS count FROM likes WHERE word_id = ?', wordId).count || 0;
		sqlRun(this.state.storage, 'UPDATE words SET likes = ?, updated_at = ? WHERE word_id = ?', count, nowIso(), wordId);
		this.emit(liked ? 'like.created' : 'like.deleted', { word_id: wordId, actor_address: address });
		return { word: this.getWord(wordId), liked };
	}

	ingest(body) {
		const records = Array.isArray(body.records) ? body.records : [body.record || body];
		const confirmed = [];
		for (const record of records) {
			const parsed = parseLingryPayload(record.op_return_payload || record.raw_payload || '');
			if (!parsed) {
				continue;
			}
			const existing = sqlFirst(this.state.storage, 'SELECT * FROM words WHERE language_code = ? AND normalized_term = ?', parsed.language_code, parsed.normalized_word);
			if (existing) {
				sqlRun(this.state.storage, 'UPDATE words SET status = ?, txid = COALESCE(NULLIF(?, \'\'), txid), confirmation_json = ?, updated_at = ? WHERE word_id = ?', 'confirmed', normalizeHex(record.txid), JSON.stringify(record), nowIso(), existing.word_id);
				this.emit('word.confirmed', { word_id: existing.word_id, txid: normalizeHex(record.txid) });
				confirmed.push(existing.word_id);
			}
		}
		return { confirmed_word_ids: confirmed };
	}

	storeIntent(intentId, type, wordId, actorAddress, expected, expiresAt) {
		sqlRun(this.state.storage, 'INSERT INTO intents (intent_id, type, word_id, actor_address, expected_json, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', intentId, type, wordId, actorAddress, JSON.stringify(expected), 'prepared', expiresAt, nowIso(), nowIso());
	}

	getIntent(intentId) {
		const row = sqlFirst(this.state.storage, 'SELECT * FROM intents WHERE intent_id = ?', intentId);
		if (!row) {
			throw apiError('not_found', 'Transaction intent was not found.', 404);
		}
		return {
			intent_id: row.intent_id,
			type: row.type,
			word_id: row.word_id,
			actor_address: row.actor_address,
			expected: JSON.parse(row.expected_json || '{}'),
			status: row.status,
			txid: row.txid || '',
			expires_at: new Date(Number(row.expires_at) * 1000).toISOString(),
			expires_at_epoch: Number(row.expires_at),
			created_at: row.created_at,
			updated_at: row.updated_at
		};
	}

	rowToWord(row) {
		return {
			word_id: row.word_id,
			language_code: row.language_code,
			term: row.term,
			normalized_term: row.normalized_term,
			part_of_speech: row.part_of_speech,
			meaning: row.meaning,
			creator_address: row.creator_address,
			status: row.status,
			op_return_payload: row.payload,
			op_return_hex: row.payload_hex,
			metadata_key: row.metadata_key || '',
			metadata_sha256: row.metadata_sha256 || '',
			txid: row.txid || '',
			confirmation: row.confirmation_json ? JSON.parse(row.confirmation_json) : null,
			likes: Number(row.likes || 0),
			tip_count: Number(row.tip_count || 0),
			tip_total_satoshis: Number(row.tip_total || 0),
			tip_total: Number(row.tip_total || 0) / Math.pow(10, SUGAR_DECIMALS),
			created_at: row.created_at,
			updated_at: row.updated_at
		};
	}

	emit(type, body) {
		sqlRun(this.state.storage, 'INSERT INTO events (event_id, type, body_json, created_at) VALUES (?, ?, ?, ?)', randomId('evt'), type, JSON.stringify(body || {}), nowIso());
	}
}

export class FeedDO extends SqlDoBase {
	async fetch(request) {
		try {
			this.initOnce([`CREATE TABLE IF NOT EXISTS feed_events (event_id TEXT PRIMARY KEY, type TEXT NOT NULL, body_json TEXT NOT NULL, created_at TEXT NOT NULL)`]);
			const url = new URL(request.url);
			if (url.pathname === '/events' && request.method === 'GET') {
				const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 50, 100));
				const rows = sqlAll(this.state.storage, 'SELECT * FROM feed_events ORDER BY created_at DESC LIMIT ?', limit);
				return responseData({ events: rows.map(row => ({ event_id: row.event_id, type: row.type, data: JSON.parse(row.body_json || '{}'), created_at: row.created_at })) });
			}
			if (url.pathname === '/events' && request.method === 'POST') {
				const body = await request.json().catch(() => ({}));
				sqlRun(this.state.storage, 'INSERT OR REPLACE INTO feed_events (event_id, type, body_json, created_at) VALUES (?, ?, ?, ?)', body.event_id || randomId('evt'), normalizeText(body.type), JSON.stringify(body.data || {}), nowIso());
				return responseData({ stored: true }, 201);
			}
			return responseError(apiError('not_found', 'Feed route not found.', 404));
		} catch (error) {
			return responseError(error);
		}
	}
}

export class WebhookDO extends SqlDoBase {
	async fetch(request) {
		try {
			this.initOnce([
				`CREATE TABLE IF NOT EXISTS webhooks (webhook_id TEXT PRIMARY KEY, actor_address TEXT NOT NULL, url TEXT NOT NULL, events_json TEXT NOT NULL, secret_hint TEXT NOT NULL, created_at TEXT NOT NULL)`,
				`CREATE TABLE IF NOT EXISTS deliveries (delivery_id TEXT PRIMARY KEY, webhook_id TEXT NOT NULL, event_type TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, created_at TEXT NOT NULL)`
			]);
			const url = new URL(request.url);
			const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
			if (url.pathname === '/webhooks' && request.method === 'POST') {
				const webhookUrl = normalizeText(body.url);
				if (!/^https:\/\//.test(webhookUrl)) {
					throw apiError('validation_error', 'Webhook URL must use HTTPS.', 400);
				}
				const webhookId = randomId('wh');
				sqlRun(this.state.storage, 'INSERT INTO webhooks (webhook_id, actor_address, url, events_json, secret_hint, created_at) VALUES (?, ?, ?, ?, ?, ?)', webhookId, normalizeText(body.actor_address), webhookUrl, JSON.stringify(body.events || []), 'hmac-sha256', nowIso());
				return responseData({ webhook_id: webhookId, url: webhookUrl, events: body.events || [] }, 201);
			}
			const deleteMatch = url.pathname.match(/^\/webhooks\/([^/]+)$/);
			if (deleteMatch && request.method === 'DELETE') {
				sqlRun(this.state.storage, 'DELETE FROM webhooks WHERE webhook_id = ?', deleteMatch[1]);
				return responseData({ deleted: true });
			}
			return responseError(apiError('not_found', 'Webhook route not found.', 404));
		} catch (error) {
			return responseError(error);
		}
	}

	static async sign(env, rawBody, timestamp) {
		const secret = String(env.LINGRY_WEBHOOK_SECRET || '');
		if (!secret) {
			throw apiError('server_not_configured', 'LINGRY_WEBHOOK_SECRET is required for webhook signing.', 503);
		}
		return hmacHex(secret, timestamp + '.' + rawBody);
	}
}

export class SugarchainMessageVerifier {
	static async verify({ signature, nonce, env }) {
		if (String(env.LINGRY_ENABLE_DEV_SIGNATURES || '').toLowerCase() === 'true') {
			return signature === 'dev:' + nonce
				? { ok: true }
				: { ok: false, message: 'Invalid development signature.' };
		}
		return {
			ok: false,
			status: 501,
			message: 'Sugarchain wallet-message signature verification is not wired yet. The verifier interface rejects by default until a compatible real-wallet verifier is installed.'
		};
	}
}

export async function storeMetadata(env, wordId, metadata) {
	const json = JSON.stringify(metadata);
	const hash = await sha256Hex(json);
	const key = `words/${wordId}.json`;
	if (env.LINGRY_METADATA && typeof env.LINGRY_METADATA.put === 'function') {
		await env.LINGRY_METADATA.put(key, json, {
			httpMetadata: { contentType: 'application/json; charset=utf-8' },
			customMetadata: { sha256: hash }
		});
	}
	return { key, hash };
}

async function authenticate(request, env) {
	const auth = request.headers.get('authorization') || '';
	const match = auth.match(/^Bearer\s+(.+)$/i);
	if (!match) {
		throw apiError('unauthorized', 'Bearer session token is required.', 401);
	}
	const session = await verifySessionToken(env, match[1]);
	if (!session) {
		throw apiError('unauthorized', 'Session is invalid or expired.', 401);
	}
	return session;
}

function requireIdempotency(request) {
	if (!WRITE_METHODS.has(request.method)) {
		return '';
	}
	const key = normalizeText(request.headers.get('idempotency-key'));
	if (!key) {
		throw apiError('idempotency_required', 'Idempotency-Key header is required for state-changing routes.', 400);
	}
	return key;
}

function shardName(languageCode) {
	return 'language:' + normalizeLanguageCode(languageCode || 'W');
}

async function handleApi(request, env) {
	const url = new URL(request.url);
	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders(request, env) });
	}
	const id = requestId();
	const headers = corsHeaders(request, env);
	try {
		if (WRITE_METHODS.has(request.method)) {
			requireIdempotency(request);
		}
		if (url.pathname === '/v1/healthz') {
			return envelope({ status: 'ok', languages: LINGRY_LANGUAGES.length }, 200, headers, id);
		}
		if (url.pathname === '/openapi.json') {
			return new Response(JSON.stringify(OPENAPI), { status: 200, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
		}
		if (url.pathname === '/v1/auth/challenge' && request.method === 'POST') {
			const body = await readJson(request);
			assertNoPrivateKeyFields(body);
			const data = await callDo(env.LINGRY_ACTOR, normalizeText(body.address), '/challenge', { method: 'POST', body: JSON.stringify(body) });
			return envelope(data, 201, headers, id);
		}
		if (url.pathname === '/v1/auth/verify' && request.method === 'POST') {
			const body = await readJson(request);
			assertNoPrivateKeyFields(body);
			const verified = await callDo(env.LINGRY_ACTOR, normalizeText(body.address), '/verify', { method: 'POST', body: JSON.stringify(body) });
			const minted = await mintSessionToken(env, verified.address, verified.scopes);
			await callDo(env.LINGRY_ACTOR, verified.address, '/session', { method: 'POST', body: JSON.stringify({ session: minted.payload }) });
			return envelope({
				address: verified.address,
				scopes: verified.scopes,
				session_token: minted.token,
				expires_at: new Date(minted.payload.exp * 1000).toISOString()
			}, 200, headers, id);
		}
		if (url.pathname === '/v1/internal/indexer/ingest' && request.method === 'POST') {
			const secret = request.headers.get('x-lingry-indexer-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
			if (!env.INTERNAL_INDEXER_SECRET || secret !== env.INTERNAL_INDEXER_SECRET) {
				throw apiError('unauthorized', 'Indexer secret is invalid.', 401);
			}
			const body = await readJson(request, 1024 * 1024);
			const records = Array.isArray(body.records) ? body.records : [body.record || body];
			const byLanguage = new Map();
			for (const record of records) {
				const parsed = parseLingryPayload(record.op_return_payload || record.raw_payload || '');
				if (parsed) {
					const bucket = byLanguage.get(parsed.language_code) || [];
					bucket.push({ ...record, op_return_payload: parsed.op_return_payload });
					byLanguage.set(parsed.language_code, bucket);
				}
			}
			const results = [];
			for (const [languageCode, bucket] of byLanguage) {
				results.push(await callDo(env.LINGRY_LEXICON, shardName(languageCode), '/indexer/ingest', { method: 'POST', body: JSON.stringify({ records: bucket }) }));
			}
			return envelope({ ingested_languages: results.length, results }, 200, headers, id);
		}

		let session = null;
		if (!WRITE_ROUTES_WITHOUT_AUTH.has(url.pathname) && (url.pathname.startsWith('/v1/me') || url.pathname.startsWith('/v1/wallets') || (WRITE_METHODS.has(request.method) && !url.pathname.startsWith('/v1/webhooks')))) {
			session = await authenticate(request, env);
		}
		if (url.pathname === '/v1/auth/logout' && request.method === 'POST') {
			return envelope({ logged_out: true }, 200, headers, id);
		}
		if (url.pathname === '/v1/me' && request.method === 'GET') {
			session = session || await authenticate(request, env);
			return envelope({ address: session.address, scopes: session.scopes }, 200, headers, id);
		}
		if (url.pathname === '/v1/wallets/register' && request.method === 'POST') {
			session = session || await authenticate(request, env);
			const body = await readJson(request);
			assertNoPrivateKeyFields(body);
			if (normalizeText(body.address) !== session.address) {
				throw apiError('forbidden', 'Wallet registration address must match the session address.', 403);
			}
			const wallet = await callDo(env.LINGRY_ACTOR, session.address, '/wallet', { method: 'POST', body: JSON.stringify(body) });
			return envelope({ wallet }, 201, headers, id);
		}
		if (url.pathname === '/v1/wallets/me' && request.method === 'GET') {
			session = session || await authenticate(request, env);
			const data = await callDo(env.LINGRY_ACTOR, session.address, '/wallet?address=' + encodeURIComponent(session.address), { method: 'GET' });
			return envelope(data, 200, headers, id);
		}
		if (url.pathname === '/v1/words' && request.method === 'POST') {
			session = session || await authenticate(request, env);
			requireScopes(session, ['words:create']);
			const body = await readJson(request);
			assertNoPrivateKeyFields(body);
			const payload = buildLingryPayload(body);
			const wordId = randomId('word');
			const metadata = {
				word_id: wordId,
				language_code: payload.language_code,
				term: payload.term,
				part_of_speech: payload.part_of_speech,
				meaning: payload.meaning,
				etymology: sanitizeField(body.etymology, 500),
				source: sanitizeField(body.source || 'api', 80),
				creator_address: session.address,
				created_at: nowIso()
			};
			const stored = await storeMetadata(env, wordId, metadata);
			const data = await callDo(env.LINGRY_LEXICON, shardName(payload.language_code), '/words', {
				method: 'POST',
				body: JSON.stringify({ ...body, word_id: wordId, creator_address: session.address, metadata_key: stored.key, metadata_sha256: stored.hash })
			});
			return envelope(data, 201, headers, id);
		}
		if (url.pathname === '/v1/words' && request.method === 'GET') {
			const languageCode = normalizeLanguageCode(url.searchParams.get('language_code')) || 'W';
			const data = await callDo(env.LINGRY_LEXICON, shardName(languageCode), '/words?' + url.searchParams.toString(), { method: 'GET' });
			return envelope(data, 200, headers, id);
		}
		const wordMatch = url.pathname.match(/^\/v1\/words\/([^/]+)$/);
		if (wordMatch && request.method === 'GET') {
			const languageCode = normalizeLanguageCode(url.searchParams.get('language_code')) || 'W';
			const data = await callDo(env.LINGRY_LEXICON, shardName(languageCode), '/words/' + encodeURIComponent(wordMatch[1]), { method: 'GET' });
			return envelope(data, 200, headers, id);
		}
		const coinMatch = url.pathname.match(/^\/v1\/words\/([^/]+)\/coin\/prepare$/);
		if (coinMatch && request.method === 'POST') {
			session = session || await authenticate(request, env);
			requireScopes(session, ['words:create']);
			const body = await readJson(request);
			assertNoPrivateKeyFields(body);
			const languageCode = normalizeLanguageCode(body.language_code || url.searchParams.get('language_code')) || 'W';
			const data = await callDo(env.LINGRY_LEXICON, shardName(languageCode), '/words/' + encodeURIComponent(coinMatch[1]) + '/coin/prepare', { method: 'POST', body: JSON.stringify({ ...body, actor_address: session.address }) });
			return envelope(data, 201, headers, id);
		}
		const likeMatch = url.pathname.match(/^\/v1\/words\/([^/]+)\/likes$/);
		if (likeMatch && (request.method === 'POST' || request.method === 'DELETE')) {
			session = session || await authenticate(request, env);
			requireScopes(session, ['likes:create']);
			const body = request.method === 'POST' ? await readJson(request) : {};
			const languageCode = normalizeLanguageCode(body.language_code || url.searchParams.get('language_code')) || 'W';
			const data = await callDo(env.LINGRY_LEXICON, shardName(languageCode), '/words/' + encodeURIComponent(likeMatch[1]) + '/likes', { method: request.method, body: JSON.stringify({ ...body, actor_address: session.address }) });
			return envelope(data, 200, headers, id);
		}
		const tipMatch = url.pathname.match(/^\/v1\/words\/([^/]+)\/tips\/prepare$/);
		if (tipMatch && request.method === 'POST') {
			session = session || await authenticate(request, env);
			requireScopes(session, ['tips:create']);
			const body = await readJson(request);
			assertNoPrivateKeyFields(body);
			const languageCode = normalizeLanguageCode(body.language_code || url.searchParams.get('language_code')) || 'W';
			const data = await callDo(env.LINGRY_LEXICON, shardName(languageCode), '/words/' + encodeURIComponent(tipMatch[1]) + '/tips/prepare', { method: 'POST', body: JSON.stringify({ ...body, actor_address: session.address }) });
			return envelope(data, 201, headers, id);
		}
		const submitMatch = url.pathname.match(/^\/v1\/transactions\/([^/]+)\/submit$/);
		if (submitMatch && request.method === 'POST') {
			session = session || await authenticate(request, env);
			const body = await readJson(request, 1024 * 256);
			assertNoPrivateKeyFields(body);
			const languageCode = normalizeLanguageCode(body.language_code || url.searchParams.get('language_code')) || 'W';
			const data = await callDo(env.LINGRY_LEXICON, shardName(languageCode), '/transactions/' + encodeURIComponent(submitMatch[1]) + '/submit', { method: 'POST', body: JSON.stringify(body) });
			return envelope(data, 200, headers, id);
		}
		const transactionMatch = url.pathname.match(/^\/v1\/transactions\/([^/]+)$/);
		if (transactionMatch && request.method === 'GET') {
			const languageCode = normalizeLanguageCode(url.searchParams.get('language_code')) || 'W';
			const data = await callDo(env.LINGRY_LEXICON, shardName(languageCode), '/transactions/' + encodeURIComponent(transactionMatch[1]), { method: 'GET' });
			return envelope(data, 200, headers, id);
		}
		if (url.pathname === '/v1/events' && request.method === 'GET') {
			const data = await callDo(env.LINGRY_FEED, 'global', '/events?' + url.searchParams.toString(), { method: 'GET' });
			return envelope(data, 200, headers, id);
		}
		if (url.pathname === '/v1/webhooks' && request.method === 'POST') {
			session = await authenticate(request, env);
			const body = await readJson(request);
			assertNoPrivateKeyFields(body);
			const data = await callDo(env.LINGRY_WEBHOOKS, session.address, '/webhooks', { method: 'POST', body: JSON.stringify({ ...body, actor_address: session.address }) });
			return envelope(data, 201, headers, id);
		}
		const webhookDelete = url.pathname.match(/^\/v1\/webhooks\/([^/]+)$/);
		if (webhookDelete && request.method === 'DELETE') {
			session = await authenticate(request, env);
			const data = await callDo(env.LINGRY_WEBHOOKS, session.address, '/webhooks/' + encodeURIComponent(webhookDelete[1]), { method: 'DELETE' });
			return envelope(data, 200, headers, id);
		}
		throw apiError('not_found', 'Lingry API route was not found.', 404);
	} catch (error) {
		return errorEnvelope(error, headers, id);
	}
}

export async function handleLingryV1Request(request, env, ctx) {
	const pathname = new URL(request.url).pathname;
	if (pathname.startsWith('/v1/') || pathname === '/openapi.json') {
		return handleApi(request, env, ctx);
	}
	return null;
}

export const OPENAPI = {
	openapi: '3.1.0',
	info: {
		title: 'Lingry Agent API',
		version: '1.0.0-mvp'
	},
	paths: {
		'/v1/auth/challenge': { post: { summary: 'Create a Sugarchain wallet-signature challenge.' } },
		'/v1/auth/verify': { post: { summary: 'Verify a signed challenge and mint a scoped session.' } },
		'/v1/auth/logout': { post: { summary: 'Client-side session logout acknowledgement.' } },
		'/v1/me': { get: { summary: 'Return the authenticated wallet identity.' } },
		'/v1/wallets/register': { post: { summary: 'Register public wallet metadata.' } },
		'/v1/wallets/me': { get: { summary: 'Return registered wallet metadata.' } },
		'/v1/words': { get: { summary: 'List coined or draft words.' }, post: { summary: 'Create a draft Lingry word.' } },
		'/v1/words/{word_id}': { get: { summary: 'Get a word.' } },
		'/v1/words/{word_id}/coin/prepare': { post: { summary: 'Prepare an unsigned Sugarchain OP_RETURN coining transaction.' } },
		'/v1/transactions/{intent_id}/submit': { post: { summary: 'Submit a signed transaction for verification and broadcast.' } },
		'/v1/transactions/{intent_id}': { get: { summary: 'Poll transaction intent status.' } },
		'/v1/words/{word_id}/likes': { post: { summary: 'Like a word.' }, delete: { summary: 'Unlike a word.' } },
		'/v1/words/{word_id}/tips/prepare': { post: { summary: 'Prepare an unsigned Sugarchain tip transaction.' } },
		'/v1/events': { get: { summary: 'List public Lingry events.' } },
		'/v1/webhooks': { post: { summary: 'Create a webhook subscription.' } },
		'/v1/webhooks/{webhook_id}': { delete: { summary: 'Delete a webhook subscription.' } },
		'/v1/internal/indexer/ingest': { post: { summary: 'Protected Sugarchain indexer ingest endpoint.' } },
		'/v1/healthz': { get: { summary: 'Health check.' } },
		'/openapi.json': { get: { summary: 'OpenAPI document.' } }
	}
};
