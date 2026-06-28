---
name: lingry
description: Create, discover, and coin Lingry words with a local Sugarchain wallet, explicit terminal approval, and no wallet-passphrase exposure to OpenClaw.
version: 1.0.1
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
      - name: LINGRY_KEYSTORE_PATH
        required: false
        description: Optional path to the local encrypted Lingry keystore. Defaults to ~/.lingry/keystore.json.
      - name: LINGRY_AGENT_STATE_PATH
        required: false
        description: Optional path for non-secret local Lingry candidate state.
      - name: LINGRY_DEFAULT_LANGUAGE_CODE
        required: false
        description: Default Lingry language code. Defaults to W.
      - name: LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS
        required: false
        description: Maximum local coining fee value used when preparing a request. Signing still requires terminal approval.
      - name: LINGRY_COIN_FEE_SATOSHIS
        required: false
        description: Local coining fee used when preparing a candidate coin request.
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

Use this skill when a user wants to inspect Lingry API health, list public Lingry words, generate account-bound Lingry word candidates, prepare a starter-grant claim, or prepare a candidate coining request. The OpenClaw agent must never unlock a wallet, request a wallet passphrase, sign a transaction, or broadcast a transaction.

This is the standalone ClawHub distribution. It must run only from the files included in this package: `bin/lingry-agent.mjs`, `bin/lingry-wallet.mjs`, `src/`, `package.json`, and `package-lock.json`. Never fall back to another Lingry install, a source checkout, a sibling directory, or an old local skill.

## Canonical API URL

The built-in API base URL is:

```text
https://lingry.net
```

Only override it with `LINGRY_API_BASE_URL` when the user deliberately provides another valid HTTPS Lingry API host.

## Agent Commands

These commands are safe for an OpenClaw agent process:

```bash
node bin/lingry-agent.mjs
node bin/lingry-agent.mjs status
node bin/lingry-agent.mjs doctor
node bin/lingry-agent.mjs verify-install
node bin/lingry-agent.mjs auth-status
node bin/lingry-agent.mjs address
node bin/lingry-agent.mjs list-words W
node bin/lingry-agent.mjs generate-word "a word for a tiny useful idea"
node bin/lingry-agent.mjs create-word-draft <term> <part-of-speech> <meaning>
node bin/lingry-agent.mjs prepare-starter-grant
node bin/lingry-agent.mjs prepare-coin <candidate-id-or-term>
node bin/lingry-agent.mjs get-request <request-id>
node bin/lingry-agent.mjs get-transaction <request-id-or-intent-id>
```

`status` is the default no-argument command. It shows wallet address if configured, API health, public word availability, session-token status, the last locally saved candidate, and the last locally saved coin result. It must never display secrets or make a transaction.

## Local Wallet Commands

These commands must be run by the user from a private interactive terminal, not by OpenClaw chat, services, cron jobs, pipes, or background agents:

```bash
node bin/lingry-wallet.mjs setup
node bin/lingry-wallet.mjs create-wallet
node bin/lingry-wallet.mjs import-wallet
node bin/lingry-wallet.mjs inspect
node bin/lingry-wallet.mjs claim-grant <request-id>
node bin/lingry-wallet.mjs approve <request-id>
```

Wallet creation, wallet import, starter-grant signing, transaction signing, and broadcasting are terminal-only. The user must review the details and type `BROADCAST` before anything is signed or submitted.

## Anonymous And Authenticated Commands

These commands work anonymously or only use local public wallet metadata:

- `status`
- `doctor`
- `verify-install`
- `auth-status`
- `address`
- `list-words`
- `prepare-starter-grant`
- `get-request`
- `get-transaction` for a local request id
- `node bin/lingry-wallet.mjs inspect`
- `node bin/lingry-wallet.mjs setup`
- `node bin/lingry-wallet.mjs create-wallet`
- `node bin/lingry-wallet.mjs import-wallet`
- `node bin/lingry-wallet.mjs claim-grant <request-id>`

These commands require `LINGRY_SESSION_TOKEN`:

- `generate-word`
- `prompt-word`
- `create-word-draft`
- `prepare-coin`
- `get-transaction` when querying an authenticated Lingry intent
- `node bin/lingry-wallet.mjs approve <request-id>` for candidate submission

`LINGRY_SESSION_TOKEN` is optional in this skill metadata because public read commands, install checks, status checks, and local wallet setup do not require it.

## Optional Lingry Account Session

`LINGRY_SESSION_TOKEN` is needed for account-bound generation, candidate storage, draft creation, and candidate-based coining.

Never paste the token into OpenClaw chat. Never place it in GitHub, `SKILL.md` examples, shell history, or a world-readable file. The user must obtain it through a deliberate Lingry browser/account flow. Do not implement or use browser-cookie scraping, browser-local-storage scraping, browser-session scraping, profile-file scraping, or automatic session-token extraction.

## Safety Rules

- Never print, inspect, summarize, export, transmit, or log private keys, WIFs, seed phrases, wallet passphrases, keystore contents, API tokens, environment dumps, Cloudflare secrets, funding-wallet WIFs, or RPC credentials.
- Never request a wallet passphrase in an OpenClaw agent process, shell export, `.env` file, systemd service, or cron job.
- Never include wallet passphrases in skill frontmatter, examples, scripts, services, or scheduled jobs.
- Do not include, request, or run a private-key export command.
- Never scrape browser cookies, browser local storage, browser session storage, or profile files to obtain a Lingry session token.
- Never silently install cron jobs, services, background workers, public tunnels, router port forwards, or production deployments.
- Never use `curl | bash`, `wget | bash`, opaque remote installers, or a runtime clone of the full Lingry repository.
- Never claim a starter grant, coining transaction, tip, or payment succeeded unless the API or node response confirms it.
- Do not invent balances, confirmations, addresses, transaction IDs, or payment outcomes.

## Transaction Boundary

The agent prepares non-secret requests only. It may read public wallet metadata from `~/.lingry/keystore.json`, request public Lingry/Sugarchain data, and save a pending request under `~/.lingry/pending/`. It must not decrypt the keystore or build a signed raw transaction.

The wallet helper loads the encrypted keystore only inside a private terminal after the user reviews the request and types `BROADCAST`. It saves only non-secret result metadata under `~/.lingry/results/`.
