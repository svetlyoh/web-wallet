const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');
const { createWordExplorerApi } = require('./lib/sugarwords/api');

const rootDir = __dirname;

function loadLocalEnv(filename) {
	const envPath = path.join(rootDir, filename);
	if (!fs.existsSync(envPath)) {
		return;
	}
	const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}
		const separator = trimmed.indexOf('=');
		if (separator <= 0) {
			continue;
		}
		const key = trimmed.slice(0, separator).trim();
		let value = trimmed.slice(separator + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (key && process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

loadLocalEnv('.env');
loadLocalEnv('.env.local');

const port = Number(process.env.PORT || 8080);
const miniMaxModel = process.env.MINIMAX_MODEL || 'MiniMax-M3';
const hardcodedMiniMaxApiKey = 'sk-api-JhtksjUxma4LONWTCcqOknX8Mr_GVf9HIbaGFSRvIbY8KDbBaQ9DMgEBV85aRv9ixN78oeIu9BKwXMqFr4jQwlQz2GDguFjZq4yOCO2gLP104bjgX6GZAgI';
const wordExplorerApi = createWordExplorerApi();
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
const sugarApiBase = process.env.SUGAR_API_URL || 'https://api.sugar.wtf';
const sugarDecimals = 8;
const faucetAmountSatoshis = 2500000;
const faucetMinimumBalanceSatoshis = 1000000;
const faucetFeeSatoshis = 1000;
const faucetExpectedAddress = process.env.LINGRY_FUNDING_ADDRESS || process.env.LINGRY_FAUCET_ADDRESS || 'sugar1q39n666w687nxm9x98tx5kgw2uvk780gtmd6yyu';
const sugarGrantsEnabled = String(process.env.LINGRY_SUGAR_GRANTS_ENABLED || 'true').toLowerCase() !== 'false';
const faucetAttempts = new Map();
let bundledBitcoin = null;

const mimeTypes = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
	res.writeHead(statusCode, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store'
	});
	res.end(JSON.stringify(payload));
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', chunk => {
			body += chunk;
			if (body.length > 1024 * 64) {
				req.destroy();
				reject(new Error('Request body is too large.'));
			}
		});
		req.on('end', () => resolve(body));
		req.on('error', reject);
	});
}

function loadBundledBitcoin() {
	if (bundledBitcoin) {
		return bundledBitcoin;
	}
	const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
	const scripts = Array.from(html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)).map(match => match[1]);
	const bitcoinScript = scripts.find(script => script.includes('BitcoinJS') && script.includes('TransactionBuilder'));
	if (!bitcoinScript) {
		throw new Error('Bundled BitcoinJS script was not found.');
	}
	const cryptoShim = {
		getRandomValues(target) {
			nodeCrypto.randomFillSync(target);
			return target;
		}
	};
	const context = {
		module: { exports: {} },
		exports: {},
		crypto: cryptoShim,
		msCrypto: cryptoShim,
		window: { crypto: cryptoShim, msCrypto: cryptoShim },
		self: { crypto: cryptoShim, msCrypto: cryptoShim },
		global: { crypto: cryptoShim, msCrypto: cryptoShim }
	};
	vm.runInNewContext(bitcoinScript, context, { timeout: 5000 });
	bundledBitcoin = context.module.exports || context.window.bitcoin || context.global.bitcoin;
	if (!bundledBitcoin) {
		throw new Error('Bundled BitcoinJS failed to load.');
	}
	return bundledBitcoin;
}

function sugarAmount(satoshis) {
	return Number(satoshis || 0) / Math.pow(10, sugarDecimals);
}

function normalizeAddress(value) {
	return String(value || '').trim();
}

function getP2WPKHScript(bitcoin, pubkey) {
	return bitcoin.payments.p2wpkh({
		pubkey,
		network: sugarNetwork
	});
}

function getP2SHScript(bitcoin, redeem) {
	return bitcoin.payments.p2sh({
		redeem,
		network: sugarNetwork
	});
}

function getAddressFromKeys(bitcoin, keys) {
	return getP2WPKHScript(bitcoin, keys.publicKey).address;
}

function validateSugarAddress(bitcoin, address) {
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

function getScriptType(bitcoin, script) {
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

async function sugarApiGet(pathname) {
	const response = await fetch(sugarApiBase + pathname);
	const data = await response.json().catch(() => null);
	if (!response.ok || !data) {
		throw new Error('Sugarchain API request failed.');
	}
	return data;
}

async function sugarApiPost(pathname, body) {
	const response = await fetch(sugarApiBase + pathname, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams(body)
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || !data) {
		throw new Error('Sugarchain API request failed.');
	}
	return data;
}

async function getAddressBalanceSatoshis(address) {
	const data = await sugarApiGet('/balance/' + encodeURIComponent(address));
	return Number(data && data.result && data.result.balance || 0);
}

async function getAddressUtxos(address, amountSatoshis) {
	const data = await sugarApiGet('/unspent/' + encodeURIComponent(address) + '?amount=' + encodeURIComponent(amountSatoshis));
	if (data.error) {
		throw new Error(data.error.message || 'Unable to load faucet UTXOs.');
	}
	return Array.isArray(data.result) ? data.result : [];
}

function chooseFaucetUtxos(utxos, requiredSatoshis) {
	const chosen = [];
	let total = 0;
	for (const utxo of utxos) {
		chosen.push(utxo);
		total += Number(utxo.value || 0);
		if (total > requiredSatoshis) {
			break;
		}
	}
	return { chosen, total };
}

function buildFaucetTransaction(bitcoin, keys, recipientAddress, utxos, amountSatoshis, feeSatoshis) {
	const faucetAddress = getAddressFromKeys(bitcoin, keys);
	const txb = new bitcoin.TransactionBuilder(sugarNetwork);
	const scripts = [];
	let totalValue = 0;

	txb.setVersion(2);
	for (const utxo of utxos) {
		const txid = utxo.txid;
		const index = utxo.index !== undefined ? utxo.index : utxo.vout;
		const scriptHex = String(utxo.script || utxo.scriptPubKey || (utxo.scriptPubKey && utxo.scriptPubKey.hex) || '');
		const script = bitcoin.Buffer.from(scriptHex, 'hex');
		const type = getScriptType(bitcoin, script);
		totalValue += Number(utxo.value || 0);
		if (type === 'bech32') {
			const p2wpkh = getP2WPKHScript(bitcoin, keys.publicKey);
			txb.addInput(txid, index, null, p2wpkh.output);
		} else {
			txb.addInput(txid, index);
		}
		scripts.push({
			script,
			type,
			value: Number(utxo.value || 0)
		});
	}

	if (totalValue <= amountSatoshis + feeSatoshis) {
		throw new Error('Faucet wallet has insufficient spendable balance.');
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
				const redeem = getP2WPKHScript(bitcoin, keys.publicKey);
				const p2sh = getP2SHScript(bitcoin, redeem);
				txb.sign(index, keys, p2sh.redeem.output, null, scripts[index].value, null);
				break;
			}
			case 'legacy':
				txb.sign(index, keys);
				break;
			default:
				throw new Error('Unsupported faucet UTXO script type.');
		}
	}

	return txb.build().toHex();
}

async function handleFaucetFund(req, res) {
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed.' });
		return;
	}

	try {
		const body = JSON.parse(await readBody(req) || '{}');
		const address = normalizeAddress(body.address);
		const bitcoin = loadBundledBitcoin();
		if (!validateSugarAddress(bitcoin, address)) {
			throw new Error('Invalid Sugarchain address.');
		}

		const balance = await getAddressBalanceSatoshis(address);
		if (balance >= faucetMinimumBalanceSatoshis) {
			sendJson(res, 200, {
				funded: false,
				reason: 'balance_ok',
				balance,
				minimum_balance: faucetMinimumBalanceSatoshis
			});
			return;
		}

		if (!sugarGrantsEnabled) {
			sendJson(res, 503, {
				funded: false,
				error: 'Starter funding is disabled on this server.'
			});
			return;
		}

		const faucetWif = String(process.env.LINGRY_FUNDING_WIF || process.env.LINGRY_FAUCET_WIF || '').trim();
		if (!faucetWif) {
			sendJson(res, 503, {
				funded: false,
				error: 'Starter funding is not configured on this server.'
			});
			return;
		}

		const previousAttempt = faucetAttempts.get(address);
		if (previousAttempt && Date.now() - previousAttempt < 10 * 60 * 1000) {
			sendJson(res, 200, {
				funded: false,
				reason: 'recent_attempt'
			});
			return;
		}

		const keys = bitcoin.ECPair.fromWIF(faucetWif, sugarNetwork);
		const faucetAddress = getAddressFromKeys(bitcoin, keys);
		if (faucetExpectedAddress && faucetAddress !== faucetExpectedAddress) {
			throw new Error('Starter funding key does not match the configured starter address.');
		}
		const required = faucetAmountSatoshis + faucetFeeSatoshis;
		const utxos = await getAddressUtxos(faucetAddress, required);
		const selection = chooseFaucetUtxos(utxos, required);
		const raw = buildFaucetTransaction(bitcoin, keys, address, selection.chosen, faucetAmountSatoshis, faucetFeeSatoshis);
		const broadcast = await sugarApiPost('/broadcast', { raw });
		if (broadcast.error) {
			throw new Error(broadcast.error.message || 'Starter funding broadcast failed.');
		}

		faucetAttempts.set(address, Date.now());
		sendJson(res, 200, {
			funded: true,
			txid: broadcast.result,
			amount: sugarAmount(faucetAmountSatoshis)
		});
	} catch (error) {
		sendJson(res, 400, { funded: false, error: error.message || 'Starter funding failed.' });
	}
}

function normalizeWord(word) {
	return String(word || '').trim().toLowerCase();
}

function sanitizeText(value, maxLength) {
	return String(value || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizePartOfSpeech(value) {
	const posText = String(value || '').toLowerCase();
	const match = posText.match(/\b(interj|conj|prep|pron|adj|adv|n|v)\.?\b/);
	return match ? match[1] : 'n';
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

function parseJsonFromModelText(text) {
	const withoutThinking = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
	try {
		return JSON.parse(withoutThinking);
	} catch (error) {
		const start = withoutThinking.indexOf('{');
		const end = withoutThinking.lastIndexOf('}');
		if (start >= 0 && end > start) {
			return JSON.parse(withoutThinking.slice(start, end + 1));
		}
		throw error;
	}
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

function chooseSugarWordLanguagePlan() {
	const families = [
		{
			name: 'German',
			codes: 'de',
			style: 'German compounds, crisp consonants, and roots such as licht, traum, feld, glanz, wald'
		},
		{
			name: 'Latin',
			codes: 'la',
			style: 'Latin roots such as lumen, vita, ventus, nova, cura, silva'
		},
		{
			name: 'French',
			codes: 'fr',
			style: 'French sound patterns and roots such as doux, reve, lumiere, coeur, brise'
		},
		{
			name: 'English or Old English',
			codes: 'en or oe',
			style: 'English and Old English roots such as word, craft, gleam, mind, wyrd, hearth'
		},
		{
			name: 'Nordic or Old Norse',
			codes: 'no or on',
			style: 'Nordic and Old Norse-style roots such as fjord, skald, rune, sol, vind, heim'
		}
	];
	const shuffled = families.slice().sort(() => Math.random() - 0.5);
	const count = 2 + Math.floor(Math.random() * 2);
	const selected = shuffled.slice(0, count);
	const primary = selected[0];
	const support = selected.slice(1);
	return {
		primary,
		selected,
		description: selected.map(item => item.name + ' (' + item.codes + ': ' + item.style + ')').join('; '),
		names: selected.map(item => item.name).join(', '),
		supportNames: support.map(item => item.name).join(', ')
	};
}

function chooseOne(items) {
	return items[Math.floor(Math.random() * items.length)];
}

function chooseSugarWordDesignBrief() {
	const semanticDomains = [
		'the feeling of finding a useful pattern in clutter',
		'a social grace for ending a tense conversation kindly',
		'the first practical idea after a long foggy problem',
		'a small object kept because it anchors a memory',
		'the relief of hearing familiar sounds after being away',
		'a sudden appetite for difficult but meaningful work',
		'the calm focus that arrives when tools are arranged well',
		'a private joke that makes a hard day lighter',
		'the courage to ask a simple question in a complicated room',
		'a bright mistake that leads to a better design',
		'the tiny ritual that turns a place into home',
		'the mental click when a name finally fits a thing'
	];
	const tones = [
		'practical and clever',
		'warm but unsentimental',
		'crisp and tool-like',
		'mythic but usable in everyday speech',
		'playful without sounding childish',
		'elegant and slightly old-world',
		'modern, memorable, and concrete',
		'earthy, tactile, and emotionally precise'
	];
	const wordShapes = [
		'a compact compound',
		'a two-root blend',
		'a soft consonant-vowel coinage',
		'a sturdy Germanic-style compound',
		'a lyrical French-Nordic blend',
		'a clipped English-Latin hybrid',
		'a word with one strong stressed syllable and one softer syllable',
		'a natural English noun that could also become a verb'
	];
	const avoid = [
		'do not define the word as a quiet lingering sense of hope during twilight',
		'avoid generic twilight, dusk, hope, nostalgia, melancholy, serenity, and gentle glow concepts unless the semantic target explicitly asks for them',
		'avoid vague meanings such as a feeling, sense, aura, vibe, or mood unless tied to a concrete use',
		'avoid repeating the same emotional weather imagery across generations'
	];
	return {
		domain: chooseOne(semanticDomains),
		tone: chooseOne(tones),
		shape: chooseOne(wordShapes),
		avoid: avoid.join('; ')
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
		"[succinct origin/construction explanation, 40 ASCII characters or fewer]"
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
		"[succinct origin/construction explanation, 40 ASCII characters or fewer]",
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

async function requestMiniMaxWord(usedWords, usedMeanings, conceptPrompt, generationMode, requestApiKey) {
	const apiKey = requestApiKey || process.env.MINIMAX_API_KEY || hardcodedMiniMaxApiKey;
	if (!apiKey) {
		throw new Error('Paste a MiniMax API key or configure MINIMAX_API_KEY on the server.');
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
				model: miniMaxModel,
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

async function handleGenerateWord(req, res, forcedGenerationMode) {
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed.' });
		return;
	}

	try {
		const body = JSON.parse(await readBody(req) || '{}');
		const usedWords = new Set(Array.isArray(body.used_words) ? body.used_words.map(normalizeWord).filter(Boolean) : []);
		const usedMeanings = Array.isArray(body.used_meanings) ? body.used_meanings.map(normalizeMeaningForComparison).filter(Boolean).slice(-12) : [];
		const generationMode = forcedGenerationMode || (body.generation_mode === 'prompt' ? 'prompt' : 'random');
		const conceptPrompt = generationMode === 'prompt' ? sanitizeText(body.concept_prompt, 500) : '';
		const requestApiKey = sanitizeText(body.api_key, 300);
		const aiProvider = sanitizeText(body.ai_provider || 'minimax', 32).toLowerCase();
		if (aiProvider && aiProvider !== 'minimax') {
			throw new Error('This local server currently supports MiniMax generation. Choose MiniMax in Settings.');
		}
		if (generationMode === 'prompt' && !conceptPrompt) {
			throw new Error('Prompt for New Word is empty.');
		}
		let lastError = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const candidate = await requestMiniMaxWord(usedWords, usedMeanings, conceptPrompt, generationMode, requestApiKey);
				const validated = validateGeneratedWord(candidate, usedWords);
				if (isRepetitiveMeaning(validated.meaning)) {
					throw new Error('Generated repetitive meaning; retrying.');
				}
				sendJson(res, 200, validated);
				return;
			} catch (error) {
				lastError = error;
				if (!/duplicated|repetitive/i.test(error.message)) {
					throw error;
				}
			}
		}
		throw lastError || new Error('Unable to generate a unique word.');
	} catch (error) {
		sendJson(res, 400, { error: error.message || 'Unable to generate word.' });
	}
}

function serveStatic(req, res) {
	const requestUrl = new URL(req.url, 'http://localhost');
	let pathname = decodeURIComponent(requestUrl.pathname);
	if (pathname === '/') {
		pathname = '/index.html';
	}
	const filePath = path.resolve(rootDir, '.' + pathname);
	const relativePath = path.relative(rootDir, filePath);
	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		res.writeHead(403);
		res.end('Forbidden');
		return;
	}

	fs.readFile(filePath, (error, data) => {
		if (error) {
			res.writeHead(404);
			res.end('Not found');
			return;
		}
		res.writeHead(200, {
			'content-type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
		});
		res.end(data);
	});
}

const server = http.createServer(async (req, res) => {
	if (req.url && req.url.startsWith('/api/invent-word-from-prompt')) {
		handleGenerateWord(req, res, 'prompt');
		return;
	}
	if (req.url && req.url.startsWith('/api/generate-word')) {
		handleGenerateWord(req, res, 'random');
		return;
	}
	if (req.url && req.url.startsWith('/api/faucet/fund')) {
		handleFaucetFund(req, res);
		return;
	}
	if (req.url && (req.url.startsWith('/api/words') || req.url.startsWith('/api/tx/'))) {
		try {
			const handled = await wordExplorerApi.handle(req, res, sendJson);
			if (handled) {
				return;
			}
		} catch (error) {
			sendJson(res, 400, { error: error.message || 'Word Explorer request failed.' });
			return;
		}
	}
	serveStatic(req, res);
});

server.listen(port, () => {
	console.log('Sugarchain web wallet listening on http://localhost:' + port + '/#/');
});
