# Lingry

Lingry lets OpenClaw users discover, generate, and coin Lingry words with a local Sugarchain wallet and explicit terminal approval.

This is the standalone ClawHub package for `@svetlyoh/lingry`. It is complete on its own and must not depend on another Lingry installation or repository checkout.

License: MIT-0.

## Install From ClawHub

```bash
openclaw skills install @svetlyoh/lingry
cd "$HOME/.openclaw/skills/lingry"
npm ci --omit=dev --ignore-scripts
node bin/lingry-agent.mjs verify-install
node bin/lingry-agent.mjs doctor
```

The built-in API base URL is `https://lingry.net`. You do not need to set `LINGRY_API_BASE_URL` unless you intentionally use another valid HTTPS Lingry API host.

Optional local settings:

```bash
export LINGRY_KEYSTORE_PATH="$HOME/.lingry/keystore.json"
export LINGRY_DEFAULT_LANGUAGE_CODE="W"
export LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS="2000"
export LINGRY_MAX_AUTO_TIP_SATOSHIS="250000"
```

## First Wallet Setup

Start on `https://lingry.net` before configuring OpenClaw. Create or open your Lingry wallet there, log in, open `Menu` then `Keys`, and keep the Lingry private/login key available only for the local Ubuntu terminal import. The wallet address on `lingry.net` must match the wallet you import on the Ubuntu OpenClaw PC.

Run wallet setup from a private Ubuntu terminal on the OpenClaw PC. If earlier commands were run as root or with `sudo`, first repair ownership:

```bash
sudo chown -R "$USER:$USER" "$HOME/.openclaw"
sudo chown -R "$USER:$USER" "$HOME/.lingry" 2>/dev/null || true
chmod 700 "$HOME/.openclaw"
chmod 700 "$HOME/.lingry" 2>/dev/null || true
chmod -R u+rwX,go-rwx "$HOME/.lingry" 2>/dev/null || true
```

Import the same Lingry private/login key locally:

```bash
cd "$HOME/.openclaw/skills/lingry"
unset LINGRY_WALLET_PASSPHRASE
node bin/lingry-wallet.mjs import-wallet
```

The WIF/private key and passphrase prompts are hidden. Typed or pasted text will not appear.

Verify the wallet:

```bash
cd "$HOME/.openclaw/skills/lingry" && node bin/lingry-wallet.mjs inspect && node bin/lingry-agent.mjs auth-status
```

The wallet helper refuses non-interactive runs. It asks for the wallet passphrase only in the terminal and never through OpenClaw chat, shell exports, `.env` files, services, or cron jobs.

## Optional Lingry Account Session

`LINGRY_SESSION_TOKEN` is needed for account-bound generation, candidate storage, draft creation, and candidate-based coining.

Never paste the token into OpenClaw chat. Never place it in GitHub, `SKILL.md` examples, shell history, or a world-readable file. The user must obtain it through a deliberate Lingry browser/account flow. Do not use browser-cookie scraping, browser-local-storage scraping, browser-session scraping, profile-file scraping, or automatic session-token extraction.

Browser-created Lingry API session tokens last about 30 days. When you have a token, configure it only in a private local environment before running authenticated commands.

First-time token setup:

1. Return to `https://lingry.net`.
2. Log in with the same Lingry private/login key that you imported on the Ubuntu OpenClaw PC.
3. Open `Menu` then `API Session`.
4. Create a new API session token and copy it.

Paste the token into the OpenClaw runtime environment from a private Ubuntu terminal:

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

Then restart OpenClaw and test from a terminal that has loaded the same `.env`:

```bash
systemctl --user unset-environment LINGRY_SESSION_TOKEN 2>/dev/null || true
openclaw gateway restart
set -a && . "$HOME/.openclaw/.env" && set +a
cd "$HOME/.openclaw/skills/lingry" && node bin/lingry-agent.mjs auth-status
```

If `auth-status` says `token_configured: false` in a plain terminal, source `~/.openclaw/.env` as shown above. OpenClaw loads that file only for its own runtime after gateway restart.

To refresh an expired token later, sign in to `https://lingry.net` with the same Lingry private/login key and matching wallet address, create a new token from `Menu` then `API Session`, repeat the private terminal paste command above, and restart OpenClaw. Tokens are valid for about 30 days.

## Troubleshooting OpenClaw Session Tokens

If `node bin/lingry-agent.mjs auth-status` accepts the new token in your terminal but OpenClaw chat still reports an old expiry, OpenClaw is still running with a stale environment. Replace the token in `~/.openclaw/.env`, clear any user systemd copy, and restart the gateway:

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

Verify the file OpenClaw should load:

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

## Commands

Safe agent commands:

```bash
node bin/lingry-agent.mjs
node bin/lingry-agent.mjs status
node bin/lingry-agent.mjs doctor
node bin/lingry-agent.mjs verify-install
node bin/lingry-agent.mjs auth-status
node bin/lingry-agent.mjs address
node bin/lingry-agent.mjs list-words W
node bin/lingry-agent.mjs generate-word "a word for a tiny useful idea found while coding"
node bin/lingry-agent.mjs create-word-draft desknosh n "a snack eaten at a desk"
node bin/lingry-agent.mjs prepare-coin <candidate-id-or-term>
node bin/lingry-agent.mjs prepare-starter-grant
node bin/lingry-agent.mjs get-request <request-id>
node bin/lingry-agent.mjs get-transaction <request-id-or-intent-id>
```

Local wallet commands:

```bash
node bin/lingry-wallet.mjs setup
node bin/lingry-wallet.mjs create-wallet
node bin/lingry-wallet.mjs import-wallet
node bin/lingry-wallet.mjs inspect
node bin/lingry-wallet.mjs claim-grant <request-id>
node bin/lingry-wallet.mjs approve <request-id>
```

`prepare-coin` does not sign or broadcast. It creates a pending request. The user reviews that request in a private terminal and must type `BROADCAST` before `lingry-wallet approve` signs and submits anything.

## Anonymous And Authenticated Access

Anonymous or local-public commands:

- `status`
- `doctor`
- `verify-install`
- `auth-status`
- `address`
- `list-words`
- `prepare-starter-grant`
- `get-request`
- `get-transaction` for a local request id
- wallet `setup`, `create-wallet`, `import-wallet`, `inspect`, and `claim-grant`

Commands that require `LINGRY_SESSION_TOKEN`:

- `generate-word`
- `prompt-word`
- `create-word-draft`
- `prepare-coin`
- `get-transaction` for an authenticated Lingry intent
- wallet `approve`

## Update And Removal

```bash
openclaw skills update @svetlyoh/lingry
openclaw skills uninstall @svetlyoh/lingry
```

## Developer Checks

Use this only when developing this package source:

```bash
npm ci --omit=dev --ignore-scripts
node bin/lingry-agent.mjs verify-install
node bin/lingry-agent.mjs doctor
npm test
```
