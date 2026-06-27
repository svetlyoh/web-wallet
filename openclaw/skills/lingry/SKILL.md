---
name: lingry
description: Create, discover, and interact with Lingry words using a local Sugarchain wallet and explicit transaction confirmation.
version: 1.0.0
homepage: https://lingry.net
metadata:
  openclaw:
    requires:
      bins:
        - node
        - npm
    envVars:
      - name: LINGRY_API_BASE_URL
        required: true
        description: Lingry API base URL used for public API requests and signed transaction intents.
      - name: LINGRY_KEYSTORE_PATH
        required: false
        description: Optional path to the local encrypted Lingry keystore.
      - name: LINGRY_WALLET_PASSPHRASE
        required: false
        description: Local wallet-keystore passphrase. Never print, log, or transmit it.
      - name: LINGRY_AGENT_STATE_PATH
        required: false
        description: Optional path for non-secret local Lingry candidate state.
      - name: LINGRY_DEFAULT_LANGUAGE_CODE
        required: false
        description: Default Lingry language code. Defaults to W.
      - name: LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS
        required: false
        description: Maximum permitted local coining fee. Coining still requires explicit user confirmation.
      - name: LINGRY_COIN_FEE_SATOSHIS
        required: false
        description: Local coining fee to use when preparing a confirmed transaction.
      - name: LINGRY_MAX_AUTO_TIP_SATOSHIS
        required: false
        description: Maximum permitted tip amount for workflows that prepare tips.
      - name: LINGRY_AGENT_REQUEST_TIMEOUT_MS
        required: false
        description: Timeout for Lingry HTTP requests.
      - name: LINGRY_SESSION_TOKEN
        required: false
        description: Optional local session token for authenticated Lingry API calls. Never print or log it.
---

# Lingry ClawHub Skill

Use this skill when a user wants to create a local Lingry wallet, request the starter grant, generate Lingry word candidates, create word drafts, list or inspect words, and coin a stored candidate only after explicit transaction confirmation.

This directory is the standalone ClawHub skill distribution of Lingry. It is derived from the Lingry OpenClaw implementation but is packaged independently so ClawHub users can install it as a standard OpenClaw skill.

Source relationship: adapted from the Lingry OpenClaw plugin implementation in this repository. Do not assume every plugin capability is available in the ClawHub skill.

## Approved Commands

Run commands from the installed `skills/lingry` folder:

```bash
node bin/lingry-agent.mjs doctor
node bin/lingry-agent.mjs create-wallet
node bin/lingry-agent.mjs address
node bin/lingry-agent.mjs claim-starter-grant
node bin/lingry-agent.mjs list-words W
node bin/lingry-agent.mjs generate-word "a word for a tiny useful idea"
node bin/lingry-agent.mjs coin-it --confirm-broadcast
node bin/lingry-agent.mjs create-word-draft <term> <part-of-speech> <meaning>
```

`coin-it` broadcasts a transaction and must only be run after the user explicitly confirms the exact action, fee, network, wallet address, and payload summary. The command itself requires `--confirm-broadcast`.

## Safety Rules

- Never print, inspect, summarize, export, transmit, or log private keys, WIFs, seed phrases, wallet passphrases, keystore contents, API tokens, or environment dumps.
- Do not include, request, or run a private-key export command.
- Do not inspect `LINGRY_WALLET_PASSPHRASE`, `LINGRY_SESSION_TOKEN`, keystore files, shell history, `.env`, `.dev.vars`, or raw secret files.
- Never use or request Lingry funding-wallet WIFs, Cloudflare deployment tokens, Sugarchain RPC passwords, or backend administration credentials.
- Never silently install cron jobs, services, or background workers.
- Never use `curl | bash`, `wget | bash`, opaque remote installers, or a runtime clone of the full Lingry repository.
- Never claim a starter grant, coining transaction, tip, or payment succeeded unless the API or node response confirms it.
- Do not invent balances, confirmations, addresses, transaction IDs, or payment outcomes.

## Starter Grant Boundary

`claim-starter-grant` may submit only the user's public address, public key, and proof-of-control signature to Lingry. It must never receive, store, request, display, or transmit the Lingry funding-wallet WIF.

## Excluded From ClawHub Skill

This standalone ClawHub skill intentionally excludes plugin-only lifecycle hooks, native plugin manifests, background daemons, cron installation, backend administration, database administration, Cloudflare deployment, server-side wallet custody, private-key export, and one-step prompt-and-broadcast shortcuts.
