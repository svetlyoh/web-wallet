import bitcoin from 'bitcoinjs-lib';
import nodeCrypto from 'node:crypto';

export const LINGRY_NEW_WALLET_GRANT_SUGAR = '0.025';
export const LINGRY_NEW_WALLET_GRANT_SATOSHIS = 2500000;
export const SUGAR_DECIMALS = 8;

export const sugarNetwork = {
	messagePrefix: '\x19Sugarchain Signed Message:\n',
	bip32: {
		public: 0x0488b21e,
		private: 0x0488ade4
	},
	bech32: 'sugar',
	pubKeyHash: 0x3F,
	scriptHash: 0x7D,
	wif: 0x80
};

export function sugarToSatoshis(value) {
	const text = String(value || '0').trim();
	const [whole, fraction = ''] = text.split('.');
	const decimals = (fraction + '0'.repeat(SUGAR_DECIMALS)).slice(0, SUGAR_DECIMALS);
	return Number(BigInt(whole || '0') * 100000000n + BigInt(decimals || '0'));
}

export function buildWalletGrantChallenge({ address, publicKey, nonce, expiresAt }) {
	return [
		'Lingry starter grant v1',
		'address=' + address,
		'public_key=' + publicKey,
		'nonce=' + nonce,
		'expires_at=' + expiresAt,
		'amount_sugar=' + LINGRY_NEW_WALLET_GRANT_SUGAR
	].join('\n');
}

export function verifyWalletGrantSignature({ publicKey, challengeText, signature }) {
	try {
		const key = bitcoin.ECPair.fromPublicKey(Buffer.from(publicKey, 'hex'), sugarNetwork);
		const digest = nodeCrypto.createHash('sha256').update(challengeText).digest();
		return key.verify(digest, Buffer.from(String(signature || '').replace(/^0x/i, ''), 'hex'));
	} catch (error) {
		return false;
	}
}

function getP2WPKHScript(pubkey) {
	return bitcoin.payments.p2wpkh({ pubkey, network: sugarNetwork });
}

function getP2SHScript(redeem) {
	return bitcoin.payments.p2sh({ redeem, network: sugarNetwork });
}

function getScriptType(script) {
	if (script[0] === bitcoin.opcodes.OP_0 && script[1] === 0x14) {
		return 'bech32';
	}
	if (script[0] === bitcoin.opcodes.OP_HASH160 && script[1] === 0x14 && script[22] === bitcoin.opcodes.OP_EQUAL) {
		return 'segwit';
	}
	if (script[0] === bitcoin.opcodes.OP_DUP && script[1] === bitcoin.opcodes.OP_HASH160 && script[2] === 0x14 && script[23] === bitcoin.opcodes.OP_EQUALVERIFY && script[24] === bitcoin.opcodes.OP_CHECKSIG) {
		return 'legacy';
	}
	return '';
}

function getUtxoScriptHex(utxo) {
	if (typeof utxo.script === 'string') {
		return utxo.script;
	}
	if (typeof utxo.scriptPubKey === 'string') {
		return utxo.scriptPubKey;
	}
	if (utxo.scriptPubKey && typeof utxo.scriptPubKey.hex === 'string') {
		return utxo.scriptPubKey.hex;
	}
	return '';
}

export function buildStarterGrantTransaction(keys, recipientAddress, utxos, amountSatoshis, feeSatoshis) {
	const grantAddress = getP2WPKHScript(keys.publicKey).address;
	const txb = new bitcoin.TransactionBuilder(sugarNetwork);
	const scripts = [];
	let totalValue = 0;
	txb.setVersion(2);
	for (const utxo of utxos) {
		const txid = utxo.txid;
		const index = utxo.index !== undefined ? utxo.index : utxo.vout;
		const script = Buffer.from(getUtxoScriptHex(utxo), 'hex');
		const type = getScriptType(script);
		const value = Number(utxo.value || 0);
		totalValue += value;
		if (type === 'bech32') {
			const p2wpkh = getP2WPKHScript(keys.publicKey);
			txb.addInput(txid, index, null, p2wpkh.output);
		} else {
			txb.addInput(txid, index);
		}
		scripts.push({ type, value });
	}
	if (totalValue < amountSatoshis + feeSatoshis) {
		throw new Error('Starter wallet has insufficient spendable balance.');
	}
	txb.addOutput(recipientAddress, amountSatoshis);
	const change = totalValue - amountSatoshis - feeSatoshis;
	if (change > 0) {
		txb.addOutput(grantAddress, change);
	}
	for (let index = 0; index < scripts.length; index++) {
		if (scripts[index].type === 'bech32') {
			txb.sign(index, keys, null, null, scripts[index].value, null);
		} else if (scripts[index].type === 'segwit') {
			const redeem = getP2WPKHScript(keys.publicKey);
			const p2sh = getP2SHScript(redeem);
			txb.sign(index, keys, p2sh.redeem.output, null, scripts[index].value, null);
		} else if (scripts[index].type === 'legacy') {
			txb.sign(index, keys);
		} else {
			throw new Error('Unsupported starter wallet UTXO script type.');
		}
	}
	return txb.build().toHex();
}
