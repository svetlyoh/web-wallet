function normalizeHex(value) {
	return String(value || '').trim().replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase();
}

function textToHex(text) {
	return Buffer.from(String(text || ''), 'utf8').toString('hex');
}

function hexToUtf8(hex) {
	const normalized = normalizeHex(hex);
	if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
		return '';
	}
	return Buffer.from(normalized, 'hex').toString('utf8').replace(/\u0000/g, '');
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

function normalizePartOfSpeech(value) {
	const pos = String(value || '').trim().toLowerCase().replace(/\.$/, '');
	const allowed = ['n', 'v', 'adj', 'adv', 'pron', 'prep', 'conj', 'interj'];
	return allowed.includes(pos) ? pos : '';
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
	const fivePartSpeech = parts.length === 5 ? normalizePartOfSpeech(parts[2]) : '';
	const fivePartType = parts.length === 5 ? parts[4] : '';
	const isNewFivePartPayload = Boolean(fivePartSpeech) && ['c', 'h', 'k'].includes(fivePartType);
	const isFourPartPayload = parts.length === 4 && Boolean(normalizePartOfSpeech(parts[2]));
	const hasPartOfSpeech = parts.length === 6 || isNewFivePartPayload || isFourPartPayload;
	const partOfSpeech = hasPartOfSpeech ? normalizePartOfSpeech(parts[2]) : '';
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

module.exports = {
	decodeOpReturnPayloadFromAsm,
	decodeOpReturnPayloadFromScript,
	extractOpReturnPayloadsFromTxInfo,
	hexToUtf8,
	normalizeHex,
	normalizePartOfSpeech,
	parseSugarWordPayload,
	recordFromPayloadHex,
	textToHex
};
