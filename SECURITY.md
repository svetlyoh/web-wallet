# Lingry Security

## Wallet Private Key And WIF Backup

Lingry OpenClaw wallets are created locally and encrypted in `~/.lingry/keystore.json` with the local passphrase. The WIF private key is never sent to the Lingry API and is never printed in normal `create-wallet` output.

Supported terminal-only recovery:

```bash
lingry-openclaw export-private-key --confirm
```

This command requires an interactive private terminal and the exact typed confirmation `DISPLAY-WIF`. It is not supported through Telegram, OpenClaw chat, cron, or any remote API endpoint.

Secure offline backup options:

- Keep the encrypted keystore and passphrase in separate places.
- Store an offline encrypted USB backup.
- Write an offline recovery record and store it securely.

## Starter Grant

The 0.025 SUGAR starter grant uses a server-side Cloudflare Worker flow. The local wallet signs a challenge with its new key, but the user WIF never leaves the computer. The grant wallet WIF must only exist as a Cloudflare secret named `LINGRY_GRANT_WALLET_WIF`.

Never commit or log WIFs, passphrases, Cloudflare tokens, `.dev.vars`, user keystores, or production secrets.
