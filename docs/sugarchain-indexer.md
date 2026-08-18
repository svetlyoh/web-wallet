# Sugarchain Indexer

The Worker does not scan the entire Sugarchain chain. Run `scripts/sugarchain-indexer.ts` on a trusted machine with Sugarchain RPC access.

## Responsibilities

- Persist a block cursor.
- Read new blocks through Sugarchain RPC.
- Parse OP_RETURN outputs.
- Accept payloads beginning with `S` plus a configured language code, then `|`.
- Send valid records to `POST /v1/internal/indexer/ingest`.
- Include transaction id, block height, timestamp, language code, word, part of speech, meaning, creator address when derivable, and raw payload.
- Keep basic reorg safety by rewinding a configurable confirmation window.

## Environment

- `SUGARCHAIN_RPC_URL`
- `SUGARCHAIN_RPC_USERNAME`
- `SUGARCHAIN_RPC_PASSWORD`
- `LINGRY_API_BASE_URL`
- `INTERNAL_INDEXER_SECRET`
- `LINGRY_INDEXER_STATE_PATH`
- `LINGRY_INDEXER_CONFIRMATIONS`
- `LINGRY_INDEXER_START_HEIGHT`
- `LINGRY_INDEXER_END_HEIGHT`
- `LINGRY_INDEXER_MAX_BLOCKS` (defaults to `1000`)

The Worker, trusted ingest route, and RPC indexer all import the same protocol parser. Current 4-, 5-, and 6-part Lingry payloads therefore have identical language, word, part-of-speech, etymology, and meaning validation.

Run:

```powershell
node --loader ts-node/esm scripts/sugarchain-indexer.ts
```

If you do not use `ts-node`, copy the TypeScript into your trusted indexer runtime and compile it with your preferred TypeScript toolchain.

## Bounded historical repair

First inspect D1 metadata and the most recent indexed words. Choose a start block safely before the first missing period; do not infer a block number from a date.

```powershell
npx wrangler d1 execute lingry-social --remote --command "SELECT key, value, updated_at FROM lingry_index_meta WHERE key IN ('public_index_last_success_at','public_index_last_error','public_index_last_scanned_height','public_index_last_scanned_block_hash','public_index_last_snapshot_key') ORDER BY key"
npx wrangler d1 execute lingry-social --remote --command "SELECT txid, word, block_height, block_hash, tx_time, indexed_at FROM lingry_words ORDER BY COALESCE(tx_time, indexed_at) DESC LIMIT 100"
```

Use a separate repair state file so the normal indexer cursor is untouched:

```powershell
$env:LINGRY_INDEXER_START_HEIGHT="<confirmed-height-before-gap>"
$env:LINGRY_INDEXER_END_HEIGHT="<bounded-target-height>"
$env:LINGRY_INDEXER_MAX_BLOCKS="1000"
$env:LINGRY_INDEXER_STATE_PATH="data\lingry-backfill-2026-08.json"
node --loader ts-node/esm scripts/sugarchain-indexer.ts
```

Repeat bounded runs until the selected target is reached. Ingest upserts `lingry_words` by transaction ID and is safe to replay. Never commit the repair state file or RPC/indexer credentials. After repair, allow or invoke a successful scheduled refresh, then verify `/v1/stream?limit=100` and `/api/words/latest?limit=100&filter=all`.
