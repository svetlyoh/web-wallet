#!/usr/bin/env node

const baseUrl = (process.env.LINGRY_SMOKE_BASE_URL || process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');

const checks = [
	{ name: 'healthz', path: '/healthz', timeoutMs: 5000, expectStatus: 200 },
	{ name: 'root', path: '/', timeoutMs: 10000, expectAnyHttp: true },
	{ name: 'static asset', path: '/images/flags/us.svg', timeoutMs: 10000, expectAnyHttp: true },
	{ name: 'local api', path: '/v1/healthz', timeoutMs: 10000, expectAnyHttp: true }
];

async function fetchWithTimeout(url, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const started = Date.now();
	try {
		const response = await fetch(url, {
			method: 'GET',
			signal: controller.signal,
			headers: {
				'cache-control': 'no-store'
			}
		});
		await response.arrayBuffer();
		return {
			status: response.status,
			ms: Date.now() - started
		};
	} finally {
		clearTimeout(timer);
	}
}

let failed = false;

for (const check of checks) {
	const url = baseUrl + check.path;
	try {
		const result = await fetchWithTimeout(url, check.timeoutMs);
		const ok = check.expectAnyHttp ? result.status >= 100 && result.status <= 599 : result.status === check.expectStatus;
		console.log(JSON.stringify({
			ok,
			check: check.name,
			url,
			status: result.status,
			ms: result.ms
		}));
		if (!ok) {
			failed = true;
		}
	} catch (error) {
		failed = true;
		console.log(JSON.stringify({
			ok: false,
			check: check.name,
			url,
			error: error && error.name === 'AbortError' ? 'timeout' : (error && error.message ? error.message : 'request failed')
		}));
	}
}

if (failed) {
	process.exitCode = 1;
}
