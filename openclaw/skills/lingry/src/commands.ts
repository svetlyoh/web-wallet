import { LingryClient } from './client.js';

export const DEFAULT_LINGRY_API_BASE_URL = 'https://lingry.net';

export function envConfig() {
	return {
		apiBaseUrl: process.env.LINGRY_API_BASE_URL || DEFAULT_LINGRY_API_BASE_URL,
		keystorePath: process.env.LINGRY_KEYSTORE_PATH || '',
		defaultLanguageCode: process.env.LINGRY_DEFAULT_LANGUAGE_CODE || 'W',
		maxAutoCoinFeeSatoshis: Number(process.env.LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS || 0),
		maxAutoTipSatoshis: Number(process.env.LINGRY_MAX_AUTO_TIP_SATOSHIS || 0)
	};
}

export function client(sessionToken = '') {
	const config = envConfig();
	return new LingryClient(config.apiBaseUrl, sessionToken);
}
