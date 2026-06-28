#!/usr/bin/env node
import {
	COIN_FEE_SATOSHIS,
	api,
	apiProbe,
	chooseUtxos,
	createPendingRequest,
	defaultLanguageCode,
	getAuthStatus,
	installationIdFor,
	legacyApi,
	lingryPaths,
	loadAgentState,
	readKeystoreHeader,
	readPendingRequest,
	readRequestResult,
	requireSessionToken,
	resolveKeystorePath,
	resolveLingryApiBaseUrl,
	safeProbeResult,
	saveAgentState,
	sessionTokenConfigured,
	skillRootFromImportMeta,
	sugarApi,
	fetchJsonWithTimeout,
	verifyInstall
} from '../src/runtime.mjs';

const command = process.argv[2] || 'status';
const languageCode = defaultLanguageCode();
const skillRoot = skillRootFromImportMeta(import.meta.url);

function printJson(value) {
	console.log(JSON.stringify(value, null, 2));
}

function parsePublicReadOptions(args) {
	let json = false;
	let limit = 100;
	for (const arg of args) {
		if (arg === '--json') {
			json = true;
			continue;
		}
		if (/^\d+$/.test(arg)) {
			limit = Number(arg);
		}
	}
	if (!Number.isFinite(limit) || limit <= 0) {
		limit = 100;
	}
	limit = Math.max(1, Math.min(Math.floor(limit), 100));
	return { json, limit };
}

function shortAddress(address) {
	const text = String(address || '');
	return text.length > 16 ? text.slice(0, 8) + '...' + text.slice(-6) : text;
}

function sugarText(value) {
	const text = String(value || '0');
	return text === '0' ? '0 SUGAR' : text + ' SUGAR';
}

function staleLine(data) {
	if (!data.stale) {
		return '';
	}
	return 'Status: STALE - latest completed hourly snapshot is older than two hours.\n';
}

function formatLeaderboard(data) {
	const board = data.leaderboard || {};
	const lines = [
		'Lingry Leaderboard',
		`Snapshot: ${data.generated_at || ''}`,
		staleLine(data).trim(),
		'Updated from the latest completed hourly public index snapshot.',
		'',
		'Top Words'
	].filter(line => line !== '');
	const words = Array.isArray(board.words) ? board.words : [];
	if (!words.length) {
		lines.push('No public coined words are in the snapshot yet.');
	} else {
		words.forEach((word, index) => {
			lines.push(`${index + 1}. ${word.word || ''} (${word.language_code || 'W'} ${word.part_of_speech || ''}) - ${word.meaning || ''}`);
			lines.push(`   Likes: ${Number(word.likes || 0)} | Tips: ${sugarText(word.tips_amount)} | Creator: ${shortAddress(word.creator_address)}`);
		});
	}
	const sections = [
		['Top Creators by Likes', board.addresses_by_likes || [], item => `${Number(item.likes_received || 0)} likes received | ${Number(item.words_count || 0)} words`],
		['Top Creators by Tips', board.addresses_by_tips || [], item => `${sugarText(item.tips_amount)} | ${Number(item.tips_count || 0)} tips`],
		['Top Creators by Words', board.addresses_by_words || [], item => `${Number(item.words_count || 0)} words | ${Number(item.likes_received || 0)} likes received`]
	];
	for (const [title, items, describe] of sections) {
		lines.push('', title);
		if (!items.length) {
			lines.push('No creator ranking data yet.');
			continue;
		}
		items.forEach((item, index) => {
			lines.push(`${index + 1}. ${shortAddress(item.address)} - ${describe(item)}`);
		});
	}
	return lines.join('\n');
}

function formatStream(data) {
	const lines = [
		'Lingry Stream',
		`Snapshot: ${data.generated_at || ''}`,
		staleLine(data).trim(),
		'Updated from the latest completed hourly public index snapshot.',
		''
	].filter(line => line !== '');
	const items = Array.isArray(data.items) ? data.items : [];
	if (!items.length) {
		lines.push('No public coined words are in the snapshot yet.');
		return lines.join('\n');
	}
	items.forEach((item, index) => {
		lines.push(`${index + 1}. ${item.word || ''} (${item.part_of_speech || ''}.) - ${item.meaning || ''}`);
		lines.push(`   Language: ${item.language_code || 'W'} | Block: ${item.block_height || ''} | Creator: ${shortAddress(item.creator_address)}`);
		lines.push(`   Likes: ${Number(item.likes || 0)} | Tips: ${sugarText(item.tips_amount)} | Coined: ${item.tx_time || ''}`);
		lines.push('');
	});
	return lines.join('\n').trimEnd();
}

async function runPublicRead(kind) {
	const options = parsePublicReadOptions(process.argv.slice(3));
	const { baseUrl } = resolveLingryApiBaseUrl();
	const pathname = '/v1/' + kind + '?limit=' + encodeURIComponent(options.limit);
	const response = await fetchJsonWithTimeout(baseUrl + pathname, { method: 'GET' }, 'Lingry API ' + pathname);
	if (!response?.ok) {
		throw new Error(response?.error?.message || 'Lingry public ' + kind + ' request failed.');
	}
	const data = response.data || response;
	if (options.json) {
		printJson(data);
		return;
	}
	console.log(kind === 'leaderboard' ? formatLeaderboard(data) : formatStream(data));
}

function languageInstruction(code) {
	if (code === 'E') {
		return 'The selected Lingry language is British English. Return the Generated Word, Meaning, and Etymology Meaning in British English. The section headings must stay exactly as requested.';
	}
	return '';
}

function generatedToCandidateBody(generated, concept) {
	return {
		language_code: languageCode,
		language_name: generated.language_name || '',
		term: generated.word || generated.term,
		part_of_speech: generated.part_of_speech || generated.pos || 'n',
		meaning: generated.meaning,
		etymology: generated.etymology || generated.etymology_meaning || '',
		newness_confidence: generated.newness_confidence,
		model_name: generated.model_name || 'minimax',
		concept_prompt: concept,
		source: 'clawhub'
	};
}

async function persistGeneratedCandidate(generated, concept) {
	const response = await api('/v1/generations', {
		method: 'POST',
		body: JSON.stringify(generatedToCandidateBody(generated, concept))
	});
	const candidate = response.candidate;
	saveAgentState({
		active_candidate_id: candidate.candidate_id,
		active_candidate_language_code: candidate.language_code,
		active_generation_id: candidate.generation_id,
		active_candidate_hash: candidate.candidate_hash,
		active_candidate_term: candidate.term || '',
		active_candidate_meaning: candidate.meaning || ''
	});
	return candidate;
}

async function resolveCandidateForCoin(termOrId = '') {
	const value = String(termOrId || '').trim();
	const state = loadAgentState();
	const activeLanguage = state.active_candidate_language_code || languageCode;
	if (!value) {
		if (!state.active_candidate_id) {
			throw new Error('No active generated candidate is saved. Run generate-word first or pass a candidate id/term.');
		}
		const data = await api('/v1/candidates/' + encodeURIComponent(state.active_candidate_id) + '?language_code=' + encodeURIComponent(activeLanguage), { method: 'GET' });
		return data.candidate;
	}
	if (value.startsWith('cand_')) {
		const data = await api('/v1/candidates/' + encodeURIComponent(value) + '?language_code=' + encodeURIComponent(activeLanguage), { method: 'GET' });
		return data.candidate;
	}
	const data = await api('/v1/candidates?language_code=' + encodeURIComponent(activeLanguage) + '&status=available&term=' + encodeURIComponent(value), { method: 'GET' });
	const candidates = Array.isArray(data.candidates) ? data.candidates : [];
	if (candidates.length !== 1) {
		throw new Error(candidates.length ? `Multiple available candidates matched "${value}". Use the candidate_id.` : `No available candidate matched "${value}".`);
	}
	return candidates[0];
}

async function publicListWordsProbe(limit = 5) {
	return apiProbe('/v1/words?language_code=' + encodeURIComponent(languageCode) + '&limit=' + encodeURIComponent(limit), { method: 'GET' });
}

async function runStatus() {
	const wallet = readKeystoreHeader();
	const health = await apiProbe('/v1/healthz', { method: 'GET' });
	const publicWords = await publicListWordsProbe(5);
	const wordsData = publicWords.json?.data || {};
	const state = loadAgentState();
	let lastLocalResult = null;
	if (state.last_local_result?.request_id) {
		lastLocalResult = {
			request_id: state.last_local_result.request_id,
			type: state.last_local_result.type || '',
			status: state.last_local_result.status || '',
			txid: state.last_local_result.txid || '',
			saved_at: state.last_local_result.saved_at || ''
		};
	}
	printJson({
		ok: true,
		api: resolveLingryApiBaseUrl(),
		wallet: {
			configured: wallet.configured,
			address: wallet.address || '',
			keystore_path: wallet.keystore_path
		},
		api_health: safeProbeResult(health),
		public_words: {
			...safeProbeResult(publicWords),
			available: Boolean(publicWords.ok && publicWords.json?.ok),
			word_count_returned: Array.isArray(wordsData.words) ? wordsData.words.length : 0,
			next_cursor_available: Boolean(wordsData.next_cursor)
		},
		session_token: await getAuthStatus(),
		last_saved_candidate: state.active_candidate_id ? {
			candidate_id: state.active_candidate_id,
			language_code: state.active_candidate_language_code || '',
			generation_id: state.active_generation_id || '',
			candidate_hash: state.active_candidate_hash || '',
			term: state.active_candidate_term || '',
			meaning: state.active_candidate_meaning || ''
		} : null,
		last_local_coin_result: lastLocalResult,
		agent_makes_transactions: false
	});
}

async function runDoctor() {
	const health = await apiProbe('/v1/healthz', { method: 'GET' });
	const broadcast = await apiProbe('/v1/broadcast/status', { method: 'GET' });
	const publicWords = await publicListWordsProbe(1);
	const generationProbe = sessionTokenConfigured()
		? await apiProbe('/v1/generations', {
			method: 'POST',
			body: JSON.stringify({ language_code: languageCode, source: 'clawhub-auth-probe' })
		})
		: { ok: false, status: 0, safe_message: 'LINGRY_SESSION_TOKEN is not configured.' };
	const coinPrepareProbe = sessionTokenConfigured()
		? await apiProbe('/v1/candidates/__clawhub_auth_probe__/coin/prepare', {
			method: 'POST',
			body: JSON.stringify({ language_code: languageCode, fee_satoshis: COIN_FEE_SATOSHIS, utxos: [] })
		})
		: { ok: false, status: 0, safe_message: 'LINGRY_SESSION_TOKEN is not configured.' };
	const publicWordsData = publicWords.json?.data || {};
	printJson({
		ok: true,
		install: verifyInstall(skillRoot),
		checks: {
			node_version: process.version,
			api: resolveLingryApiBaseUrl(),
			keystore: resolveKeystorePath(),
			session_token_configured: sessionTokenConfigured(),
			default_language_code: languageCode,
			agent_decrypts_wallet: false,
			agent_broadcasts_transactions: false,
			plugin_or_checkout_fallback: false
		},
		api_health: safeProbeResult(health),
		broadcast_status: {
			...safeProbeResult(broadcast),
			available: Boolean(broadcast.ok && broadcast.json?.ok && broadcast.json?.data?.broadcast?.available),
			rpc_configured: Boolean(broadcast.json?.data?.broadcast?.rpc_configured),
			public_sugar_api_fallback: Boolean(broadcast.json?.data?.broadcast?.public_sugar_api_fallback)
		},
		public_list_words_access: {
			...safeProbeResult(publicWords),
			available: Boolean(publicWords.ok && publicWords.json?.ok),
			word_count_returned: Array.isArray(publicWordsData.words) ? publicWordsData.words.length : 0,
			note: 'This public read check is independent of LINGRY_SESSION_TOKEN.'
		},
		auth_status: await getAuthStatus(),
		authenticated_candidate_generation_access: {
			...safeProbeResult(generationProbe, [400]),
			probe_note: sessionTokenConfigured() ? 'Uses an intentionally incomplete request; HTTP 400 means authentication reached the generation route without saving a candidate.' : 'Not probed without a session token.'
		},
		authenticated_candidate_coin_preparation_access: {
			...safeProbeResult(coinPrepareProbe, [400, 404, 409]),
			probe_note: sessionTokenConfigured() ? 'Uses a non-existent candidate id; HTTP 400/404/409 after authentication means auth reached coin preparation without creating a transaction.' : 'Not probed without a session token.'
		}
	});
}

async function prepareStarterGrant() {
	const wallet = readKeystoreHeader();
	if (!wallet.configured || !wallet.address || !wallet.public_key) {
		throw new Error('No local Lingry wallet is configured. Run: node bin/lingry-wallet.mjs setup');
	}
	const challenge = await legacyApi('/api/wallet-grants/challenge', {
		method: 'POST',
		body: JSON.stringify({
			address: wallet.address,
			public_key: wallet.public_key,
			installation_id: installationIdFor(wallet.address, wallet.keystore_path)
		})
	});
	const request = createPendingRequest('grant', {
		api: resolveLingryApiBaseUrl(),
		wallet: {
			address: wallet.address,
			public_key: wallet.public_key,
			keystore_path: wallet.keystore_path
		},
		installation_id: installationIdFor(wallet.address, wallet.keystore_path),
		challenge: {
			claim_id: challenge.claim_id || '',
			nonce: challenge.nonce || '',
			challenge: challenge.challenge || '',
			status: challenge.startup_grant?.status || ''
		},
		required_user_command: `node bin/lingry-wallet.mjs claim-grant ${'${request_id}'}`
	});
	request.required_user_command = `node bin/lingry-wallet.mjs claim-grant ${request.request_id}`;
	printJson({
		ok: true,
		type: 'lingry.starter_grant_prepared',
		request_id: request.request_id,
		expires_at: request.expires_at,
		wallet_address: wallet.address,
		next_step: request.required_user_command,
		note: 'The agent prepared a public challenge only. A private terminal wallet helper must sign and submit it.'
	});
}

async function prepareCoin(candidateArg = '') {
	requireSessionToken();
	const wallet = readKeystoreHeader();
	if (!wallet.configured || !wallet.address || !wallet.public_key) {
		throw new Error('No local Lingry wallet is configured. Run: node bin/lingry-wallet.mjs setup');
	}
	const candidate = await resolveCandidateForCoin(candidateArg);
	const activeLanguage = candidate.language_code || languageCode;
	const utxos = await sugarApi('/unspent/' + encodeURIComponent(wallet.address) + '?amount=' + encodeURIComponent(COIN_FEE_SATOSHIS + 1));
	const selection = chooseUtxos(Array.isArray(utxos) ? utxos : [], COIN_FEE_SATOSHIS);
	const prepared = await api('/v1/candidates/' + encodeURIComponent(candidate.candidate_id) + '/coin/prepare', {
		method: 'POST',
		body: JSON.stringify({
			language_code: activeLanguage,
			fee_satoshis: COIN_FEE_SATOSHIS,
			utxos: selection.chosen
		})
	});
	const request = createPendingRequest('coin', {
		api: resolveLingryApiBaseUrl(),
		wallet: {
			address: wallet.address,
			public_key: wallet.public_key,
			keystore_path: wallet.keystore_path
		},
		candidate: {
			candidate_id: candidate.candidate_id,
			language_code: activeLanguage,
			candidate_hash: candidate.candidate_hash || '',
			term: candidate.term || '',
			meaning: candidate.meaning || ''
		},
		intent_id: prepared.intent_id,
		word_id: prepared.word_id || '',
		fee_satoshis: COIN_FEE_SATOSHIS,
		required_outputs: prepared.required_outputs || [],
		utxos: selection.chosen,
		required_user_command: `node bin/lingry-wallet.mjs approve ${'${request_id}'}`
	});
	request.required_user_command = `node bin/lingry-wallet.mjs approve ${request.request_id}`;
	printJson({
		ok: true,
		type: 'lingry.coin_request_prepared',
		request_id: request.request_id,
		expires_at: request.expires_at,
		candidate: request.candidate,
		fee_satoshis: request.fee_satoshis,
		wallet_address: wallet.address,
		next_step: request.required_user_command,
		note: 'No private key was loaded and no transaction was signed or broadcast. Review and approve from a private terminal.'
	});
}

async function generateWord() {
	requireSessionToken();
	const concept = process.argv.slice(3).join(' ').trim();
	if (!concept) {
		throw new Error('Provide a prompt, for example: generate-word "a word for cozy late-night coding"');
	}
	const generated = await legacyApi('/api/invent-word-from-prompt', {
		method: 'POST',
		body: JSON.stringify({
			generation_mode: 'prompt',
			concept_prompt: concept,
			used_words: [],
			used_meanings: [],
			language_code: languageCode,
			language_instruction: languageInstruction(languageCode)
		})
	});
	const candidate = await persistGeneratedCandidate(generated, concept);
	printJson({
		ok: true,
		type: 'lingry.word_generated',
		message: `Generated Lingry word candidate: ${candidate.term} - ${candidate.meaning}`,
		candidate,
		next_step: `node bin/lingry-agent.mjs prepare-coin ${candidate.candidate_id}`
	});
}

async function createWordDraft() {
	requireSessionToken();
	const [, , , term, partOfSpeech, ...meaningParts] = process.argv;
	const meaning = meaningParts.join(' ').trim();
	if (!term || !partOfSpeech || !meaning) {
		throw new Error('Usage: node bin/lingry-agent.mjs create-word-draft <term> <part-of-speech> <meaning>');
	}
	printJson(await api('/v1/words', {
		method: 'POST',
		body: JSON.stringify({ language_code: languageCode, term, part_of_speech: partOfSpeech, meaning, source: 'clawhub' })
	}));
}

async function main() {
	if (command === 'verify-install') {
		printJson(verifyInstall(skillRoot));
		return;
	}
	if (command === 'doctor') {
		await runDoctor();
		return;
	}
	if (command === 'status') {
		await runStatus();
		return;
	}
	if (command === 'auth-status') {
		printJson(await getAuthStatus());
		return;
	}
	if (command === 'address') {
		const wallet = readKeystoreHeader();
		if (!wallet.configured) {
			throw new Error('No local Lingry wallet is configured. Run: node bin/lingry-wallet.mjs setup');
		}
		printJson({ address: wallet.address, public_key: wallet.public_key, keystore_path: wallet.keystore_path });
		return;
	}
	if (command === 'list-words') {
		const requestedLanguage = process.argv[3] || languageCode;
		printJson(await api('/v1/words?language_code=' + encodeURIComponent(requestedLanguage), { method: 'GET' }));
		return;
	}
	if (command === 'leaderboard') {
		await runPublicRead('leaderboard');
		return;
	}
	if (command === 'stream') {
		await runPublicRead('stream');
		return;
	}
	if (command === 'generate-word' || command === 'prompt-word') {
		await generateWord();
		return;
	}
	if (command === 'prepare-coin' || command === 'coin-candidate' || command === 'coin-word-candidate') {
		await prepareCoin(process.argv.slice(3).join(' ').trim());
		return;
	}
	if (command === 'prepare-starter-grant') {
		await prepareStarterGrant();
		return;
	}
	if (command === 'get-request') {
		printJson(readPendingRequest(process.argv[3] || ''));
		return;
	}
	if (command === 'get-transaction') {
		const value = process.argv[3] || '';
		if (value.includes('_')) {
			printJson(readRequestResult(value));
			return;
		}
		const state = loadAgentState();
		const language = state.active_candidate_language_code || languageCode;
		printJson(await api('/v1/transactions/' + encodeURIComponent(value) + '?language_code=' + encodeURIComponent(language), { method: 'GET' }));
		return;
	}
	if (command === 'create-wallet' || command === 'import-wallet') {
		throw new Error('Wallet creation and import are terminal-only. Run: node bin/lingry-wallet.mjs setup');
	}
	if (command === 'claim-starter-grant') {
		throw new Error('Starter grant signing is terminal-only. Run: node bin/lingry-agent.mjs prepare-starter-grant, then node bin/lingry-wallet.mjs claim-grant <request-id>');
	}
	if (command === 'coin-it') {
		throw new Error('Direct agent broadcasting is disabled. Run: node bin/lingry-agent.mjs prepare-coin [candidate-id-or-term], then approve from a private terminal with node bin/lingry-wallet.mjs approve <request-id>.');
	}
	console.log('Usage: lingry-agent [status] | doctor | verify-install | auth-status | address | list-words [language] | leaderboard [limit] [--json] | stream [limit] [--json] | generate-word <prompt> | create-word-draft <term> <pos> <meaning> | prepare-coin [candidate-id-or-term] | prepare-starter-grant | get-request <request-id> | get-transaction <request-id-or-intent-id>');
}

main().catch((error) => {
	console.error(error.message || error);
	process.exitCode = 1;
});
