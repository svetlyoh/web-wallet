# Lingry Terminal Commands

Create a wallet and request the starter grant:

```bash
lingry-openclaw create-wallet
```

Show the public address:

```bash
lingry-openclaw address
```

Claim or check the idempotent 0.025 SUGAR starter grant:

```bash
lingry-openclaw claim-starter-grant
```

Export the wallet private key for offline backup:

```bash
lingry-openclaw export-private-key --confirm
```

`export-private-key --confirm` is local-only, terminal-only, interactive-only, and never supported through Telegram or OpenClaw chat. It requires typing `DISPLAY-WIF`.

Daily Lingry subscription:

```bash
lingry-openclaw install-daily-cron
lingry-openclaw daily-popular-pick
```
