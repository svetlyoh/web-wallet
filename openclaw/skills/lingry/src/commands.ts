import { LingryClient } from './client.js';

export function envConfig() {
	return {
		apiBaseUrl: process.env.LINGRY_API_BASE_URL || 'http://localhost:8787',
		keystorePath: process.env.LINGRY_KEYSTORE_PATH || '',
		passphrase: process.env.LINGRY_WALLET_PASSPHRASE || '',
		defaultLanguageCode: process.env.LINGRY_DEFAULT_LANGUAGE_CODE || 'W',
		maxAutoCoinFeeSatoshis: Number(process.env.LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS || 0),
		maxAutoTipSatoshis: Number(process.env.LINGRY_MAX_AUTO_TIP_SATOSHIS || 0)
	};
}

export function client(sessionToken = '') {
	const config = envConfig();
	return new LingryClient(config.apiBaseUrl, sessionToken);
}

