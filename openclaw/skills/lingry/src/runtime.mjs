import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_API_BASE_URL = 'https://lingry.net';
export const DEFAULT_LANGUAGE_CODE = 'W';
export const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.LINGRY_AGENT_REQUEST_TIMEOUT_MS || 180000));

export function skillRootFromImportMeta(importMetaUrl) {
	return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), '..');
}

export function workspaceRoot() {
	return path.resolve(process.cwd());
}

export function lingryPaths() {
	const statePath = process.env.LINGRY_AGENT_STATE_PATH
		? path.resolve(process.env.LINGRY_AGENT_STATE_PATH)
		: path.join(workspaceRoot(), '.lingry', 'agent.json');
	return { statePath, stateDir: path.dirname(statePath), workspace: workspaceRoot() };
}

function requireHttpsUrl(value, source) {
	let url;
	try { url = new URL(value); } catch { throw new Error(`${source} must be a valid HTTPS URL.`); }
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error(`${source} must use HTTPS (HTTP is allowed only for local development).`);
	return url.href.replace(/\/+$/, '');
}

export function resolveLingryApiBaseUrl() {
	if (process.env.LINGRY_API_BASE_URL) return { baseUrl: requireHttpsUrl(process.env.LINGRY_API_BASE_URL, 'LINGRY_API_BASE_URL'), source: 'LINGRY_API_BASE_URL' };
	return { baseUrl: DEFAULT_API_BASE_URL, source: 'built-in default' };
}

export function defaultLanguageCode() {
	return String(process.env.LINGRY_DEFAULT_LANGUAGE_CODE || DEFAULT_LANGUAGE_CODE).trim().toUpperCase().charAt(0) || DEFAULT_LANGUAGE_CODE;
}

export function ensurePrivateDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
	try { fs.chmodSync(dirPath, 0o700); } catch { /* Best effort on non-POSIX filesystems. */ }
}

export function writeJsonPrivateAtomic(filePath, value) {
	ensurePrivateDir(path.dirname(filePath));
	const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
	fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
	try { fs.chmodSync(tempPath, 0o600); } catch { /* Best effort on non-POSIX filesystems. */ }
	fs.renameSync(tempPath, filePath);
	try { fs.chmodSync(filePath, 0o600); } catch { /* Best effort on non-POSIX filesystems. */ }
}

export function loadAgentState() {
	try { return JSON.parse(fs.readFileSync(lingryPaths().statePath, 'utf8')); } catch { return {}; }
}

export function saveAgentState(update) {
	const next = { ...loadAgentState(), ...update, updated_at: new Date().toISOString() };
	writeJsonPrivateAtomic(lingryPaths().statePath, next);
	return next;
}

function randomCredential(bytes) {
	return crypto.randomBytes(bytes).toString('base64url');
}

export function ensureLocalAgentCredential() {
	const state = loadAgentState();
	if (state.client_instance_id && state.agent_secret) return state;
	return saveAgentState({ state_version: 2, client_type: 'openclaw', client_instance_id: randomCredential(24), agent_secret: randomCredential(32), created_at: state.created_at || new Date().toISOString() });
}

export async function fetchJsonWithTimeout(url, options = {}, label = 'Lingry request') {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(url, { ...options, signal: controller.signal });
		const text = await response.text();
		let json = null;
		if (text) {
			try { json = JSON.parse(text); } catch { throw new Error(`${label} returned HTTP ${response.status} with non-JSON response.`); }
		}
		if (!response.ok) {
			const message = json?.error?.message || json?.error || response.statusText || 'request failed';
			const error = new Error(`${label} returned HTTP ${response.status}: ${message}`);
			error.status = response.status;
			error.code = json?.error?.code || '';
			throw error;
		}
		return json;
	} catch (error) {
		if (error.name === 'AbortError') throw new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS} ms.`);
		throw error;
	} finally { clearTimeout(timer); }
}

export async function fetchJsonProbe(url, options = {}, label = 'Lingry request') {
	try { return { ok: true, status: 200, json: await fetchJsonWithTimeout(url, options, label) }; }
	catch (error) { return { ok: false, status: Number(error.status || 0), code: error.code || '', safe_message: error.message || `${label} failed.` }; }
}

function requestHeaders(options = {}, token = '') {
	const headers = new Headers(options);
	headers.set('content-type', headers.get('content-type') || 'application/json');
	if (token) headers.set('authorization', `Bearer ${token}`);
	return headers;
}

export async function publicApi(pathname, options = {}) {
	const { baseUrl } = resolveLingryApiBaseUrl();
	const json = await fetchJsonWithTimeout(baseUrl + pathname, { ...options, headers: requestHeaders(options.headers) }, `Lingry API ${pathname}`);
	if (!json?.ok) throw new Error(json?.error?.message || `Lingry API ${pathname} failed.`);
	return json.data || json;
}

export async function apiProbe(pathname, options = {}) {
	const { baseUrl } = resolveLingryApiBaseUrl();
	return fetchJsonProbe(baseUrl + pathname, { ...options, headers: requestHeaders(options.headers) }, `Lingry API ${pathname}`);
}

export async function legacyApi(pathname, options = {}) {
	const { baseUrl } = resolveLingryApiBaseUrl();
	const json = await fetchJsonWithTimeout(baseUrl + pathname, { ...options, headers: requestHeaders(options.headers) }, `Lingry ${pathname}`);
	if (json?.error) throw new Error(json.error?.message || json.error || `Lingry ${pathname} failed.`);
	return json;
}

function credentialBody(state) {
	return { client_type: 'openclaw', client_instance_id: state.client_instance_id, agent_secret: state.agent_secret };
}

export async function bootstrapAgentPublisher() {
	let state = ensureLocalAgentCredential();
	const publisher = await publicApi('/v1/agents/bootstrap', { method: 'POST', headers: { 'idempotency-key': `bootstrap-${state.client_instance_id}` }, body: JSON.stringify(credentialBody(state)) });
	state = saveAgentState({ agent_id: publisher.agent_id, publisher_address: publisher.publisher_address, publisher_public_key: publisher.publisher_public_key, publisher_status: publisher.status, funding_status: publisher.funding_status, bootstrapped_at: state.bootstrapped_at || new Date().toISOString() });
	return { state, publisher };
}

export async function createAgentSession() {
	let state = ensureLocalAgentCredential();
	if (!state.agent_id || !state.publisher_address) ({ state } = await bootstrapAgentPublisher());
	const session = await publicApi('/v1/agents/session', { method: 'POST', headers: { 'idempotency-key': `session-${crypto.randomUUID()}` }, body: JSON.stringify(credentialBody(state)) });
	return { state, session };
}

export async function authenticatedApi(pathname, options = {}) {
	const { session } = await createAgentSession();
	const headers = requestHeaders(options.headers, session.access_token);
	if (options.method && options.method !== 'GET' && !headers.has('idempotency-key')) headers.set('idempotency-key', `openclaw-${crypto.randomUUID()}`);
	const { baseUrl } = resolveLingryApiBaseUrl();
	const json = await fetchJsonWithTimeout(baseUrl + pathname, { ...options, headers }, `Lingry Agent API ${pathname}`);
	if (!json?.ok) throw new Error(json?.error?.message || `Lingry Agent API ${pathname} failed.`);
	return json.data;
}

export function publicAgentIdentity() {
	const state = loadAgentState();
	return state.agent_id ? { agent_id: state.agent_id, client_type: 'openclaw', publisher_address: state.publisher_address || '', publisher_public_key: state.publisher_public_key || '', status: state.publisher_status || 'unknown', funding_status: state.funding_status || 'unknown' } : null;
}

export function markOnboardingComplete(featuredWord = null) {
	return saveAgentState({ onboarding_version: 1, onboarding_completed: true, onboarding_completed_at: new Date().toISOString(), onboarding_featured_txid: featuredWord?.txid || '' });
}

export async function firstUseOnboarding() {
	const state = loadAgentState();
	if (state.onboarding_completed && Number(state.onboarding_version) >= 1) return null;
	let featuredWord = null;
	let streamAvailable = false;
	try {
		const stream = await publicApi('/v1/stream?limit=1', { method: 'GET' });
		const items = Array.isArray(stream.items) ? stream.items : [];
		featuredWord = items.find(item => item && item.word && item.meaning) || null;
		streamAvailable = true;
	} catch { /* Onboarding remains useful without fabricating Stream content. */ }
	markOnboardingComplete(featuredWord);
	return {
		type: 'lingry.first_use', title: '🟢 Lingry is ready.', stream_available: streamAvailable,
		featured_word: featuredWord ? { word: featuredWord.word, part_of_speech: featuredWord.part_of_speech || '', meaning: featuredWord.meaning, txid: featuredWord.txid || '' } : null,
		actions: ['Invent a new word', 'Show me the 5 latest words', 'Coin a new word on Sugarchain'],
		daily_word_prompt: 'I can send you one new Lingry word every day. Want me to set that up?',
		agent_publisher_created: false, blockchain_transaction_created: false
	};
}

export function safeProbeResult(probe, okWhenStatuses = []) {
	return { ok: Boolean(probe.ok || okWhenStatuses.includes(probe.status)), status: probe.status || (probe.ok ? 200 : 0), safe_message: probe.ok ? 'ok' : (probe.safe_message || 'request failed') };
}

export function verifyInstall(skillRoot) {
	const requiredFiles = ['SKILL.md', 'README.md', 'package.json', 'npm-shrinkwrap.json', 'bin/lingry-agent.mjs', 'src/runtime.mjs', 'LICENSE', 'CHANGELOG.md', 'SECURITY.md', 'SUPPORT.md'];
	const files = requiredFiles.map(relativePath => {
		const fullPath = path.join(skillRoot, relativePath);
		return { path: relativePath, present: fs.existsSync(fullPath) && fs.statSync(fullPath).isFile(), size: fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0 };
	});
	const missing = files.filter(file => !file.present || file.size <= 0).map(file => file.path);
	const pkg = JSON.parse(fs.readFileSync(path.join(skillRoot, 'package.json'), 'utf8'));
	const bins = pkg.bin || {};
	const binOk = bins['lingry-agent'] === 'bin/lingry-agent.mjs' && !Object.hasOwn(bins, 'lingry-wallet');
	return { ok: missing.length === 0 && binOk && pkg.name === '@svetlyoh/lingry', package_name: pkg.name, version: pkg.version, required_files: files, missing, bins, standalone: true, plugin_fallback_enabled: false };
}
