const { SugarWordsDb } = require('./db');
const { SugarWordsIndexer } = require('./indexer');
const {
	decodeOpReturnPayloadFromScript,
	normalizeHex,
	recordFromPayloadHex
} = require('./parser');

function readBody(req, maxBytes = 1024 * 1024) {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', chunk => {
			body += chunk;
			if (body.length > maxBytes) {
				req.destroy();
				reject(new Error('Request body is too large.'));
			}
		});
		req.on('end', () => resolve(body));
		req.on('error', reject);
	});
}

function parseLimit(searchParams, fallback = 25) {
	return Math.max(1, Math.min(Number(searchParams.get('limit')) || fallback, 100));
}

function parseOffset(searchParams) {
	return Math.max(0, Number(searchParams.get('offset')) || 0);
}

function parseBlocks(searchParams, fallback = 500) {
	return Math.max(1, Math.min(Number(searchParams.get('blocks')) || fallback, 5000));
}

function parseStartHeight(searchParams) {
	const value = Number(searchParams.get('start_height'));
	return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function isTruthy(value) {
	return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function createDirectSummary(blocks, startHeight) {
	return {
		enabled: true,
		requested_blocks: blocks,
		start_height: startHeight,
		scan_mode: startHeight == null ? 'recent' : 'since_height',
		checked_txids: 0,
		verified_txids: 0,
		scanned_blocks: 0,
		scanned_transactions: 0,
		indexed_records: 0,
		errors: []
	};
}

function mergeScanSummary(summary, scan) {
	summary.scanned_blocks += Number(scan.scanned_blocks || 0);
	summary.scanned_transactions += Number(scan.scanned_transactions || 0);
	summary.indexed_records += Number(scan.indexed_records || 0);
	if (Array.isArray(scan.errors) && scan.errors.length) {
		summary.errors.push(...scan.errors.slice(0, 10));
	}
}

async function verifyCandidateTxids(indexer, records, summary, seenTxids) {
	const txids = [];
	for (const record of records || []) {
		const txid = String(record && record.txid ? record.txid : '').trim().toLowerCase();
		if (txid && !seenTxids.has(txid)) {
			seenTxids.add(txid);
			txids.push(txid);
		}
	}
	for (const txid of txids.slice(0, 8)) {
		try {
			const result = await indexer.indexTxid(txid);
			summary.checked_txids += 1;
			if (result.records && result.records.length) {
				summary.verified_txids += 1;
				summary.indexed_records += result.records.length;
			}
		} catch (error) {
			summary.checked_txids += 1;
			summary.errors.push({ txid, error: error.message || 'Unable to verify txid.' });
		}
	}
}

async function searchBlockchainDirectly(db, indexer, q, mode, filters, blocks, startHeight, scanMode = '') {
	const summary = createDirectSummary(blocks, startHeight);
	if (scanMode === 'latest_after') {
		summary.scan_mode = 'latest_after';
	}
	const seenTxids = new Set();
	const rawQuery = String(q || '').trim();
	const queryHex = normalizeHex(rawQuery);
	const exactTxid = /^[0-9a-f]{64}$/.test(queryHex) ? queryHex : '';

	let candidateRecords = db.search(q, mode, 50, 0, filters);
	if (mode === 'op_return_hex') {
		const payloadHex = decodeOpReturnPayloadFromScript(queryHex) || queryHex;
		candidateRecords = candidateRecords.concat(db.findByOpReturnHex(payloadHex));
	}

	await verifyCandidateTxids(indexer, candidateRecords, summary, seenTxids);

	if ((mode === 'txid' || mode === 'all') && exactTxid && !seenTxids.has(exactTxid)) {
		seenTxids.add(exactTxid);
		try {
			const result = await indexer.indexTxid(exactTxid);
			summary.checked_txids += 1;
			if (result.records && result.records.length) {
				summary.verified_txids += 1;
				summary.indexed_records += result.records.length;
			}
		} catch (error) {
			summary.checked_txids += 1;
			summary.errors.push({ txid: exactTxid, error: error.message || 'Unable to verify txid.' });
		}
	}

	if (!summary.verified_txids && !exactTxid) {
		try {
			const canUseTargetedWordScan = startHeight != null && mode === 'word' && /^[a-z-]{2,32}$/i.test(rawQuery);
			const scan = scanMode === 'latest_after' && startHeight != null
				? await indexer.scanLatestAfter(startHeight, blocks)
				: startHeight == null
				? await indexer.scanRecent(blocks)
				: (canUseTargetedWordScan
					? await indexer.scanForWordSince(rawQuery, startHeight, 'word_precheck_scanned_after_' + startHeight)
					: await indexer.scanSince(startHeight, 'word_precheck_scanned_after_' + startHeight));
			mergeScanSummary(summary, scan);
			if (scan.matched_record) {
				summary.matched_word = scan.matched_record.word;
			}
		} catch (error) {
			summary.errors.push({ error: error.message || 'Direct blockchain scan failed.' });
		}
	}

	summary.errors = summary.errors.slice(0, 10);
	return summary;
}

function createWordExplorerApi(options = {}) {
	const db = new SugarWordsDb(options.dbPath);
	const indexer = new SugarWordsIndexer(db, options);

	async function handle(req, res, sendJson) {
		const url = new URL(req.url, 'http://localhost');
		const pathname = url.pathname;

		if (req.method === 'GET' && pathname === '/api/words/latest') {
			const records = db.latest(parseLimit(url.searchParams), parseOffset(url.searchParams), {
				filter: url.searchParams.get('filter')
			});
			sendJson(res, 200, { records, state: db.data.state });
			return true;
		}

		if (req.method === 'GET' && pathname === '/api/words/search') {
			const mode = url.searchParams.get('mode') || 'all';
			const q = url.searchParams.get('q') || '';
			const filters = {
				filter: url.searchParams.get('filter')
			};
			const direct = isTruthy(url.searchParams.get('direct'));
			const blocks = parseBlocks(url.searchParams);
			const startHeight = parseStartHeight(url.searchParams);
			const scanMode = url.searchParams.get('scan_mode') || '';
			let direct_summary = null;
			if (direct) {
				direct_summary = await searchBlockchainDirectly(db, indexer, q, mode, filters, blocks, startHeight, scanMode);
			}
			let records = db.search(q, mode, parseLimit(url.searchParams, 50), parseOffset(url.searchParams), filters);
			let decoded_record = null;
			if (mode === 'op_return_hex' && records.length === 0) {
				const queryHex = normalizeHex(q);
				const payloadHex = decodeOpReturnPayloadFromScript(queryHex) || queryHex;
				records = db.findByOpReturnHex(payloadHex);
				decoded_record = recordFromPayloadHex(payloadHex);
				if (decoded_record) {
					decoded_record.source = 'pasted_hex';
					decoded_record.verified_status = 'unverified_hex_only';
					if (!records.length) {
						records = [decoded_record];
					}
				}
			}
			sendJson(res, 200, { records, decoded_record, direct_summary });
			return true;
		}

		if (req.method === 'GET' && pathname.startsWith('/api/words/')) {
			const word = decodeURIComponent(pathname.slice('/api/words/'.length));
			const claims = db.findByWord(word);
			const first = claims[0] || null;
			sendJson(res, first ? 200 : 404, {
				word,
				first_seen: first,
				claims,
				related: db.related(first)
			});
			return true;
		}

		if (req.method === 'GET' && pathname.startsWith('/api/tx/') && pathname.endsWith('/word')) {
			const txid = decodeURIComponent(pathname.slice('/api/tx/'.length, -'/word'.length));
			let existing = db.findByTxid(txid);
			if (!existing.length) {
				const result = await indexer.indexTxid(txid);
				existing = result.records;
				if (!existing.length) {
					sendJson(res, 404, {
						txid,
						records: [],
						message: 'No SugarWords record found in this transaction.'
					});
					return true;
				}
			}
			sendJson(res, 200, { txid, records: existing });
			return true;
		}

		if (req.method === 'POST' && pathname === '/api/words/import-json') {
			const bodyText = await readBody(req, 1024 * 1024 * 10);
			const payload = JSON.parse(bodyText || '{}');
			const records = Array.isArray(payload.records) ? payload.records : (Array.isArray(payload) ? payload : []);
			if (!records.length) {
				throw new Error('No SugarWords records found in the selected JSON file.');
			}
			const imported = [];
			const errors = [];
			for (const record of records) {
				try {
					const result = await indexer.verifyImportedRecord(record);
					if (!result || !result.word) {
						errors.push({
							word: record && record.word ? String(record.word) : '',
							error: 'Invalid SugarWords record.'
						});
						continue;
					}
					imported.push(result);
				} catch (error) {
					errors.push({
						word: record && record.word ? String(record.word) : '',
						error: error.message || 'Import failed for this record.'
					});
				}
			}
			sendJson(res, 200, {
				imported_count: imported.length,
				skipped_count: errors.length,
				errors: errors.slice(0, 20),
				records: imported
			});
			return true;
		}

		if (req.method === 'POST' && pathname === '/api/words/scan') {
			const bodyText = await readBody(req, 1024 * 16);
			const payload = bodyText ? JSON.parse(bodyText) : {};
			const mode = payload.mode || 'recent';
			let result;
			if (mode === 'full') {
				result = await indexer.scanFull(payload.start_height || 0, payload.max_blocks || 500);
			} else if (mode === 'latest_after') {
				result = await indexer.scanLatestAfter(payload.start_height || 0, payload.blocks || 500);
			} else if (mode === 'txid') {
				result = await indexer.indexTxid(payload.txid);
			} else {
				result = await indexer.scanRecent(payload.blocks || 50);
			}
			sendJson(res, 200, result);
			return true;
		}

		return false;
	}

	return { handle, db, indexer };
}

module.exports = {
	createWordExplorerApi
};
