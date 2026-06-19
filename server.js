const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const port = Number(process.env.PORT || 8080);
const miniMaxModel = process.env.MINIMAX_MODEL || 'MiniMax-M3';

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

function normalizeWord(word) {
	return String(word || '').trim().toLowerCase();
}

function sanitizeText(value, maxLength) {
	return String(value || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function validateGeneratedWord(candidate, usedWords) {
	const word = normalizeWord(candidate.word);
	const meaning = sanitizeText(candidate.meaning, 80);
	const etymology = sanitizeText(candidate.etymology_meaning, 120);
	const roots = sanitizeText(candidate.roots_compact, 60);
	const confidence = Number(candidate.confidence_not_existing);

	if (!/^[a-z]{2,32}(-[a-z]{2,32})?$/.test(word) || word.length > 32) {
		throw new Error('Generated word failed validation.');
	}
	if (usedWords.has(word)) {
		throw new Error('Generated word duplicated a session word.');
	}
	if (meaning.length < 1 || meaning.length > 80) {
		throw new Error('Generated meaning failed validation.');
	}
	if (etymology.length < 1 || etymology.length > 120) {
		throw new Error('Generated etymology failed validation.');
	}
	if (roots.length < 1 || roots.length > 60) {
		throw new Error('Generated compact roots failed validation.');
	}
	if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
		throw new Error('Generated confidence failed validation.');
	}

	return {
		word,
		meaning,
		etymology_meaning: etymology,
		roots_compact: roots,
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

async function requestMiniMaxWord(usedWords) {
	const apiKey = process.env.MINIMAX_API_KEY;
	if (!apiKey) {
		throw new Error('MINIMAX_API_KEY is not configured on the server.');
	}

	const usedList = Array.from(usedWords).join(', ') || 'none';
	const prompt = 'Create exactly one new coined English word that does not currently exist as a common English dictionary word. It should sound natural, be memorable, and have a meaningful coined etymology. Do not use or resemble any of these already-used session words: [' + usedList + ']. Return JSON only with: word, meaning, etymology_meaning, roots_compact, confidence_not_existing. The word should be lowercase. The meaning should be short. The etymology should explain roots from languages such as Latin, Greek, Spanish, Old English, French, or Germanic patterns. Do not repeat previous words.';

	const response = await fetch('https://api.minimax.io/v1/chat/completions', {
		method: 'POST',
		headers: {
			'authorization': 'Bearer ' + apiKey,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			model: miniMaxModel,
			messages: [
				{
					role: 'system',
					content: 'You return one strict JSON object only. Do not include markdown, prose, code fences, or explanatory text.'
				},
				{
					role: 'user',
					content: prompt
				}
			],
			thinking: {
				type: 'adaptive',
				reasoning_split: true
			},
			max_completion_tokens: 600,
			temperature: 0.9,
			top_p: 0.95
		})
	});

	const responseJson = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error('MiniMax word generation failed.');
	}
	const outputText = extractMiniMaxContent(responseJson || {});
	if (!outputText) {
		throw new Error('MiniMax returned an empty response.');
	}
	return parseJsonFromModelText(outputText);
}

async function handleGenerateWord(req, res) {
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed.' });
		return;
	}

	try {
		const body = JSON.parse(await readBody(req) || '{}');
		const usedWords = new Set(Array.isArray(body.used_words) ? body.used_words.map(normalizeWord).filter(Boolean) : []);
		let lastError = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const candidate = await requestMiniMaxWord(usedWords);
				const validated = validateGeneratedWord(candidate, usedWords);
				sendJson(res, 200, validated);
				return;
			} catch (error) {
				lastError = error;
				if (!/duplicated/i.test(error.message)) {
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

const server = http.createServer((req, res) => {
	if (req.url && req.url.startsWith('/api/generate-word')) {
		handleGenerateWord(req, res);
		return;
	}
	serveStatic(req, res);
});

server.listen(port, () => {
	console.log('Sugarchain web wallet listening on http://localhost:' + port + '/#/');
});
