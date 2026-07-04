---
name: lingry
description: Create, discover, and coin Lingry words with a local Sugarchain wallet, explicit terminal approval, and no wallet-passphrase exposure to OpenClaw.
version: 1.0.7
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

## Core Lingry Workflows

Lingry lets users create, discover, and coin words through `https://lingry.net` and through this OpenClaw skill. Use the skill for read-only status checks, public Stream and Leaderboard views, account-bound word generation, word-draft creation, starter-grant preparation, and coining-request preparation.

To create or submit a word, help the user choose a term, part of speech, and meaning, then use `generate-word`, `create-word-draft`, or `prepare-coin` as appropriate. `prepare-coin` only creates a pending non-secret request; the user must approve signing and broadcast in a private terminal with `node bin/lingry-wallet.mjs approve <request-id>`.

To view public activity, use `node bin/lingry-agent.mjs stream` for the latest public Stream snapshot and `node bin/lingry-agent.mjs leaderboard` for ranked public words and addresses. These commands are read-only and do not require wallet authorization.

Wallet authorization is deliberately split between browser, local terminal, and agent. The browser is where the user creates or refreshes an API session token. The local terminal is where wallet import, hidden passphrase entry, transaction review, signing, and broadcast happen. The OpenClaw agent may prepare requests and read public or non-secret status, but it must never request, expose, log, or infer private keys, wallet passphrases, session tokens, API keys, seed phrases, or recovery phrases.

## Visual walkthrough

<!-- BEGIN LINGRY SCREENSHOT WALKTHROUGH -->

### Sign up from the Lingry home screen

![Lingry home screen with the Sign up tab open, showing email and password fields, a Sign up button, and a Sign up by Key option.](https://raw.githubusercontent.com/svetlyoh/web-wallet/aea18082413393a9d82bc37b501d216cbc0fae6f/docs/lingry/screenshots/01-sign-up-from-the-lingry-home-screen.jpg)

**What this shows:** Users can sign up from the Lingry home screen by entering an email, creating a password, and confirming it. A key-based sign-up option is also available for users who prefer wallet-key access.

**What the user does:** Enter an email address, create a password, confirm the password, then select Sign up. Users who prefer wallet-key access can select Sign up by Key instead.

**Expected result:** Lingry creates the wallet session and brings the user into the app.

**Agent guidance:** Guide the user to choose the normal email sign-up path unless they specifically want wallet-key access. Never ask the user to paste a private key, password, or session token into chat.

### Save your login key

![Lingry account screen showing a Save your login key panel with the key value redacted and a Copy button visible above the Word Stream.](https://raw.githubusercontent.com/svetlyoh/web-wallet/aea18082413393a9d82bc37b501d216cbc0fae6f/docs/lingry/screenshots/02-save-your-login-key.jpg)

**What this shows:** After creating an account, Lingry provides a wallet key for future login. Users should save this key securely before continuing, since it allows them to access the wallet again later.

**What the user does:** Copy the login key and save it somewhere secure before continuing in Lingry.

**Expected result:** The user has a saved login key they can use to access the wallet again later.

**Agent guidance:** Explain that this key must be treated like a wallet credential. Tell the user to save it privately and never paste it into chat, public docs, issue comments, or screenshots.

### Prompt for a new word

![Lingry Prompt for New Word screen showing a concept prompt, an Invent From Prompt button, and a generated word suggestion with meaning and part-of-speech fields.](https://raw.githubusercontent.com/svetlyoh/web-wallet/aea18082413393a9d82bc37b501d216cbc0fae6f/docs/lingry/screenshots/03-prompt-for-a-new-word.jpg)

**What this shows:** Users can enter a prompt describing the idea or concept they want Lingry to turn into a new word. Lingry then uses that prompt to generate a more focused and personalized word suggestion.

**What the user does:** Type a concept or idea into the Prompt for New Word field, then select Invent From Prompt.

**Expected result:** Lingry generates a suggested word with meaning, part of speech, etymology meaning, confidence, and status details.

**Agent guidance:** Help the user phrase the prompt clearly and specifically, then review the generated word details before recommending any coining or submission step.

### Generate a word with AI

![Lingry AI Generate screen showing an Invent New Word button, Coin It button, and a generated word candidate with meaning, part of speech, etymology meaning, confidence, and status.](https://raw.githubusercontent.com/svetlyoh/web-wallet/aea18082413393a9d82bc37b501d216cbc0fae6f/docs/lingry/screenshots/04-generate-a-word-with-ai.jpg)

**What this shows:** The AI Generate tab automatically creates a new word idea for the user, including meaning and context. It gives users a fast way to discover and coin a new word with minimal input.

**What the user does:** Open AI Generate and select Invent New Word to create a fresh word suggestion, then review or edit the generated details before selecting Coin It.

**Expected result:** Lingry shows a generated word candidate with meaning, part of speech, etymology meaning, confidence, and ready-to-post status.

**Agent guidance:** Use this screen when the user wants a quick generated candidate. Encourage them to review and edit the meaning before preparing any coining request.

### View Lingry rankings

![Lingry Rankings screen showing top trending word cards with creator handles, language flags, like counts, tip counts, and Sugar tip totals.](https://raw.githubusercontent.com/svetlyoh/web-wallet/aea18082413393a9d82bc37b501d216cbc0fae6f/docs/lingry/screenshots/05-view-lingry-rankings.jpg)

**What this shows:** Lingry Rankings shows top words and creators. Users can like favorite words and tip creators with Sugars, helping reward popular or meaningful word contributions.

**What the user does:** Open Lingry Rankings, review the top trending words, then use like or tip actions when a word contribution is worth supporting.

**Expected result:** The user sees ranked words and creator activity ordered by likes and tips, with the latest refresh and scan context visible.

**Agent guidance:** Use rankings to help the user discover popular words and creators. Explain that likes and tips are public contribution signals, and never claim a tip succeeded until the wallet/API confirms it.

### View wallet keys from the menu

![Lingry Keys screen showing wallet address, public key, a masked private key field with a Show button, and redeem script details.](https://raw.githubusercontent.com/svetlyoh/web-wallet/aea18082413393a9d82bc37b501d216cbc0fae6f/docs/lingry/screenshots/06-view-wallet-keys-from-the-menu.jpg)

**What this shows:** From Menu > Show Keys, users can view their private key and save it for future logins. This key should be stored securely, since it provides access to the wallet.

**What the user does:** Open Menu, choose Show Keys, and only reveal or copy the private key when the user is in a private setting ready to store it securely.

**Expected result:** Lingry shows the wallet address, public key, masked private key field, and related wallet details so the user can save access information safely.

**Agent guidance:** Warn the user that the private key controls wallet access. Never ask them to paste it into chat, screenshots, GitHub, ClawHub, logs, or support messages.

<!-- END LINGRY SCREENSHOT WALKTHROUGH -->

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
node bin/lingry-agent.mjs leaderboard
node bin/lingry-agent.mjs stream
node bin/lingry-agent.mjs generate-word "a word for a tiny useful idea"
node bin/lingry-agent.mjs create-word-draft <term> <part-of-speech> <meaning>
node bin/lingry-agent.mjs prepare-starter-grant
node bin/lingry-agent.mjs prepare-coin <candidate-id-or-term>
node bin/lingry-agent.mjs get-request <request-id>
node bin/lingry-agent.mjs get-transaction <request-id-or-intent-id>
```

`status` is the default no-argument command. It shows wallet address if configured, API health, public word availability, session-token status, the last locally saved candidate, and the last locally saved coin result. It must never display secrets or make a transaction.

## Public Social Reads

When the user asks to show Lingry's leaderboard, run:

```bash
node bin/lingry-agent.mjs leaderboard
```

When the user asks to show the latest Lingry stream, run:

```bash
node bin/lingry-agent.mjs stream
```

These commands are public read-only calls. They do not need a session token, wallet, private key, passphrase, browser session, or signing approval. Render the returned words as a concise numbered list, mention the snapshot time, and state clearly when data is stale. Do not claim the stream is live or real-time; it refreshes from the latest completed hourly snapshot. Do not scrape `lingry.net/leaderboard`, `lingry.net/stream`, browser cookies, browser storage, or page HTML. Do not expose raw API payloads unless the user asks for JSON.

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

## First Launch In OpenClaw

When a user first launches the Lingry skill, guide them through setup without asking them to paste secrets into chat:

1. Open `https://lingry.net`, create or open a Lingry wallet, log in, open `Menu` then `Keys`, and copy the Lingry private/login key only for local terminal import. The wallet address on `lingry.net` must match the wallet imported on the Ubuntu OpenClaw PC.
2. On the Ubuntu OpenClaw PC, fix ownership if previous commands used root:

```bash
sudo chown -R "$USER:$USER" "$HOME/.openclaw"
sudo chown -R "$USER:$USER" "$HOME/.lingry" 2>/dev/null || true
chmod 700 "$HOME/.openclaw"
chmod 700 "$HOME/.lingry" 2>/dev/null || true
chmod -R u+rwX,go-rwx "$HOME/.lingry" 2>/dev/null || true
```

3. Import the Lingry private/login key into the local encrypted OpenClaw wallet:

```bash
cd "$HOME/.openclaw/skills/lingry"
unset LINGRY_WALLET_PASSPHRASE
node bin/lingry-wallet.mjs import-wallet
```

The WIF/private key and wallet passphrase prompts are hidden; typed or pasted text will not appear.

4. Verify the local wallet and token status:

```bash
cd "$HOME/.openclaw/skills/lingry" && node bin/lingry-wallet.mjs inspect && node bin/lingry-agent.mjs auth-status
```

5. Return to `https://lingry.net`, log in with the same Lingry private/login key and matching wallet address, open `Menu` then `API Session`, create an API session token, and copy it. Browser-created tokens last about 30 days.
6. Put the token in the OpenClaw runtime environment file with a hidden terminal prompt, not in chat:

```bash
umask 077
mkdir -p "$HOME/.openclaw"

read -rsp "Paste Lingry session token: " NEW_LINGRY_TOKEN
printf '\n'

tmpfile="$(mktemp)"
[ -f "$HOME/.openclaw/.env" ] && grep -v '^LINGRY_SESSION_TOKEN=' "$HOME/.openclaw/.env" > "$tmpfile"
printf 'LINGRY_SESSION_TOKEN=%s\n' "$NEW_LINGRY_TOKEN" >> "$tmpfile"
mv "$tmpfile" "$HOME/.openclaw/.env"
chmod 600 "$HOME/.openclaw/.env"

unset NEW_LINGRY_TOKEN
unset LINGRY_SESSION_TOKEN
```

Then run:

```bash
systemctl --user unset-environment LINGRY_SESSION_TOKEN 2>/dev/null || true
openclaw gateway restart
set -a && . "$HOME/.openclaw/.env" && set +a
cd "$HOME/.openclaw/skills/lingry" && node bin/lingry-agent.mjs auth-status
```

If a direct terminal test without sourcing `.env` says `token_configured: false`, that only means the current shell has not loaded OpenClaw's runtime `.env`; source the file as shown above or test from OpenClaw after restarting the gateway.

For future refreshes, tell the user to sign in to `https://lingry.net` with the same Lingry private/login key and matching wallet address, create a new token from `Menu` then `API Session`, repeat the hidden terminal paste flow above, and restart OpenClaw.

## Troubleshooting Session Tokens

If terminal `auth-status` accepts a new token but OpenClaw chat still reports an old expiry, the chat-side gateway is still using a stale environment. Do not ask the user to paste the token into chat. Give them this private terminal repair flow:

```bash
cd "$HOME/.openclaw/skills/lingry"

umask 077
mkdir -p "$HOME/.openclaw"

read -rsp "Paste the NEW Lingry session token: " NEW_LINGRY_TOKEN
printf '\n'

tmpfile="$(mktemp)"
[ -f "$HOME/.openclaw/.env" ] && grep -v '^LINGRY_SESSION_TOKEN=' "$HOME/.openclaw/.env" > "$tmpfile"
printf 'LINGRY_SESSION_TOKEN=%s\n' "$NEW_LINGRY_TOKEN" >> "$tmpfile"
mv "$tmpfile" "$HOME/.openclaw/.env"
chmod 600 "$HOME/.openclaw/.env"

unset LINGRY_SESSION_TOKEN
unset NEW_LINGRY_TOKEN

systemctl --user unset-environment LINGRY_SESSION_TOKEN 2>/dev/null || true
openclaw gateway restart
```

Then verify:

```bash
cd "$HOME/.openclaw/skills/lingry"
set -a && . "$HOME/.openclaw/.env" && set +a
node bin/lingry-agent.mjs auth-status
```

If OpenClaw chat still shows the old expiry, restart the gateway process fully:

```bash
openclaw gateway stop
sleep 3
openclaw gateway start
```

## Troubleshooting Coin Approval

If wallet approval fails after `BROADCAST` with `Sugarchain RPC is not configured`, explain that the configured Lingry API host cannot broadcast signed Sugarchain transactions. Do not ask for the wallet passphrase or private key. Have the user run:

```bash
cd "$HOME/.openclaw/skills/lingry"
node bin/lingry-agent.mjs doctor
```

Current wallet helpers preflight `/v1/broadcast/status` before asking for the wallet passphrase. If broadcast is unavailable, the Lingry API operator must configure Sugarchain broadcast or update the API to a version with public Sugar API broadcast fallback.

## Anonymous And Authenticated Commands

These commands work anonymously or only use local public wallet metadata:

- `status`
- `doctor`
- `verify-install`
- `auth-status`
- `address`
- `list-words`
- `leaderboard`
- `stream`
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

Browser-created Lingry API session tokens last about 30 days. The user refreshes them by signing in to `https://lingry.net` with the same Lingry private/login key and matching wallet address, then opening `Menu` and `API Session`. Never paste the token into OpenClaw chat. Never place it in GitHub, `SKILL.md` examples, shell history, or a world-readable file. The user must obtain it through a deliberate Lingry browser/account flow. Do not implement or use browser-cookie scraping, browser-local-storage scraping, browser-session scraping, profile-file scraping, or automatic session-token extraction.

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
