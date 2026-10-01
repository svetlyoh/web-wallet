CREATE TABLE IF NOT EXISTS lingry_index_runs (
	run_id TEXT PRIMARY KEY,
	mode TEXT NOT NULL,
	started_at TEXT NOT NULL,
	finished_at TEXT NOT NULL,
	status TEXT NOT NULL,
	start_height INTEGER,
	end_height INTEGER,
	checkpoint_height INTEGER,
	scanned_blocks INTEGER NOT NULL,
	upstream_requests INTEGER NOT NULL,
	error TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lingry_index_runs_started ON lingry_index_runs (started_at DESC);
CREATE TABLE IF NOT EXISTS lingry_index_tx_checks (
	block_hash TEXT NOT NULL,
	txid TEXT NOT NULL,
	records_json TEXT NOT NULL,
	PRIMARY KEY (block_hash, txid)
);
