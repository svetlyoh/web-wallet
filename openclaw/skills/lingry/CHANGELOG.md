# Changelog

## 1.0.1

- Set the built-in API default to `https://lingry.net`.
- Add `bin/lingry-wallet.mjs` for interactive-terminal-only wallet setup, grant signing, transaction approval, and broadcasting.
- Change the agent to prepare non-secret request files instead of decrypting wallets, signing transactions, or broadcasting.
- Add `verify-install` and clean-room package tests for standalone ClawHub installs.
- Remove wallet-passphrase requirements from the OpenClaw agent contract and documentation.

## 1.0.0

- Create standalone ClawHub skill package.
- Add ClawHub metadata in `SKILL.md`.
- Restrict command surface to safe user-facing Lingry workflows.
- Require explicit `--confirm-broadcast` for coining.
- Exclude private-key export, cron installation, plugin lifecycle hooks, deployment administration, and server-wallet custody.
