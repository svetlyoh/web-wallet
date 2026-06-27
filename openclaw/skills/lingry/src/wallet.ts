import bitcoin from 'bitcoinjs-lib';

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

export function createWallet() {
	const key = bitcoin.ECPair.makeRandom({ network: sugarNetwork });
	return walletFromKey(key);
}

export function importWallet(wif: string) {
	return walletFromKey(bitcoin.ECPair.fromWIF(wif, sugarNetwork));
}

function walletFromKey(key: bitcoin.ECPairInterface) {
	const payment = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: sugarNetwork });
	return {
		address: payment.address || '',
		public_key: key.publicKey.toString('hex'),
		wif: key.toWIF()
	};
}

