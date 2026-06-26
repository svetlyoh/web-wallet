# Lingry Social D1 Design

Lingry uses Sugarchain as the source of truth for coined words and SUGAR transfers. Cloudflare D1 is used as a fast social index for stream likes, tip summaries, and txid-to-word metadata.

## Cloudflare Binding

Create the database:

```powershell
pnpm dlx wrangler d1 create lingry-social
```

Add the returned database id to `wrangler.jsonc`:

```jsonc
"d1_databases": [
	{
		"binding": "LINGRY_DB",
		"database_name": "lingry-social",
		"database_id": "YOUR_DATABASE_ID"
	}
]
```

Apply the schema:

```powershell
pnpm dlx wrangler d1 migrations apply lingry-social --remote
```

## Tables

- `lingry_words`: cached Sugarchain OP_RETURN word records keyed by word transaction id.
- `lingry_likes`: one like per `word_txid + liker_address`.
- `lingry_tips`: one recorded tip per Sugarchain tip transaction id.

## Runtime Behavior

- Blockchain scans persist discovered word records to D1 when `LINGRY_DB` is configured.
- Stream cards request `/api/social/summary` for visible txids.
- Likes are off-chain social metadata in D1.
- Tips are real Sugarchain transactions. Lingry stores the tip txid after broadcast for fast stream totals.

If `LINGRY_DB` is not configured, the Worker keeps returning normal stream data and social actions return a clear configuration error. The local Node server uses an in-memory fallback for development.
