# Security

This ClawHub skill keeps user wallet keys local and encrypted. It must never print, inspect, summarize, export, transmit, or log private keys, WIFs, seed phrases, wallet passphrases, keystore contents, API tokens, environment dumps, Cloudflare secrets, funding-wallet WIFs, or RPC credentials.

The skill does not include a private-key export command.

Money-moving commands must require explicit user confirmation. The agent can only run `prepare-coin`, which creates a non-secret pending request. The local wallet helper signs and submits only after the user reviews the action, wallet address, network, fee, and payload summary in a private terminal and types `BROADCAST`.

The starter grant preparation command sends only a public address and public key. The local wallet helper creates the proof-of-control signature only after terminal approval.
