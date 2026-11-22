# Install Command Deck R7.1 on Ubuntu

Requires onboarded **OpenClaw 2026.11.6**, a working configured default model, its native managed Gateway service, Python 3.11+, curl and unzip. Run as the OpenClaw service user, without sudo. The package includes the ready-built UI; no Node/pnpm or compression tool is needed on Ubuntu.

```bash
(
set -e
OC_BUNDLE="$(mktemp -d "$HOME/CommandDeck-r7.1.XXXXXX")"
cd "$OC_BUNDLE"
OC_RELEASE='https://github.com/svetlyoh/web-wallet/releases/download/lazykins-commanddeck-helm-2026.11.6-r7.1'
OC_ZIP='LazyKins-CommandDeck-Helm-2026.11.6-r7.1.zip'
curl -fL --retry 2 "$OC_RELEASE/$OC_ZIP" -o "$OC_ZIP"
curl -fL --retry 2 "$OC_RELEASE/$OC_ZIP.sha256" -o "$OC_ZIP.sha256"
sha256sum -c "$OC_ZIP.sha256"
unzip -q "$OC_ZIP" -d bundle
cd bundle
sha256sum --quiet -c SHA256SUMS
python3 setup-command-deck.py --profile default --state-dir "$HOME/.openclaw"
)
```

Review and type each requested approval: maintenance, Templates Labs if disabled, and each missing agent individually. The installer registers and verifies native Helm, Jace and Cruz before enabling Command Deck, then offers a separate optional Helm delegation target grant. It preserves ordinary main/default/models/channels, reuses verified existing crew and restores an originally running service on cancellation/failure. It creates no channel bot accounts and runs no model task.

After completion, reload your usual OpenClaw dashboard and click **Enter Command Deck**. Helm is first; Jace/Cruz are separate selectable native agents. Main remains available through the deliberate Other OpenClaw agents toggle. Sanitize remains separately controlled.

For custom profiles/state/config, use the values belonging to your actual service instead of the default example. The wizard supports --config-path and --openclaw. Unmanaged/mismatched services or edited/colliding crew require the bundled manual review guide. Native onboarding/provider account setup remains an OpenClaw prerequisite, not part of this ZIP.

Private receipt paths are printed. A registered agent or configured target allowlist does not prove a successful provider response or effective delegation/tool policy. Test a short direct chat with each crew member after setup, then authorize a small Helm delegation if desired. Development build/browser fixtures were synthetic; no Ubuntu host was remotely accessed.
