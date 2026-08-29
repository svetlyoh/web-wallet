CREATE TABLE IF NOT EXISTS lingry_identities (
	user_id TEXT PRIMARY KEY,
	wallet_address TEXT NOT NULL,
	normalized_wallet_address TEXT NOT NULL UNIQUE,
	wallet_public_key TEXT NOT NULL DEFAULT '',
	handle TEXT NOT NULL DEFAULT '',
	display_name TEXT NOT NULL DEFAULT '',
	profile_json TEXT NOT NULL DEFAULT '{}',
	auth_version TEXT NOT NULL DEFAULT 'wallet-pin-v1',
	legacy_source TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lingry_identities_wallet
ON lingry_identities(normalized_wallet_address);

CREATE INDEX IF NOT EXISTS idx_lingry_identities_last_seen
ON lingry_identities(last_seen_at DESC);
