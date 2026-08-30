---
name: lingry
description: Create and permanently coin new words on Sugarchain, or discover the latest words from Lingry's public Stream. On first use, show the newest Lingry word and offer immediate word creation or discovery.
version: 2.0.0
homepage: https://lingry.net
metadata:
  openclaw:
    requires:
      bins:
        - node
        - npm
    envVars:
      - name: LINGRY_API_BASE_URL
        required: false
        description: Optional HTTPS Lingry API base URL. Defaults to https://lingry.net.
      - name: LINGRY_AGENT_STATE_PATH
        required: false
        description: Optional override for workspace-specific Lingry agent state.
      - name: LINGRY_DEFAULT_LANGUAGE_CODE
        required: false
        description: Default Lingry language code. Defaults to W.
      - name: LINGRY_AGENT_REQUEST_TIMEOUT_MS
        required: false
        description: Timeout for Lingry HTTP requests.
---

# Lingry for OpenClaw

Lingry lets OpenClaw agents discover, create, and permanently coin new words on Sugarchain. Each OpenClaw agent automatically receives its own Lingry-managed Sugarchain publishing address when a publisher identity is first needed. Public discovery needs no account. OpenClaw never handles the blockchain signing key.

## First Use — Engage Immediately

On the first use of this skill, run:

```bash
node bin/lingry-agent.mjs
```

Immediately render the returned newest public Stream word. Do not begin with setup instructions. Then offer these two primary actions:

- Invent a new word.
- Show me the 5 latest words.

Finally ask: “I can send you one new Lingry word every day. Want me to set that up?”

Prefer demonstrating Lingry over explaining it. The no-argument command records onboarding in the current OpenClaw workspace at `.lingry/agent.json`, so `/new`, chat resets, gateway restarts, and machine restarts do not repeat the full welcome. `LINGRY_AGENT_STATE_PATH` is an explicit override.

The onboarding Stream request is anonymous and read-only. It must not create an Agent Publisher, fund an address, sign anything, or broadcast anything. If the Stream is unavailable, say so and still offer creation, coining, and discovery; never invent a featured word.

## Discovery

Public commands require no identity:

```bash
node bin/lingry-agent.mjs stream 5
node bin/lingry-agent.mjs leaderboard
node bin/lingry-agent.mjs list-words W
node bin/lingry-agent.mjs daily-word
```

Use `stream 5` when the user asks for the five latest words. Keep the presentation compact. Reading public data must never bootstrap a publisher.

## Create and Coin

Generate a reversible candidate:

```bash
node bin/lingry-agent.mjs generate-word "a concept that needs a word"
node bin/lingry-agent.mjs create-word-draft <term> <part-of-speech> <meaning>
```

Do not put a generated candidate on Sugarchain unless the user's request clearly includes coin, publish, post, or record on Sugarchain.

When the user explicitly requests permanent publication, run:

```bash
node bin/lingry-agent.mjs coin-word <candidate-id>
```

Coining is irreversible. There is no second transaction-approval step. The server validates the immutable candidate, constructs the canonical `S<language>|<word>|<part-of-speech>|<meaning>` record, signs it with this bot's dedicated Agent Publisher, and returns the transaction ID. Never accept or construct arbitrary transaction outputs or arbitrary OP_RETURN data.

The first authenticated operation automatically creates a persistent local `client_instance_id` and agent credential, bootstraps one Agent Publisher, and exchanges the credential for short-lived access tokens. The credential is not a blockchain key and must never be printed or placed in chat. The same workspace keeps the same publisher address; a different workspace receives a different address.

Useful identity commands:

```bash
node bin/lingry-agent.mjs agent-status
node bin/lingry-agent.mjs address
node bin/lingry-agent.mjs get-transaction <intent-id>
```

## Daily Lingry Word

The daily word is opt-in. Installation is not consent. Do not create any automation until the user explicitly agrees.

After an affirmative reply, use OpenClaw's native persistent automation interface. Do not edit cron files, databases, Gateway state, or hidden APIs. Use the stable name `lingry-daily-word` and keep the job with the same OpenClaw agent and active chat delivery route.

Before creating it, check whether an active `lingry-daily-word` job already exists for this user/agent context. If it exists, do not duplicate it; update its schedule only when requested. If the user did not specify a time, ask what time they prefer and use their configured OpenClaw timezone.

The automation prompt should say:

> Fetch the current public Lingry Stream using `node bin/lingry-agent.mjs daily-word`. Select one recent word not recently sent when history is available. Send only the word, part of speech, and concise meaning. Do not create an Agent Publisher, generate or coin a word, fund a wallet, sign a transaction, or broadcast anything.

Recognize requests to stop or disable the Daily Lingry Word. Use the native OpenClaw automation interface to disable or remove the existing job and confirm succinctly. If automation permission is unavailable, explain that OpenClaw needs that permission; do not work around it.

## Custody and Authority

Human Lingry publishers remain non-custodial: their keys stay in their browser/device and the existing PIN wallet signs human transactions.

OpenClaw Agent Publishers are different: Lingry manages a unique server-side Sugarchain key and address for each bot. OpenClaw receives only a constrained Lingry credential. Do not describe Agent Publishers as non-custodial.

OpenClaw may read public data, generate candidates, coin its own canonical candidates, view its publisher address, and view transaction results. It must never attempt general SUGAR transfers, tipping, key export, arbitrary transaction signing, arbitrary OP_RETURN records, recipient changes, or change-address changes.

## Safety

- Never request, receive, display, inspect, transmit, summarize, or log any human or Agent Publisher blockchain secret, WIF, mnemonic, seed, recovery phrase, funding-wallet secret, or local agent credential.
- Never ask the user to visit Lingry, install a cryptocurrency wallet, import a key, configure a browser API session, or paste an API token for normal OpenClaw use.
- Never claim a word was coined unless the API returns a transaction result.
- Never create recurring notifications without explicit user consent.
- Never claim OpenClaw guarantees code execution immediately after installation. Run onboarding on the first available turn where the skill is available.

## Commands

```text
status, doctor, verify-install
stream, leaderboard, list-words, daily-word
agent-status, address
generate-word, create-word-draft, coin-word
get-transaction
```

The version 1 local-wallet, grant-preparation, transaction-preparation, and approval commands are removed.
