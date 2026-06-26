import bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';

const MINI_MAX_MODEL = 'MiniMax-M3';
const SUGAR_API_BASES = ['https://api.sugar.wtf', 'https://api.sugarchain.org'];
const SUGAR_DECIMALS = 8;
const FAUCET_AMOUNT_SATOSHIS = 2500000;
const FAUCET_MINIMUM_BALANCE_SATOSHIS = 1000000;
const FAUCET_FEE_SATOSHIS = 1000;
const FAUCET_DEFAULT_ADDRESS = 'sugar1q39n666w687nxm9x98tx5kgw2uvk780gtmd6yyu';
const SUGAR_API_RETRIES = 2;
const SUGAR_API_TX_PAGE_SIZE = 10;
const WORKER_LIVE_SCAN_LIMIT = 500;
const WORKER_DEFAULT_CACHE_SCAN_BLOCKS = 500;
const WORKER_RANGE_BATCH_SIZE = 100;
const WORKER_TX_LOOKUP_CONCURRENCY = 8;
const LINGRY_WORD_START_HEIGHT = 42900000;
const LINGRY_LEADERBOARD_REFRESH_MS = 3 * 60 * 60 * 1000;
const LINGRY_LEADERBOARD_REFRESH_LOCK_MS = 15 * 60 * 1000;
const LINGRY_LEADERBOARD_RECENT_BLOCKS = 2500;
const LINGRY_LEADERBOARD_SCAN_CHUNK_BLOCKS = 500;
const faucetAttempts = new Map();
const workerWordCache = {
	records: [],
	scannedAt: 0,
	summary: null
};
const lingryLeaderboardRefreshState = {
	lastRefresh: 0,
	running: null,
	summary: null
};
let lingrySocialDbReady = false;
let lingryMetaDbReady = false;
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

function jsonResponse(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
}

function normalizeWord(word) {
	return String(word || '').trim().toLowerCase();
}

function normalizeAddress(value) {
	return String(value || '').trim();
}

function sugarAmount(satoshis) {
	return Number(satoshis || 0) / Math.pow(10, SUGAR_DECIMALS);
}

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function isoFromUnix(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? new Date(number * 1000).toISOString() : '';
}

function sanitizeText(value, maxLength) {
	return String(value || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeHex(value) {
	return String(value || '').trim().replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase();
}

function getP2WPKHScript(pubkey) {
	return bitcoin.payments.p2wpkh({
		pubkey,
		network: sugarNetwork
	});
}

function getP2SHScript(redeem) {
	return bitcoin.payments.p2sh({
		redeem,
		network: sugarNetwork
	});
}

function getAddressFromKeys(keys) {
	return getP2WPKHScript(keys.publicKey).address;
}

function validateSugarAddress(address) {
	try {
		bitcoin.address.fromBase58Check(address, sugarNetwork);
		return true;
	} catch (error) {
		try {
			bitcoin.address.fromBech32(address, sugarNetwork);
			return true;
		} catch (innerError) {
			return false;
		}
	}
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
	return null;
}

function textToHex(text) {
	const bytes = new TextEncoder().encode(String(text || ''));
	return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToUtf8(hex) {
	const normalized = normalizeHex(hex);
	if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
		return '';
	}
	const bytes = new Uint8Array(normalized.match(/.{2}/g).map(byte => parseInt(byte, 16)));
	return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\u0000/g, '');
}

function normalizePartOfSpeech(value) {
	const posText = String(value || '').toLowerCase();
	const match = posText.match(/\b(interj|conj|prep|pron|adj|adv|n|v)\.?\b/);
	return match ? match[1] : 'n';
}

function normalizeSugarWordPartOfSpeech(value) {
	const pos = String(value || '').trim().toLowerCase().replace(/\.$/, '');
	const allowed = ['n', 'v', 'adj', 'adv', 'pron', 'prep', 'conj', 'interj'];
	return allowed.includes(pos) ? pos : '';
}

function mapEtymologyType(type) {
	if (type === 'c') {
		return 'coined';
	}
	if (type === 'h') {
		return 'hypothesized';
	}
	if (type === 'k') {
		return 'known';
	}
	return '';
}

function parseSugarWordPayload(payloadText) {
	const payload = String(payloadText || '').trim();
	if (!/^S[A-Z]\|/.test(payload) && !payload.startsWith('SGW1|')) {
		return null;
	}

	const parts = payload.split('|');
	if (![4, 5, 6].includes(parts.length)) {
		return null;
	}

	const protocol = parts[0];
	const languageCode = /^S[A-Z]$/.test(protocol) ? protocol.slice(1) : 'W';
	const wordRaw = parts[1];
	const fivePartSpeech = parts.length === 5 ? normalizeSugarWordPartOfSpeech(parts[2]) : '';
	const fivePartType = parts.length === 5 ? parts[4] : '';
	const isNewFivePartPayload = Boolean(fivePartSpeech) && ['c', 'h', 'k'].includes(fivePartType);
	const isFourPartPayload = parts.length === 4 && Boolean(normalizeSugarWordPartOfSpeech(parts[2]));
	const hasPartOfSpeech = parts.length === 6 || isNewFivePartPayload || isFourPartPayload;
	const partOfSpeech = hasPartOfSpeech ? normalizeSugarWordPartOfSpeech(parts[2]) : '';
	const meaningRaw = hasPartOfSpeech ? parts[3] : parts[2];
	const rootsRaw = parts.length === 6 ? parts[4] : (isNewFivePartPayload || isFourPartPayload ? '' : parts[3]);
	const type = parts.length === 6 ? parts[5] : (isFourPartPayload ? 'c' : parts[4]);
	const word = String(wordRaw || '').trim().toLowerCase();
	const meaning = String(meaningRaw || '').trim();
	const rootsCompact = String(rootsRaw || '').trim();

	if (!/^S[A-Z]$/.test(protocol) && protocol !== 'SGW1') {
		return null;
	}
	if (!/^[a-z-]{2,32}$/.test(word)) {
		return null;
	}
	if (hasPartOfSpeech && !partOfSpeech) {
		return null;
	}
	if (!meaning || meaning.length > 140) {
		return null;
	}
	if (!['c', 'h', 'k'].includes(type)) {
		return null;
	}

	return {
		protocol,
		language_code: languageCode,
		word,
		part_of_speech: partOfSpeech,
		meaning,
		roots_compact: rootsCompact,
		etymology_type: mapEtymologyType(type),
		etymology_code: type,
		op_return_payload: payload,
		op_return_hex: textToHex(payload),
		valid: true
	};
}

function decodeOpReturnPayloadFromScript(scriptHex) {
	const clean = normalizeHex(scriptHex);
	if (!clean || clean.slice(0, 2) !== '6a') {
		return null;
	}

	let offset = 2;
	const opcode = parseInt(clean.slice(offset, offset + 2), 16);
	let length = 0;
	if (!Number.isFinite(opcode)) {
		return null;
	}

	if (opcode === 0x4c) {
		length = parseInt(clean.slice(offset + 2, offset + 4), 16);
		offset += 4;
	} else if (opcode === 0x4d) {
		const low = parseInt(clean.slice(offset + 2, offset + 4), 16);
		const high = parseInt(clean.slice(offset + 4, offset + 6), 16);
		length = low + (high * 256);
		offset += 6;
	} else if (opcode <= 75) {
		length = opcode;
		offset += 2;
	} else {
		return null;
	}

	const payload = clean.slice(offset, offset + (length * 2));
	return payload.length === length * 2 ? payload : null;
}

function decodeOpReturnPayloadFromAsm(asm) {
	if (!asm || !String(asm).includes('OP_RETURN')) {
		return null;
	}
	const parts = String(asm).split(/\s+/);
	for (const part of parts) {
		if (/^[0-9a-fA-F]{2,}$/.test(part)) {
			return normalizeHex(part);
		}
	}
	return null;
}

function extractOpReturnPayloadsFromTxInfo(txInfo) {
	const payloads = [];
	const seen = new Set();

	function addPayload(payload) {
		const normalized = normalizeHex(payload);
		if (normalized && !seen.has(normalized)) {
			seen.add(normalized);
			payloads.push(normalized);
		}
	}

	function walk(value, key) {
		if (value == null) {
			return;
		}
		if (typeof value === 'string') {
			const clean = value.trim();
			if (key === 'asm') {
				addPayload(decodeOpReturnPayloadFromAsm(clean));
			}
			if (/^[0-9a-fA-F]+$/.test(clean)) {
				if (['script', 'scriptHex', 'scriptPubKey', 'hex'].includes(key) || clean.slice(0, 2).toLowerCase() === '6a') {
					addPayload(decodeOpReturnPayloadFromScript(clean));
				}
			}
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				walk(item, key);
			}
			return;
		}
		if (typeof value === 'object') {
			for (const childKey of Object.keys(value)) {
				walk(value[childKey], childKey);
			}
		}
	}

	walk(txInfo, '');
	return payloads;
}

function recordFromPayloadHex(payloadHex) {
	const normalized = normalizeHex(payloadHex);
	const payloadText = hexToUtf8(normalized);
	const parsed = parseSugarWordPayload(payloadText);
	if (!parsed) {
		return null;
	}
	return {
		...parsed,
		op_return_hex: normalized
	};
}

function recordCacheKey(record) {
	const txid = String(record && record.txid || '').trim();
	const payload = String(record && (record.op_return_hex || record.op_return_payload || record.word) || '').trim();
	return txid && payload ? txid + ':' + payload : (txid || payload);
}

function mergeWorkerWordCache(records, summary) {
	const merged = new Map();
	for (const record of workerWordCache.records || []) {
		merged.set(recordCacheKey(record), record);
	}
	for (const record of records || []) {
		merged.set(recordCacheKey(record), record);
	}
	workerWordCache.records = Array.from(merged.values())
		.sort((a, b) => Number(b.block_height || 0) - Number(a.block_height || 0))
		.slice(0, 250);
	workerWordCache.scannedAt = Date.now();
	workerWordCache.summary = summary || workerWordCache.summary;
	return workerWordCache.records;
}

function filteredWorkerRecords(filter) {
	let records = (workerWordCache.records || []).slice();
	if (filter === 'verified') {
		records = records.filter(record => record.verified_status === 'verified_on_chain');
	}
	if (filter === 'duplicates') {
		const seen = new Set();
		records = records.filter(record => {
			const word = normalizeWord(record.word);
			if (!word || !seen.has(word)) {
				seen.add(word);
				return false;
			}
			return true;
		});
	}
	return records;
}

function hasLingrySocialDb(env) {
	return Boolean(env && env.LINGRY_DB && typeof env.LINGRY_DB.prepare === 'function');
}

async function ensureLingrySocialDb(env) {
	if (!hasLingrySocialDb(env)) {
		return false;
	}
	lingrySocialDbReady = true;
	return lingrySocialDbReady;
}

async function ensureLingryMetaDb(env) {
	if (!(await ensureLingrySocialDb(env))) {
		return false;
	}
	if (!lingryMetaDbReady) {
		await env.LINGRY_DB.prepare(`
			CREATE TABLE IF NOT EXISTS lingry_meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		lingryMetaDbReady = true;
	}
	return true;
}

async function getLingryMeta(env, key) {
	if (!(await ensureLingryMetaDb(env))) {
		return '';
	}
	const row = await env.LINGRY_DB.prepare('SELECT value FROM lingry_meta WHERE key = ?').bind(String(key || '')).first();
	return row && row.value ? String(row.value) : '';
}

async function setLingryMeta(env, key, value) {
	if (!(await ensureLingryMetaDb(env))) {
		return;
	}
	await env.LINGRY_DB.prepare(`
		INSERT INTO lingry_meta (key, value, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`).bind(String(key || ''), String(value || ''), new Date().toISOString()).run();
}

function normalizeSocialTxid(value) {
	const txid = String(value || '').trim().toLowerCase();
	return /^[0-9a-f]{64}$/.test(txid) ? txid : '';
}

function normalizeSocialAddress(value) {
	const address = normalizeAddress(value);
	return validateSugarAddress(address) ? address : '';
}

function collectSugarAddresses(value, output = []) {
	if (value == null) {
		return output;
	}
	if (typeof value === 'string') {
		const text = value.trim();
		if (validateSugarAddress(text) && !output.includes(text)) {
			output.push(text);
		}
		return output;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			collectSugarAddresses(item, output);
		}
		return output;
	}
	if (typeof value === 'object') {
		for (const key of Object.keys(value)) {
			collectSugarAddresses(value[key], output);
		}
	}
	return output;
}

function extractTxSourceAddress(tx) {
	const inputCandidates = []
		.concat(Array.isArray(tx && tx.vin) ? tx.vin : [])
		.concat(Array.isArray(tx && tx.inputs) ? tx.inputs : []);
	for (const input of inputCandidates) {
		const addresses = collectSugarAddresses(input, []);
		if (addresses.length) {
			return addresses[0];
		}
	}
	return '';
}

function normalizeSocialWordRecord(record) {
	const txid = normalizeSocialTxid(record && record.txid);
	if (!txid) {
		return null;
	}
	return {
		txid,
		word: normalizeWord(record.word),
		meaning: sanitizeText(record.meaning, 140),
		etymology_meaning: sanitizeText(record.etymology_meaning || record.roots_compact, 80),
		language_code: String(record.language_code || 'W').slice(0, 1).toUpperCase(),
		part_of_speech: normalizeSugarWordPartOfSpeech(record.part_of_speech),
		creator_address: normalizeSocialAddress(record.creator_address || record.address || record.sender),
		block_height: record.block_height == null ? null : Number(record.block_height),
		block_hash: String(record.block_hash || ''),
		tx_time: String(record.tx_time || record.timestamp || ''),
		op_return_payload: String(record.op_return_payload || ''),
		op_return_hex: normalizeHex(record.op_return_hex),
		indexed_at: String(record.indexed_at || new Date().toISOString())
	};
}

async function persistLingrySocialWords(env, records) {
	if (!records || !records.length || !(await ensureLingrySocialDb(env))) {
		return;
	}
	const statements = [];
	for (const record of records) {
		const normalized = normalizeSocialWordRecord(record);
		if (!normalized) {
			continue;
		}
		statements.push(env.LINGRY_DB.prepare(`
			INSERT INTO lingry_words (
				txid, word, meaning, etymology_meaning, language_code, part_of_speech,
				creator_address, block_height, block_hash, tx_time, op_return_payload, op_return_hex, indexed_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(txid) DO UPDATE SET
				word = excluded.word,
				meaning = excluded.meaning,
				etymology_meaning = CASE WHEN excluded.etymology_meaning != '' THEN excluded.etymology_meaning ELSE lingry_words.etymology_meaning END,
				language_code = excluded.language_code,
				part_of_speech = excluded.part_of_speech,
				creator_address = CASE WHEN excluded.creator_address != '' THEN excluded.creator_address ELSE lingry_words.creator_address END,
				block_height = COALESCE(excluded.block_height, lingry_words.block_height),
				block_hash = CASE WHEN excluded.block_hash != '' THEN excluded.block_hash ELSE lingry_words.block_hash END,
				tx_time = CASE WHEN excluded.tx_time != '' THEN excluded.tx_time ELSE lingry_words.tx_time END,
				op_return_payload = excluded.op_return_payload,
				op_return_hex = excluded.op_return_hex,
				indexed_at = excluded.indexed_at
		`).bind(
			normalized.txid,
			normalized.word,
			normalized.meaning,
			normalized.etymology_meaning,
			normalized.language_code,
			normalized.part_of_speech,
			normalized.creator_address,
			normalized.block_height,
			normalized.block_hash,
			normalized.tx_time,
			normalized.op_return_payload,
			normalized.op_return_hex,
			normalized.indexed_at
		));
	}
	if (statements.length) {
		await env.LINGRY_DB.batch(statements);
	}
}

async function lingrySocialSummaryForTxids(env, txids, viewerAddress = '') {
	txids = Array.from(new Set((txids || []).map(normalizeSocialTxid).filter(Boolean))).slice(0, 100);
	const fallback = {};
	for (const txid of txids) {
		fallback[txid] = {
			txid,
			creator_address: '',
			likes: 0,
			liked: false,
			tips_count: 0,
			tips_satoshis: 0,
			tips_amount: 0
		};
	}
	if (!txids.length || !(await ensureLingrySocialDb(env))) {
		return fallback;
	}
	const placeholders = txids.map(() => '?').join(',');
	const wordRows = await env.LINGRY_DB.prepare(`SELECT txid, creator_address FROM lingry_words WHERE txid IN (${placeholders})`).bind(...txids).all();
	for (const row of wordRows.results || []) {
		if (fallback[row.txid]) {
			fallback[row.txid].creator_address = row.creator_address || '';
		}
	}
	const likeRows = await env.LINGRY_DB.prepare(`SELECT word_txid, COUNT(*) AS likes FROM lingry_likes WHERE word_txid IN (${placeholders}) GROUP BY word_txid`).bind(...txids).all();
	for (const row of likeRows.results || []) {
		if (fallback[row.word_txid]) {
			fallback[row.word_txid].likes = Number(row.likes || 0);
		}
	}
	const tipRows = await env.LINGRY_DB.prepare(`SELECT word_txid, COUNT(*) AS tips_count, COALESCE(SUM(amount_satoshis), 0) AS tips_satoshis FROM lingry_tips WHERE word_txid IN (${placeholders}) GROUP BY word_txid`).bind(...txids).all();
	for (const row of tipRows.results || []) {
		if (fallback[row.word_txid]) {
			fallback[row.word_txid].tips_count = Number(row.tips_count || 0);
			fallback[row.word_txid].tips_satoshis = Number(row.tips_satoshis || 0);
			fallback[row.word_txid].tips_amount = sugarAmount(row.tips_satoshis || 0);
		}
	}
	const normalizedViewer = normalizeSocialAddress(viewerAddress);
	if (normalizedViewer) {
		const likedRows = await env.LINGRY_DB.prepare(`SELECT word_txid FROM lingry_likes WHERE liker_address = ? AND word_txid IN (${placeholders})`).bind(normalizedViewer, ...txids).all();
		for (const row of likedRows.results || []) {
			if (fallback[row.word_txid]) {
				fallback[row.word_txid].liked = true;
			}
		}
	}
	return fallback;
}

async function enrichLingryRecordsWithSocial(env, records, viewerAddress = '') {
	records = Array.isArray(records) ? records : [];
	const summary = await lingrySocialSummaryForTxids(env, records.map(record => record && record.txid), viewerAddress);
	return records.map(record => {
		const txid = normalizeSocialTxid(record && record.txid);
		return txid && summary[txid] ? { ...record, social: summary[txid] } : record;
	});
}

async function latestLingrySocialWords(env, limit = 50, viewerAddress = '') {
	if (!(await ensureLingrySocialDb(env))) {
		return [];
	}
	const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
	const rows = await env.LINGRY_DB.prepare(`
		SELECT txid, word, meaning, etymology_meaning, language_code, part_of_speech,
			creator_address, block_height, block_hash, tx_time, op_return_payload, op_return_hex, indexed_at
		FROM lingry_words
		ORDER BY COALESCE(tx_time, indexed_at) DESC, COALESCE(block_height, 0) DESC
		LIMIT ?
	`).bind(safeLimit).all();
	const records = (rows.results || []).map(row => ({
		txid: row.txid || '',
		word: row.word || '',
		meaning: row.meaning || '',
		etymology_meaning: row.etymology_meaning || '',
		language_code: row.language_code || 'W',
		part_of_speech: row.part_of_speech || '',
		creator_address: row.creator_address || '',
		address: row.creator_address || '',
		block_height: row.block_height,
		block_hash: row.block_hash || '',
		tx_time: row.tx_time || '',
		timestamp: row.tx_time || row.indexed_at || '',
		op_return_payload: row.op_return_payload || '',
		op_return_hex: row.op_return_hex || '',
		indexed_at: row.indexed_at || '',
		source: 'd1_social_index',
		verified_status: 'verified_on_chain'
	}));
	return enrichLingryRecordsWithSocial(env, records, viewerAddress);
}

async function handleLingrySocialSummary(request, env) {
	const url = new URL(request.url);
	const txids = String(url.searchParams.get('txids') || '').split(',').map(item => item.trim());
	const viewerAddress = url.searchParams.get('address') || '';
	return jsonResponse({
		enabled: await ensureLingrySocialDb(env),
		items: await lingrySocialSummaryForTxids(env, txids, viewerAddress)
	});
}

async function handleLingrySocialLike(request, env) {
	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method not allowed.' }, 405);
	}
	const body = await request.json().catch(() => ({}));
	const wordTxid = normalizeSocialTxid(body.word_txid);
	const likerAddress = normalizeSocialAddress(body.liker_address);
	const liked = body.liked !== false;
	if (!wordTxid || !likerAddress) {
		return jsonResponse({ error: 'Valid word txid and Lingry address are required.' }, 400);
	}
	if (!(await ensureLingrySocialDb(env))) {
		return jsonResponse({ error: 'Lingry social database is not configured.' }, 503);
	}
	if (body.record) {
		await persistLingrySocialWords(env, [{ ...body.record, txid: wordTxid }]);
	}
	if (liked) {
		await env.LINGRY_DB.prepare('INSERT OR IGNORE INTO lingry_likes (word_txid, liker_address, created_at) VALUES (?, ?, ?)').bind(wordTxid, likerAddress, new Date().toISOString()).run();
	} else {
		await env.LINGRY_DB.prepare('DELETE FROM lingry_likes WHERE word_txid = ? AND liker_address = ?').bind(wordTxid, likerAddress).run();
	}
	return jsonResponse({
		enabled: true,
		items: await lingrySocialSummaryForTxids(env, [wordTxid], likerAddress)
	});
}

async function handleLingrySocialTip(request, env) {
	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method not allowed.' }, 405);
	}
	const body = await request.json().catch(() => ({}));
	const wordTxid = normalizeSocialTxid(body.word_txid);
	const tipTxid = normalizeSocialTxid(body.tip_txid);
	const fromAddress = normalizeSocialAddress(body.from_address);
	const toAddress = normalizeSocialAddress(body.to_address);
	const amountSatoshis = Math.max(0, Math.floor(Number(body.amount_satoshis || 0)));
	if (!wordTxid || !tipTxid || !fromAddress || !toAddress || amountSatoshis <= 0) {
		return jsonResponse({ error: 'Valid tip transaction, word txid, addresses, and amount are required.' }, 400);
	}
	if (!(await ensureLingrySocialDb(env))) {
		return jsonResponse({ error: 'Lingry social database is not configured.' }, 503);
	}
	if (body.record) {
		await persistLingrySocialWords(env, [{ ...body.record, txid: wordTxid, creator_address: toAddress }]);
	}
	await env.LINGRY_DB.prepare(`
		INSERT OR IGNORE INTO lingry_tips (tip_txid, word_txid, from_address, to_address, amount_satoshis, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`).bind(tipTxid, wordTxid, fromAddress, toAddress, amountSatoshis, new Date().toISOString()).run();
	return jsonResponse({
		enabled: true,
		items: await lingrySocialSummaryForTxids(env, [wordTxid], fromAddress)
	});
}

function emptyLingryLeaderboardSummary(error = '') {
	return {
		enabled: true,
		start_height: LINGRY_WORD_START_HEIGHT,
		refresh_blocks: LINGRY_LEADERBOARD_RECENT_BLOCKS,
		block_seconds: 5,
		expected_three_hour_blocks: Math.ceil((3 * 60 * 60) / 5),
		refreshed_at: lingryLeaderboardRefreshState.lastRefresh ? new Date(lingryLeaderboardRefreshState.lastRefresh).toISOString() : '',
		refreshing: Boolean(lingryLeaderboardRefreshState.running),
		scanned_blocks: 0,
		scanned_transactions: 0,
		indexed_records: 0,
		errors: error ? [{ error }] : []
	};
}

function parseLingryMetaDate(value) {
	const time = Date.parse(String(value || ''));
	return Number.isFinite(time) ? time : 0;
}

async function readLingryLeaderboardRefreshSummary(env) {
	const fallback = lingryLeaderboardRefreshState.summary || emptyLingryLeaderboardSummary();
	if (!(await ensureLingryMetaDb(env))) {
		return fallback;
	}
	const storedSummaryJson = await getLingryMeta(env, 'leaderboard_last_summary');
	let storedSummary = null;
	if (storedSummaryJson) {
		try {
			storedSummary = JSON.parse(storedSummaryJson);
		} catch (error) {
			storedSummary = null;
		}
	}
	const lastRefresh = await getLingryMeta(env, 'leaderboard_last_refresh_at');
	const startedAt = await getLingryMeta(env, 'leaderboard_refresh_started_at');
	const lastRefreshMs = parseLingryMetaDate(lastRefresh);
	const startedMs = parseLingryMetaDate(startedAt);
	const refreshing = Boolean(lingryLeaderboardRefreshState.running) || Boolean(startedMs && startedMs > lastRefreshMs && Date.now() - startedMs < LINGRY_LEADERBOARD_REFRESH_LOCK_MS);
	return {
		...(storedSummary || fallback),
		refreshed_at: lastRefresh || (storedSummary && storedSummary.refreshed_at) || '',
		refreshing
	};
}

async function refreshLingryLeaderboardIndex(env) {
	if (!(await ensureLingrySocialDb(env))) {
		lingryLeaderboardRefreshState.summary = emptyLingryLeaderboardSummary('Lingry social database is not configured.');
		return lingryLeaderboardRefreshState.summary;
	}
	if (lingryLeaderboardRefreshState.running) {
		return lingryLeaderboardRefreshState.running;
	}
	lingryLeaderboardRefreshState.running = (async () => {
		const summary = emptyLingryLeaderboardSummary();
		summary.started_at = new Date().toISOString();
		await setLingryMeta(env, 'leaderboard_refresh_started_at', summary.started_at);
		for (let offset = 0; offset < LINGRY_LEADERBOARD_RECENT_BLOCKS; offset += LINGRY_LEADERBOARD_SCAN_CHUNK_BLOCKS) {
			const blocks = Math.min(LINGRY_LEADERBOARD_SCAN_CHUNK_BLOCKS, LINGRY_LEADERBOARD_RECENT_BLOCKS - offset);
			try {
				const result = await scanLatestSugarBlocks(LINGRY_WORD_START_HEIGHT, blocks, '', offset);
				const scan = result.summary || {};
				mergeWorkerWordCache(result.records, scan);
				await persistLingrySocialWords(env, result.records);
				summary.scanned_blocks += Number(scan.scanned_blocks || scan.effective_blocks || 0);
				summary.scanned_transactions += Number(scan.scanned_transactions || 0);
				summary.indexed_records += Number(scan.indexed_records || (result.records || []).length || 0);
				summary.end_height = Math.max(Number(summary.end_height || 0), Number(scan.end_height || 0));
				if (Array.isArray(scan.errors) && scan.errors.length) {
					summary.errors.push(...scan.errors.slice(0, 4));
				}
			} catch (error) {
				summary.errors.push({ offset_blocks: offset, error: error.message || 'Recent leaderboard scan failed.' });
			}
		}
		summary.errors = summary.errors.slice(0, 20);
		summary.refreshed_at = new Date().toISOString();
		summary.refreshing = false;
		lingryLeaderboardRefreshState.lastRefresh = Date.now();
		lingryLeaderboardRefreshState.summary = summary;
		await setLingryMeta(env, 'leaderboard_last_refresh_at', summary.refreshed_at);
		await setLingryMeta(env, 'leaderboard_last_summary', JSON.stringify(summary));
		await setLingryMeta(env, 'leaderboard_refresh_started_at', '');
		return summary;
	})();
	try {
		return await lingryLeaderboardRefreshState.running;
	} finally {
		lingryLeaderboardRefreshState.running = null;
	}
}

function mapLeaderboardWordRow(row) {
	const tipsSatoshis = Number(row.tips_satoshis || 0);
	return {
		txid: row.txid || '',
		word: row.word || '',
		meaning: row.meaning || '',
		etymology_meaning: row.etymology_meaning || '',
		language_code: row.language_code || 'W',
		part_of_speech: row.part_of_speech || '',
		creator_address: row.creator_address || '',
		block_height: row.block_height,
		tx_time: row.tx_time || '',
		op_return_payload: row.op_return_payload || '',
		likes: Number(row.likes || 0),
		tips_count: Number(row.tips_count || 0),
		tips_satoshis: tipsSatoshis,
		tips_amount: sugarAmount(tipsSatoshis),
		popularity_score: Number(row.popularity_score || 0)
	};
}

function mapLeaderboardAddressRow(row) {
	const tipsSatoshis = Number(row.tips_satoshis || 0);
	return {
		address: row.address || '',
		words_count: Number(row.words_count || 0),
		likes_received: Number(row.likes_received || 0),
		tips_count: Number(row.tips_count || 0),
		tips_satoshis: tipsSatoshis,
		tips_amount: sugarAmount(tipsSatoshis),
		popularity_score: Number(row.popularity_score || 0)
	};
}

async function readLingryLeaderboard(env, limit = 25) {
	if (!(await ensureLingrySocialDb(env))) {
		return {
			enabled: false,
			words: [],
			addresses_by_likes: [],
			addresses_by_tips: [],
			addresses_by_words: []
		};
	}
	const safeLimit = Math.max(5, Math.min(Number(limit) || 25, 50));
	const wordRows = await env.LINGRY_DB.prepare(`
		WITH likes AS (
			SELECT word_txid, COUNT(*) AS likes
			FROM lingry_likes
			GROUP BY word_txid
		),
		tips AS (
			SELECT word_txid, COUNT(*) AS tips_count, COALESCE(SUM(amount_satoshis), 0) AS tips_satoshis
			FROM lingry_tips
			GROUP BY word_txid
		)
		SELECT w.txid, w.word, w.meaning, w.etymology_meaning, w.language_code, w.part_of_speech,
			w.creator_address, w.block_height, w.tx_time, w.op_return_payload,
			COALESCE(l.likes, 0) AS likes,
			COALESCE(t.tips_count, 0) AS tips_count,
			COALESCE(t.tips_satoshis, 0) AS tips_satoshis,
			(COALESCE(l.likes, 0) + COALESCE(t.tips_count, 0)) AS popularity_score
		FROM lingry_words w
		LEFT JOIN likes l ON l.word_txid = w.txid
		LEFT JOIN tips t ON t.word_txid = w.txid
		WHERE COALESCE(w.block_height, 0) >= ?
		ORDER BY popularity_score DESC, COALESCE(t.tips_satoshis, 0) DESC, COALESCE(w.tx_time, w.indexed_at) DESC, COALESCE(w.block_height, 0) DESC
		LIMIT ?
	`).bind(LINGRY_WORD_START_HEIGHT, safeLimit).all();

	const addressSql = `
		WITH likes AS (
			SELECT word_txid, COUNT(*) AS likes
			FROM lingry_likes
			GROUP BY word_txid
		),
		tips AS (
			SELECT word_txid, COUNT(*) AS tips_count, COALESCE(SUM(amount_satoshis), 0) AS tips_satoshis
			FROM lingry_tips
			GROUP BY word_txid
		)
		SELECT w.creator_address AS address,
			COUNT(DISTINCT w.txid) AS words_count,
			COALESCE(SUM(l.likes), 0) AS likes_received,
			COALESCE(SUM(t.tips_count), 0) AS tips_count,
			COALESCE(SUM(t.tips_satoshis), 0) AS tips_satoshis,
			(COALESCE(SUM(l.likes), 0) + COALESCE(SUM(t.tips_count), 0) + COUNT(DISTINCT w.txid)) AS popularity_score
		FROM lingry_words w
		LEFT JOIN likes l ON l.word_txid = w.txid
		LEFT JOIN tips t ON t.word_txid = w.txid
		WHERE COALESCE(w.block_height, 0) >= ? AND w.creator_address != ''
		GROUP BY w.creator_address
	`;
	const addressLikes = await env.LINGRY_DB.prepare(addressSql + ' ORDER BY likes_received DESC, tips_count DESC, words_count DESC LIMIT ?').bind(LINGRY_WORD_START_HEIGHT, safeLimit).all();
	const addressTips = await env.LINGRY_DB.prepare(addressSql + ' ORDER BY tips_count DESC, tips_satoshis DESC, likes_received DESC, words_count DESC LIMIT ?').bind(LINGRY_WORD_START_HEIGHT, safeLimit).all();
	const addressWords = await env.LINGRY_DB.prepare(addressSql + ' ORDER BY words_count DESC, likes_received DESC, tips_count DESC LIMIT ?').bind(LINGRY_WORD_START_HEIGHT, safeLimit).all();

	return {
		enabled: true,
		words: (wordRows.results || []).map(mapLeaderboardWordRow),
		addresses_by_likes: (addressLikes.results || []).map(mapLeaderboardAddressRow),
		addresses_by_tips: (addressTips.results || []).map(mapLeaderboardAddressRow),
		addresses_by_words: (addressWords.results || []).map(mapLeaderboardAddressRow)
	};
}

async function handleLingryLeaderboard(request, env, ctx) {
	const url = new URL(request.url);
	const limit = Math.max(5, Math.min(Number(url.searchParams.get('limit')) || 25, 50));
	const forceRefresh = ['1', 'true', 'yes', 'on'].includes(String(url.searchParams.get('refresh') || '').toLowerCase());
	const waitForRefresh = ['1', 'true', 'yes', 'on'].includes(String(url.searchParams.get('wait') || '').toLowerCase());
	let refreshSummary = await readLingryLeaderboardRefreshSummary(env);
	const lastRefreshMs = parseLingryMetaDate(refreshSummary.refreshed_at);
	const recentlyStarted = refreshSummary.refreshing;
	const stale = !lastRefreshMs || Date.now() - lastRefreshMs >= LINGRY_LEADERBOARD_REFRESH_MS;

	if ((forceRefresh || stale) && !recentlyStarted && !lingryLeaderboardRefreshState.running) {
		const refreshPromise = refreshLingryLeaderboardIndex(env).catch(error => {
			lingryLeaderboardRefreshState.summary = emptyLingryLeaderboardSummary(error.message || 'Leaderboard refresh failed.');
			return lingryLeaderboardRefreshState.summary;
		});
		if (waitForRefresh) {
			await refreshPromise;
			refreshSummary = await readLingryLeaderboardRefreshSummary(env);
		} else if (ctx && typeof ctx.waitUntil === 'function') {
			ctx.waitUntil(refreshPromise);
			refreshSummary = { ...refreshSummary, refreshing: true };
		}
	} else if (waitForRefresh && lingryLeaderboardRefreshState.running) {
		await lingryLeaderboardRefreshState.running;
		refreshSummary = await readLingryLeaderboardRefreshSummary(env);
	}

	const leaderboard = await readLingryLeaderboard(env, limit);
	return jsonResponse({
		...leaderboard,
		since_block: LINGRY_WORD_START_HEIGHT,
		refresh_policy: {
			every_hours: 3,
			block_seconds: 5,
			expected_blocks: Math.ceil((3 * 60 * 60) / 5),
			scan_blocks_with_slack: LINGRY_LEADERBOARD_RECENT_BLOCKS
		},
		refresh_summary: refreshSummary
	});
}

function validateGeneratedWord(candidate, usedWords) {
	const word = normalizeWord(candidate.word);
	const partOfSpeech = normalizePartOfSpeech(candidate.part_of_speech);
	const meaning = sanitizeText(candidate.meaning, 65);
	const etymology = sanitizeText(candidate.etymology_meaning, 40);
	const confidence = Number(candidate.confidence_not_existing);

	if (!/^[a-z]{2,32}(-[a-z]{2,32})?$/.test(word) || word.length > 32) {
		throw new Error('Generated word failed validation.');
	}
	if (usedWords.has(word)) {
		throw new Error('Generated word duplicated a session word.');
	}
	if (meaning.length < 1 || meaning.length > 65) {
		throw new Error('Generated meaning failed validation.');
	}
	if (etymology.length < 1 || etymology.length > 40) {
		throw new Error('Generated etymology failed validation.');
	}
	if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
		throw new Error('Generated confidence failed validation.');
	}

	return {
		word,
		part_of_speech: partOfSpeech,
		meaning,
		etymology_meaning: etymology,
		confidence_not_existing: confidence
	};
}

function extractMiniMaxContent(responseJson) {
	const choice = responseJson && Array.isArray(responseJson.choices) ? responseJson.choices[0] : null;
	const message = choice && choice.message ? choice.message : null;
	return typeof (message && message.content) === 'string' ? message.content : '';
}

function extractSection(text, heading, nextHeadings) {
	const headingPattern = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const nextPattern = nextHeadings.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
	const endPattern = nextPattern ? '(?=\\n\\s*(?:' + nextPattern + ')\\s*\\n|$)' : '(?=$)';
	const pattern = new RegExp('(?:^|\\n)\\s*' + headingPattern + '\\s*\\n+([\\s\\S]*?)' + endPattern, 'i');
	const match = String(text || '').match(pattern);
	return match ? match[1].trim() : '';
}

function parseSectionWordResponse(text, defaultConfidence) {
	const cleaned = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
	const headings = [
		'Generated Word',
		'Part of Speech',
		'Meaning',
		'Etymology Meaning',
		'Compact Roots',
		'Newness Confidence'
	];
	const word = extractSection(cleaned, 'Generated Word', headings.filter(item => item !== 'Generated Word')).split(/\s+/)[0] || '';
	const confidenceText = extractSection(cleaned, 'Newness Confidence', []);
	const confidence = confidenceText ? Number((confidenceText.match(/[01](?:\.\d+)?/) || [])[0]) : defaultConfidence;

	return {
		word,
		part_of_speech: extractSection(cleaned, 'Part of Speech', headings.filter(item => item !== 'Part of Speech')),
		meaning: extractSection(cleaned, 'Meaning', headings.filter(item => item !== 'Meaning')),
		etymology_meaning: extractSection(cleaned, 'Etymology Meaning', headings.filter(item => item !== 'Etymology Meaning')),
		confidence_not_existing: Number.isFinite(confidence) ? confidence : defaultConfidence
	};
}

function normalizeMeaningForComparison(value) {
	return sanitizeText(value, 120).toLowerCase();
}

function isRepetitiveMeaning(meaning) {
	const normalized = normalizeMeaningForComparison(meaning);
	return normalized.includes('quiet') &&
		normalized.includes('lingering') &&
		normalized.includes('hope') &&
		(normalized.includes('twilight') || normalized.includes('dusk'));
}

function languageInstructionLines(languageInstruction) {
	return languageInstruction ? [
		'',
		'Language instruction:',
		languageInstruction,
		''
	] : [];
}

function buildConceptWordPrompt(concept, languageInstruction = '') {
	const targetLanguage = languageInstruction ? 'the selected Lingry language' : 'American English';
	const taskLine = languageInstruction ?
		'Your job is to create one new word in the selected Lingry language for the concept provided below.' :
		'Your job is to create one new English word for the concept provided below.';
	return [
		'You are an expert etymologist, lexicographer, and wordsmith.',
		'',
		taskLine,
		'',
		'CONCEPT:',
		concept,
		...languageInstructionLines(languageInstruction),
		'',
		'Instructions:',
		'',
		'* First, understand the concept.',
		'* Silently generate 5 possible new words.',
		'* Use plausible roots, sounds, word-building patterns, and cultural tone from ' + targetLanguage + '.',
		'* Silently check whether each word already exists as a common word, known term, or obvious trademark in ' + targetLanguage + '.',
		'* Reject words that already exist or strongly conflict with existing words.',
		'* Pick the best word based on clarity, memorability, natural sound in ' + targetLanguage + ', etymological consistency, and likelihood of adoption.',
		'* Return only the winning word and its dictionary entry.',
		'* The Generated Word, Meaning, and Etymology Meaning values must all be written in ' + targetLanguage + '.',
		'* Keep the section headings in English exactly as shown below.',
		'* Do not show the 5 candidate words.',
		'* Do not explain your selection process.',
		'* Do not include examples.',
		'* Do not include notes.',
		'* Be succinct in both Meaning and Etymology Meaning.',
		'* Keep Meaning to 65 characters or fewer, counting spaces and punctuation.',
		'* Keep Etymology Meaning to 40 characters or fewer.',
		'* Both Meaning and Etymology Meaning must fit within their character limits before you return the answer.',
		'* If either field is too long, rewrite it shorter instead of exceeding the limit.',
		'',
		'Return exactly this format:',
		'',
		'Generated Word',
		'',
		'[word]',
		'',
		'Part of Speech',
		'',
		'[n., v., adj., adv., or multiple]',
		'',
		'Meaning',
		'',
		'[succinct dictionary definition in ' + targetLanguage + ', 65 characters or fewer including spaces and punctuation]',
		'',
		'Etymology Meaning',
		'',
		'[succinct origin/construction explanation in ' + targetLanguage + ', 40 characters or fewer]'
	].join('\n');
}

function buildRandomWordPrompt(usedWords, usedMeanings, languageInstruction = '') {
	const usedList = Array.from(usedWords).join(', ') || 'none';
	const recentMeanings = usedMeanings.length ? usedMeanings.join(' | ') : 'none';
	const targetLanguage = languageInstruction ? 'the selected Lingry language' : 'American English';
	const taskLine = languageInstruction ?
		'Randomly identify a useful concept, action, feeling, object, situation, or phenomenon that the selected Lingry language lacks a concise word for. Then create one new word in that language for it.' :
		'Randomly identify a useful concept, action, feeling, object, situation, or phenomenon that English lacks a concise word for. Then create one new English word for it.';
	return [
		'You are an expert etymologist, lexicographer, and wordsmith.',
		'',
		'Task:',
		taskLine,
		...languageInstructionLines(languageInstruction),
		'',
		'Already-used session words to avoid:',
		usedList,
		'',
		'Recent session meanings to avoid repeating:',
		recentMeanings,
		'',
		'Process silently:',
		'',
		'1. Choose a concept that feels useful, vivid, and genuinely missing from ' + targetLanguage + '.',
		'2. Generate 5 candidate words for that concept.',
		'3. Use roots, sounds, word-building patterns, and cultural tone from ' + targetLanguage + '.',
		'4. Check from your knowledge whether each candidate already exists as a common word, known term, or obvious trademark in ' + targetLanguage + '. Reject conflicts.',
		'5. Estimate a newness confidence score from 0.00 to 1.00, where 1.00 means you are highly confident the word is not already an established English word.',
		'6. Pick the best candidate based on clarity, memorability, natural sound in ' + targetLanguage + ', etymological consistency, usefulness, likelihood of adoption, and newness confidence.',
		'7. Output only the winning word.',
		'',
		'Return exactly this format:',
		'',
		'Generated Word',
		'',
		'[word]',
		'',
		'Part of Speech',
		'',
		'[n., v., adj., adv., or multiple]',
		'',
		'Meaning',
		'',
		'[succinct dictionary definition in ' + targetLanguage + ', 65 characters or fewer including spaces and punctuation]',
		'',
		'Etymology Meaning',
		'',
		'[succinct origin/construction explanation in ' + targetLanguage + ', 40 characters or fewer]',
		'',
		'Newness Confidence',
		'',
		'[0.00-1.00]',
		'',
		'Rules:',
		'',
		'* Do not show the 5 candidates.',
		'* Do not explain your selection process.',
		'* Do not include examples.',
		'* Do not include notes.',
		'* Do not include literal meaning.',
		'* Do not ask the user for a concept.',
		'* Invent the concept yourself each time.',
		'* The Generated Word, Meaning, and Etymology Meaning values must all be written in ' + targetLanguage + '.',
		'* Keep the section headings in English exactly as shown above.',
		'* Be succinct in both Meaning and Etymology Meaning.',
		'* Keep Meaning to 65 characters or fewer, counting spaces and punctuation.',
		'* Keep Etymology Meaning to 40 characters or fewer.',
		'* Both Meaning and Etymology Meaning must fit within their character limits before you return the answer.',
		'* If either field is too long, rewrite it shorter instead of exceeding the limit.',
		'* Prefer compact, memorable words that sound natural in ' + targetLanguage + '.',
		'* Avoid existing common words and obvious trademarks in ' + targetLanguage + '.',
		'* If the best candidate conflicts with an existing common word, discard it and choose another.',
		'* Use confidence format like 0.92, meaning 92% confidence.'
	].join('\n');
}

async function requestMiniMaxWord(usedWords, usedMeanings, conceptPrompt, generationMode, env, languageInstruction = '') {
	const apiKey = env.MINIMAX_API_KEY || '';
	if (!apiKey) {
		throw new Error('AI word generation is not configured on this server.');
	}

	const useConceptPrompt = generationMode === 'prompt';
	const prompt = useConceptPrompt ? buildConceptWordPrompt(sanitizeText(conceptPrompt, 500), languageInstruction) : buildRandomWordPrompt(usedWords, usedMeanings, languageInstruction);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 45000);

	let response;
	try {
		response = await fetch('https://api.minimax.io/v1/chat/completions', {
			method: 'POST',
			headers: {
				'authorization': 'Bearer ' + apiKey,
				'content-type': 'application/json'
			},
			signal: controller.signal,
			body: JSON.stringify({
				model: env.MINIMAX_MODEL || MINI_MAX_MODEL,
				messages: [
					{
						role: 'system',
						content: 'Follow the requested section format exactly. Do not use markdown, code fences, notes, examples, or extra commentary.'
					},
					{
						role: 'user',
						content: prompt
					}
				],
				thinking: {
					type: 'disabled'
				},
				max_completion_tokens: 600,
				temperature: 0.9,
				top_p: 0.95
			})
		});
	} catch (error) {
		if (error && error.name === 'AbortError') {
			throw new Error('MiniMax word generation timed out.');
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}

	const responseJson = await response.json().catch(() => null);
	if (!response.ok) {
		const status = response.status ? ' HTTP ' + response.status : '';
		throw new Error('MiniMax word generation failed.' + status);
	}
	const outputText = extractMiniMaxContent(responseJson || {});
	if (!outputText) {
		throw new Error('MiniMax returned an empty response.');
	}
	return parseSectionWordResponse(outputText, useConceptPrompt ? 0.85 : 0.9);
}

async function handleGenerateWord(request, env, forcedGenerationMode) {
	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method not allowed.' }, 405);
	}

	try {
		const body = await request.json().catch(() => ({}));
		const usedWords = new Set(Array.isArray(body.used_words) ? body.used_words.map(normalizeWord).filter(Boolean) : []);
		const usedMeanings = Array.isArray(body.used_meanings) ? body.used_meanings.map(normalizeMeaningForComparison).filter(Boolean).slice(-12) : [];
		const generationMode = forcedGenerationMode || (body.generation_mode === 'prompt' ? 'prompt' : 'random');
		const conceptPrompt = generationMode === 'prompt' ? sanitizeText(body.concept_prompt, 500) : '';
		const languageInstruction = sanitizeText(body.language_instruction || '', 240);
		if (generationMode === 'prompt' && !conceptPrompt) {
			throw new Error('Prompt for New Word is empty.');
		}
		let lastError = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const candidate = await requestMiniMaxWord(usedWords, usedMeanings, conceptPrompt, generationMode, env, languageInstruction);
				const validated = validateGeneratedWord(candidate, usedWords);
				if (isRepetitiveMeaning(validated.meaning)) {
					throw new Error('Generated repetitive meaning; retrying.');
				}
				return jsonResponse(validated);
			} catch (error) {
				lastError = error;
				if (!/duplicated|repetitive/i.test(error.message || '')) {
					throw error;
				}
			}
		}
		throw lastError || new Error('Unable to generate a unique word.');
	} catch (error) {
		return jsonResponse({ error: error.message || 'Unable to generate word.' }, 400);
	}
}

async function fetchSugarJson(path, timeoutMs = 8000) {
	let lastError = null;
	for (let attempt = 0; attempt < SUGAR_API_RETRIES; attempt++) {
		for (const base of SUGAR_API_BASES) {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const response = await fetch(base + path, { signal: controller.signal });
				const text = await response.text().catch(() => '');
				let json = null;
				try {
					json = text ? JSON.parse(text) : null;
				} catch (error) {
					json = null;
				}
				if (!response.ok || !json || json.error) {
					const apiMessage = json && json.error && json.error.message ? json.error.message : '';
					const bodyMessage = !apiMessage && text ? text.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
					const statusMessage = response.status ? 'HTTP ' + response.status : '';
					const detail = [statusMessage, apiMessage || bodyMessage || 'Sugarchain API request failed.'].filter(Boolean).join(': ');
					throw new Error(detail + ' [' + base + path + ']');
				}
				return json.result;
			} catch (error) {
				lastError = error && error.name === 'AbortError' ? new Error('Sugarchain API request timed out. [' + base + path + ']') : error;
			} finally {
				clearTimeout(timeout);
			}
		}
		if (attempt < SUGAR_API_RETRIES - 1) {
			await delay(250 * (attempt + 1));
		}
	}
	throw lastError || new Error('Sugarchain API request failed.');
}

async function postSugarForm(path, body, timeoutMs = 15000) {
	let lastError = null;
	for (const base of SUGAR_API_BASES) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(base + path, {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams(body),
				signal: controller.signal
			});
			const json = await response.json().catch(() => null);
			if (!response.ok || !json) {
				throw new Error('Sugarchain API request failed.');
			}
			return json;
		} catch (error) {
			lastError = error && error.name === 'AbortError' ? new Error('Sugarchain API request timed out.') : error;
		} finally {
			clearTimeout(timeout);
		}
	}
	throw lastError || new Error('Sugarchain API request failed.');
}

async function getAddressBalanceSatoshis(address) {
	const result = await fetchSugarJson('/balance/' + encodeURIComponent(address));
	return Number(result && result.balance || 0);
}

async function getAddressUtxos(address, amountSatoshis) {
	const result = await fetchSugarJson('/unspent/' + encodeURIComponent(address) + '?amount=' + encodeURIComponent(amountSatoshis), 10000);
	return Array.isArray(result) ? result : [];
}

function chooseFaucetUtxos(utxos, requiredSatoshis) {
	const chosen = [];
	let total = 0;
	for (const utxo of utxos) {
		chosen.push(utxo);
		total += Number(utxo.value || 0);
		if (total >= requiredSatoshis) {
			break;
		}
	}
	return { chosen, total };
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

function buildFaucetTransaction(keys, recipientAddress, utxos, amountSatoshis, feeSatoshis) {
	const faucetAddress = getAddressFromKeys(keys);
	const txb = new bitcoin.TransactionBuilder(sugarNetwork);
	const scripts = [];
	let totalValue = 0;

	txb.setVersion(2);
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
		scripts.push({ script, type, value });
	}

	if (totalValue < amountSatoshis + feeSatoshis) {
		throw new Error('Starter wallet has insufficient spendable balance.');
	}

	txb.addOutput(recipientAddress, amountSatoshis);
	const change = totalValue - amountSatoshis - feeSatoshis;
	if (change > 0) {
		txb.addOutput(faucetAddress, change);
	}

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
				throw new Error('Unsupported starter wallet UTXO script type.');
		}
	}

	return txb.build().toHex();
}

async function handleFaucetFund(request, env) {
	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method not allowed.' }, 405);
	}

	try {
		const body = await request.json().catch(() => ({}));
		const address = normalizeAddress(body.address);
		if (!validateSugarAddress(address)) {
			return jsonResponse({ funded: false, error: 'Invalid Sugarchain address.' }, 400);
		}

		const balance = await getAddressBalanceSatoshis(address);
		if (balance >= FAUCET_MINIMUM_BALANCE_SATOSHIS) {
			return jsonResponse({
				funded: false,
				reason: 'balance_ok',
				balance,
				minimum_balance: FAUCET_MINIMUM_BALANCE_SATOSHIS
			});
		}

		const grantsEnabled = String(env.LINGRY_SUGAR_GRANTS_ENABLED || 'true').toLowerCase() !== 'false';
		if (!grantsEnabled) {
			return jsonResponse({ funded: false, error: 'Starter funding is disabled on this server.' }, 503);
		}

		const faucetWif = String(env.LINGRY_FUNDING_WIF || env.LINGRY_FAUCET_WIF || '').trim();
		if (!faucetWif) {
			return jsonResponse({ funded: false, error: 'Starter funding is not configured on this server.' }, 503);
		}

		const previousAttempt = faucetAttempts.get(address);
		if (previousAttempt && Date.now() - previousAttempt < 10 * 60 * 1000) {
			return jsonResponse({
				funded: false,
				reason: 'recent_attempt',
				retry_after_seconds: Math.ceil((10 * 60 * 1000 - (Date.now() - previousAttempt)) / 1000)
			});
		}

		const keys = bitcoin.ECPair.fromWIF(faucetWif, sugarNetwork);
		const faucetAddress = getAddressFromKeys(keys);
		const expectedAddress = env.LINGRY_FUNDING_ADDRESS || env.LINGRY_FAUCET_ADDRESS || FAUCET_DEFAULT_ADDRESS;
		if (expectedAddress && faucetAddress !== expectedAddress) {
			throw new Error('Starter funding key does not match the configured starter address.');
		}

		const required = FAUCET_AMOUNT_SATOSHIS + FAUCET_FEE_SATOSHIS;
		const utxos = await getAddressUtxos(faucetAddress, required);
		const selection = chooseFaucetUtxos(utxos, required);
		const raw = buildFaucetTransaction(keys, address, selection.chosen, FAUCET_AMOUNT_SATOSHIS, FAUCET_FEE_SATOSHIS);
		const broadcast = await postSugarForm('/broadcast', { raw });
		if (broadcast.error) {
			throw new Error(broadcast.error.message || 'Starter funding broadcast failed.');
		}

		faucetAttempts.set(address, Date.now());
		return jsonResponse({
			funded: true,
			txid: broadcast.result,
			amount: sugarAmount(FAUCET_AMOUNT_SATOSHIS)
		});
	} catch (error) {
		return jsonResponse({ funded: false, error: error.message || 'Starter funding failed.' }, 400);
	}
}

async function indexSugarTxid(txid, knownBlock = null) {
	const txInfo = await fetchSugarJson('/transaction/' + txid);
	const tx = txInfo && txInfo.txid ? txInfo : (txInfo && txInfo.result ? txInfo.result : txInfo);
	const payloads = extractOpReturnPayloadsFromTxInfo(tx);
	const records = [];
	for (const payloadHex of payloads) {
		const parsed = recordFromPayloadHex(payloadHex);
		if (!parsed) {
			continue;
		}
		records.push({
			...parsed,
			txid: tx.txid || txid,
			block_height: tx.height != null ? tx.height : (knownBlock && knownBlock.height),
			block_hash: tx.blockhash || (knownBlock && knownBlock.hash) || '',
			tx_time: isoFromUnix(tx.blocktime || tx.time || (knownBlock && knownBlock.time)),
			indexed_at: new Date().toISOString(),
			source: 'blockchain',
			verified_status: 'verified_on_chain',
			duplicate_status: 'first_seen',
			creator_address: extractTxSourceAddress(tx)
		});
	}
	return records;
}

function uniqueTxids(txids) {
	const seen = new Set();
	const unique = [];
	for (const txid of txids || []) {
		const normalized = String(txid || '').trim();
		if (normalized && !seen.has(normalized)) {
			seen.add(normalized);
			unique.push(normalized);
		}
	}
	return unique;
}

async function mapWithConcurrency(items, limit, mapper) {
	const results = new Array(items.length);
	let nextIndex = 0;
	const workerCount = Math.max(1, Math.min(limit, items.length));
	async function runWorker() {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await mapper(items[index], index);
		}
	}
	await Promise.all(Array.from({ length: workerCount }, runWorker));
	return results;
}

async function fetchSugarBlockByHeight(height) {
	const block = await fetchSugarJson('/height/' + height + '?offset=0', 10000);
	const txids = Array.isArray(block.tx) ? block.tx.slice() : [];
	const txcount = Math.max(txids.length, Number(block.txcount || block.nTx || 0));
	for (let offset = txids.length; offset < txcount; offset += SUGAR_API_TX_PAGE_SIZE) {
		const page = await fetchSugarJson('/height/' + height + '?offset=' + offset, 10000);
		if (Array.isArray(page.tx)) {
			txids.push(...page.tx);
		}
	}
	return {
		...block,
		height: block.height != null ? block.height : height,
		tx: uniqueTxids(txids)
	};
}

async function fetchSugarBlockBatch(startHeight, endHeight, allowHeightFallback = false) {
	const count = Math.max(0, endHeight - startHeight + 1);
	if (!count) {
		return { blocks: [], rangeError: null };
	}

	try {
		const range = await fetchSugarJson('/range/' + endHeight + '?offset=' + count, 20000);
		if (Array.isArray(range) && range.length) {
			const blocks = range
				.filter(block => block && Number(block.height) >= startHeight && Number(block.height) <= endHeight)
				.map(block => ({
					height: Number(block.height),
					block: {
						...block,
						tx: uniqueTxids(Array.isArray(block.tx) ? block.tx : [])
					}
				}))
				.sort((a, b) => a.height - b.height);
			return { blocks, rangeError: null };
		}
		throw new Error('Sugarchain range returned no blocks.');
	} catch (rangeError) {
		if (!allowHeightFallback) {
			return { blocks: [], rangeError };
		}
		const heights = [];
		for (let current = startHeight; current <= endHeight; current++) {
			heights.push(current);
		}
		const blocks = await Promise.all(heights.map(async height => {
			try {
				const block = await fetchSugarBlockByHeight(height);
				return { height, block };
			} catch (error) {
				return { height, error };
			}
		}));
		return { blocks, rangeError };
	}
}

async function scanLatestSugarBlocks(startHeight, blockCount, word = '', offsetBlocks = 0) {
	const normalizedWord = normalizeWord(word);
	const height = Number(await fetchSugarJson('/info').then(info => info.blocks || info.headers || 0));
	const floor = Math.max(0, Number(startHeight) || 0);
	const requestedCount = Math.max(1, Number(blockCount) || 80);
	const offset = Math.max(0, Number(offsetBlocks) || 0);
	const safeCount = Math.max(1, Math.min(requestedCount, WORKER_LIVE_SCAN_LIMIT));
	const end = Math.max(floor, height - offset);
	const start = Math.max(floor + 1, end - safeCount + 1);
	const summary = {
		enabled: true,
		requested_blocks: requestedCount,
		effective_blocks: safeCount,
		offset_blocks: offset,
		start_height: floor,
		end_height: end,
		scan_mode: 'latest_after',
		checked_txids: 0,
		verified_txids: 0,
		scanned_blocks: 0,
		scanned_transactions: 0,
		indexed_records: 0,
		errors: []
	};
	const matches = [];

	if (requestedCount > safeCount) {
		summary.errors.push({ error: 'Cloudflare live scan chunk capped at ' + safeCount + ' latest blocks. The browser continues with additional chunks when needed.' });
	}
	if (start > end) {
		return { records: matches, summary };
	}

	const batchSize = WORKER_RANGE_BATCH_SIZE;
	for (let batchStart = start; batchStart <= end; batchStart += batchSize) {
		const batchEnd = Math.min(end, batchStart + batchSize - 1);
		const batch = await fetchSugarBlockBatch(batchStart, batchEnd, safeCount <= 25);
		const blocks = batch.blocks;
		if (batch.rangeError) {
			summary.errors.push({ start_height: batchStart, end_height: batchEnd, error: 'Range lookup failed; fell back to individual blocks: ' + (batch.rangeError.message || 'Sugarchain range failed.') });
		}

		const txJobs = [];
		for (const item of blocks) {
			if (item.error) {
				summary.errors.push({ height: item.height, error: item.error.message || 'Block lookup failed.' });
				continue;
			}
			const block = item.block || {};
			const txids = Array.isArray(block.tx) ? block.tx.slice(1) : [];
			summary.scanned_blocks += 1;
			for (const txid of txids) {
				txJobs.push({ height: item.height, txid, block });
			}
		}

		const txResults = await mapWithConcurrency(txJobs, WORKER_TX_LOOKUP_CONCURRENCY, async job => {
			try {
				return {
					job,
					records: await indexSugarTxid(job.txid, job.block)
				};
			} catch (error) {
				return { job, error };
			}
		});

		for (const result of txResults) {
			if (!result) {
				continue;
			}
			const job = result.job || {};
			summary.scanned_transactions += 1;
			summary.checked_txids += 1;
			if (result.error) {
				summary.errors.push({ height: job.height, txid: job.txid, error: result.error.message || 'Transaction lookup failed.' });
				continue;
			}
			const records = result.records || [];
			summary.indexed_records += records.length;
			if (records.length) {
				summary.verified_txids += 1;
			}
			for (const record of records) {
				if (!normalizedWord || record.word === normalizedWord) {
					matches.push(record);
					summary.matched_word = record.word;
				}
			}
		}
		if (normalizedWord && matches.length) {
			break;
		}
	}

	summary.errors = summary.errors.slice(0, 20);
	return { records: matches, summary };
}

async function handleWordLatest(request, env) {
	const url = new URL(request.url);
	const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 50, 100));
	const filter = url.searchParams.get('filter') || '';
	const viewerAddress = url.searchParams.get('address') || '';
	if (!workerWordCache.records.length || Date.now() - workerWordCache.scannedAt > 5 * 60 * 1000) {
		try {
			const scan = await scanLatestSugarBlocks(LINGRY_WORD_START_HEIGHT, WORKER_DEFAULT_CACHE_SCAN_BLOCKS);
			mergeWorkerWordCache(scan.records, scan.summary);
			await persistLingrySocialWords(env, scan.records);
		} catch (error) {
			workerWordCache.summary = {
				enabled: true,
				requested_blocks: WORKER_DEFAULT_CACHE_SCAN_BLOCKS,
				effective_blocks: 0,
				start_height: LINGRY_WORD_START_HEIGHT,
				end_height: 0,
				scan_mode: 'latest_after',
				checked_txids: 0,
				verified_txids: 0,
				scanned_blocks: 0,
				scanned_transactions: 0,
				indexed_records: 0,
				errors: [{ error: error.message || 'Sugarchain scan unavailable.' }]
			};
		}
	}
	const d1Records = await latestLingrySocialWords(env, limit, viewerAddress);
	const merged = new Map();
	for (const record of d1Records) {
		merged.set(recordCacheKey(record), record);
	}
	for (const record of filteredWorkerRecords(filter)) {
		merged.set(recordCacheKey(record), record);
	}
	return jsonResponse({
		records: await enrichLingryRecordsWithSocial(env, Array.from(merged.values()).slice(0, limit), viewerAddress),
		scan_summary: workerWordCache.summary
	});
}

async function handleWordScan(request, env) {
	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method not allowed.' }, 405);
	}
	let startHeight = LINGRY_WORD_START_HEIGHT;
	let blocks = 120;
	let offset = 0;
	try {
		const body = await request.json().catch(() => ({}));
		startHeight = Number(body.start_height) || startHeight;
		blocks = Number(body.blocks) || blocks;
		offset = Number(body.offset) || 0;
		const result = await scanLatestSugarBlocks(startHeight, blocks, '', offset);
		mergeWorkerWordCache(result.records, result.summary);
		await persistLingrySocialWords(env, result.records);
		return jsonResponse({
			...result.summary,
			records: await enrichLingryRecordsWithSocial(env, result.records, body.viewer_address || '')
		});
	} catch (error) {
		const cachedRecords = filteredWorkerRecords('all').slice(0, 100);
		return jsonResponse({
			enabled: true,
			requested_blocks: blocks,
			effective_blocks: 0,
			offset_blocks: offset,
			start_height: startHeight,
			end_height: 0,
			scan_mode: 'latest_after',
			checked_txids: 0,
			verified_txids: 0,
			scanned_blocks: 0,
			scanned_transactions: 0,
			indexed_records: 0,
			errors: [{ error: error.message || 'Sugarchain scan unavailable.' }],
			records: await enrichLingryRecordsWithSocial(env, cachedRecords)
		});
	}
}

async function handleWordSearch(request, env) {
	const url = new URL(request.url);
	const direct = ['1', 'true', 'yes', 'on'].includes(String(url.searchParams.get('direct') || '').toLowerCase());
	const mode = url.searchParams.get('mode') || 'all';
	const word = normalizeWord(url.searchParams.get('q') || '');
	const startHeight = Number(url.searchParams.get('start_height')) || LINGRY_WORD_START_HEIGHT;
	const blocks = Number(url.searchParams.get('blocks')) || 500;
	const viewerAddress = url.searchParams.get('address') || '';

	if (!direct || mode !== 'word' || !/^[a-z-]{2,32}$/.test(word)) {
		return jsonResponse({
			records: [],
			decoded_record: null,
			direct_summary: {
				enabled: Boolean(direct),
				requested_blocks: 0,
				start_height: startHeight,
				scan_mode: direct ? 'unsupported_worker_search' : 'off',
				checked_txids: 0,
				verified_txids: 0,
				scanned_blocks: 0,
				scanned_transactions: 0,
				indexed_records: 0,
				errors: []
			}
		});
	}

	try {
		const result = await scanLatestSugarBlocks(startHeight, blocks, word);
		mergeWorkerWordCache(result.records, result.summary);
		await persistLingrySocialWords(env, result.records);
		return jsonResponse({
			records: await enrichLingryRecordsWithSocial(env, result.records, viewerAddress),
			decoded_record: null,
			direct_summary: result.summary
		});
	} catch (error) {
		const cachedMatches = filteredWorkerRecords('all').filter(record => normalizeWord(record.word) === word).slice(0, 50);
		return jsonResponse({
			records: await enrichLingryRecordsWithSocial(env, cachedMatches, viewerAddress),
			decoded_record: null,
			direct_summary: {
				enabled: true,
				requested_blocks: blocks,
				effective_blocks: 0,
				start_height: startHeight,
				scan_mode: 'latest_after',
				checked_txids: 0,
				verified_txids: cachedMatches.length ? cachedMatches.length : 0,
				scanned_blocks: 0,
				scanned_transactions: 0,
				indexed_records: cachedMatches.length,
				errors: [{ error: error.message || 'Sugarchain scan unavailable.' }]
			}
		});
	}
}

async function handleWordDetail(request, env, word) {
	const url = new URL(request.url);
	const viewerAddress = url.searchParams.get('address') || '';
	const normalizedWord = normalizeWord(word);
	if (!normalizedWord) {
		return jsonResponse({ error: 'Word is required.' }, 400);
	}
	if (!workerWordCache.records.length || Date.now() - workerWordCache.scannedAt > 5 * 60 * 1000) {
		try {
			const scan = await scanLatestSugarBlocks(LINGRY_WORD_START_HEIGHT, WORKER_DEFAULT_CACHE_SCAN_BLOCKS);
			mergeWorkerWordCache(scan.records, scan.summary);
			await persistLingrySocialWords(env, scan.records);
		} catch (error) {
			workerWordCache.summary = {
				enabled: true,
				requested_blocks: WORKER_DEFAULT_CACHE_SCAN_BLOCKS,
				effective_blocks: 0,
				start_height: LINGRY_WORD_START_HEIGHT,
				end_height: 0,
				scan_mode: 'latest_after',
				checked_txids: 0,
				verified_txids: 0,
				scanned_blocks: 0,
				scanned_transactions: 0,
				indexed_records: 0,
				errors: [{ error: error.message || 'Sugarchain scan unavailable.' }]
			};
		}
	}
	const claims = workerWordCache.records.filter(record => normalizeWord(record.word) === normalizedWord);
	const first = claims[0] || null;
	if (!first) {
		return jsonResponse({
			word: normalizedWord,
			first_seen: null,
			claims: [],
			related: []
		}, 404);
	}
	const related = workerWordCache.records
		.filter(record => normalizeWord(record.word) !== normalizedWord)
		.filter(record => normalizeWord(record.part_of_speech) === normalizeWord(first.part_of_speech))
		.slice(0, 8);
	return jsonResponse({
		word: normalizedWord,
		first_seen: (await enrichLingryRecordsWithSocial(env, [first], viewerAddress))[0],
		claims: await enrichLingryRecordsWithSocial(env, claims, viewerAddress),
		related: await enrichLingryRecordsWithSocial(env, related, viewerAddress)
	});
}

async function handleTxWord(request, env, txid) {
	const url = new URL(request.url);
	const viewerAddress = url.searchParams.get('address') || '';
	try {
		const records = await indexSugarTxid(txid);
		if (records.length) {
			mergeWorkerWordCache(records, {
				enabled: true,
				requested_blocks: 0,
				start_height: null,
				scan_mode: 'txid',
				checked_txids: 1,
				verified_txids: 1,
				scanned_blocks: 0,
				scanned_transactions: 1,
				indexed_records: records.length,
				errors: []
			});
			await persistLingrySocialWords(env, records);
		}
		return jsonResponse({ records: await enrichLingryRecordsWithSocial(env, records, viewerAddress) });
	} catch (error) {
		return jsonResponse({ error: error.message || 'Transaction lookup failed.' }, 400);
	}
}

export default {
	async scheduled(controller, env, ctx) {
		if (ctx && typeof ctx.waitUntil === 'function') {
			ctx.waitUntil(refreshLingryLeaderboardIndex(env));
			return;
		}
		await refreshLingryLeaderboardIndex(env);
	},
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (url.pathname === '/api/invent-word-from-prompt') {
			return handleGenerateWord(request, env, 'prompt');
		}
		if (url.pathname === '/api/generate-word') {
			return handleGenerateWord(request, env, null);
		}
		if (url.pathname === '/api/faucet/fund') {
			return handleFaucetFund(request, env);
		}
		if (url.pathname === '/api/social/summary') {
			return handleLingrySocialSummary(request, env);
		}
		if (url.pathname === '/api/social/like') {
			return handleLingrySocialLike(request, env);
		}
		if (url.pathname === '/api/social/tip') {
			return handleLingrySocialTip(request, env);
		}
		if (url.pathname === '/api/leaderboard') {
			return handleLingryLeaderboard(request, env, ctx);
		}
		if (url.pathname === '/api/words/latest') {
			return handleWordLatest(request, env);
		}
		if (url.pathname === '/api/words/scan') {
			return handleWordScan(request, env);
		}
		if (url.pathname === '/api/words/search') {
			return handleWordSearch(request, env);
		}
		if (url.pathname.startsWith('/api/words/')) {
			const word = decodeURIComponent(url.pathname.slice('/api/words/'.length));
			return handleWordDetail(request, env, word);
		}
		if (url.pathname.startsWith('/api/tx/') && url.pathname.endsWith('/word')) {
			const txid = decodeURIComponent(url.pathname.slice('/api/tx/'.length, -'/word'.length));
			return handleTxWord(request, env, txid);
		}
		return env.ASSETS.fetch(request);
	}
};
