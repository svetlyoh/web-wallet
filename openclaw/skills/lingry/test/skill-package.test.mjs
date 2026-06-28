import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
const agent = fs.readFileSync(path.join(root, 'bin/lingry-agent.mjs'), 'utf8');

function readPackageText(dir = root) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'test') return [];
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) return readPackageText(fullPath);
		if (!/\.(mjs|js|ts|md|json|sh)$/.test(entry.name)) return [];
		return fs.readFileSync(fullPath, 'utf8');
	}).join('\n');
}

test('SKILL.md has ClawHub frontmatter', () => {
	assert.match(skill, /^---\nname: lingry\n/m);
	assert.match(skill, /homepage: https:\/\/lingry\.net/);
	assert.match(skill, /LINGRY_API_BASE_URL/);
	assert.doesNotMatch(skill, /LINGRY_GRANT_WALLET_WIF|LINGRY_FUNDING_WIF/);
});

test('ClawHub agent does not expose private-key export or plugin-only commands', () => {
	assert.doesNotMatch(agent, /export-private-key|exportPrivateKey|maybeDisplayWifOnce|install-daily-cron|daily-popular-pick|prompt-and-coin|import-wallet/);
	assert.match(agent, /--confirm-broadcast/);
});

test('package source does not include private-key import/export or native-plugin surfaces', () => {
	const packageText = readPackageText();
	assert.doesNotMatch(packageText, /export-private-key|exportPrivateKey|maybeDisplayWifOnce|install-daily-cron|daily-popular-pick|prompt-and-coin|import-wallet|importWallet|plugin\.json|openclaw\.plugin/);
});

test('doctor command is safe and non-secret', () => {
	const result = spawnSync(process.execPath, ['bin/lingry-agent.mjs', 'doctor'], {
		cwd: root,
		env: {
			...process.env,
			LINGRY_API_BASE_URL: 'http://127.0.0.1:9',
			LINGRY_WALLET_PASSPHRASE: '',
			LINGRY_KEYSTORE_PATH: path.join(root, '.tmp-keystore.json')
		},
		encoding: 'utf8'
	});
	assert.equal(result.status, 0, result.stderr);
	const parsed = JSON.parse(result.stdout);
	assert.equal(parsed.ok, true);
	assert.equal(parsed.checks.passphrase_configured, false);
	assert.equal(parsed.checks.session_token_configured, false);
	assert.equal(parsed.public_list_words_access.available, false);
	assert.equal(parsed.auth_status.token_configured, false);
	assert.equal(parsed.authenticated_candidate_generation_access.ok, false);
	assert.equal(parsed.authenticated_candidate_coin_preparation_access.ok, false);
	assert.doesNotMatch(result.stdout + result.stderr, /WIF private key|BEGIN|[KL5][1-9A-HJ-NP-Za-km-z]{50,51}/);
});

test('default status and auth-status are safe and non-secret', () => {
	const env = {
		...process.env,
		LINGRY_API_BASE_URL: 'http://127.0.0.1:9',
		LINGRY_WALLET_PASSPHRASE: '',
		LINGRY_KEYSTORE_PATH: path.join(root, '.tmp-keystore.json'),
		LINGRY_SESSION_TOKEN: ''
	};
	const status = spawnSync(process.execPath, ['bin/lingry-agent.mjs'], {
		cwd: root,
		env,
		encoding: 'utf8'
	});
	assert.equal(status.status, 0, status.stderr);
	const parsedStatus = JSON.parse(status.stdout);
	assert.equal(parsedStatus.ok, true);
	assert.equal(parsedStatus.session_token.token_configured, false);
	assert.equal(parsedStatus.session_token.token_accepted, 'unknown');
	assert.ok(Object.hasOwn(parsedStatus, 'last_saved_candidate'));
	assert.ok(Object.hasOwn(parsedStatus, 'last_coin_result'));

	const auth = spawnSync(process.execPath, ['bin/lingry-agent.mjs', 'auth-status'], {
		cwd: root,
		env,
		encoding: 'utf8'
	});
	assert.equal(auth.status, 0, auth.stderr);
	const parsedAuth = JSON.parse(auth.stdout);
	assert.equal(parsedAuth.token_configured, false);
	assert.equal(parsedAuth.token_accepted, 'unknown');
	assert.doesNotMatch(status.stdout + status.stderr + auth.stdout + auth.stderr, /WIF private key|BEGIN|[KL5][1-9A-HJ-NP-Za-km-z]{50,51}/);
});
