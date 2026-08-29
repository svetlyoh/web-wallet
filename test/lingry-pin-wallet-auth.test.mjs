import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
	OPENAPI,
	lingryIdentityUserId,
	normalizeLingryWalletAddress
} from '../src/lingry-api.mjs';

const indexSource = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const authSource = fs.readFileSync(new URL('../public/lingry-auth.js', import.meta.url), 'utf8');
const authCss = fs.readFileSync(new URL('../public/lingry-auth.css', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../src/lingry-api.mjs', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(new URL('../migrations/0006_lingry_wallet_identities.sql', import.meta.url), 'utf8');

test('normal Lingry entry has no legacy account authentication controls', () => {
	assert.match(indexSource, /id="lingry-auth-card"/);
	assert.match(indexSource, /src="lingry-auth\.js\?2"/);
	for (const obsolete of [
		'Continue with Google',
		'Sign up by Key',
		'Login with key',
		'id="open-email"',
		'id="open-password"',
		'id="open-regular-form"',
		'id="open-key-form"'
	]) {
		assert.equal(indexSource.includes(obsolete), false, obsolete);
	}
	assert.match(authSource, /Start New/);
	assert.match(authSource, /I already have Lingry/);
});

test('PIN entry is exactly four numeric digits and auto-submits', () => {
	assert.match(authSource, /inputmode="numeric"/);
	assert.match(authSource, /autocomplete="one-time-code"/);
	assert.match(authSource, /maxlength="4"/);
	assert.match(authSource, /replace\(\/\\D\/g, ''\)\.slice\(0, 4\)/);
	assert.match(authSource, /if \(value\.length === 4\)/);
	assert.match(authSource, /handlePinComplete\(value\)/);
	assert.match(authSource, /\^\\d\{4\}\$/);
});

test('local vault combines a non-extractable device key with PIN-derived encryption', () => {
	assert.match(authSource, /generateKey\(\{ name: 'AES-GCM', length: 256 \}, false/);
	assert.match(authSource, /name: 'PBKDF2'/);
	assert.match(authSource, /iterations: PBKDF2_ITERATIONS/);
	assert.match(authSource, /crypto\.subtle\.encrypt/);
	assert.match(authSource, /indexedDB\.open/);
	assert.doesNotMatch(authSource, /localStorage\.setItem\([^\n]*pin/i);
	assert.match(authSource, /blocked_until/);
	assert.match(authSource, /Math\.min\(30, Math\.pow/);
});

test('wallet proof requests contain public proof only', () => {
	const proofStart = authSource.indexOf('async function authenticateWallet');
	const proofEnd = authSource.indexOf('async function startNew', proofStart);
	const proofSource = authSource.slice(proofStart, proofEnd);
	assert.ok(proofStart > 0 && proofEnd > proofStart);
	assert.match(proofSource, /challenge_id/);
	assert.match(proofSource, /public_key/);
	assert.match(proofSource, /signature/);
	assert.doesNotMatch(proofSource, /\bwif\b|private_key|privateKey/);
	assert.match(apiSource, /assertNoPrivateKeyFields\(body\)/);
	assert.match(apiSource, /wallet-proof-recovery/);
});

test('valid legacy wallet proof can restore an identity without preexisting local index data', () => {
	assert.match(apiSource, /action !== 'recover'/);
	assert.match(apiSource, /legacySource = hasActivity/);
	assert.match(apiSource, /'wallet-proof-recovery'/);
	assert.doesNotMatch(authSource, /error\.code === 'existing_identity_not_found'/);
});

test('wallet identities have a unique normalized address and stable user id', async () => {
	const mixedBech32 = 'SuGaR1QExampleAddress';
	assert.equal(normalizeLingryWalletAddress(mixedBech32), mixedBech32.toLowerCase());
	assert.equal(normalizeLingryWalletAddress('SbCaseSensitive'), 'SbCaseSensitive');
	assert.equal(await lingryIdentityUserId(mixedBech32), await lingryIdentityUserId(mixedBech32.toLowerCase()));
	assert.match(await lingryIdentityUserId(mixedBech32), /^lingry_[0-9a-f]{32}$/);
	assert.match(migrationSource, /normalized_wallet_address TEXT NOT NULL UNIQUE/);
	assert.match(migrationSource, /auth_version TEXT NOT NULL DEFAULT 'wallet-pin-v1'/);
	assert.ok(OPENAPI.paths['/v1/auth/wallet']);
});

test('compact PIN layout remains within narrow mobile viewports', () => {
	assert.match(authCss, /grid-template-columns: repeat\(4, minmax\(48px, 58px\)\)/);
	assert.match(authCss, /@media \(max-width: 350px\)/);
	assert.match(authCss, /min-height: 48px/);
	assert.match(authCss, /width: min\(100%, 430px\)/);
	assert.match(authSource, /data-lingry-auth-screen/);
	assert.match(authCss, /data-lingry-auth-screen="unlock"/);
	assert.doesNotMatch(authCss, /\.lingry-pin-cells:focus-within/);
});
