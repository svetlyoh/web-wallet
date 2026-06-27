# Lingry Troubleshooting

## Starter Grant, 0.025 SUGAR, And New Wallet Funding

If `create-wallet` reports `pending_or_unavailable`, the wallet was still created successfully. Retry:

```bash
lingry-openclaw claim-starter-grant
```

Production starter grants remain safely disabled until the Cloudflare administrator configures the grant wallet secret, funding address, budgets, rate limits, and kill switch.

## Wallet Private Key And WIF Backup

Normal wallet creation does not print the WIF. Use a private interactive terminal:

```bash
lingry-openclaw export-private-key --confirm
```

Type `DISPLAY-WIF` only when you are ready to make an offline backup. Clear terminal scrollback afterward.

## Cloudflare Secret And Grant Wallet

The administrator must configure these outside Git:

```bash
npx wrangler secret put LINGRY_GRANT_WALLET_WIF
```

The non-secret expected funding address is configured as `LINGRY_GRANT_FUNDING_ADDRESS`. The Worker refuses to broadcast if the WIF-derived address does not match.
