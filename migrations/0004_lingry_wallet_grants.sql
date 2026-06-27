CREATE TABLE IF NOT EXISTS lingry_wallet_grant_challenges (
	claim_id TEXT PRIMARY KEY,
	address TEXT NOT NULL,
	public_key TEXT NOT NULL,
	nonce TEXT NOT NULL UNIQUE,
	challenge_text TEXT NOT NULL,
	installation_id TEXT NOT NULL DEFAULT '',
	ip_hash TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	claimed_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_lingry_wallet_grant_challenges_expires
ON lingry_wallet_grant_challenges(expires_at);

CREATE TABLE IF NOT EXISTS lingry_wallet_grants (
	grant_id TEXT PRIMARY KEY,
	claim_id TEXT NOT NULL,
	address TEXT NOT NULL UNIQUE,
	public_key TEXT NOT NULL UNIQUE,
	installation_id TEXT NOT NULL DEFAULT '',
	ip_hash TEXT NOT NULL DEFAULT '',
	amount_satoshis INTEGER NOT NULL,
	status TEXT NOT NULL,
	txid TEXT NOT NULL DEFAULT '',
	safe_message TEXT NOT NULL DEFAULT '',
	idempotency_key TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lingry_wallet_grants_status_updated
ON lingry_wallet_grants(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_lingry_wallet_grants_ip_updated
ON lingry_wallet_grants(ip_hash, updated_at);
