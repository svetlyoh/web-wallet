CREATE TABLE IF NOT EXISTS lingry_words (
	txid TEXT PRIMARY KEY,
	word TEXT NOT NULL DEFAULT '',
	meaning TEXT NOT NULL DEFAULT '',
	etymology_meaning TEXT NOT NULL DEFAULT '',
	language_code TEXT NOT NULL DEFAULT 'W',
	part_of_speech TEXT NOT NULL DEFAULT '',
	creator_address TEXT NOT NULL DEFAULT '',
	block_height INTEGER,
	block_hash TEXT NOT NULL DEFAULT '',
	tx_time TEXT NOT NULL DEFAULT '',
	op_return_payload TEXT NOT NULL DEFAULT '',
	op_return_hex TEXT NOT NULL DEFAULT '',
	indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lingry_words_time ON lingry_words(tx_time DESC, block_height DESC);
CREATE INDEX IF NOT EXISTS idx_lingry_words_creator ON lingry_words(creator_address);

CREATE TABLE IF NOT EXISTS lingry_likes (
	word_txid TEXT NOT NULL,
	liker_address TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (word_txid, liker_address)
);

CREATE INDEX IF NOT EXISTS idx_lingry_likes_word ON lingry_likes(word_txid);

CREATE TABLE IF NOT EXISTS lingry_tips (
	tip_txid TEXT PRIMARY KEY,
	word_txid TEXT NOT NULL,
	from_address TEXT NOT NULL,
	to_address TEXT NOT NULL,
	amount_satoshis INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lingry_tips_word ON lingry_tips(word_txid);
