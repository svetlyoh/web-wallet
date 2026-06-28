#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
	api,
	buildCoinTransaction,
	chooseUtxos,
	createWalletRecord,
	defaultLanguageCode,
	installationIdFor,
	keysFromWallet,
	legacyApi,
	loadEncryptedWallet,
	readKeystoreHeader,
	readPendingRequest,
	resolveKeystorePath,
	saveEncryptedWallet,
	saveRequestResult,
	signGrantChallenge,
	sugarApi,
	walletFromWif
} from '../src/runtime.mjs';

process.umask(0o077);

const command = process.argv[2] || 'help';

function printJson(value) {
	console.log(JSON.stringify(value, null, 2));
}

function fail(message) {
	console.error(message);
	process.exitCode = 1;
}

function openTty() {
	if (process.env.LINGRY_WALLET_TEST_ALLOW_NON_TTY === 'true') {
		return null;
	}
	try {
		if (process.platform === 'win32') {
			return {
				inFd: fs.openSync('CONIN$', 'r'),
				outFd: fs.openSync('CONOUT$', 'w')
			};
		}
		return {
			inFd: fs.openSync('/dev/tty', 'r'),
			outFd: fs.openSync('/dev/tty', 'w')
		};
	} catch {
		throw new Error('Lingry wallet commands must be run from an interactive local terminal, not from an OpenClaw agent process, cron job, service, pipe, or chat transcript.');
	}
}

function setEcho(enabled) {
	if (process.platform === 'win32') return;
	spawnSync('sh', ['-c', `stty ${enabled ? 'echo' : '-echo'} < /dev/tty`], { stdio: 'ignore' });
}

function writeTty(tty, text) {
	if (!tty) {
		process.stderr.write(text);
		return;
	}
	fs.writeSync(tty.outFd, text);
}

function readLineTty(tty) {
	if (!tty) {
		return fs.readFileSync(0, 'utf8').split(/\r?\n/)[0] || '';
	}
	const chunks = [];
	const buf = Buffer.alloc(1);
	while (true) {
		const count = fs.readSync(tty.inFd, buf, 0, 1, null);
		if (count <= 0) break;
		const byte = buf[0];
		if (byte === 10 || byte === 13) break;
		chunks.push(byte);
	}
	return Buffer.from(chunks).toString('utf8');
}

function promptLine(tty, prompt, { hidden = false } = {}) {
	writeTty(tty, prompt);
	if (hidden) setEcho(false);
	try {
		return readLineTty(tty).trim();
	} finally {
		if (hidden) {
			setEcho(true);
			writeTty(tty, '\n');
		}
	}
}

function requirePrivateTerminal() {
	if (process.env.LINGRY_WALLET_PASSPHRASE) {
		throw new Error('Do not provide a Lingry wallet passphrase through an environment variable. Run this helper locally and type it only into the terminal prompt.');
	}
	return openTty();
}

function closeTty(tty) {
	if (!tty) return;
	try { fs.closeSync(tty.inFd); } catch {}
	try { fs.closeSync(tty.outFd); } catch {}
}

function requireFreshRequest(request) {
	if (request.expires_at && Date.parse(request.expires_at) < Date.now()) {
		throw new Error('This prepared Lingry request has expired. Prepare it again with lingry-agent.');
	}
}

function promptPassphrase(tty, { confirm = false } = {}) {
	const first = promptLine(tty, 'Wallet passphrase: ', { hidden: true });
	if (!first) throw new Error('Wallet passphrase is required.');
	if (confirm) {
		const second = promptLine(tty, 'Confirm wallet passphrase: ', { hidden: true });
		if (first !== second) throw new Error('Passphrases did not match.');
	}
	return first;
}

function showRequestSummary(tty, request) {
	writeTty(tty, '\nLingry request summary\n');
	writeTty(tty, `Type: ${request.type}\n`);
	writeTty(tty, `Request id: ${request.request_id}\n`);
	writeTty(tty, `Expires: ${request.expires_at || ''}\n`);
	writeTty(tty, `API: ${request.api?.baseUrl || ''}\n`);
	writeTty(tty, `Wallet: ${request.wallet?.address || ''}\n`);
	if (request.type === 'coin') {
		writeTty(tty, `Candidate: ${request.candidate?.term || request.candidate?.candidate_id || ''}\n`);
		writeTty(tty, `Meaning: ${request.candidate?.meaning || ''}\n`);
		writeTty(tty, `Fee: ${request.fee_satoshis} satoshis\n`);
	}
	if (request.type === 'grant') {
		writeTty(tty, 'Action: claim the Lingry starter grant for this wallet\n');
	}
	writeTty(tty, '\n');
}

async function setupWallet(tty) {
	const existing = readKeystoreHeader();
	if (existing.configured) {
		printJson({ ok: true, wallet: { address: existing.address, public_key: existing.public_key, keystore_path: existing.keystore_path }, note: 'A Lingry wallet is already configured.' });
		return;
	}
	const choice = promptLine(tty, 'Create a new wallet or import an existing WIF? [create/import] ');
	if (choice.toLowerCase().startsWith('i')) {
		await importWallet(tty);
		return;
	}
	await createWallet(tty);
}

async function createWallet(tty) {
	const { keystorePath } = resolveKeystorePath();
	const passphrase = promptPassphrase(tty, { confirm: true });
	const wallet = createWalletRecord();
	const header = saveEncryptedWallet(keystorePath, passphrase, wallet);
	printJson({
		ok: true,
		wallet: {
			address: header.address,
			public_key: header.public_key,
			keystore_path: header.keystore_path
		},
		next_step: 'node bin/lingry-agent.mjs prepare-starter-grant'
	});
}

async function importWallet(tty) {
	if (process.argv[3]) {
		throw new Error('Do not pass WIFs as command arguments. Run import-wallet and paste the WIF only into the hidden terminal prompt.');
	}
	const { keystorePath } = resolveKeystorePath();
	const wif = promptLine(tty, 'Wallet WIF to import: ', { hidden: true });
	const passphrase = promptPassphrase(tty, { confirm: true });
	const wallet = walletFromWif(wif);
	const header = saveEncryptedWallet(keystorePath, passphrase, wallet);
	printJson({
		ok: true,
		wallet: {
			address: header.address,
			public_key: header.public_key,
			keystore_path: header.keystore_path
		}
	});
}

function loadWalletAfterApproval(tty, request) {
	showRequestSummary(tty, request);
	const approval = promptLine(tty, 'Type BROADCAST to sign and submit, or anything else to cancel: ');
	if (approval !== 'BROADCAST') {
		throw new Error('Canceled. No signature was created and nothing was broadcast.');
	}
	const passphrase = promptPassphrase(tty);
	const wallet = loadEncryptedWallet(request.wallet.keystore_path, passphrase);
	if (wallet.address !== request.wallet.address || wallet.public_key !== request.wallet.public_key) {
		throw new Error('The unlocked wallet does not match the prepared Lingry request.');
	}
	return wallet;
}

async function approveCoin(tty) {
	const requestId = process.argv[3] || '';
	const request = readPendingRequest(requestId);
	if (request.type !== 'coin') throw new Error('This request is not a coin request.');
	requireFreshRequest(request);
	const wallet = loadWalletAfterApproval(tty, request);
	const keys = keysFromWallet(wallet);
	const requiredOutput = (request.required_outputs || []).find((output) => output.type === 'op_return');
	if (!requiredOutput?.payload) {
		throw new Error('Prepared coin request is missing its required OP_RETURN payload.');
	}
	const currentUtxos = await sugarApi('/unspent/' + encodeURIComponent(wallet.address) + '?amount=' + encodeURIComponent(Number(request.fee_satoshis) + 1));
	const selection = chooseUtxos(Array.isArray(currentUtxos) ? currentUtxos : [], Number(request.fee_satoshis));
	const raw = buildCoinTransaction(keys, wallet.address, requiredOutput.payload, selection.chosen, Number(request.fee_satoshis));
	const submitted = await api('/v1/transactions/' + encodeURIComponent(request.intent_id) + '/submit', {
		method: 'POST',
		body: JSON.stringify({
			language_code: request.candidate.language_code || defaultLanguageCode(),
			candidate_id: request.candidate.candidate_id,
			candidate_hash: request.candidate.candidate_hash,
			signed_transaction_hex: raw
		})
	});
	const result = saveRequestResult(requestId, {
		type: 'coin',
		status: submitted.transaction?.status || 'submitted',
		txid: submitted.transaction?.txid || '',
		intent_id: request.intent_id,
		word_id: submitted.word?.word_id || request.word_id || '',
		candidate_id: request.candidate.candidate_id,
		wallet_address: wallet.address,
		fee_satoshis: Number(request.fee_satoshis)
	});
	printJson({ ok: true, result });
}

async function claimGrant(tty) {
	const requestId = process.argv[3] || '';
	const request = readPendingRequest(requestId);
	if (request.type !== 'grant') throw new Error('This request is not a starter grant request.');
	requireFreshRequest(request);
	const wallet = loadWalletAfterApproval(tty, request);
	const keys = keysFromWallet(wallet);
	const signature = signGrantChallenge(keys, request.challenge.challenge);
	const claim = await legacyApi('/api/wallet-grants/claim', {
		method: 'POST',
		headers: { 'idempotency-key': request.challenge.claim_id || request.request_id },
		body: JSON.stringify({
			claim_id: request.challenge.claim_id,
			address: wallet.address,
			public_key: wallet.public_key,
			nonce: request.challenge.nonce,
			signature,
			installation_id: request.installation_id || installationIdFor(wallet.address, request.wallet.keystore_path)
		})
	});
	const grant = claim.startup_grant || claim;
	const result = saveRequestResult(requestId, {
		type: 'grant',
		status: grant.status || 'submitted',
		txid: grant.txid || '',
		wallet_address: wallet.address,
		requested_amount_sugar: grant.requested_amount_sugar || '0.025'
	});
	printJson({ ok: true, result });
}

async function main() {
	let tty = null;
	try {
		if (command === 'help' || command === '--help' || command === '-h') {
			console.log('Usage: lingry-wallet setup | create-wallet | import-wallet | inspect | approve <request-id> | claim-grant <request-id>');
			return;
		}
		tty = requirePrivateTerminal();
		if (command === 'setup') {
			await setupWallet(tty);
			return;
		}
		if (command === 'create-wallet') {
			await createWallet(tty);
			return;
		}
		if (command === 'import-wallet') {
			await importWallet(tty);
			return;
		}
		if (command === 'inspect') {
			const wallet = readKeystoreHeader();
			printJson({ ok: true, wallet });
			return;
		}
		if (command === 'approve') {
			await approveCoin(tty);
			return;
		}
		if (command === 'claim-grant') {
			await claimGrant(tty);
			return;
		}
		throw new Error('Unknown wallet command. Usage: lingry-wallet setup | create-wallet | import-wallet | inspect | approve <request-id> | claim-grant <request-id>');
	} finally {
		closeTty(tty);
	}
}

main().catch((error) => {
	fail(error.message || String(error));
});
