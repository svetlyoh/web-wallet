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

`SUGARCHAIN_RPC_URL` remains the preferred broadcast path. If it is not configured, Lingry transaction submission falls back to the public Sugar API broadcast endpoints unless `LINGRY_DISABLE_PUBLIC_SUGAR_BROADCAST=true` is set.

The public Lingry leaderboard/stream index can use an optional private R2 bucket binding named `LINGRY_PUBLIC_INDEX` with bucket `lingry-public-index`. If R2 is not enabled for the Cloudflare account, the Worker stores the latest public snapshot in D1 metadata and continues serving the public routes.

For local development, copy `.dev.vars.example` to `.dev.vars` and replace placeholders locally.

## Starter Grant Administration

Production starter grants are disabled by default. Enable them only after configuring a dedicated, limited-balance grant wallet. Do not use a main treasury wallet.

Secret name:

```powershell
npx wrangler secret put LINGRY_GRANT_WALLET_WIF
```

Do not put the WIF value in GitHub, `wrangler.jsonc`, `.dev.vars.example`, docs, logs, Telegram, D1, KV, R2, or terminal transcripts.

Non-secret Worker variables:

```text
LINGRY_SUGAR_GRANTS_ENABLED=true
LINGRY_GRANT_FUNDING_ADDRESS=<grant wallet public address>
LINGRY_GRANT_DAILY_BUDGET_SUGAR=<daily budget>
LINGRY_GRANT_MONTHLY_BUDGET_SUGAR=<monthly budget>
LINGRY_GRANT_MAX_PER_IP_DAY=<positive integer>
LINGRY_GRANT_FEE_SATOSHIS=<optional network fee>
```

The Worker derives the public address from `LINGRY_GRANT_WALLET_WIF` before broadcasting and fails closed unless it matches `LINGRY_GRANT_FUNDING_ADDRESS`.

Grant endpoints:

```text
POST /api/wallet-grants/challenge
POST /api/wallet-grants/claim
GET  /api/wallet-grants/status/<claim-id-or-address>
```

The recipient amount is exactly `0.025 SUGAR`; network fees are paid separately by the grant wallet.

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
