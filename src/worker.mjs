const MINI_MAX_MODEL = 'MiniMax-M3';

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

async function requestMiniMaxWord(usedWords, usedMeanings, conceptPrompt, generationMode, requestApiKey, env) {
	const apiKey = requestApiKey || env.MINIMAX_API_KEY || '';
	if (!apiKey) {
		throw new Error('Paste a MiniMax API key in the wallet tab.');
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
		const requestApiKey = sanitizeText(body.api_key, 300);
		if (generationMode === 'prompt' && !conceptPrompt) {
			throw new Error('Prompt for New Word is empty.');
		}
		let lastError = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const candidate = await requestMiniMaxWord(usedWords, usedMeanings, conceptPrompt, generationMode, requestApiKey, env);
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

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === '/api/invent-word-from-prompt') {
			return handleGenerateWord(request, env, 'prompt');
		}
		if (url.pathname === '/api/generate-word') {
			return handleGenerateWord(request, env, null);
		}
		if (url.pathname === '/api/words/search') {
			return jsonResponse({
				records: [],
				decoded_record: null,
				direct_summary: {
					enabled: true,
					requested_blocks: 0,
					start_height: Number(url.searchParams.get('start_height')) || null,
					scan_mode: 'worker_static_no_index',
					checked_txids: 0,
					verified_txids: 0,
					scanned_blocks: 0,
					scanned_transactions: 0,
					indexed_records: 0,
					errors: []
				}
			});
		}
		return env.ASSETS.fetch(request);
	}
};
