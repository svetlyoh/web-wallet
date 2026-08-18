export const LINGRY_PROTOCOL_LANGUAGE_CODES = new Set('WESGFIRPCAHBJKTVUNMYLDOQXZ'.split(''));

const LINGRY_PARTS_OF_SPEECH = new Set(['n', 'v', 'adj', 'adv', 'pron', 'prep', 'conj', 'interj']);
const LINGRY_ETYMOLOGY_CODES = new Set(['c', 'h', 'k']);

function textToHex(text) {
	return Array.from(new TextEncoder().encode(String(text || '')))
		.map(byte => byte.toString(16).padStart(2, '0'))
		.join('');
}

function normalizeLanguageCode(value) {
	const code = String(value || '').trim().toUpperCase().charAt(0);
	return LINGRY_PROTOCOL_LANGUAGE_CODES.has(code) ? code : '';
}

function normalizePartOfSpeech(value) {
	const partOfSpeech = String(value || '').trim().toLowerCase().replace(/\.$/, '');
	return LINGRY_PARTS_OF_SPEECH.has(partOfSpeech) ? partOfSpeech : '';
}

function isValidWord(value) {
	return /^[\p{L}\p{M}]{2,32}(?:-[\p{L}\p{M}]{2,32})?$/u.test(String(value || ''));
}

function etymologyType(code) {
	return code === 'c' ? 'coined' : code === 'h' ? 'hypothesized' : code === 'k' ? 'known' : '';
}

// This parser is the single protocol contract for Worker scans, trusted ingest,
// and the external RPC indexer. Keep all three consumers on this implementation.
export function parseSugarWordPayload(payloadText) {
	const payload = String(payloadText || '').trim();
	if (!/^S[A-Z]\|/.test(payload) && !payload.startsWith('SGW1|')) {
		return null;
	}

	const parts = payload.split('|');
	if (![4, 5, 6].includes(parts.length)) {
		return null;
	}

	const protocol = parts[0];
	const languageCode = /^S[A-Z]$/.test(protocol) ? normalizeLanguageCode(protocol.slice(1)) : 'W';
	const fivePartSpeech = parts.length === 5 ? normalizePartOfSpeech(parts[2]) : '';
	const fivePartType = parts.length === 5 ? parts[4] : '';
	const isNewFivePartPayload = Boolean(fivePartSpeech) && LINGRY_ETYMOLOGY_CODES.has(fivePartType);
	const isFourPartPayload = parts.length === 4 && Boolean(normalizePartOfSpeech(parts[2]));
	const hasPartOfSpeech = parts.length === 6 || isNewFivePartPayload || isFourPartPayload;
	const partOfSpeech = hasPartOfSpeech ? normalizePartOfSpeech(parts[2]) : '';
	const meaningRaw = hasPartOfSpeech ? parts[3] : parts[2];
	const rootsRaw = parts.length === 6 ? parts[4] : (isNewFivePartPayload || isFourPartPayload ? '' : parts[3]);
	const code = parts.length === 6 ? parts[5] : (isFourPartPayload ? 'c' : parts[4]);
	const word = String(parts[1] || '').trim().toLowerCase();
	const meaning = String(meaningRaw || '').trim();
	const rootsCompact = String(rootsRaw || '').trim();

	if ((!/^S[A-Z]$/.test(protocol) && protocol !== 'SGW1') || !languageCode || !isValidWord(word)) {
		return null;
	}
	if ((hasPartOfSpeech && !partOfSpeech) || !meaning || meaning.length > 140 || !LINGRY_ETYMOLOGY_CODES.has(code)) {
		return null;
	}

	return {
		protocol,
		language_code: languageCode,
		word,
		normalized_word: word,
		part_of_speech: partOfSpeech,
		meaning,
		roots_compact: rootsCompact,
		etymology_type: etymologyType(code),
		etymology_code: code,
		op_return_payload: payload,
		op_return_hex: textToHex(payload),
		valid: true
	};
}
