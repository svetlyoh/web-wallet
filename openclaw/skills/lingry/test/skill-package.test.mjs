import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const agent = fs.readFileSync(path.join(root, 'bin/lingry-agent.mjs'), 'utf8');
const wallet = fs.readFileSync(path.join(root, 'bin/lingry-wallet.mjs'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function isolatedEnv(extra = {}) {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lingry-test-home-'));
	return {
		...process.env,
		HOME: home,
		USERPROFILE: home,
		LINGRY_API_BASE_URL: 'https://127.0.0.1:9',
		LINGRY_KEYSTORE_PATH: path.join(home, '.lingry', 'keystore.json'),
		LINGRY_AGENT_REQUEST_TIMEOUT_MS: '1000',
		LINGRY_SESSION_TOKEN: '',
		...extra
	};
}

function runNode(args, options = {}) {
	return spawnSync(process.execPath, args, {
		cwd: options.cwd || root,
		env: options.env || isolatedEnv(),
		encoding: 'utf8',
		timeout: options.timeout || 10000
	});
}

function mockFetchEnv(routePayloads) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingry-fetch-mock-'));
	const mockPath = path.join(dir, 'mock-fetch.mjs');
	fs.writeFileSync(mockPath, `
const payloads = ${JSON.stringify(routePayloads)};
globalThis.fetch = async (url) => {
	const parsed = new URL(String(url));
	const payload = payloads[parsed.pathname] || payloads.default;
	if (payload && payload.status) {
		return new Response(JSON.stringify(payload.body), { status: payload.status, headers: { 'content-type': 'application/json' } });
	}
	return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
};
`, 'utf8');
	return isolatedEnv({ NODE_OPTIONS: `--import=${pathToFileURL(mockPath).href}` });
}

function copyCleanRoom() {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lingry-clean-room-'));
	fs.cpSync(root, temp, {
		recursive: true,
		filter: (source) => {
			const base = path.basename(source);
			return base !== 'node_modules' && base !== '.git' && !base.startsWith('.tmp-');
		}
	});
	return temp;
}

test('SKILL.md has ClawHub frontmatter and optional auth metadata', () => {
	assert.match(skill, /^---\nname: lingry\n/m);
	assert.match(skill, /homepage: https:\/\/lingry\.net/);
	assert.match(skill, /LINGRY_SESSION_TOKEN[\s\S]*required: false/);
	assert.match(skill, /Defaults to https:\/\/lingry\.net/);
	assert.doesNotMatch(skill, /LINGRY_GRANT_WALLET_WIF|LINGRY_FUNDING_WIF/);
	assert.doesNotMatch(skill, /export\s+LINGRY_WALLET_PASSPHRASE|LINGRY_WALLET_PASSPHRASE=/);
});

test('README documents canonical package and no passphrase export', () => {
	assert.match(readme, /openclaw skills install @svetlyoh\/lingry/);
	assert.match(readme, /https:\/\/lingry\.net/);
	assert.match(readme, /Optional Lingry Account Session/);
	assert.match(readme, /node bin\/lingry-wallet\.mjs setup/);
	assert.match(readme, /node bin\/lingry-agent\.mjs leaderboard/);
	assert.match(readme, /node bin\/lingry-agent\.mjs stream/);
	assert.doesNotMatch(readme, /export\s+LINGRY_WALLET_PASSPHRASE|LINGRY_WALLET_PASSPHRASE=|export-private-key|plugin-skills/);
});

test('package includes required standalone executable text-source files', () => {
	assert.equal(pkg.name, '@svetlyoh/lingry');
	assert.equal(pkg.version, '1.0.5');
	assert.equal(pkg.bin['lingry-agent'], 'bin/lingry-agent.mjs');
	assert.equal(pkg.bin['lingry-wallet'], 'bin/lingry-wallet.mjs');
	for (const relativePath of [
		'bin/lingry-agent.mjs',
		'bin/lingry-wallet.mjs',
		'src/runtime.mjs',
		'package.json',
		'package-lock.json'
	]) {
		assert.ok(fs.statSync(path.join(root, relativePath)).size > 0, relativePath);
	}
});

test('agent has no wallet decryption, passphrase, fallback, or direct broadcast path', () => {
	assert.doesNotMatch(agent, /LINGRY_WALLET_PASSPHRASE|createDecipher|loadEncryptedWallet|fromWIF|TransactionBuilder|signed_transaction_hex/);
	assert.doesNotMatch(agent, /plugin-skills|web-wallet|localhost:8787|--confirm-broadcast/);
	assert.match(agent, /prepare-coin/);
	assert.match(agent, /prepare-starter-grant/);
	assert.match(agent, /leaderboard/);
	assert.match(agent, /stream/);
});

test('leaderboard and stream usage is listed', () => {
	const result = runNode(['bin/lingry-agent.mjs', 'help']);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /leaderboard \[limit\] \[--json\]/);
	assert.match(result.stdout, /stream \[limit\] \[--json\]/);
});

test('wallet helper owns terminal-only signing commands', () => {
	assert.match(wallet, /create-wallet/);
	assert.match(wallet, /import-wallet/);
	assert.match(wallet, /approve/);
	assert.match(wallet, /claim-grant/);
	assert.match(wallet, /BROADCAST/);
	assert.match(wallet, /Lingry wallet commands must be run from an interactive local terminal/);
});

test('public leaderboard and stream commands are anonymous read-only commands', () => {
	const source = agent;
	const leaderboardBlock = source.slice(source.indexOf('async function runPublicRead'), source.indexOf('async function runStatus'));
	assert.match(leaderboardBlock, /\/v1\/'\s*\+\s*kind/);
	assert.doesNotMatch(leaderboardBlock, /requireSessionToken|readKeystoreHeader|createPendingRequest|sugarApi|lingry-wallet|loadEncryptedWallet|WIF|passphrase|TransactionBuilder|broadcast/i);
});

test('leaderboard and stream format public snapshots and JSON', () => {
	const snapshot = {
		ok: true,
		source: 'lingry-hourly-public-index',
		generated_at: '2026-06-28T18:00:00.000Z',
		stale: true,
		scan: { start_height: 100, end_height: 820, scanned_blocks: 720 },
		leaderboard: {
			words: [{ word: 'desknosh', meaning: 'a snack eaten while working', language_code: 'W', part_of_speech: 'n', likes: 3, tips_amount: '0.02500000', creator_address: 'sugar1qabcdef1234567890' }],
			addresses_by_likes: [{ address: 'sugar1qabcdef1234567890', likes_received: 3, words_count: 1 }],
			addresses_by_tips: [{ address: 'sugar1qabcdef1234567890', tips_amount: '0.02500000', tips_count: 1 }],
			addresses_by_words: [{ address: 'sugar1qabcdef1234567890', words_count: 1, likes_received: 3 }]
		},
		items: [{ word: 'desknosh', meaning: 'a snack eaten while working', language_code: 'W', part_of_speech: 'n', creator_address: 'sugar1qabcdef1234567890', block_height: 820, txid: 'a'.repeat(64), tx_time: '2026-06-28T17:54:12.000Z', likes: 3, tips_amount: '0.02500000' }]
	};
	const env = mockFetchEnv({ '/v1/leaderboard': { ok: true, data: snapshot }, '/v1/stream': { ok: true, data: snapshot } });
	const leaderboard = runNode(['bin/lingry-agent.mjs', 'leaderboard'], { env });
	assert.equal(leaderboard.status, 0, leaderboard.stderr);
	assert.match(leaderboard.stdout, /Lingry Leaderboard/);
	assert.match(leaderboard.stdout, /1\. desknosh/);
	assert.match(leaderboard.stdout, /STALE/);
	const stream = runNode(['bin/lingry-agent.mjs', 'stream', '20'], { env });
	assert.equal(stream.status, 0, stream.stderr);
	assert.match(stream.stdout, /Lingry Stream/);
	assert.match(stream.stdout, /1\. desknosh/);
	const json = runNode(['bin/lingry-agent.mjs', 'leaderboard', '--json'], { env });
	assert.equal(json.status, 0, json.stderr);
	assert.equal(JSON.parse(json.stdout).leaderboard.words[0].word, 'desknosh');
});

test('leaderboard and stream limits are safe and snapshot-not-ready is clear', () => {
	const env = mockFetchEnv({
		'/v1/leaderboard': { ok: true, data: { generated_at: '2026-06-28T18:00:00.000Z', stale: false, leaderboard: { words: [], addresses_by_likes: [], addresses_by_tips: [], addresses_by_words: [] } } },
		'/v1/stream': { status: 503, body: { ok: false, error: { code: 'hourly_snapshot_not_ready', message: 'Lingry public index has not completed its first hourly refresh yet.', retryable: true } } }
	});
	const capped = runNode(['bin/lingry-agent.mjs', 'leaderboard', '500', '--json'], { env });
	assert.equal(capped.status, 0, capped.stderr);
	const notReady = runNode(['bin/lingry-agent.mjs', 'stream'], { env });
	assert.notEqual(notReady.status, 0);
	assert.match(notReady.stderr, /hourly refresh/);
	const invalid = runNode(['bin/lingry-agent.mjs', 'leaderboard', 'nope'], { env });
	assert.equal(invalid.status, 0, invalid.stderr);
});

test('verify-install succeeds without network or repository fallback', () => {
	const result = runNode(['bin/lingry-agent.mjs', 'verify-install']);
	assert.equal(result.status, 0, result.stderr);
	const parsed = JSON.parse(result.stdout);
	assert.equal(parsed.ok, true);
	assert.equal(parsed.package_name, '@svetlyoh/lingry');
	assert.equal(parsed.plugin_fallback_enabled, false);
	assert.deepEqual(parsed.missing, []);
});

test('doctor probes public and authenticated endpoints independently', () => {
	const result = runNode(['bin/lingry-agent.mjs', 'doctor']);
	assert.equal(result.status, 0, result.stderr);
	const parsed = JSON.parse(result.stdout);
	assert.equal(parsed.ok, true);
	assert.equal(parsed.checks.api.baseUrl, 'https://127.0.0.1:9');
	assert.equal(parsed.checks.session_token_configured, false);
	assert.equal(parsed.checks.agent_decrypts_wallet, false);
	assert.equal(parsed.public_list_words_access.available, false);
	assert.equal(parsed.public_list_words_access.note, 'This public read check is independent of LINGRY_SESSION_TOKEN.');
	assert.equal(parsed.auth_status.token_configured, false);
	assert.equal(parsed.authenticated_candidate_generation_access.ok, false);
	assert.equal(parsed.authenticated_candidate_coin_preparation_access.ok, false);
	assert.doesNotMatch(result.stdout + result.stderr, /[KL5][1-9A-HJ-NP-Za-km-z]{50,51}/);
});

test('default status and auth-status are safe and non-secret', () => {
	const env = isolatedEnv();
	const status = runNode(['bin/lingry-agent.mjs'], { env });
	assert.equal(status.status, 0, status.stderr);
	const parsedStatus = JSON.parse(status.stdout);
	assert.equal(parsedStatus.ok, true);
	assert.equal(parsedStatus.wallet.configured, false);
	assert.equal(parsedStatus.session_token.token_configured, false);
	assert.equal(parsedStatus.session_token.token_accepted, 'unknown');
	assert.ok(Object.hasOwn(parsedStatus, 'last_saved_candidate'));
	assert.ok(Object.hasOwn(parsedStatus, 'last_local_coin_result'));

	const auth = runNode(['bin/lingry-agent.mjs', 'auth-status'], { env });
	assert.equal(auth.status, 0, auth.stderr);
	const parsedAuth = JSON.parse(auth.stdout);
	assert.equal(parsedAuth.token_configured, false);
	assert.equal(parsedAuth.token_accepted, 'unknown');
	assert.doesNotMatch(status.stdout + status.stderr + auth.stdout + auth.stderr, /[KL5][1-9A-HJ-NP-Za-km-z]{50,51}/);
});

test('wallet helper refuses non-interactive runs and passphrase environment input', () => {
	const nonInteractive = runNode(['bin/lingry-wallet.mjs', 'inspect'], { timeout: 3000 });
	assert.notEqual(nonInteractive.status, 0);
	assert.match(nonInteractive.stderr, /interactive local terminal/);

	const withEnvPassphrase = runNode(['bin/lingry-wallet.mjs', 'inspect'], {
		env: isolatedEnv({ LINGRY_WALLET_PASSPHRASE: 'not-used' }),
		timeout: 3000
	});
	assert.notEqual(withEnvPassphrase.status, 0);
	assert.match(withEnvPassphrase.stdout + withEnvPassphrase.stderr, /Do not provide a Lingry wallet passphrase through an environment variable/);
});

test('clean-room install works with no checkout fallback', () => {
	const clean = copyCleanRoom();
	const npmCommand = process.platform === 'win32' ? 'npm ci --omit=dev --ignore-scripts' : 'npm';
	const npmArgs = process.platform === 'win32' ? [] : ['ci', '--omit=dev', '--ignore-scripts'];
	const install = spawnSync(npmCommand, npmArgs, {
		cwd: clean,
		encoding: 'utf8',
		shell: process.platform === 'win32',
		timeout: 60000
	});
	assert.equal(install.status, 0, install.stderr);
	const verify = runNode(['bin/lingry-agent.mjs', 'verify-install'], { cwd: clean });
	assert.equal(verify.status, 0, verify.stderr);
	const parsedVerify = JSON.parse(verify.stdout);
	assert.equal(parsedVerify.ok, true);
	assert.equal(parsedVerify.package_name, '@svetlyoh/lingry');
	const status = runNode(['bin/lingry-agent.mjs', 'status'], { cwd: clean });
	assert.equal(status.status, 0, status.stderr);
	assert.equal(JSON.parse(status.stdout).api.baseUrl, 'https://127.0.0.1:9');
});
