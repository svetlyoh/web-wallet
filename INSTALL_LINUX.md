# Lingry OpenClaw Linux Install

```bash
mkdir -p "$HOME/lingry-openclaw"
cd "$HOME/lingry-openclaw"
git clone https://github.com/svetlyoh/web-wallet.git
cd web-wallet/openclaw/skills/lingry
npm install
bash install-linux.sh
```

The installer automatically enables the free 0.025 SUGAR starter balance claim when a new local wallet is created.

It sends only your new public address, public key, and a signature proving you control the new wallet. Your private key and wallet passphrase remain only on this computer.

Common commands:

```bash
lingry-openclaw create-wallet
lingry-openclaw address
lingry-openclaw claim-starter-grant
lingry-openclaw daily-popular-pick
lingry-openclaw install-daily-cron
```

Terminal-only WIF backup:

```bash
lingry-openclaw export-private-key --confirm
```

Never run private-key export from Telegram or OpenClaw chat.
