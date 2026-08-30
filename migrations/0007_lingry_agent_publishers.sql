CREATE TABLE IF NOT EXISTS lingry_agent_publishers (
	agent_id TEXT PRIMARY KEY,
	client_type TEXT NOT NULL CHECK (client_type = 'openclaw'),
	client_instance_id_hash TEXT NOT NULL,
	publisher_address TEXT NOT NULL UNIQUE,
	publisher_public_key TEXT NOT NULL,
	encrypted_private_key TEXT NOT NULL,
	private_key_nonce TEXT NOT NULL,
	wrapped_dek TEXT NOT NULL,
	dek_nonce TEXT NOT NULL,
	key_encryption_version TEXT NOT NULL,
	credential_hash TEXT NOT NULL,
	bootstrap_ip_hash TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'active',
	funding_status TEXT NOT NULL DEFAULT 'pending',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	last_seen_at TEXT NOT NULL,
	last_coin_at TEXT NOT NULL DEFAULT '',
	UNIQUE (client_type, client_instance_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_lingry_agent_publishers_status_seen
	ON lingry_agent_publishers (status, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_lingry_agent_publishers_bootstrap_velocity
	ON lingry_agent_publishers (bootstrap_ip_hash, created_at);

CREATE TABLE IF NOT EXISTS lingry_agent_funding_events (
	funding_id TEXT PRIMARY KEY,
	agent_id TEXT NOT NULL UNIQUE,
	publisher_address TEXT NOT NULL,
	ip_hash TEXT NOT NULL,
	amount_satoshis INTEGER NOT NULL,
	status TEXT NOT NULL,
	txid TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (agent_id) REFERENCES lingry_agent_publishers(agent_id)
);

CREATE INDEX IF NOT EXISTS idx_lingry_agent_funding_events_budget
	ON lingry_agent_funding_events (status, created_at);
CREATE INDEX IF NOT EXISTS idx_lingry_agent_funding_events_ip
	ON lingry_agent_funding_events (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS lingry_agent_coin_operations (
	operation_id TEXT PRIMARY KEY,
	agent_id TEXT NOT NULL,
	candidate_id TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	status TEXT NOT NULL,
	fee_satoshis INTEGER NOT NULL,
	txid TEXT NOT NULL DEFAULT '',
	response_json TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (agent_id, idempotency_key),
	FOREIGN KEY (agent_id) REFERENCES lingry_agent_publishers(agent_id)
);

CREATE INDEX IF NOT EXISTS idx_lingry_agent_coin_operations_policy
	ON lingry_agent_coin_operations (agent_id, status, created_at);
