import crypto from 'node:crypto';
import bitcoin from 'bitcoinjs-lib';

const baseUrl = String(process.env.LINGRY_LOCAL_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const sugarNetwork = {
	messagePrefix: '\x19Sugarchain Signed Message:\n',
	bip32: { public: 0x0488b21e, private: 0x0488ade4 },
	bech32: 'sugar',
	pubKeyHash: 0x3F,
	scriptHash: 0x7D,
	wif: 0x80
};

function wallet() {
	const keys = bitcoin.ECPair.makeRandom({ network: sugarNetwork });
	const address = bitcoin.payments.p2wpkh({ pubkey: keys.publicKey, network: sugarNetwork }).address;
	return { keys, address, publicKey: keys.publicKey.toString('hex') };
}

function signature(keys, message) {
	return keys.sign(crypto.createHash('sha256').update(message).digest()).toString('hex');
}

async function post(path, body, expectedStatus = 200) {
	const serialized = JSON.stringify(body);
	if (/"(?:wif|private_key|privateKey|pin)"\s*:/i.test(serialized)) {
		throw new Error('Smoke test refused a secret-bearing request body.');
	}
	const response = await fetch(baseUrl + path, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'idempotency-key': 'lingry-auth-smoke-' + crypto.randomUUID()
		},
		body: serialized
	});
	const json = await response.json();
	if (response.status !== expectedStatus) {
		throw new Error(`${path} returned ${response.status}: ${json?.error?.message || 'unknown error'}`);
	}
	return json;
}

async function prove(walletIdentity, action) {
	const challengeResponse = await post('/v1/auth/challenge', {
		address: walletIdentity.address,
		public_key: walletIdentity.publicKey,
		auth_action: action,
		client_name: 'Lingry local auth smoke',
		requested_scopes: ['identity:read', 'wallet:read', 'words:create']
	}, 201);
	const challenge = challengeResponse.data;
	const proof = {
		challenge_id: challenge.challenge_id,
		address: walletIdentity.address,
		public_key: walletIdentity.publicKey,
		signature: signature(walletIdentity.keys, challenge.message),
		auth_action: action
	};
	const verified = await post('/v1/auth/wallet', proof);
	return { challenge, proof, verified: verified.data };
}

const createdWallet = wallet();
const created = await prove(createdWallet, 'start-new');
if (created.verified.address !== createdWallet.address || created.verified.auth_version !== 'wallet-pin-v1') {
	throw new Error('Start New did not return the expected wallet identity.');
}

const recovered = await prove(createdWallet, 'recover');
if (recovered.verified.identity.user_id !== created.verified.identity.user_id) {
	throw new Error('Recovery created a duplicate wallet identity.');
}

const replay = await post('/v1/auth/wallet', created.proof, 409);
if (replay.error?.code !== 'nonce_reused') {
	throw new Error('A consumed challenge was not rejected as a replay.');
}

const unknownWallet = wallet();
const unknownChallenge = (await post('/v1/auth/challenge', {
	address: unknownWallet.address,
	public_key: unknownWallet.publicKey,
	auth_action: 'recover',
	client_name: 'Lingry local unknown-wallet smoke',
	requested_scopes: ['identity:read']
}, 201)).data;
const imported = await post('/v1/auth/wallet', {
	challenge_id: unknownChallenge.challenge_id,
	address: unknownWallet.address,
	public_key: unknownWallet.publicKey,
	signature: signature(unknownWallet.keys, unknownChallenge.message),
	auth_action: 'recover'
});
if (imported.data.address !== unknownWallet.address || imported.data.identity.legacy_source !== 'wallet-proof-recovery') {
	throw new Error('A valid legacy wallet key was not restored from signed wallet proof.');
}

console.log(JSON.stringify({
	ok: true,
	start_new: 'created',
	recovery: 'same-identity',
	replay: 'rejected',
	legacy_wallet_recovery: 'restored-from-proof',
	private_key_transmitted: false,
	pin_transmitted: false
}, null, 2));
