const fs = require('fs');
const path = require('path');
const { normalizeHex, normalizePartOfSpeech } = require('./parser');

const DEFAULT_DB = path.join(__dirname, '..', '..', 'data', 'sugarwords-index.json');

function nowIso() {
	return new Date().toISOString();
}

function partOfSpeechLabel(value) {
	const labels = {
		n: 'noun',
		v: 'verb',
		adj: 'adjective',
		adv: 'adverb',
		pron: 'pronoun',
		prep: 'preposition',
		conj: 'conjunction',
		interj: 'interjection'
	};
	return labels[normalizePartOfSpeech(value)] || '';
}

class SugarWordsDb {
	constructor(filePath = DEFAULT_DB) {
		this.filePath = filePath;
		this.data = {
			nextId: 1,
			records: [],
			malformed: [],
			state: {}
		};
		this.load();
	}

	load() {
		try {
			if (fs.existsSync(this.filePath)) {
				const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
				this.data = {
					nextId: Number(parsed.nextId || 1),
					records: Array.isArray(parsed.records) ? parsed.records : [],
					malformed: Array.isArray(parsed.malformed) ? parsed.malformed : [],
					state: parsed.state && typeof parsed.state === 'object' ? parsed.state : {}
				};
			}
		} catch (error) {
			this.data = { nextId: 1, records: [], malformed: [], state: { load_error: error.message } };
		}
	}

	save() {
		fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
		fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
	}

	getState(key) {
		return this.data.state[key];
	}

	setState(key, value) {
		this.data.state[key] = value;
		this.save();
	}

	addMalformed(entry) {
		this.data.malformed.push({ ...entry, indexed_at: nowIso() });
		this.save();
	}

	upsertWord(record) {
		const normalized = this.normalizeRecord(record);
		const existing = this.data.records.find(item => {
			if (normalized.txid && item.txid && item.txid === normalized.txid && item.op_return_hex === normalized.op_return_hex) {
				return true;
			}
			return !normalized.txid && item.source === normalized.source && item.op_return_hex === normalized.op_return_hex;
		});

		if (existing) {
			Object.assign(existing, this.mergeRecord(existing, normalized));
			this.save();
			return { record: this.withDuplicateStatus(existing), created: false };
		}

		normalized.id = this.data.nextId++;
		normalized.indexed_at = normalized.indexed_at || nowIso();
		this.data.records.push(normalized);
		this.save();
		return { record: this.withDuplicateStatus(normalized), created: true };
	}

	normalizeRecord(record) {
		return {
			word: String(record.word || '').trim().toLowerCase(),
			part_of_speech: normalizePartOfSpeech(record.part_of_speech),
			meaning: String(record.meaning || '').trim(),
			roots_compact: String(record.roots_compact || '').trim(),
			etymology_type: String(record.etymology_type || 'coined'),
			etymology_meaning: String(record.etymology_meaning || '').trim(),
			creator_address: String(record.creator_address || record.address || record.sender || '').trim(),
			op_return_payload: String(record.op_return_payload || '').trim(),
			op_return_hex: normalizeHex(record.op_return_hex),
			txid: String(record.txid || '').trim().toLowerCase(),
			block_height: record.block_height == null ? null : Number(record.block_height),
			block_hash: String(record.block_hash || ''),
			tx_time: String(record.tx_time || record.timestamp || ''),
			indexed_at: String(record.indexed_at || ''),
			source: String(record.source || 'blockchain'),
			verified_status: String(record.verified_status || 'verified_on_chain')
		};
	}

	mergeRecord(existing, next) {
		const existingHasImportEnrichment = Boolean(existing.etymology_meaning) || String(existing.source || '').includes('imported_json');
		const nextIsBareBlockchain = next.source === 'blockchain';
		const keepExistingText = existingHasImportEnrichment && nextIsBareBlockchain;
		return {
			...existing,
			...next,
			part_of_speech: next.part_of_speech || existing.part_of_speech || '',
			meaning: keepExistingText && existing.meaning ? existing.meaning : (next.meaning || existing.meaning || ''),
			roots_compact: keepExistingText && existing.roots_compact ? existing.roots_compact : (next.roots_compact || existing.roots_compact || ''),
			etymology_meaning: next.etymology_meaning || existing.etymology_meaning || '',
			creator_address: next.creator_address || existing.creator_address || '',
			source: keepExistingText ? 'blockchain+imported_json' : (next.source || existing.source || ''),
			block_height: next.block_height == null ? existing.block_height : next.block_height,
			block_hash: next.block_hash || existing.block_hash || '',
			tx_time: next.tx_time || existing.tx_time || '',
			indexed_at: existing.indexed_at || next.indexed_at || nowIso()
		};
	}

	latest(limit = 25, offset = 0, filters = {}) {
		let records = this.data.records.slice();
		records = this.applyFilters(records, filters);
		records.sort((a, b) => this.timeRank(b) - this.timeRank(a));
		return records.slice(offset, offset + limit).map(record => this.withDuplicateStatus(record));
	}

	search(q, mode = 'all', limit = 50, offset = 0, filters = {}) {
		const needle = String(q || '').trim().toLowerCase();
		let records = this.applyFilters(this.data.records.slice(), filters);
		if (needle) {
			records = records.filter(record => this.matches(record, needle, mode));
		}
		records.sort((a, b) => this.timeRank(b) - this.timeRank(a));
		return records.slice(offset, offset + limit).map(record => this.withDuplicateStatus(record));
	}

	findByWord(word) {
		const normalized = String(word || '').trim().toLowerCase();
		const claims = this.data.records
			.filter(record => record.word === normalized)
			.sort((a, b) => this.timeRank(a) - this.timeRank(b))
			.map(record => this.withDuplicateStatus(record));
		return claims;
	}

	findByTxid(txid) {
		const normalized = String(txid || '').trim().toLowerCase();
		return this.data.records
			.filter(record => record.txid === normalized || (record.txid && record.txid.startsWith(normalized)))
			.map(record => this.withDuplicateStatus(record));
	}

	findByOpReturnHex(hex) {
		const normalized = normalizeHex(hex);
		return this.data.records
			.filter(record => record.op_return_hex === normalized || (record.op_return_hex && (record.op_return_hex.startsWith(normalized) || record.op_return_hex.includes(normalized))))
			.map(record => this.withDuplicateStatus(record));
	}

	related(record, limit = 8) {
		if (!record) {
			return [];
		}
		const prefix = String(record.roots_compact || '').match(/^[a-z]{2}:/);
		const chunks = String(record.word || '').match(/[a-z]{3,}/g) || [];
		return this.data.records
			.filter(item => item.id !== record.id)
			.filter(item => {
				if (prefix && String(item.roots_compact || '').startsWith(prefix[0])) {
					return true;
				}
				return chunks.some(chunk => item.word.includes(chunk) || item.meaning.toLowerCase().includes(chunk));
			})
			.slice(0, limit)
			.map(item => this.withDuplicateStatus(item));
	}

	applyFilters(records, filters) {
		let output = records;
		const filter = String(filters.filter || '').toLowerCase();
		if (filter === 'verified') {
			output = output.filter(record => record.verified_status === 'verified_on_chain');
		} else if (filter === 'imported') {
			output = output.filter(record => record.source !== 'blockchain' || record.verified_status !== 'verified_on_chain');
		} else if (filter === 'duplicates') {
			output = output.filter(record => this.data.records.filter(item => item.word === record.word).length > 1);
		} else if (['es', 'la', 'grc', 'oe'].includes(filter)) {
			output = output.filter(record => String(record.roots_compact || '').toLowerCase().includes(filter + ':'));
		}
		return output;
	}

	matches(record, needle, mode) {
		const opHex = normalizeHex(needle);
		const fields = {
			word: record.word,
			part_of_speech: record.part_of_speech,
			syllable: record.word,
			meaning: record.meaning,
			roots: [record.roots_compact, record.meaning, record.etymology_meaning, record.word, record.part_of_speech, partOfSpeechLabel(record.part_of_speech)].join(' '),
			txid: record.txid,
			op_return_hex: record.op_return_hex,
			op_return_payload: record.op_return_payload
		};

		if (mode === 'txid') {
			return fields.txid === needle || fields.txid.startsWith(needle);
		}
		if (mode === 'op_return_hex') {
			return fields.op_return_hex === opHex ||
				fields.op_return_hex.startsWith(opHex) ||
				fields.op_return_hex.includes(opHex) ||
				fields.op_return_payload.toLowerCase().includes(needle);
		}
		if (mode === 'word') {
			return fields.word === needle || fields.word.includes(needle);
		}
		if (mode === 'syllable') {
			return fields.syllable.includes(needle);
		}
		if (mode === 'meaning') {
			return fields.meaning.toLowerCase().includes(needle);
		}
		if (mode === 'roots') {
			return fields.roots.toLowerCase().includes(needle);
		}
		return [
			record.word,
			record.part_of_speech,
			partOfSpeechLabel(record.part_of_speech),
			record.meaning,
			record.roots_compact,
			record.etymology_meaning,
			record.txid,
			record.op_return_payload,
			record.op_return_hex
		].join(' ').toLowerCase().includes(mode === 'op_return_hex' ? opHex : needle);
	}

	timeRank(record) {
		if (record.block_height != null && Number.isFinite(record.block_height)) {
			return Number(record.block_height);
		}
		const parsed = Date.parse(record.tx_time || record.indexed_at || '');
		return Number.isFinite(parsed) ? parsed / 1000 : 0;
	}

	withDuplicateStatus(record) {
		const sameWord = this.data.records
			.filter(item => item.word === record.word)
			.sort((a, b) => this.timeRank(a) - this.timeRank(b));
		const first = sameWord[0];
		let duplicate_status = 'first_seen';
		if (first && first.id !== record.id) {
			duplicate_status = first.op_return_payload === record.op_return_payload ? 'same_payload_duplicate' : 'different_meaning_duplicate';
		}
		return { ...record, duplicate_status };
	}
}

module.exports = {
	SugarWordsDb,
	DEFAULT_DB
};
