# Lingry OpenClaw Companion

This companion keeps Sugarchain keys local and talks to the Lingry `/v1` API.

Install directly from GitHub:

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

Configure the runtime API and local encrypted keystore:

```powershell
$env:LINGRY_API_BASE_URL="https://replace-with-your-lingry-worker.workers.dev"
$env:LINGRY_KEYSTORE_PATH="$env:USERPROFILE\.lingry\keystore.json"
$env:LINGRY_WALLET_PASSPHRASE="replace-with-your-local-passphrase"
$env:LINGRY_DEFAULT_LANGUAGE_CODE="W"
$env:LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS="2000"
$env:LINGRY_MAX_AUTO_TIP_SATOSHIS="250000"
```

`LINGRY_API_BASE_URL` is the deployed Worker API URL, not the GitHub repository URL.

```powershell
node bin/lingry-agent.mjs create-wallet
node bin/lingry-agent.mjs address
node bin/lingry-agent.mjs list-words
```

Install the 8:00 AM local-time daily OpenClaw pick from Lingry Rankings:

```bash
node bin/lingry-agent.mjs install-daily-cron
```

Test it immediately:

```bash
node bin/lingry-agent.mjs daily-popular-pick
```

The cron job writes to:

```text
$HOME/.lingry/lingry-daily-popular-pick.log
```

Ask Lingry to invent a word from a prompt:

```bash
node bin/lingry-agent.mjs prompt-word "a word for a tiny useful idea found while coding"
```

Prompt and coin the generated word on Sugarchain:

```bash
node bin/lingry-agent.mjs prompt-and-coin "a word for a tiny useful idea found while coding"
```

`prompt-and-coin` signs locally from the encrypted keystore, broadcasts through Sugarchain, and prints the resulting transaction id. It refuses to coin when `LINGRY_COIN_FEE_SATOSHIS` is greater than `LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS`.

The keystore format is:

```text
scrypt-derived key + AES-256-GCM encrypted WIF
```

The WIF is never printed by default and is never sent to the Lingry API.
