# Lingry Security

## Human wallet

The existing browser wallet keeps human signing authority on the user's device. No OpenClaw skill command accepts a human wallet private key, WIF, seed phrase, mnemonic, or passphrase. Never commit or log wallet material, Cloudflare secrets, RPC credentials, or funding keys.

## OpenClaw skill

The ClawHub client at `openclaw/skills/lingry` stores no credentials or candidate state on disk. It communicates only with `https://lingry.net`. Generation creates a server-held, expiring candidate and no transaction. Coining requires an explicit user publication request and a validated candidate ID; the API request has no arbitrary outputs, amount, destination, record, or signing key.

Lingry's server constructs the canonical word record, signs a fixed publication transaction, and broadcasts it. Its publisher key and funding key remain server-side. Per-candidate operation records and the stored candidate status prevent a repeated coin request from creating another publication.

The source repository includes tests and documentation. The ClawHub artifact is built from an allowlist with `npm run build:clawhub`; review `dist/clawhub-lingry/` before publication.
