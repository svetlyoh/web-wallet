# Security

## OpenClaw Never Receives Blockchain Secrets

This package must never receive, request, display, inspect, transmit, or log human private keys, Agent Publisher private keys, WIF values, mnemonics, seeds, recovery phrases, or Lingry funding-wallet secrets. It contains no blockchain wallet, key import, key export, transaction-signing, or general SUGAR-transfer command.

The workspace state contains a high-entropy Lingry agent credential, not a blockchain key. It is persisted atomically with restrictive permissions where supported and must never be printed or included in command JSON, chat, documentation examples, or logs. The server stores only its protected hash.

## Lingry Controls Agent Publisher Keys

Each OpenClaw workspace receives a distinct Agent Publisher address. Lingry generates its Sugarchain key server-side and stores it using per-publisher envelope encryption with AES-GCM. This is a custodial service identity and is separate from human Lingry wallets, whose keys remain local in the browser/device.

## Deliberately Constrained Authority

OpenClaw can read public Lingry data, generate candidates, coin its own stored canonical candidates, view its publisher address, and view transaction results.

OpenClaw cannot send arbitrary SUGAR, tip, export a key, sign arbitrary transactions, create arbitrary OP_RETURN records, select a payment recipient, or change the transaction change address. Server policy restricts a coin transaction to one zero-value canonical Lingry OP_RETURN, change to the same Agent Publisher, a capped fee, idempotency, and rate/budget limits.

Coining is irreversible and happens only when the user asks to publish. Discovery and Daily Lingry Word are anonymous, read-only operations and cannot create an Agent Publisher or blockchain side effect. Recurring delivery requires explicit opt-in and OpenClaw's normal automation permissions.
