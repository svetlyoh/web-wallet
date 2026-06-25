import bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';

const MINI_MAX_MODEL = 'MiniMax-M3';
const SUGAR_API_BASES = ['https://api.sugar.wtf', 'https://api.sugarchain.org'];
const SUGAR_DECIMALS = 8;
const FAUCET_AMOUNT_SATOSHIS = 2500000;
const FAUCET_MINIMUM_BALANCE_SATOSHIS = 1000000;
const FAUCET_FEE_SATOSHIS = 1000;
const FAUCET_DEFAULT_ADDRESS = 'sugar1q39n666w687nxm9x98tx5kgw2uvk780gtmd6yyu';
const faucetAttempts = new Map();
const workerWordCache = {
	records: [],
	scannedAt: 0,
	summary: null
};
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
	if (!payload.startsWith('SW|') && !payload.startsWith('SGW1|')) {
		return null;
	}

	const parts = payload.split('|');
	if (![4, 5, 6].includes(parts.length)) {
		return null;
	}

	const protocol = parts[0];
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

	if (!['SW', 'SGW1'].includes(protocol)) {
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
	return record.txid || record.op_return_hex || record.op_return_payload || record.word || '';
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

function buildConceptWordPrompt(concept) {
	return [
		'You are an expert etymologist, lexicographer, and wordsmith.',
		'',
		'Your job is to create one new English word for the concept provided below.',
		'',
		'CONCEPT:',
		concept,
		'',
		'Instructions:',
		'',
		'* First, understand the concept.',
		'* Silently generate 5 possible new words.',
		'* Use plausible roots or sounds from English, Latin, Greek, Germanic, Romance, French, German, Old English, or Old Norse.',
		'* Silently check whether each word already exists as a common English word, known term, or obvious trademark.',
		'* Reject words that already exist or strongly conflict with existing words.',
		'* Pick the best word based on clarity, memorability, natural English sound, etymological consistency, and likelihood of adoption.',
		'* Return only the winning word and its dictionary entry.',
		'* Do not show the 5 candidate words.',
		'* Do not explain your selection process.',
		'* Do not include examples.',
		'* Do not include notes.',
		'* Be succinct in both Meaning and Etymology Meaning.',
		'* Keep Meaning to 65 ASCII characters or fewer, counting spaces and punctuation.',
		'* Keep Etymology Meaning to 40 ASCII characters or fewer.',
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
		'[succinct dictionary definition, 65 ASCII characters or fewer including spaces and punctuation]',
		'',
		'Etymology Meaning',
		'',
		'[succinct origin/construction explanation, 40 ASCII characters or fewer]'
	].join('\n');
}

function buildRandomWordPrompt(usedWords, usedMeanings) {
	const usedList = Array.from(usedWords).join(', ') || 'none';
	const recentMeanings = usedMeanings.length ? usedMeanings.join(' | ') : 'none';
	return [
		'You are an expert etymologist, lexicographer, and wordsmith.',
		'',
		'Task:',
		'Randomly identify a useful concept, action, feeling, object, situation, or phenomenon that English lacks a concise word for. Then create one new English word for it.',
		'',
		'Already-used session words to avoid:',
		usedList,
		'',
		'Recent session meanings to avoid repeating:',
		recentMeanings,
		'',
		'Process silently:',
		'',
		'1. Choose a concept that feels useful, vivid, and genuinely missing from ordinary English.',
		'2. Generate 5 candidate words for that concept.',
		'3. Use roots, sounds, or word-building patterns from English, Latin, German, French, Old Norse, Old English, Greek, or other related European languages.',
		'4. Check from your knowledge whether each candidate already exists as a common English word, known term, or obvious trademark. Reject conflicts.',
		'5. Estimate a newness confidence score from 0.00 to 1.00, where 1.00 means you are highly confident the word is not already an established English word.',
		'6. Pick the best candidate based on clarity, memorability, natural English sound, etymological consistency, usefulness, likelihood of adoption, and newness confidence.',
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
		'[succinct dictionary definition, 65 ASCII characters or fewer including spaces and punctuation]',
		'',
		'Etymology Meaning',
		'',
		'[succinct origin/construction explanation, 40 ASCII characters or fewer]',
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
		'* Be succinct in both Meaning and Etymology Meaning.',
		'* Keep Meaning to 65 ASCII characters or fewer, counting spaces and punctuation.',
		'* Keep Etymology Meaning to 40 ASCII characters or fewer.',
		'* Both Meaning and Etymology Meaning must fit within their character limits before you return the answer.',
		'* If either field is too long, rewrite it shorter instead of exceeding the limit.',
		'* Prefer compact, memorable words that sound natural in English.',
		'* Avoid existing common English words and obvious trademarks.',
		'* If the best candidate conflicts with an existing common word, discard it and choose another.',
		'* Use confidence format like 0.92, meaning 92% confidence.'
	].join('\n');
}

async function requestMiniMaxWord(usedWords, usedMeanings, conceptPrompt, generationMode, env) {
	const apiKey = env.MINIMAX_API_KEY || '';
	if (!apiKey) {
		throw new Error('AI word generation is not configured on this server.');
	}

	const useConceptPrompt = generationMode === 'prompt';
	const prompt = useConceptPrompt ? buildConceptWordPrompt(sanitizeText(conceptPrompt, 500)) : buildRandomWordPrompt(usedWords, usedMeanings);
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
		if (generationMode === 'prompt' && !conceptPrompt) {
			throw new Error('Prompt for New Word is empty.');
		}
		let lastError = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const candidate = await requestMiniMaxWord(usedWords, usedMeanings, conceptPrompt, generationMode, env);
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
	for (const base of SUGAR_API_BASES) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(base + path, { signal: controller.signal });
			const json = await response.json().catch(() => null);
			if (!response.ok || !json || json.error) {
				const message = json && json.error && json.error.message ? json.error.message : 'Sugarchain API request failed.';
				throw new Error(message);
			}
			return json.result;
		} catch (error) {
			lastError = error && error.name === 'AbortError' ? new Error('Sugarchain API request timed out.') : error;
		} finally {
			clearTimeout(timeout);
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
			tx_time: '',
			indexed_at: new Date().toISOString(),
			source: 'blockchain',
			verified_status: 'verified_on_chain',
			duplicate_status: 'first_seen'
		});
	}
	return records;
}

async function scanLatestSugarBlocks(startHeight, blockCount, word = '', offsetBlocks = 0) {
	const normalizedWord = normalizeWord(word);
	const height = Number(await fetchSugarJson('/info').then(info => info.blocks || info.headers || 0));
	const floor = Math.max(0, Number(startHeight) || 0);
	const requestedCount = Math.max(1, Number(blockCount) || 80);
	const offset = Math.max(0, Number(offsetBlocks) || 0);
	const safeCount = Math.max(1, Math.min(requestedCount, 32));
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
		summary.errors.push({ error: 'Cloudflare live scan capped at ' + safeCount + ' latest blocks for responsiveness.' });
	}
	if (start > end) {
		return { records: matches, summary };
	}

	const batchSize = 32;
	for (let batchStart = start; batchStart <= end; batchStart += batchSize) {
		const batchEnd = Math.min(end, batchStart + batchSize - 1);
		const heights = [];
		for (let current = batchStart; current <= batchEnd; current++) {
			heights.push(current);
		}
		const blocks = await Promise.all(heights.map(async currentHeight => {
			try {
				const block = await fetchSugarJson('/height/' + currentHeight);
				return { height: currentHeight, block };
			} catch (error) {
				return { height: currentHeight, error };
			}
		}));

		for (const item of blocks) {
			if (item.error) {
				summary.errors.push({ height: item.height, error: item.error.message || 'Block lookup failed.' });
				continue;
			}
			const block = item.block || {};
			const txids = Array.isArray(block.tx) ? block.tx.slice(1) : [];
			summary.scanned_blocks += 1;
			for (const txid of txids) {
				try {
					const records = await indexSugarTxid(txid, block);
					summary.scanned_transactions += 1;
					summary.checked_txids += 1;
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
				} catch (error) {
					summary.errors.push({ height: item.height, txid, error: error.message || 'Transaction lookup failed.' });
				}
			}
		}
		if (matches.length) {
			break;
		}
	}

	summary.errors = summary.errors.slice(0, 10);
	return { records: matches, summary };
}

async function handleWordLatest(request) {
	const url = new URL(request.url);
	const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 50, 100));
	const filter = url.searchParams.get('filter') || '';
	if (!workerWordCache.records.length || Date.now() - workerWordCache.scannedAt > 5 * 60 * 1000) {
		try {
			const scan = await scanLatestSugarBlocks(42900000, 32);
			mergeWorkerWordCache(scan.records, scan.summary);
		} catch (error) {
			workerWordCache.summary = {
				enabled: true,
				requested_blocks: 32,
				effective_blocks: 0,
				start_height: 42900000,
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
	return jsonResponse({
		records: filteredWorkerRecords(filter).slice(0, limit),
		scan_summary: workerWordCache.summary
	});
}

async function handleWordScan(request) {
	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method not allowed.' }, 405);
	}
	let startHeight = 42900000;
	let blocks = 120;
	let offset = 0;
	try {
		const body = await request.json().catch(() => ({}));
		startHeight = Number(body.start_height) || startHeight;
		blocks = Number(body.blocks) || blocks;
		offset = Number(body.offset) || 0;
		const result = await scanLatestSugarBlocks(startHeight, blocks, '', offset);
		mergeWorkerWordCache(result.records, result.summary);
		return jsonResponse({
			...result.summary,
			records: result.records
		});
	} catch (error) {
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
			records: []
		});
	}
}

async function handleWordSearch(request) {
	const url = new URL(request.url);
	const direct = ['1', 'true', 'yes', 'on'].includes(String(url.searchParams.get('direct') || '').toLowerCase());
	const mode = url.searchParams.get('mode') || 'all';
	const word = normalizeWord(url.searchParams.get('q') || '');
	const startHeight = Number(url.searchParams.get('start_height')) || 42900000;
	const blocks = Number(url.searchParams.get('blocks')) || 500;

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

	const result = await scanLatestSugarBlocks(startHeight, blocks, word);
	mergeWorkerWordCache(result.records, result.summary);
	return jsonResponse({
		records: result.records,
		decoded_record: null,
		direct_summary: result.summary
	});
}

async function handleWordDetail(request, word) {
	const normalizedWord = normalizeWord(word);
	if (!normalizedWord) {
		return jsonResponse({ error: 'Word is required.' }, 400);
	}
	if (!workerWordCache.records.length || Date.now() - workerWordCache.scannedAt > 5 * 60 * 1000) {
		try {
			const scan = await scanLatestSugarBlocks(42900000, 32);
			mergeWorkerWordCache(scan.records, scan.summary);
		} catch (error) {
			workerWordCache.summary = {
				enabled: true,
				requested_blocks: 32,
				effective_blocks: 0,
				start_height: 42900000,
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
		first_seen: first,
		claims,
		related
	});
}

async function handleTxWord(request, txid) {
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
		}
		return jsonResponse({ records });
	} catch (error) {
		return jsonResponse({ error: error.message || 'Transaction lookup failed.' }, 400);
	}
}

export default {
	async fetch(request, env) {
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
		if (url.pathname === '/api/words/latest') {
			return handleWordLatest(request);
		}
		if (url.pathname === '/api/words/scan') {
			return handleWordScan(request);
		}
		if (url.pathname === '/api/words/search') {
			return handleWordSearch(request);
		}
		if (url.pathname.startsWith('/api/words/')) {
			const word = decodeURIComponent(url.pathname.slice('/api/words/'.length));
			return handleWordDetail(request, word);
		}
		if (url.pathname.startsWith('/api/tx/') && url.pathname.endsWith('/word')) {
			const txid = decodeURIComponent(url.pathname.slice('/api/tx/'.length, -'/word'.length));
			return handleTxWord(request, txid);
		}
		return env.ASSETS.fetch(request);
	}
};
