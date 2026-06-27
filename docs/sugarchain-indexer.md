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

Run:

```powershell
node --loader ts-node/esm scripts/sugarchain-indexer.ts
```

If you do not use `ts-node`, copy the TypeScript into your trusted indexer runtime and compile it with your preferred TypeScript toolchain.
