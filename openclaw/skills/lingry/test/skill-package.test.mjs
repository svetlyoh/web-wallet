import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { candidateNextActions, requireCandidate, requireCandidateId } from '../src/runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..', '..');
const cli = path.join(root, 'bin', 'lingry-agent.mjs');
const validId = 'cand_W' + 'a'.repeat(32);

function setupFetch(candidateId = validId) {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lingry-security-'));
	const logPath = path.join(temp, 'requests.jsonl');
	const preload = path.join(temp, 'preload.mjs');
	fs.writeFileSync(preload, `
import fs from 'node:fs';
const logPath = ${JSON.stringify(logPath)};
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(String(url));
  fs.appendFileSync(logPath, JSON.stringify({ origin: parsed.origin, path: parsed.pathname, method: options.method || 'GET', redirect: options.redirect, body: options.body || '', headers: options.headers || {} }) + '\\n');
  if (parsed.pathname === '/v1/openclaw/generations') return Response.json({ ok: true, data: { candidate: { candidate_id: ${JSON.stringify(candidateId)}, candidate_hash: 'b'.repeat(64), term: 'airlilt', meaning: 'A pleasant desk breeze', part_of_speech: 'n', language_code: 'W', language_name: 'American English', expires_at: '2099-01-01T00:00:00Z' } } });
  if (parsed.pathname.endsWith('/coin')) return Response.json({ ok: true, data: { candidate_id: ${JSON.stringify(candidateId)}, txid: 'c'.repeat(64), status: 'pending', publisher_address: 'sugar1qpublisher' } });
  if (parsed.pathname === '/v1/stream') return Response.json({ ok: true, data: { items: [{ word: 'desknosh', meaning: 'A desk snack' }] } });
  if (parsed.pathname === '/v1/healthz') return Response.json({ ok: true, data: { status: 'ok' } });
  return Response.json({ ok: false, error: { code: 'not_found' } }, { status: 404 });
};
`, 'utf8');
	return { temp, logPath, preload };
}

function run(args, setup) {
	return spawnSync(process.execPath, [cli, ...args], {
		cwd: setup.temp,
		env: { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(setup.preload).href}` },
		encoding: 'utf8', timeout: 10_000
	});
}

function requests(setup) {
	if (!fs.existsSync(setup.logPath)) return [];
	return fs.readFileSync(setup.logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

test('candidate IDs use one strict allowlist validator', () => {
	for (const value of ['cand_Abcdefghijklmnop', 'cand_a1_b2-c3_d4-e5f6', validId]) assert.equal(requireCandidateId(value), value);
	for (const value of [
		'cand_x;whoami', 'cand_x&&whoami', 'cand_x|whoami', 'cand_x$(whoami)', 'cand_x`whoami`',
		'cand_x\nwhoami', '"cand_x"', "'cand_x'", '../cand_x', '../../etc/passwd', '--help',
		'-http', 'cand_x > file', 'cand_x < file', 'cand_x*', 'cand_%24%28whoami%29', 1, null
	]) assert.throws(() => requireCandidateId(value), /invalid candidate ID/);
});

test('candidate display data is validated and actions have no executable fields', () => {
	const candidate = requireCandidate({ candidate_id: validId, candidate_hash: 'b'.repeat(64), term: 'airlilt', meaning: 'A pleasant desk breeze', part_of_speech: 'n', language_code: 'W' });
	assert.equal(candidate.term, 'airlilt');
	assert.throws(() => requireCandidate({ ...candidate, candidate_id: 'cand_x;whoami' }), /invalid candidate ID/);
	const actions = candidateNextActions();
	assert.deepEqual(actions.next_actions.map(action => action.label), ['Coin this term', 'Prompt for another']);
	assert.equal(actions.next_actions[0].requires_explicit_publication_intent, true);
	assert.equal(actions.next_actions[1].coins_current_candidate, false);
	for (const action of actions.next_actions) for (const field of ['command', 'shell', 'shell_command', 'exec', 'executable']) assert.equal(Object.hasOwn(action, field), false);
});

test('public discovery, generation, and prompt-another create no local state or publication', () => {
	const setup = setupFetch();
	for (const args of [[], ['daily-word'], ['generate-word', 'desk breeze'], ['prompt-another', 'gentle fan breeze']]) {
		const result = run(args, setup);
		assert.equal(result.status, 0, result.stderr);
		if (args[0] === 'generate-word' || args[0] === 'prompt-another') {
			const output = JSON.parse(result.stdout);
			assert.equal(output.coined, false);
			assert.equal(output.candidate.candidate_id, validId);
			assert.deepEqual(output.next_actions.map(action => action.id), ['coin_term', 'prompt_another']);
			assert.doesNotMatch(result.stdout, /node bin\/lingry-agent\.mjs coin-word/);
		}
	}
	assert.equal(fs.existsSync(path.join(setup.temp, '.lingry')), false);
	const calls = requests(setup);
	assert.deepEqual(calls.map(call => call.path), ['/v1/stream', '/v1/stream', '/v1/openclaw/generations', '/v1/openclaw/generations']);
	assert.ok(calls.every(call => call.origin === 'https://lingry.net' && call.redirect === 'error'));
});

test('coin requires an explicit flag and rejects invalid IDs before any request', () => {
	const setup = setupFetch();
	for (const args of [['coin-word', validId], ['coin-word', 'cand_x;whoami', '--publish']]) {
		const result = run(args, setup);
		assert.notEqual(result.status, 0);
	}
	assert.deepEqual(requests(setup), []);
	const result = run(['coin-word', validId, '--publish'], setup);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(JSON.parse(result.stdout).txid, 'c'.repeat(64));
	const calls = requests(setup);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].path, `/v1/openclaw/candidates/${validId}/coin`);
	assert.equal(calls[0].body, '{}');
	assert.equal(calls[0].headers['idempotency-key'], `clawhub-${validId}`);
	assert.equal(fs.existsSync(path.join(setup.temp, '.lingry')), false);
});

test('malformed API candidate IDs are rejected before being presented', () => {
	const setup = setupFetch('cand_x$(whoami)');
	const result = run(['generate-word', 'desk breeze'], setup);
	assert.notEqual(result.status, 0);
	assert.equal(result.stdout, '');
	assert.match(result.stderr, /invalid candidate ID/);
	assert.equal(requests(setup).length, 1);
});

test('verify-install checks local files without network calls or publishing', () => {
	const setup = setupFetch();
	const result = run(['verify-install'], setup);
	assert.equal(result.status, 0, result.stderr);
	const report = JSON.parse(result.stdout);
	assert.equal(report.type, 'lingry.install_verified');
	assert.equal(report.read_only, true);
	assert.deepEqual(requests(setup), []);
	assert.equal(fs.existsSync(path.join(setup.temp, '.lingry')), false);
});

test('staged ClawHub package and portable ZIP have identical safe files and version', () => {
	const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts', 'build-clawhub.mjs')], { cwd: repositoryRoot, encoding: 'utf8', timeout: 10_000 });
	assert.equal(result.status, 0, result.stderr);
	const expected = ['INSTALL.json', 'README.md', 'SKILL.md', 'bin/lingry-agent.mjs', 'package.json', 'src/runtime.mjs'];
	assert.deepEqual(result.stdout.trim().split(/\r?\n/), expected);
	const target = path.join(repositoryRoot, 'dist', 'clawhub-lingry');
	for (const forbidden of ['test', 'tests', 'node_modules', '.env', '.lingry', '.clawhubignore', 'LICENSE']) assert.equal(fs.existsSync(path.join(target, forbidden)), false, forbidden);
	const runtime = fs.readFileSync(path.join(target, 'src', 'runtime.mjs'), 'utf8') + fs.readFileSync(path.join(target, 'bin', 'lingry-agent.mjs'), 'utf8');
	assert.doesNotMatch(runtime, /child_process|execSync\s*\(|\bspawn\s*\(|shell\s*:\s*true|agent_secret|refresh_token/);

	const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
	const stagedPackage = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
	const install = JSON.parse(fs.readFileSync(path.join(target, 'INSTALL.json'), 'utf8'));
	const skill = fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8');
	assert.equal(stagedPackage.version, version);
	assert.equal(install.version, version);
	assert.match(skill, new RegExp(`^version: ${version.replaceAll('.', '\\.')}$`, 'm'));
	assert.deepEqual(stagedPackage.dependencies, {});
	assert.equal(stagedPackage.scripts, undefined);

	const dist = path.join(repositoryRoot, 'dist');
	const archive = `lingry-skill-${version}.zip`;
	const zip = fs.readFileSync(path.join(dist, archive));
	const hash = createHash('sha256').update(zip).digest('hex');
	assert.equal(fs.readFileSync(path.join(dist, `${archive}.sha256`), 'utf8'), `${hash}  ${archive}\n`);
	const releaseManifest = JSON.parse(fs.readFileSync(path.join(dist, `lingry-skill-${version}.manifest.json`), 'utf8'));
	const stagedManifest = JSON.parse(fs.readFileSync(path.join(dist, 'clawhub-lingry-manifest.json'), 'utf8'));
	assert.equal(releaseManifest.version, version);
	assert.equal(releaseManifest.archive, archive);
	assert.equal(releaseManifest.sha256, hash);
	assert.equal(stagedManifest.version, version);
	assert.equal(stagedManifest.source.github_import_path, 'skills/lingry');
	assert.deepEqual(releaseManifest.files, stagedManifest.files);
	const githubImport = path.join(repositoryRoot, 'skills', 'lingry');
	assert.deepEqual(fs.readdirSync(githubImport).sort(), ['INSTALL.json', 'README.md', 'SKILL.md', 'bin', 'package.json', 'src']);
	for (const relative of expected) {
		assert.deepEqual(fs.readFileSync(path.join(githubImport, relative)), fs.readFileSync(path.join(target, relative)), relative);
	}

	const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'lingry-portable-'));
	try {
		const zipPaths = [];
		let offset = 0;
		while (zip.readUInt32LE(offset) === 0x04034b50) {
			assert.equal(zip.readUInt16LE(offset + 8), 0, 'ZIP entry must be stored');
			const size = zip.readUInt32LE(offset + 18);
			const nameLength = zip.readUInt16LE(offset + 26);
			const extraLength = zip.readUInt16LE(offset + 28);
			const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
			assert.ok(name.startsWith('lingry/') && !name.includes('..'));
			const start = offset + 30 + nameLength + extraLength;
			const contents = zip.subarray(start, start + size);
			const destination = path.join(extracted, ...name.split('/'));
			fs.mkdirSync(path.dirname(destination), { recursive: true });
			fs.writeFileSync(destination, contents);
			zipPaths.push(name.slice('lingry/'.length));
			offset = start + size;
		}
		assert.equal(zip.readUInt32LE(offset), 0x02014b50, 'ZIP central directory follows file entries');
		assert.deepEqual(zipPaths, expected);
		for (const relative of expected) {
			const stagedHash = createHash('sha256').update(fs.readFileSync(path.join(target, relative))).digest('hex');
			const extractedHash = createHash('sha256').update(fs.readFileSync(path.join(extracted, 'lingry', relative))).digest('hex');
			assert.equal(extractedHash, stagedHash, relative);
			assert.equal(stagedManifest.files.find(file => file.path === relative)?.sha256, stagedHash);
		}
		const verified = spawnSync(process.execPath, [path.join(extracted, 'lingry', 'bin', 'lingry-agent.mjs'), 'verify-install'], {
			cwd: path.join(extracted, 'lingry'), encoding: 'utf8', timeout: 10_000
		});
		assert.equal(verified.status, 0, verified.stderr);
		assert.equal(JSON.parse(verified.stdout).version, version);
	} finally {
		fs.rmSync(extracted, { recursive: true, force: true });
	}
});
