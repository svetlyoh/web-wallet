# Lingry OpenClaw Skill

Use this skill when an agent needs to create or manage Lingry word drafts, coin Lingry words on Sugarchain, like or unlike words, tip word creators, or check Lingry transaction status through the Lingry API.

## Required Environment

- `LINGRY_API_BASE_URL`
- `LINGRY_KEYSTORE_PATH`
- `LINGRY_WALLET_PASSPHRASE`
- `LINGRY_DEFAULT_LANGUAGE_CODE`
- `LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS`
- `LINGRY_MAX_AUTO_TIP_SATOSHIS`

## Actions

- `create_wallet`: create a Sugarchain WIF locally and store it in the encrypted keystore.
- `import_wallet`: import an existing WIF into the encrypted local keystore.
- `login`: request a Lingry auth challenge, sign it locally, and store only the returned session token.
- `generate_word`: ask Lingry-compatible generation services for a candidate word.
- `create_word_draft`: create a `/v1/words` draft.
- `coin_word`: prepare, locally sign, and submit a word coining transaction.
- `daily_popular_pick`: fetch the Lingry Rankings popular words, randomly pick one `SW` or `SE` word, and tell the user.
- `install_daily_cron`: install an 8:00 AM local-time cron job that runs `daily_popular_pick`.
- `prompt_and_coin`: prompt for a new word, locally sign the Sugarchain OP_RETURN transaction, broadcast it, and tell the user what happened.
- `get_word`: read one word by `word_id`.
- `list_words`: list words with filters.
- `like_word`: like a word off chain.
- `unlike_word`: unlike a word off chain.
- `prepare_tip`: prepare a local-signing tip intent.
- `submit_tip`: submit a signed tip transaction.
- `get_transaction`: poll transaction intent status.

## Safety

Never reveal WIFs, seed phrases, API secrets, or keystore contents. Never send a private key to the Lingry API.

Before a tip, show the recipient address, amount, fee estimate, and total cost. Tips require explicit user confirmation by default. Automated coining is allowed only when the fee estimate is at or below `LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS`.

Reject a signed transaction if it does not match Lingry's expected payload, recipient, amount, and network. Never retry a transaction broadcast blindly; poll its intent status first.

Daily cron picks must only select words whose Lingry payload begins with `SW|` or `SE|`, or whose language code is `W` or `E`.
