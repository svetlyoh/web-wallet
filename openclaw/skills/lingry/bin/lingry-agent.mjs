#!/usr/bin/env node
import crypto from 'node:crypto';
import {
	apiProbe,
	authenticatedApi,
	bootstrapAgentPublisher,
	defaultLanguageCode,
	firstUseOnboarding,
	legacyApi,
	lingryPaths,
	loadAgentState,
	publicAgentIdentity,
	publicApi,
	resolveLingryApiBaseUrl,
	safeProbeResult,
	saveAgentState,
	skillRootFromImportMeta,
	verifyInstall
} from '../src/runtime.mjs';

const command = process.argv[2] || '';
const args = process.argv.slice(3);
const languageCode = defaultLanguageCode();
const skillRoot = skillRootFromImportMeta(import.meta.url);

function printJson(value) { console.log(JSON.stringify(value, null, 2)); }

function parseReadOptions(values, fallback = 100) {
	let json = false;
	let limit = fallback;
	for (const value of values) {
		if (value === '--json') json = true;
		else if (/^\d+$/.test(value)) limit = Number(value);
	}
	return { json, limit: Math.max(1, Math.min(Number.isFinite(limit) ? Math.floor(limit) : fallback, 100)) };
}

function formatStream(data, title = 'Lingry Stream') {
	const items = Array.isArray(data.items) ? data.items : [];
	const lines = [title, data.generated_at ? `Snapshot: ${data.generated_at}` : ''];
	if (data.stale) lines.push('Status: STALE — showing the latest completed public snapshot.');
	lines.push('');
	if (!items.length) lines.push('No public coined words are available in the current snapshot.');
	items.forEach((item, index) => lines.push(`${index + 1}. ${item.word}${item.part_of_speech ? ` (${item.part_of_speech})` : ''} — ${item.meaning}`));
	return lines.filter((line, index) => line || index === lines.length - 1).join('\n');
}

function formatLeaderboard(data) {
	const words = Array.isArray(data.leaderboard?.words) ? data.leaderboard.words : [];
	const lines = ['Lingry Leaderboard', data.generated_at ? `Snapshot: ${data.generated_at}` : '', ''];
	if (!words.length) lines.push('No public coined words are available in the current snapshot.');
	words.forEach((item, index) => lines.push(`${index + 1}. ${item.word}${item.part_of_speech ? ` (${item.part_of_speech})` : ''} — ${item.meaning}`));
	return lines.filter((line, index) => line || index === lines.length - 1).join('\n');
}

async function runPublicRead(kind, values = args) {
	const options = parseReadOptions(values);
	const data = await publicApi(`/v1/${kind}?limit=${options.limit}`, { method: 'GET' });
	if (options.json) return printJson(data);
	console.log(kind === 'leaderboard' ? formatLeaderboard(data) : formatStream(data));
}

async function runStatus() {
	const health = await apiProbe('/v1/healthz', { method: 'GET' });
	const state = loadAgentState();
	printJson({
		ok: true,
		api: resolveLingryApiBaseUrl(),
		api_health: safeProbeResult(health),
		workspace_state_path: lingryPaths().statePath,
		onboarding_completed: Boolean(state.onboarding_completed),
		agent_publisher: publicAgentIdentity(),
		last_saved_candidate: state.active_candidate_id ? {
			candidate_id: state.active_candidate_id,
			language_code: state.active_candidate_language_code || '',
			candidate_hash: state.active_candidate_hash || '',
			term: state.active_candidate_term || '',
			meaning: state.active_candidate_meaning || ''
		} : null,
		last_coin_result: state.last_coin_result || null,
		blockchain_key_present_locally: false
	});
}

async function runDoctor() {
	const health = await apiProbe('/v1/healthz', { method: 'GET' });
	const stream = await apiProbe('/v1/stream?limit=1', { method: 'GET' });
	printJson({
		ok: true,
		install: verifyInstall(skillRoot),
		checks: {
			node_version: process.version,
			api: resolveLingryApiBaseUrl(),
			state_path: lingryPaths().statePath,
			workspace_scoped_state: !process.env.LINGRY_AGENT_STATE_PATH,
			blockchain_key_handling: 'server-only',
			manual_secrets_required: false
		},
		api_health: safeProbeResult(health),
		public_stream_access: { ...safeProbeResult(stream), creates_agent_publisher: false }
	});
}

function languageInstruction(code) {
	return code === 'E' ? 'Use British English. Return the Generated Word, Meaning, and Etymology Meaning in British English.' : '';
}

function candidateBody(generated, concept) {
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
		source: 'openclaw-agent-publisher'
	};
}

function candidateNextActions(candidateId) {
	return {
		next_prompt: 'Coin this term, or prompt for another?',
		next_step: `node bin/lingry-agent.mjs coin-word ${candidateId}`,
		next_actions: [
			{
				id: 'coin_term',
				label: 'Coin this term',
				command: `node bin/lingry-agent.mjs coin-word ${candidateId}`,
				irreversible: true,
				requires_explicit_publication_intent: true
			},
			{
				id: 'prompt_another',
				label: 'Prompt for another',
				command: 'node bin/lingry-agent.mjs generate-word "<new or refined concept>"',
				irreversible: false,
				coins_current_candidate: false
			}
		]
	};
}

async function persistCandidate(body) {
	const data = await authenticatedApi('/v1/generations', { method: 'POST', body: JSON.stringify(body) });
	const candidate = data.candidate;
	saveAgentState({ active_candidate_id: candidate.candidate_id, active_candidate_language_code: candidate.language_code, active_candidate_hash: candidate.candidate_hash, active_candidate_term: candidate.term || '', active_candidate_meaning: candidate.meaning || '' });
	return candidate;
}

async function generateWord() {
	const concept = args.join(' ').trim();
	if (!concept) throw new Error('Usage: node bin/lingry-agent.mjs generate-word "a missing concept"');
	const generated = await legacyApi('/api/invent-word-from-prompt', {
		method: 'POST', body: JSON.stringify({ generation_mode: 'prompt', concept_prompt: concept, used_words: [], used_meanings: [], language_code: languageCode, language_instruction: languageInstruction(languageCode) })
	});
	const candidate = await persistCandidate(candidateBody(generated, concept));
	printJson({ ok: true, type: 'lingry.word_generated', candidate, reversible: true, coined: false, ...candidateNextActions(candidate.candidate_id) });
}

async function createWordDraft() {
	const [term, partOfSpeech, ...meaningParts] = args;
	const meaning = meaningParts.join(' ').trim();
	if (!term || !partOfSpeech || !meaning) throw new Error('Usage: node bin/lingry-agent.mjs create-word-draft <term> <part-of-speech> <meaning>');
	const candidate = await persistCandidate({ language_code: languageCode, term, part_of_speech: partOfSpeech, meaning, source: 'openclaw-draft' });
	printJson({ ok: true, candidate, reversible: true, coined: false, ...candidateNextActions(candidate.candidate_id) });
}

async function resolveCandidateId(value) {
	const state = loadAgentState();
	if (!value) {
		if (!state.active_candidate_id) throw new Error('No active candidate is saved. Generate a word or pass a candidate id.');
		return { candidate_id: state.active_candidate_id, language_code: state.active_candidate_language_code || languageCode };
	}
	if (!value.startsWith('cand_')) throw new Error('coin-word requires an immutable candidate id beginning with cand_.');
	return { candidate_id: value, language_code: state.active_candidate_language_code || languageCode };
}

async function coinWord() {
	const candidate = await resolveCandidateId(args[0] || '');
	const state = loadAgentState();
	const samePendingCandidate = state.pending_coin_candidate_id === candidate.candidate_id && state.pending_coin_idempotency_key;
	const idempotencyKey = samePendingCandidate ? state.pending_coin_idempotency_key : `coin-${crypto.randomUUID()}`;
	saveAgentState({ pending_coin_candidate_id: candidate.candidate_id, pending_coin_idempotency_key: idempotencyKey });
	const result = await authenticatedApi('/v1/agents/coin', {
		method: 'POST', headers: { 'idempotency-key': idempotencyKey },
		body: JSON.stringify({ candidate_id: candidate.candidate_id, language_code: candidate.language_code })
	});
	saveAgentState({ pending_coin_candidate_id: '', pending_coin_idempotency_key: '', last_coin_result: result });
	printJson({ ok: true, type: 'lingry.word_coined', ...result, irreversible: true });
}

async function runAddress() {
	const { publisher } = await bootstrapAgentPublisher();
	printJson({ agent_id: publisher.agent_id, client_type: publisher.client_type, publisher_address: publisher.publisher_address, publisher_public_key: publisher.publisher_public_key, status: publisher.status, funding_status: publisher.funding_status });
}

async function runListWords() {
	const requestedLanguage = String(args[0] || languageCode).toUpperCase().charAt(0);
	const data = await publicApi(`/v1/words?language_code=${encodeURIComponent(requestedLanguage)}&limit=100`, { method: 'GET' });
	printJson(data);
}

async function runDailyWord() {
	const data = await publicApi('/v1/stream?limit=20', { method: 'GET' });
	const item = Array.isArray(data.items) ? data.items.find(entry => entry?.word && entry?.meaning) : null;
	printJson({ ok: true, type: 'lingry.daily_word', word: item ? { word: item.word, part_of_speech: item.part_of_speech || '', meaning: item.meaning, txid: item.txid || '' } : null, read_only: true, agent_publisher_created: false, blockchain_transaction_created: false });
}

function usage() {
	console.log('Usage: lingry-agent [status] | doctor | verify-install | stream [limit] [--json] | leaderboard [limit] [--json] | list-words [language] | agent-status | address | generate-word <concept> | create-word-draft <term> <pos> <meaning> | coin-word <candidate-id> | get-transaction <intent-id> | daily-word');
}

async function main() {
	if (!command) {
		const onboarding = await firstUseOnboarding();
		if (onboarding) return printJson(onboarding);
		return runStatus();
	}
	if (command === 'help' || command === '--help' || command === '-h') return usage();
	if (command === 'verify-install') return printJson(verifyInstall(skillRoot));
	if (command === 'status') return runStatus();
	if (command === 'doctor') return runDoctor();
	if (command === 'stream' || command === 'leaderboard') return runPublicRead(command);
	if (command === 'list-words') return runListWords();
	if (command === 'address') return runAddress();
	if (command === 'agent-status') return printJson(await authenticatedApi('/v1/agents/me', { method: 'GET' }));
	if (command === 'generate-word' || command === 'prompt-word') return generateWord();
	if (command === 'create-word-draft') return createWordDraft();
	if (command === 'coin-word') return coinWord();
	if (command === 'get-transaction') {
		if (!args[0]) throw new Error('get-transaction requires an intent id.');
		return printJson(await publicApi(`/v1/transactions/${encodeURIComponent(args[0])}?language_code=${encodeURIComponent(languageCode)}`, { method: 'GET' }));
	}
	if (command === 'daily-word') return runDailyWord();
	usage();
	process.exitCode = 1;
}

main().catch(error => { console.error(error.message || String(error)); process.exitCode = 1; });
