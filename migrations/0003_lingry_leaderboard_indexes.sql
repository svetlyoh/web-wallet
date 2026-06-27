CREATE INDEX IF NOT EXISTS idx_lingry_words_language_word
ON lingry_words(language_code, word);

CREATE INDEX IF NOT EXISTS idx_lingry_words_block_height
ON lingry_words(block_height);

CREATE INDEX IF NOT EXISTS idx_lingry_words_creator_block
ON lingry_words(creator_address, block_height);

CREATE INDEX IF NOT EXISTS idx_lingry_likes_word_created
ON lingry_likes(word_txid, created_at);

CREATE INDEX IF NOT EXISTS idx_lingry_tips_word_amount
ON lingry_tips(word_txid, amount_satoshis);
