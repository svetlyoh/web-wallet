export function isScanBudgetError(error) {
	return error?.code === 'scan_budget_exhausted';
}

// One budget per invocation, shared by ranges, pagination, retries and tx lookups.
// Leave headroom below Free's 50 external requests; D1 writes must still finish.
export function createScanBudget(limit = 32, durationMs = 45000, now = Date.now) {
	const deadline = now() + durationMs;
	return {
		limit,
		used: 0,
		preferredBase: 'https://api.sugarchain.org',
		take() {
			if (this.used >= this.limit || now() >= deadline) {
				const error = new Error('Scan paused at its request or time budget; the next batch resumes the saved checkpoint.');
				error.code = 'scan_budget_exhausted';
				throw error;
			}
			this.used++;
		}
	};
}
