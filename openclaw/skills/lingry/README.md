# Lingry

Lingry lets OpenClaw users create, discover, and interact with Lingry words using a local Sugarchain wallet and explicit transaction confirmation.

This directory is the standalone ClawHub skill distribution of Lingry. It is derived from the Lingry OpenClaw plugin but is packaged independently so ClawHub users can install it as a standard OpenClaw skill.

Source relationship: adapted from the Lingry OpenClaw plugin in this repository. Do not assume every plugin capability is available in the ClawHub skill.

License: MIT-0. This ClawHub skill directory is released under MIT-0.

## Install From ClawHub

Use the publisher handle shown in ClawHub:

```bash
openclaw skills install @<publisher-handle>/lingry
```

Then enter the installed skill folder:

```text
<active-openclaw-workspace>/skills/lingry
```

Install dependencies and validate:

```bash
npm ci --omit=dev --ignore-scripts
node bin/lingry-agent.mjs status
node bin/lingry-agent.mjs doctor
```

Set environment variables in your local OpenClaw environment, not in chat:

```bash
export LINGRY_API_BASE_URL="https://lingry.net"
export LINGRY_KEYSTORE_PATH="$HOME/.lingry/keystore.json"
export LINGRY_WALLET_PASSPHRASE="<local passphrase>"
export LINGRY_DEFAULT_LANGUAGE_CODE="W"
export LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS="2000"
export LINGRY_MAX_AUTO_TIP_SATOSHIS="250000"
```

## Optional Lingry Account Session

`LINGRY_SESSION_TOKEN` is optional for public browsing and local wallet checks, but it is needed for account-bound generation, candidate storage, draft creation, and candidate-based coining.

Create it through a deliberate Lingry browser/account flow: sign in at Lingry, open `Keys`, then `API Session`, and choose `Create API Session Token`. Copy the token into your local OpenClaw environment only.

Never paste the token into OpenClaw chat. Never place it in GitHub, `SKILL.md` examples, shell history, or a world-readable file. Do not use browser-cookie scraping, browser-local-storage scraping, or automatic token extraction.

## Commands

```bash
node bin/lingry-agent.mjs status
node bin/lingry-agent.mjs doctor
node bin/lingry-agent.mjs auth-status
node bin/lingry-agent.mjs create-wallet
node bin/lingry-agent.mjs address
node bin/lingry-agent.mjs claim-starter-grant
node bin/lingry-agent.mjs list-words W
node bin/lingry-agent.mjs generate-word "a word for a tiny useful idea found while coding"
node bin/lingry-agent.mjs coin-it --confirm-broadcast
node bin/lingry-agent.mjs create-word-draft desknosh n "a snack eaten at a desk"
```

`coin-it --confirm-broadcast` must only be run after the user explicitly approves the exact transaction action, network, fee, wallet address, and payload summary.

## Anonymous And Authenticated Access

Anonymous or local-only commands:

- `status`
- `doctor`
- `auth-status`
- `create-wallet`
- `address`
- `claim-starter-grant`
- `list-words`

Commands that require `LINGRY_SESSION_TOKEN`:

- `generate-word`
- `prompt-word`
- `create-word-draft`
- `coin-it --confirm-broadcast`

## Update And Removal

```bash
openclaw skills update @<publisher-handle>/lingry
openclaw skills uninstall @<publisher-handle>/lingry
```

## Developer/Source Checkout Only

Use this only when developing the skill source:

```bash
git clone https://github.com/svetlyoh/web-wallet.git
cd web-wallet/openclaw/skills/lingry
npm ci --omit=dev --ignore-scripts
node bin/lingry-agent.mjs doctor
npm test
```

Normal ClawHub users should not clone the full `web-wallet` repository.
