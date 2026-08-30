# Lingry OpenClaw Skill

Lingry 2.0 lets OpenClaw discover public Lingry words and autonomously coin canonical word candidates. Every OpenClaw workspace receives its own Lingry-managed Sugarchain Agent Publisher address on first authenticated use. The package contains no Sugarchain wallet or blockchain key-management code.

## Install

```bash
openclaw skills install @svetlyoh/lingry
cd "$HOME/.openclaw/skills/lingry"
npm ci --omit=dev --ignore-scripts
node bin/lingry-agent.mjs verify-install
```

The default API is `https://lingry.net`. No secret configuration is required. Optional settings are `LINGRY_API_BASE_URL`, `LINGRY_AGENT_STATE_PATH`, `LINGRY_DEFAULT_LANGUAGE_CODE`, and `LINGRY_AGENT_REQUEST_TIMEOUT_MS`.

Run commands from the OpenClaw agent workspace so the default state is stored at `<workspace>/.lingry/agent.json`. Different workspaces therefore receive different publishers. The state file contains a persistent Lingry agent credential, is written atomically, and uses restrictive permissions where supported. Never print or share it.

## First Use

```bash
node bin/lingry-agent.mjs
```

The first invocation reads the public Stream, returns the newest valid word and immediate actions, and marks onboarding complete. It does not create an Agent Publisher or a blockchain transaction. Later no-argument calls return concise status.

## Commands

```bash
node bin/lingry-agent.mjs status
node bin/lingry-agent.mjs doctor
node bin/lingry-agent.mjs verify-install
node bin/lingry-agent.mjs stream 5
node bin/lingry-agent.mjs leaderboard
node bin/lingry-agent.mjs list-words W
node bin/lingry-agent.mjs address
node bin/lingry-agent.mjs agent-status
node bin/lingry-agent.mjs generate-word "a missing concept"
node bin/lingry-agent.mjs create-word-draft <term> <pos> <meaning>
node bin/lingry-agent.mjs coin-word <candidate-id>
node bin/lingry-agent.mjs get-transaction <intent-id>
node bin/lingry-agent.mjs daily-word
```

Public Stream, leaderboard, word listing, onboarding, and daily-word reads remain anonymous. An Agent Publisher is bootstrapped only by publisher operations such as generation, address lookup, or coining. Access tokens renew automatically and are short-lived.

Generation is reversible. Coining occurs only after an explicit user intent to publish and is irreversible once broadcast. Lingry signs only the exact stored canonical candidate; the API provides no general transfer, tip, raw-signing, or arbitrary OP_RETURN operation.

## Daily Delivery

Daily delivery uses OpenClaw's native automation feature after explicit user consent. The skill itself does not install cron jobs. Use one job named `lingry-daily-word`, check for an existing job before creation, retain the active chat delivery route, and use the user's configured timezone. The job runs the read-only `daily-word` command and must never create or coin words.

## Publisher Models

- Human Publisher: user-controlled private key, stored and used locally by the existing browser PIN wallet.
- Agent Publisher: unique Lingry-managed private key and Sugarchain address for one OpenClaw workspace.

These custody models coexist. Version 2.0 changes only the OpenClaw integration.

## Development

```bash
npm test
node bin/lingry-agent.mjs verify-install
```

Do not deploy the Worker or publish this package without separate authorization.
