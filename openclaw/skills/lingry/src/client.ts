export class LingryClient {
	baseUrl: string;
	sessionToken: string;

	constructor(baseUrl: string, sessionToken = '') {
		this.baseUrl = baseUrl.replace(/\/+$/, '');
		this.sessionToken = sessionToken;
	}

	async request(path: string, options: RequestInit = {}) {
		const headers = new Headers(options.headers || {});
		headers.set('content-type', headers.get('content-type') || 'application/json');
		if (this.sessionToken) {
			headers.set('authorization', 'Bearer ' + this.sessionToken);
		}
		if (!headers.has('idempotency-key') && options.method && options.method !== 'GET') {
			headers.set('idempotency-key', 'openclaw-' + crypto.randomUUID());
		}
		const response = await fetch(this.baseUrl + path, { ...options, headers });
		const json = await response.json().catch(() => null);
		if (!response.ok || !json?.ok) {
			throw new Error(json?.error?.message || 'Lingry API request failed.');
		}
		return json.data;
	}
}

