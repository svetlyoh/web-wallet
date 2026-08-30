# Changelog

## 2.0.1

- Documented the exact workspace-scoped, quoted ClawHub install command shown to users.
- Removed unnecessary post-install `npm` and manual verification steps.
- Confirmed clean-install word generation automatically creates the workspace credential, bootstraps the Agent Publisher, and opens a short-lived session without user-provided keys or secrets.
- Clarified that publisher-key encryption is server-managed and operator configuration errors are not transient client failures.

## 2.0.0

- Removed the OpenClaw local Sugarchain wallet, private-key import, browser API Session copy/paste, and manual transaction approval workflow.
- Added automatic workspace-scoped Agent Publisher registration and short-lived session renewal.
- Added one unique Lingry-managed Sugarchain publishing address per OpenClaw agent workspace.
- Added autonomous, policy-constrained coining of immutable canonical Lingry candidates.
- Added first-use public Stream onboarding and read-only Daily Lingry Word automation guidance.

## 1.0.7

- Change default public leaderboard and stream command limits to 100 records.

## 1.0.6

- Accept direct public snapshot responses for leaderboard and stream commands.

## 1.0.5

- Added public hourly-indexed leaderboard and stream commands for OpenClaw.

## 1.0.4

- Clarify first-run setup: create or open a `lingry.net` wallet first, import the matching private/login key on Ubuntu OpenClaw, then configure the 30-day API session token.
- Add stale OpenClaw gateway environment troubleshooting for cases where terminal `auth-status` accepts a new token but chat still reports an old expiry.

## 1.0.3

- Add first-launch OpenClaw setup instructions for ownership repair, wallet import, session-token storage, gateway restart, and terminal testing.

## 1.0.2

- Align `verify-install` with the exact file list ClawHub publishes and installs.

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
