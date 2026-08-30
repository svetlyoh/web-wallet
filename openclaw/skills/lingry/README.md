# Lingry OpenClaw Skill 2.0.2

Lingry 2.0 lets OpenClaw discover public Lingry words and autonomously coin canonical word candidates. Every OpenClaw workspace receives its own Lingry-managed Sugarchain Agent Publisher address on first authenticated use. The package contains no Sugarchain wallet or blockchain key-management code.

## Install

```bash
cd ~/.openclaw/workspace
openclaw skills install '@svetlyoh/lingry'
```

Run those two lines exactly. The single quotes prevent the owner-qualified ClawHub reference from being misread by the shell or installer. The skill has no package-install step and requires no wallet, API token, encryption key, or other secret from the user.

To replace an older or incomplete workspace copy without any manual repair steps:

```bash
cd ~/.openclaw/workspace
openclaw skills install '@svetlyoh/lingry' --force
```

The default API is `https://lingry.net`. Optional settings are `LINGRY_API_BASE_URL`, `LINGRY_AGENT_STATE_PATH`, `LINGRY_DEFAULT_LANGUAGE_CODE`, and `LINGRY_AGENT_REQUEST_TIMEOUT_MS`; none is required for normal use.

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

Generation is reversible. On a clean installation, the first generation request creates the workspace credential, registers the dedicated Agent Publisher, obtains a short-lived session, and saves the candidate automatically. Lingry's publisher-key encryption remains entirely server-side. After generating a candidate, OpenClaw presents two explicit choices: **Coin this term** or **Prompt for another**. Asking for another candidate leaves the current one uncoined and never implies permission to publish the replacement. Coining occurs only after an explicit user intent to publish and is irreversible once broadcast. Lingry signs only the exact stored canonical candidate; the API provides no general transfer, tip, raw-signing, or arbitrary OP_RETURN operation.

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
