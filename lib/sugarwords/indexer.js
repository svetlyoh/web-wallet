const {
	extractOpReturnPayloadsFromTxInfo,
	parseSugarWordPayload,
	recordFromPayloadHex
} = require('./parser');

const DEFAULT_API = process.env.SUGARWORDS_API_URL || 'https://api.sugar.wtf';
const MAX_LATEST_AFTER_BLOCKS = 125000;

function isoFromUnix(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? new Date(number * 1000).toISOString() : '';
}

class SugarWordsIndexer {
	constructor(db, options = {}) {
		this.db = db;
		this.apiBase = String(options.apiBase || DEFAULT_API).replace(/\/+$/, '');
	}

	async fetchJson(path, timeoutMs = 5000) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(this.apiBase + path, { signal: controller.signal });
			const json = await response.json().catch(() => null);
			if (!response.ok || !json || json.error) {
				const message = json && json.error && json.error.message ? json.error.message : 'Sugarchain API request failed.';
				throw new Error(message);
			}
			return json.result;
		} catch (error) {
			if (error && error.name === 'AbortError') {
				throw new Error('Sugarchain API request timed out.');
			}
			throw error;
		} finally {
			clearTimeout(timer);
		}
	}

	async getHeight() {
		const info = await this.fetchJson('/info');
		return Number(info.blocks || info.headers || 0);
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

		const batchSize = 128;
		for (let batchStart = start; batchStart <= height; batchStart += batchSize) {
			const batchEnd = Math.min(height, batchStart + batchSize - 1);
			const heights = [];
			for (let current = batchStart; current <= batchEnd; current++) {
				heights.push(current);
			}
			const blocks = await Promise.all(heights.map(async currentHeight => {
				try {
					const block = await this.fetchJson('/height/' + currentHeight);
					return { height: currentHeight, block };
				} catch (error) {
					return { height: currentHeight, error };
				}
			}));

			let batchHadError = false;
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

		const batchSize = 128;
		for (let batchStart = startHeight; batchStart <= endHeight; batchStart += batchSize) {
			const batchEnd = Math.min(endHeight, batchStart + batchSize - 1);
			const heights = [];
			for (let current = batchStart; current <= batchEnd; current++) {
				heights.push(current);
			}
			const blocks = await Promise.all(heights.map(async height => {
				try {
					const block = await this.fetchJson('/height/' + height);
					return { height, block };
				} catch (error) {
					return { height, error };
				}
			}));

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
