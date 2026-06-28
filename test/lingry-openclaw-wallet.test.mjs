import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import bitcoin from 'bitcoinjs-lib';
import {
	buildStarterGrantTransaction,
	buildWalletGrantChallenge,
	LINGRY_NEW_WALLET_GRANT_SATOSHIS,
	LINGRY_NEW_WALLET_GRANT_SUGAR,
	sugarNetwork,
	sugarToSatoshis,
	verifyWalletGrantSignature
} from '../src/lingry-grants.mjs';

const agentPath = path.resolve('openclaw/skills/lingry/bin/lingry-agent.mjs');
const wifPattern = /\b[KL5][1-9A-HJ-NP-Za-km-z]{50,51}\b/;

function tempEnv() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingry-wallet-test-'));
	return {
		dir,
		env: {
			...process.env,
			LINGRY_API_BASE_URL: 'http://127.0.0.1:8787',
			LINGRY_KEYSTORE_PATH: path.join(dir, 'keystore.json'),
			LINGRY_WALLET_PASSPHRASE: 'test-passphrase',
			LINGRY_AUTO_CLAIM_STARTER_GRANT: 'false'
		}
	};
}

test('normal create-wallet creates encrypted keystore and does not print WIF', () => {
	const { dir, env } = tempEnv();
	const result = spawnSync(process.execPath, [agentPath, 'create-wallet'], {
		env,
		encoding: 'utf8'
	});
	assert.equal(result.status, 0, result.stderr);
	const output = result.stdout + result.stderr;
	assert.equal(wifPattern.test(output), false);
	const json = JSON.parse(result.stdout);
	assert.equal(json.private_key_backup.displayed_in_normal_output, false);
	assert.match(json.private_key_backup.warning, /never prints or exports WIFs/);
	assert.match(json.next_step, /claim-starter-grant/);
	const keystore = JSON.parse(fs.readFileSync(path.join(dir, 'keystore.json'), 'utf8'));
	assert.equal(typeof keystore.ciphertext, 'string');
	assert.equal(Object.hasOwn(keystore, 'wif'), false);
});

test('OpenClaw skill omits private-key export commands from agent tools', () => {
	const skill = fs.readFileSync('openclaw/skills/lingry/SKILL.md', 'utf8');
	const agent = fs.readFileSync(agentPath, 'utf8');
	assert.doesNotMatch(agent, /export-private-key|exportPrivateKey|maybeDisplayWifOnce/);
	assert.match(skill, /Do not include, request, or run a private-key export command/);
	assert.match(skill, /Never print, inspect, summarize, export, transmit, or log private keys, WIFs/);
	assert.match(skill, /Never scrape browser cookies, browser local storage, browser session storage/);
});

test('starter grant proof verifies valid signatures and rejects invalid signatures', () => {
	const key = bitcoin.ECPair.makeRandom({ network: sugarNetwork });
	const address = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork }).address;
	const publicKey = key.publicKey.toString('hex');
	const challenge = buildWalletGrantChallenge({
		address,
		publicKey,
		nonce: 'grant_test_nonce',
		expiresAt: '2026-06-27T12:00:00.000Z'
	});
	const digest = crypto.createHash('sha256').update(challenge).digest();
	const signature = key.sign(digest).toString('hex');
	assert.equal(verifyWalletGrantSignature({ publicKey, challengeText: challenge, signature }), true);
	assert.equal(verifyWalletGrantSignature({ publicKey, challengeText: challenge + 'x', signature }), false);
});

test('starter grant amount is exactly 0.025 SUGAR exclusive of grant wallet fee', () => {
	assert.equal(LINGRY_NEW_WALLET_GRANT_SUGAR, '0.025');
	assert.equal(sugarToSatoshis('0.025'), 2500000);
	assert.equal(LINGRY_NEW_WALLET_GRANT_SATOSHIS, 2500000);
	const grantKey = bitcoin.ECPair.fromWIF(bitcoin.ECPair.makeRandom({ network: sugarNetwork }).toWIF(), sugarNetwork);
	const recipientKey = bitcoin.ECPair.makeRandom({ network: sugarNetwork });
	const recipient = bitcoin.payments.p2wpkh({ pubkey: recipientKey.publicKey, network: sugarNetwork }).address;
	const grantAddress = bitcoin.payments.p2wpkh({ pubkey: grantKey.publicKey, network: sugarNetwork }).address;
	const script = bitcoin.payments.p2wpkh({ pubkey: grantKey.publicKey, network: sugarNetwork }).output.toString('hex');
	const raw = buildStarterGrantTransaction(grantKey, recipient, [{
		txid: '11'.repeat(32),
		vout: 0,
		script,
		value: 3000000
	}], LINGRY_NEW_WALLET_GRANT_SATOSHIS, 1000);
	const tx = bitcoin.Transaction.fromHex(raw);
	const recipientScript = bitcoin.address.toOutputScript(recipient, sugarNetwork).toString('hex');
	const grantScript = bitcoin.address.toOutputScript(grantAddress, sugarNetwork).toString('hex');
	const recipientOutput = tx.outs.find(output => output.script.toString('hex') === recipientScript);
	const changeOutput = tx.outs.find(output => output.script.toString('hex') === grantScript);
	assert.equal(recipientOutput.value, 2500000);
	assert.equal(changeOutput.value, 499000);
});
