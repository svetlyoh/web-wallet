const {
	extractOpReturnPayloadsFromTxInfo,
	parseSugarWordPayload,
	recordFromPayloadHex
} = require('./parser');

const DEFAULT_API = process.env.SUGARWORDS_API_URL || 'https://api.sugar.wtf';
const DEFAULT_API_BASES = Array.from(new Set([DEFAULT_API, 'https://api.sugarchain.org']));
const MAX_LATEST_AFTER_BLOCKS = 125000;
const SUGAR_API_RETRIES = 2;
const SUGAR_API_TX_PAGE_SIZE = 10;
const RANGE_BATCH_SIZE = 100;

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function isoFromUnix(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? new Date(number * 1000).toISOString() : '';
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

function looksLikeSugarAddress(value) {
	const text = String(value || '').trim();
	return /^sugar1[0-9a-z]{20,}$/i.test(text) || /^[A-Za-z0-9]{26,50}$/.test(text);
}

function collectAddressCandidates(value, output = []) {
	if (value == null) {
		return output;
	}
	if (typeof value === 'string') {
		const text = value.trim();
		if (looksLikeSugarAddress(text) && !output.includes(text)) {
			output.push(text);
		}
		return output;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			collectAddressCandidates(item, output);
		}
		return output;
	}
	if (typeof value === 'object') {
		for (const key of Object.keys(value)) {
			collectAddressCandidates(value[key], output);
		}
	}
	return output;
}

function extractTxSourceAddress(tx) {
	const inputCandidates = []
		.concat(Array.isArray(tx && tx.vin) ? tx.vin : [])
		.concat(Array.isArray(tx && tx.inputs) ? tx.inputs : []);
	for (const input of inputCandidates) {
		const addresses = collectAddressCandidates(input, []);
		if (addresses.length) {
			return addresses[0];
		}
	}
	return '';
}

class SugarWordsIndexer {
	constructor(db, options = {}) {
		this.db = db;
		const configuredBases = Array.isArray(options.apiBases) ? options.apiBases : [options.apiBase || DEFAULT_API];
		this.apiBases = Array.from(new Set(configuredBases.concat(DEFAULT_API_BASES).map(base => String(base || '').replace(/\/+$/, '')).filter(Boolean)));
		this.apiBase = this.apiBases[0];
	}

	async fetchJson(path, timeoutMs = 5000) {
		let lastError = null;
		for (let attempt = 0; attempt < SUGAR_API_RETRIES; attempt++) {
			for (const base of this.apiBases) {
				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), timeoutMs);
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
					clearTimeout(timer);
				}
			}
			if (attempt < SUGAR_API_RETRIES - 1) {
				await delay(250 * (attempt + 1));
			}
		}
		throw lastError || new Error('Sugarchain API request failed.');
	}

	async getHeight() {
		const info = await this.fetchJson('/info');
		return Number(info.blocks || info.headers || 0);
	}

	async fetchBlockByHeight(height) {
		const block = await this.fetchJson('/height/' + height + '?offset=0', 10000);
		const txids = Array.isArray(block.tx) ? block.tx.slice() : [];
		const txcount = Math.max(txids.length, Number(block.txcount || block.nTx || 0));
		for (let offset = txids.length; offset < txcount; offset += SUGAR_API_TX_PAGE_SIZE) {
			const page = await this.fetchJson('/height/' + height + '?offset=' + offset, 10000);
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

	async fetchBlockBatch(startHeight, endHeight) {
		const count = Math.max(0, endHeight - startHeight + 1);
		if (!count) {
			return { blocks: [], rangeError: null };
		}

		try {
			const range = await this.fetchJson('/range/' + endHeight + '?offset=' + count, 20000);
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
			const heights = [];
			for (let current = startHeight; current <= endHeight; current++) {
				heights.push(current);
			}
			const blocks = await Promise.all(heights.map(async height => {
				try {
					const block = await this.fetchBlockByHeight(height);
					return { height, block };
				} catch (error) {
					return { height, error };
				}
			}));
			return { blocks, rangeError };
		}
	}

	async scanRecent(blockCount = 50) {
		const height = await this.getHeight();
		const safeCount = Math.max(1, Math.min(Number(blockCount) || 50, 500));
		const start = Math.max(0, height - safeCount + 1);
		return this.scanRange(start, height);
	}

	async scanLatestAfter(startHeight = 0, blockCount = 500) {
		const height = await this.getHeight();
		const floor = Math.max(0, Number(startHeight) || 0);
		const safeCount = Math.max(1, Math.min(Number(blockCount) || 500, MAX_LATEST_AFTER_BLOCKS));
		const start = Math.max(floor + 1, height - safeCount + 1);
		if (start > height) {
			return {
				start_height: start,
				end_height: height,
				scanned_blocks: 0,
				scanned_transactions: 0,
				indexed_records: 0,
				errors: []
			};
		}
		return this.scanRange(start, height);
	}

	async scanSince(startHeight = 0, stateKey = '') {
		const height = await this.getHeight();
		const floor = Math.max(0, Number(startHeight) || 0);
		const storedHeight = stateKey ? Number(this.db.getState(stateKey)) : NaN;
		const start = Math.max(floor + 1, Number.isFinite(storedHeight) && storedHeight > floor ? storedHeight + 1 : floor + 1);
		if (start > height) {
			return {
				start_height: start,
				end_height: height,
				scanned_blocks: 0,
				scanned_transactions: 0,
				indexed_records: 0,
				errors: []
			};
		}
		const result = await this.scanRange(start, height);
		if (stateKey && (!result.errors || !result.errors.length)) {
			this.db.setState(stateKey, String(height));
		}
		return result;
	}

	async scanForWordSince(word, startHeight = 0, stateKey = '') {
		const normalizedWord = String(word || '').trim().toLowerCase();
		const height = await this.getHeight();
		const floor = Math.max(0, Number(startHeight) || 0);
		const storedHeight = stateKey ? Number(this.db.getState(stateKey)) : NaN;
		let start = Math.max(floor + 1, Number.isFinite(storedHeight) && storedHeight > floor ? storedHeight + 1 : floor + 1);
		const summary = {
			start_height: start,
			end_height: height,
			scanned_blocks: 0,
			scanned_transactions: 0,
			indexed_records: 0,
			matched_record: null,
			errors: []
		};

		if (!normalizedWord || start > height) {
			return summary;
		}

		const batchSize = RANGE_BATCH_SIZE;
		for (let batchStart = start; batchStart <= height; batchStart += batchSize) {
			const batchEnd = Math.min(height, batchStart + batchSize - 1);
			const batch = await this.fetchBlockBatch(batchStart, batchEnd);
			const blocks = batch.blocks;

			let batchHadError = Boolean(batch.rangeError);
			if (batch.rangeError) {
				summary.errors.push({ start_height: batchStart, end_height: batchEnd, error: 'Range lookup failed; fell back to individual blocks: ' + (batch.rangeError.message || 'Sugarchain range failed.') });
			}
			for (const item of blocks) {
				if (item.error) {
					batchHadError = true;
					summary.errors.push({ height: item.height, error: item.error.message || 'Block lookup failed.' });
					continue;
				}
				const block = item.block || {};
				const txids = Array.isArray(block.tx) ? block.tx.slice(1) : [];
				for (const txid of txids) {
					try {
						const result = await this.indexTxid(txid, block);
						summary.scanned_transactions += 1;
						summary.indexed_records += result.records.length;
						const match = result.records.find(record => record.word === normalizedWord);
						if (match) {
							summary.matched_record = match;
							if (stateKey) {
								this.db.setState(stateKey, String(item.height));
							}
							return summary;
						}
					} catch (error) {
						batchHadError = true;
						summary.errors.push({ height: item.height, txid, error: error.message || 'Transaction lookup failed.' });
					}
				}
				summary.scanned_blocks += 1;
			}

			if (stateKey && !batchHadError) {
				this.db.setState(stateKey, String(batchEnd));
			}
		}

		return summary;
	}

	async scanFull(startHeight = 0, maxBlocks = 500) {
		const height = await this.getHeight();
		const storedHeight = Number(this.db.getState('last_scanned_block_height'));
		const floor = Math.max(0, Number(startHeight) || 0);
		const storedStart = Number.isFinite(storedHeight) && storedHeight > floor ? storedHeight + 1 : floor + 1;
		const start = Math.max(floor + 1, storedStart);
		const end = Math.min(height, start + Math.max(1, Math.min(Number(maxBlocks) || 500, 5000)) - 1);
		return this.scanRange(start, end);
	}

	async scanRange(startHeight, endHeight) {
		const summary = {
			start_height: startHeight,
			end_height: endHeight,
			scanned_blocks: 0,
			scanned_transactions: 0,
			indexed_records: 0,
			errors: []
		};

		const batchSize = RANGE_BATCH_SIZE;
		for (let batchStart = startHeight; batchStart <= endHeight; batchStart += batchSize) {
			const batchEnd = Math.min(endHeight, batchStart + batchSize - 1);
			const batch = await this.fetchBlockBatch(batchStart, batchEnd);
			const blocks = batch.blocks;
			if (batch.rangeError) {
				summary.errors.push({ start_height: batchStart, end_height: batchEnd, error: 'Range lookup failed; fell back to individual blocks: ' + (batch.rangeError.message || 'Sugarchain range failed.') });
			}

			let lastScannedBlock = null;
			for (const item of blocks) {
				const height = item.height;
				if (item.error) {
					summary.errors.push({ height, error: item.error.message });
					continue;
				}
				const block = item.block || {};
				const txids = Array.isArray(block.tx) ? block.tx.slice(1) : [];
				for (const txid of txids) {
					try {
						const result = await this.indexTxid(txid, block);
						summary.scanned_transactions += 1;
						summary.indexed_records += result.records.length;
					} catch (error) {
						summary.errors.push({ height, txid, error: error.message });
					}
				}
				summary.scanned_blocks += 1;
				lastScannedBlock = { height, hash: block.hash || '' };
			}
			if (lastScannedBlock) {
				this.db.setState('last_scanned_block_height', String(lastScannedBlock.height));
				this.db.setState('last_scanned_block_hash', lastScannedBlock.hash);
				this.db.setState('last_scan_time', new Date().toISOString());
			}
		}

		return summary;
	}

	async indexTxid(txid, knownBlock = null) {
		const txInfo = await this.fetchJson('/transaction/' + txid);
		const tx = txInfo && txInfo.txid ? txInfo : (txInfo && txInfo.result ? txInfo.result : txInfo);
		const payloads = extractOpReturnPayloadsFromTxInfo(tx);
		const records = [];
		for (const payloadHex of payloads) {
			const parsed = recordFromPayloadHex(payloadHex);
			if (!parsed) {
				continue;
			}
			const blockHeight = tx.height != null ? tx.height : (knownBlock && knownBlock.height);
			const blockHash = tx.blockhash || (knownBlock && knownBlock.hash) || '';
			const txTime = isoFromUnix(tx.blocktime || tx.time || (knownBlock && knownBlock.time));
			const saved = this.db.upsertWord({
				...parsed,
				txid: tx.txid || txid,
				block_height: blockHeight,
				block_hash: blockHash,
				tx_time: txTime,
				creator_address: extractTxSourceAddress(tx),
				source: 'blockchain',
				verified_status: 'verified_on_chain'
			});
			records.push(saved.record);
		}
		return {
			txid,
			records,
			op_return_payloads: payloads
		};
	}

	async verifyImportedRecord(record) {
		const payload = String(record.op_return_payload || '').trim();
		const parsed = payload ? parseSugarWordPayload(payload) : null;
		if (!parsed) {
			return null;
		}

		const baseRecord = {
			...parsed,
			word: String(record.word || parsed.word || '').trim().toLowerCase(),
			part_of_speech: String(record.part_of_speech || parsed.part_of_speech || '').trim().toLowerCase(),
			meaning: String(record.meaning || parsed.meaning || '').trim(),
			roots_compact: String(record.roots_compact || parsed.roots_compact || '').trim(),
			etymology_meaning: String(record.etymology_meaning || ''),
			txid: String(record.txid || '').trim().toLowerCase(),
			tx_time: String(record.timestamp || ''),
			source: 'imported_json',
			verified_status: 'local_only'
		};

		if (!baseRecord.txid) {
			return this.db.upsertWord(baseRecord).record;
		}

		try {
			const verification = await this.indexTxid(baseRecord.txid);
			const matched = verification.records.find(item => item.op_return_payload === parsed.op_return_payload);
			if (matched) {
				const enriched = this.db.upsertWord({
					...matched,
					word: baseRecord.word || matched.word,
					part_of_speech: baseRecord.part_of_speech || matched.part_of_speech,
					meaning: baseRecord.meaning || matched.meaning,
					roots_compact: baseRecord.roots_compact || matched.roots_compact,
					etymology_meaning: baseRecord.etymology_meaning || matched.etymology_meaning,
					source: 'blockchain+imported_json',
					verified_status: 'verified_on_chain'
				});
				return enriched.record;
			}
			return this.db.upsertWord({ ...baseRecord, verified_status: 'mismatch' }).record;
		} catch (error) {
			return this.db.upsertWord({ ...baseRecord, verified_status: 'local_only' }).record;
		}
	}
}

module.exports = {
	SugarWordsIndexer
};
