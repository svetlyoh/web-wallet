# OpenClaw Lingry Skill

The OpenClaw integration lives in `openclaw/skills/lingry`.

## Install From GitHub

Download the companion directly from your GitHub repository:

```powershell
$env:LINGRY_REPO_URL="https://github.com/svetlyoh/web-wallet.git"
$env:LINGRY_REPO_DIR="$env:USERPROFILE\.openclaw\lingry\web-wallet"

if (Test-Path $env:LINGRY_REPO_DIR) {
  git -C $env:LINGRY_REPO_DIR pull
} else {
  git clone $env:LINGRY_REPO_URL $env:LINGRY_REPO_DIR
}

cd "$env:LINGRY_REPO_DIR\openclaw\skills\lingry"
npm install
```

If Git is not available, download the repository ZIP from:

```text
https://github.com/svetlyoh/web-wallet/archive/refs/heads/main.zip
```

## Required Configuration

- `LINGRY_API_BASE_URL`
- `LINGRY_KEYSTORE_PATH`
- `LINGRY_WALLET_PASSPHRASE`
- `LINGRY_DEFAULT_LANGUAGE_CODE`
- `LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS`
- `LINGRY_MAX_AUTO_TIP_SATOSHIS`

For a deployed Cloudflare Worker, use the Worker URL for `LINGRY_API_BASE_URL`. Do not set it to the GitHub repository URL; GitHub is only the source download location.

```powershell
$env:LINGRY_API_BASE_URL="https://replace-with-your-lingry-worker.workers.dev"
$env:LINGRY_KEYSTORE_PATH="$env:USERPROFILE\.lingry\keystore.json"
$env:LINGRY_WALLET_PASSPHRASE="replace-with-your-local-passphrase"
$env:LINGRY_DEFAULT_LANGUAGE_CODE="W"
$env:LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS="2000"
$env:LINGRY_MAX_AUTO_TIP_SATOSHIS="250000"
```

For local Worker development, use:

```powershell
$env:LINGRY_API_BASE_URL="http://localhost:8787"
```

## Actions

- `create_wallet`
- `import_wallet`
- `login`
- `generate_word`
- `create_word_draft`
- `coin_word`
- `daily_popular_pick`
- `install_daily_cron`
- `prompt_and_coin`
- `coin_it`
- `get_word`
- `list_words`
- `like_word`
- `unlike_word`
- `prepare_tip`
- `submit_tip`
- `get_transaction`

## Safety Rules

The companion client creates or imports Sugarchain WIFs locally, encrypts them with `scrypt` plus `AES-256-GCM`, and never sends private key material to the API.

Before a tip, the skill must show the recipient address, amount, fee estimate, and total cost. Automated coining is allowed only when configured under `LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS`. Tips default to explicit user confirmation.

Before submitting any signed transaction, the client must compare it with the Lingry intent and reject mismatched payloads, recipient addresses, amounts, or network assumptions. Never retry broadcast blindly; poll the intent first.

## Ubuntu Cron Setup

After installing the OpenClaw companion on Ubuntu, set the environment variables and run:

```bash
node bin/lingry-agent.mjs install-daily-cron
```

This installs:

```text
0 8 * * * $HOME/.lingry/lingry-daily-popular-pick.sh >> $HOME/.lingry/lingry-daily-popular-pick.log 2>&1
```

The daily job fetches `/api/leaderboard?limit=100`, filters Popular Words to `SW` or `SE`, picks one randomly, and emits a JSON event that OpenClaw can read or summarize for the user.

Run it manually:

```bash
node bin/lingry-agent.mjs daily-popular-pick
```

Generate without coining:

```bash
node bin/lingry-agent.mjs prompt-word "a word for calm confidence before shipping code"
```

`prompt-word` persists the returned candidate through `POST /v1/generations` before printing it. The agent saves the returned `candidate_id` as the active candidate.

Coin the active candidate:

```bash
node bin/lingry-agent.mjs coin-it
```

Coin an exact stored candidate by term or id:

```bash
node bin/lingry-agent.mjs coin-it burgerlash
node bin/lingry-agent.mjs coin-it cand_...
```

Generate and coin in one command:

```bash
node bin/lingry-agent.mjs prompt-and-coin "a word for calm confidence before shipping code"
```

`prompt-and-coin` still persists the generated candidate first, then prepares coining from `/v1/candidates/{candidate_id}/coin/prepare`. It must never call generation a second time for the coin step.
