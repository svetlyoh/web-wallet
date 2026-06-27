# Security

This ClawHub skill keeps user wallet keys local and encrypted. It must never print, inspect, summarize, export, transmit, or log private keys, WIFs, seed phrases, wallet passphrases, keystore contents, API tokens, environment dumps, Cloudflare secrets, funding-wallet WIFs, or RPC credentials.

The skill does not include a private-key export command.

Money-moving commands must require explicit user confirmation. `coin-it` requires `--confirm-broadcast` and should only be run after the user reviews the action, wallet address, network, fee, and payload summary.

The starter grant command sends only a public address, public key, and proof-of-control signature to the Lingry service.
