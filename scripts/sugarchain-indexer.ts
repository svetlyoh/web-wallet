import fs from 'node:fs';
import path from 'node:path';

const LANGUAGE_CODES = new Set('WESGFIRPCAHBJKTVUNMYLDOQXZ'.split(''));
const RPC_URL = process.env.SUGARCHAIN_RPC_URL || '';
const RPC_USERNAME = process.env.SUGARCHAIN_RPC_USERNAME || '';
const RPC_PASSWORD = process.env.SUGARCHAIN_RPC_PASSWORD || '';
const API_BASE = (process.env.LINGRY_API_BASE_URL || 'http://localhost:8787').replace(/\/+$/, '');
const INDEXER_SECRET = process.env.INTERNAL_INDEXER_SECRET || '';
const STATE_PATH = process.env.LINGRY_INDEXER_STATE_PATH || path.join(process.cwd(), 'data', 'sugarchain-indexer-state.json');
const CONFIRMATIONS = Math.max(1, Number(process.env.LINGRY_INDEXER_CONFIRMATIONS || 6));
const START_HEIGHT = Math.max(0, Number(process.env.LINGRY_INDEXER_START_HEIGHT || 42900000));

type IndexerState = {
	last_height: number;
	block_hashes: Record<string, string>;
};

type LingryRecord = {
	txid: string;
	block_height: number;
	block_hash: string;
	timestamp: string;
	language_code: string;
	word: string;
	part_of_speech: string;
	meaning: string;
	creator_address: string;
	op_return_payload: string;
	raw_payload: string;
};

function readState(): IndexerState {
	try {
		return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
	} catch {
		return { last_height: START_HEIGHT, block_hashes: {} };
	}
}

function writeState(state: IndexerState) {
	fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
	fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function rpc(method: string, params: unknown[] = []) {
	if (!RPC_URL) {
		throw new Error('SUGARCHAIN_RPC_URL is required.');
	}
	const auth = RPC_USERNAME ? 'Basic ' + Buffer.from(RPC_USERNAME + ':' + RPC_PASSWORD).toString('base64') : '';
	const response = await fetch(RPC_URL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(auth ? { authorization: auth } : {})
		},
		body: JSON.stringify({ jsonrpc: '1.0', id: 'lingry-indexer', method, params })
	});
	const json = await response.json() as { result?: unknown; error?: { message?: string } };
	if (!response.ok || json.error) {
		throw new Error(json.error?.message || 'Sugarchain RPC failed.');
	}
	return json.result;
}

function normalizeHex(value: unknown) {
	return String(value || '').trim().replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase();
}

function hexToUtf8(hex: string) {
	const clean = normalizeHex(hex);
	if (!clean || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) {
		return '';
	}
	return Buffer.from(clean, 'hex').toString('utf8').replace(/\u0000/g, '');
}

function decodeOpReturn(scriptHex: string) {
	const clean = normalizeHex(scriptHex);
	if (!clean.startsWith('6a')) {
		return '';
	}
	let offset = 2;
	const opcode = parseInt(clean.slice(offset, offset + 2), 16);
	let length = 0;
	if (opcode === 0x4c) {
		length = parseInt(clean.slice(offset + 2, offset + 4), 16);
		offset += 4;
	} else if (opcode === 0x4d) {
		length = parseInt(clean.slice(offset + 2, offset + 4), 16) + (parseInt(clean.slice(offset + 4, offset + 6), 16) * 256);
		offset += 6;
	} else if (opcode <= 75) {
		length = opcode;
		offset += 2;
	} else {
		return '';
	}
	const payload = clean.slice(offset, offset + (length * 2));
	return payload.length === length * 2 ? hexToUtf8(payload) : '';
}

function parsePayload(payload: string) {
	const parts = String(payload || '').trim().split('|');
	if (parts.length !== 4 || !/^S[A-Z]$/.test(parts[0])) {
		return null;
	}
	const languageCode = parts[0].slice(1);
	if (!LANGUAGE_CODES.has(languageCode)) {
		return null;
	}
	const word = parts[1].trim().toLowerCase();
	const partOfSpeech = parts[2].trim().toLowerCase().replace(/\.$/, '');
	const meaning = parts[3].trim();
	if (!word || !partOfSpeech || !meaning) {
		return null;
	}
	return { language_code: languageCode, word, part_of_speech: partOfSpeech, meaning };
}

function firstInputAddress(tx: any) {
	const inputs = Array.isArray(tx.vin) ? tx.vin : [];
	for (const input of inputs) {
		const addresses = input.prevout?.scriptPubKey?.addresses || input.scriptPubKey?.addresses || input.addresses || [];
		if (Array.isArray(addresses) && addresses[0]) {
			return String(addresses[0]);
		}
		if (typeof input.address === 'string') {
			return input.address;
		}
	}
	return '';
}

async function ingest(records: LingryRecord[]) {
	if (!records.length) {
		return;
	}
	if (!INDEXER_SECRET) {
		throw new Error('INTERNAL_INDEXER_SECRET is required.');
	}
	const response = await fetch(API_BASE + '/v1/internal/indexer/ingest', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'idempotency-key': 'indexer-' + records[0].block_height,
			'x-lingry-indexer-secret': INDEXER_SECRET
		},
		body: JSON.stringify({ records })
	});
	if (!response.ok) {
		throw new Error('Lingry ingest failed: HTTP ' + response.status + ' ' + await response.text());
	}
}

async function scanOnce() {
	const state = readState();
	const chainHeight = Number(await rpc('getblockcount'));
	const safeTip = Math.max(0, chainHeight - CONFIRMATIONS);
	let start = Math.max(START_HEIGHT, Number(state.last_height || START_HEIGHT) - CONFIRMATIONS + 1);
	if (start > safeTip) {
		console.log('No confirmed blocks to index.');
		return;
	}
	for (let height = start; height <= safeTip; height++) {
		const hash = String(await rpc('getblockhash', [height]));
		const block = await rpc('getblock', [hash, 2]) as any;
		const previousHash = state.block_hashes[String(height)];
		if (previousHash && previousHash !== hash) {
			console.warn('Reorg detected at height', height, 'rewinding confirmation window.');
			state.last_height = Math.max(START_HEIGHT, height - CONFIRMATIONS);
			writeState(state);
			return;
		}
		const records: LingryRecord[] = [];
		for (const tx of block.tx || []) {
			for (const out of tx.vout || []) {
				const scriptHex = out.scriptPubKey?.hex || '';
				const payload = decodeOpReturn(scriptHex);
				const parsed = parsePayload(payload);
				if (!parsed) {
					continue;
				}
				records.push({
					txid: tx.txid,
					block_height: height,
					block_hash: hash,
					timestamp: new Date(Number(block.time || 0) * 1000).toISOString(),
					creator_address: firstInputAddress(tx),
					op_return_payload: payload,
					raw_payload: payload,
					...parsed
				});
			}
		}
		await ingest(records);
		state.last_height = height;
		state.block_hashes[String(height)] = hash;
		for (const oldHeight of Object.keys(state.block_hashes)) {
			if (Number(oldHeight) < height - CONFIRMATIONS * 4) {
				delete state.block_hashes[oldHeight];
			}
		}
		writeState(state);
		console.log('Indexed height', height, 'records', records.length);
	}
}

scanOnce().catch(error => {
	console.error(error && error.message ? error.message : error);
	process.exitCode = 1;
});
