import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentPath = path.join(root, 'bin', 'lingry-agent.mjs');
const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'src', 'runtime.mjs'), 'utf8');
const agent = fs.readFileSync(agentPath, 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function mockEnvironment(options = {}) {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lingry-openclaw-test-'));
	const logPath = path.join(temp, 'requests.log');
	const preload = path.join(temp, 'mock-fetch.mjs');
	fs.writeFileSync(preload, `
import fs from 'node:fs';
import crypto from 'node:crypto';
const log = ${JSON.stringify(logPath)};
const failStream = ${Boolean(options.failStream)};
globalThis.fetch = async (url, init = {}) => {
  const parsed = new URL(String(url));
  const body = init.body ? JSON.parse(String(init.body)) : {};
  fs.appendFileSync(log, JSON.stringify({ path: parsed.pathname, method: init.method || 'GET' }) + '\\n');
  if (parsed.pathname === '/v1/stream') {
    if (failStream) return new Response(JSON.stringify({ ok: false, error: { code: 'unavailable', message: 'Stream unavailable' } }), { status: 503, headers: { 'content-type': 'application/json' } });
    return Response.json({ ok: true, items: [{ word: 'desknosh', part_of_speech: 'n', meaning: 'A snack eaten while working.', txid: 'a'.repeat(64) }], generated_at: '2026-08-29T00:00:00.000Z' });
  }
  if (parsed.pathname === '/v1/healthz') return Response.json({ ok: true, data: { status: 'ok' } });
  if (parsed.pathname === '/api/invent-word-from-prompt') return Response.json({ word: 'airlilt', part_of_speech: 'n', meaning: 'A small current of air that makes a desk fan pleasant.', etymology: 'air + lilt', model_name: 'test-model' });
  if (parsed.pathname === '/v1/agents/bootstrap') {
    const hash = crypto.createHash('sha256').update(body.client_instance_id).digest('hex');
    return Response.json({ ok: true, data: { agent_id: 'agt_' + hash.slice(0, 20), client_type: 'openclaw', publisher_address: 'sugar1q' + hash.slice(0, 38), publisher_public_key: '02' + hash.slice(0, 64), status: 'active', funding_status: 'ready' } });
  }
  if (parsed.pathname === '/v1/agents/session') return Response.json({ ok: true, data: { access_token: 'test.access', expires_at: '2099-01-01T00:00:00.000Z', scopes: ['words:create','words:coin'] } });
  if (parsed.pathname === '/v1/agents/me') return Response.json({ ok: true, data: { agent_id: 'agt_test', publisher_address: 'sugar1qtest', status: 'active' } });
  if (parsed.pathname === '/v1/generations') return Response.json({ ok: true, data: { candidate: { candidate_id: 'cand_test', language_code: 'W', candidate_hash: 'b'.repeat(64), term: body.term, meaning: body.meaning } } });
  if (parsed.pathname === '/v1/agents/coin') return Response.json({ ok: true, data: { candidate_id: body.candidate_id, word: 'desknosh', meaning: 'Desk snack', publisher_address: 'sugar1qpublisher', intent_id: 'intent_test', txid: 'c'.repeat(64), status: 'pending' } });
  if (parsed.pathname.startsWith('/v1/words')) return Response.json({ ok: true, data: { words: [] } });
  return Response.json({ ok: true, data: {} });
};
`, 'utf8');
	return {
		temp,
		logPath,
		env: { ...process.env, LINGRY_API_BASE_URL: 'https://lingry.test', LINGRY_AGENT_REQUEST_TIMEOUT_MS: '1000', NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` }
	};
}

function run(args, setup, cwd = setup.temp) {
	return spawnSync(process.execPath, [agentPath, ...args], { cwd, env: setup.env, encoding: 'utf8', timeout: 10000 });
}

function requests(setup) {
	if (!fs.existsSync(setup.logPath)) return [];
	return fs.readFileSync(setup.logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

test('package 2.0.1 exposes only the Agent Publisher executable', () => {
	assert.equal(pkg.version, '2.0.1');
	assert.deepEqual(pkg.bin, { 'lingry-agent': 'bin/lingry-agent.mjs' });
	assert.deepEqual(pkg.dependencies, {});
	for (const removed of ['bin/lingry-wallet.mjs', 'src/keystore.ts', 'src/wallet.ts']) assert.equal(fs.existsSync(path.join(root, removed)), false, removed);
});

test('active OpenClaw code has no Sugarchain key, wallet, signing, or manual approval path', () => {
	const source = runtime + '\n' + agent;
	for (const forbidden of ['bitcoinjs-lib', 'fromWIF', 'TransactionBuilder', 'LINGRY_SESSION_TOKEN', 'LINGRY_KEYSTORE_PATH', 'LINGRY_WALLET_PASSPHRASE', 'signed_transaction_hex']) assert.equal(source.includes(forbidden), false, forbidden);
	assert.doesNotMatch(source, /export-private-key|sendSugar|sendToAddress|signRawTransaction/);
	assert.match(skill, /Each OpenClaw agent automatically receives its own Lingry-managed Sugarchain publishing address/);
	assert.match(skill, /First Use — Engage Immediately/);
	assert.match(skill, /cd ~\/\.openclaw\/workspace\nopenclaw skills install '@svetlyoh\/lingry'/);
	assert.match(skill, /No additional `npm` command, wallet setup, API token, encryption key, or environment variable is required/);
});

test('first no-argument invocation shows real Stream onboarding without creating an Agent Publisher', () => {
	const setup = mockEnvironment();
	const result = run([], setup);
	assert.equal(result.status, 0, result.stderr);
	const output = JSON.parse(result.stdout);
	assert.equal(output.type, 'lingry.first_use');
	assert.equal(output.featured_word.word, 'desknosh');
	assert.equal(output.agent_publisher_created, false);
	const state = JSON.parse(fs.readFileSync(path.join(setup.temp, '.lingry', 'agent.json'), 'utf8'));
	assert.equal(state.onboarding_completed, true);
	assert.equal(Object.hasOwn(state, 'client_instance_id'), false);
	assert.deepEqual(requests(setup).map(item => item.path), ['/v1/stream']);
});

test('completed onboarding is idempotent across later invocations', () => {
	const setup = mockEnvironment();
	assert.equal(run([], setup).status, 0);
	const second = run([], setup);
	assert.equal(second.status, 0, second.stderr);
	const output = JSON.parse(second.stdout);
	assert.equal(output.type, undefined);
	assert.equal(output.onboarding_completed, true);
	assert.equal(requests(setup).filter(item => item.path === '/v1/stream').length, 1);
});

test('Stream failure still completes onboarding and fabricates no word', () => {
	const setup = mockEnvironment({ failStream: true });
	const result = run([], setup);
	assert.equal(result.status, 0, result.stderr);
	const output = JSON.parse(result.stdout);
	assert.equal(output.stream_available, false);
	assert.equal(output.featured_word, null);
	assert.equal(output.actions.includes('Invent a new word'), true);
});

test('a fresh word prompt automatically bootstraps and creates a candidate without client key setup', () => {
	const setup = mockEnvironment();
	for (const name of ['LINGRY_AGENT_KEY_ENCRYPTION_KEY', 'LINGRY_AGENT_CREDENTIAL_PEPPER', 'LINGRY_SESSION_SECRET']) delete setup.env[name];
	const result = run(['generate-word', 'a pleasant breeze from a desk fan'], setup);
	assert.equal(result.status, 0, result.stderr);
	const output = JSON.parse(result.stdout);
	assert.equal(output.type, 'lingry.word_generated');
	assert.equal(output.candidate.term, 'airlilt');
	assert.equal(output.coined, false);
	assert.deepEqual(requests(setup).map(item => item.path), [
		'/api/invent-word-from-prompt',
		'/v1/agents/bootstrap',
		'/v1/agents/session',
		'/v1/generations'
	]);
	const state = JSON.parse(fs.readFileSync(path.join(setup.temp, '.lingry', 'agent.json'), 'utf8'));
	assert.ok(state.client_instance_id);
	assert.ok(state.agent_secret);
	assert.equal(state.publisher_address.startsWith('sugar1q'), true);
	assert.doesNotMatch(result.stdout + result.stderr, /agent_secret|client_instance_id|encryption.key/i);
});

test('two workspace states receive different publishers and one workspace reconnects to the same address', () => {
	const setup = mockEnvironment();
	const workspaceA = path.join(setup.temp, 'agent-a');
	const workspaceB = path.join(setup.temp, 'agent-b');
	fs.mkdirSync(workspaceA); fs.mkdirSync(workspaceB);
	const a1 = run(['address'], setup, workspaceA);
	const a2 = run(['address'], setup, workspaceA);
	const b = run(['address'], setup, workspaceB);
	assert.equal(a1.status, 0, a1.stderr); assert.equal(a2.status, 0, a2.stderr); assert.equal(b.status, 0, b.stderr);
	const addressA1 = JSON.parse(a1.stdout).publisher_address;
	const addressA2 = JSON.parse(a2.stdout).publisher_address;
	const addressB = JSON.parse(b.stdout).publisher_address;
	assert.equal(addressA1, addressA2);
	assert.notEqual(addressA1, addressB);
	assert.doesNotMatch(a1.stdout + a2.stdout + b.stdout, /agent_secret|client_instance_id/);
});

test('coin-word is autonomous and contains no human approval step', () => {
	const setup = mockEnvironment();
	fs.mkdirSync(path.join(setup.temp, '.lingry'), { recursive: true });
	fs.writeFileSync(path.join(setup.temp, '.lingry', 'agent.json'), JSON.stringify({ onboarding_completed: true, onboarding_version: 1, active_candidate_id: 'cand_test', active_candidate_language_code: 'W' }));
	const result = run(['coin-word', 'cand_test'], setup);
	assert.equal(result.status, 0, result.stderr);
	const output = JSON.parse(result.stdout);
	assert.equal(output.type, 'lingry.word_coined');
	assert.equal(output.txid, 'c'.repeat(64));
	assert.equal(output.publisher_address, 'sugar1qpublisher');
	assert.doesNotMatch(result.stdout + result.stderr, /passphrase|approval|required_user_command/i);
	assert.ok(requests(setup).some(item => item.path === '/v1/agents/coin'));
});

test('daily-word is a public read with no blockchain or publisher side effects', () => {
	const setup = mockEnvironment();
	const result = run(['daily-word'], setup);
	assert.equal(result.status, 0, result.stderr);
	const output = JSON.parse(result.stdout);
	assert.equal(output.read_only, true);
	assert.equal(output.agent_publisher_created, false);
	assert.equal(output.blockchain_transaction_created, false);
	assert.deepEqual(requests(setup).map(item => item.path), ['/v1/stream']);
});

test('verify-install succeeds and help lists the 2.0 command surface', () => {
	const setup = mockEnvironment();
	const verify = run(['verify-install'], setup);
	assert.equal(verify.status, 0, verify.stderr);
	assert.equal(JSON.parse(verify.stdout).ok, true);
	const help = run(['help'], setup);
	assert.match(help.stdout, /coin-word <candidate-id>/);
	assert.doesNotMatch(help.stdout, /lingry-wallet|prepare-coin|claim-grant/);
});

test('Daily Lingry Word guidance requires consent, duplicate checks, native automation, and easy disable', () => {
	assert.match(skill, /explicitly agrees/);
	assert.match(skill, /check whether an active `lingry-daily-word` job already exists/);
	assert.match(skill, /native persistent automation interface/);
	assert.match(skill, /disable or remove the existing job/);
	assert.doesNotMatch(skill, /silently enable|installation is consent/i);
});
