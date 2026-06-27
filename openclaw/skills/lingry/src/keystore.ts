import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export type LingryKeystore = {
	version: 1;
	kdf: 'scrypt';
	cipher: 'aes-256-gcm';
	address: string;
	public_key: string;
	salt: string;
	iv: string;
	tag: string;
	ciphertext: string;
};

function derive(passphrase: string, salt: Buffer) {
	return crypto.scryptSync(passphrase, salt, 32, SCRYPT_OPTIONS);
}

export function saveEncryptedWif(filePath: string, passphrase: string, address: string, publicKey: string, wif: string) {
	const salt = crypto.randomBytes(16);
	const iv = crypto.randomBytes(12);
	const key = derive(passphrase, salt);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(wif, 'utf8'), cipher.final()]);
	const store: LingryKeystore = {
		version: 1,
		kdf: 'scrypt',
		cipher: 'aes-256-gcm',
		address,
		public_key: publicKey,
		salt: salt.toString('base64'),
		iv: iv.toString('base64'),
		tag: cipher.getAuthTag().toString('base64'),
		ciphertext: ciphertext.toString('base64')
	};
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(store, null, 2), { mode: 0o600 });
	return store;
}

export function loadEncryptedWif(filePath: string, passphrase: string) {
	const store = JSON.parse(fs.readFileSync(filePath, 'utf8')) as LingryKeystore;
	if (store.version !== 1 || store.kdf !== 'scrypt' || store.cipher !== 'aes-256-gcm') {
		throw new Error('Unsupported Lingry keystore format.');
	}
	const key = derive(passphrase, Buffer.from(store.salt, 'base64'));
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(store.iv, 'base64'));
	decipher.setAuthTag(Buffer.from(store.tag, 'base64'));
	const wif = Buffer.concat([decipher.update(Buffer.from(store.ciphertext, 'base64')), decipher.final()]).toString('utf8');
	return { ...store, wif };
}

