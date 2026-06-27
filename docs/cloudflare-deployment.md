# Cloudflare Deployment

## Setup

The current deployable Worker requires the Durable Objects declared in `wrangler.jsonc` and the existing D1 database binding:

```powershell
npm run db:migrate:remote
npm run deploy:cloud
```

Do not leave placeholder KV IDs in `wrangler.jsonc`. The optional `LINGRY_METADATA` R2 binding is only needed if the Cloudflare account has R2 enabled and the Worker is configured to store metadata there.

## Secrets

Set placeholders with real values in Cloudflare, never in Git:

```powershell
npx wrangler secret put SUGARCHAIN_RPC_URL
npx wrangler secret put SUGARCHAIN_RPC_USERNAME
npx wrangler secret put SUGARCHAIN_RPC_PASSWORD
npx wrangler secret put LINGRY_SESSION_SECRET
npx wrangler secret put LINGRY_WEBHOOK_SECRET
npx wrangler secret put MINIMAX_API_KEY
npx wrangler secret put INTERNAL_INDEXER_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

For local development, copy `.dev.vars.example` to `.dev.vars` and replace placeholders locally.

## Durable Objects

The Worker exports:

- `LexiconShardDO`
- `ActorDO`
- `FeedDO`
- `WebhookDO`

`wrangler.jsonc` includes a SQLite Durable Object migration tagged `v1-lingry-agent-api`.

## Local Development

```powershell
npm install
npm test
npm run db:migrate:local
npm run dev:lan
```

The legacy local wallet server still runs with:

```powershell
npm start
```

## Rollback

Keep the previous Worker version available in Cloudflare deployments. Roll back the Worker first, then pause the external Sugarchain indexer. Do not delete Durable Object classes during rollback; they contain authoritative mutable state.
