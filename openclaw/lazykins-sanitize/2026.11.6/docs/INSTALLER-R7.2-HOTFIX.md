# Command Deck R7.2 installer correction

November 25, 2026. OpenClaw 2026.11.6 only.

R7.1 could fail immediately after maintenance approval: its captured CLI output makes the native stop command noninteractive. This native version requires explicit --force acknowledgment in that case. R7.2 supplies that acknowledgment only after the existing service-target checks and typed maintenance approval. It does not bypass native agent, permission or source review.

A failed recovery start could hide the original installation failure. Both errors are now retained. A native start can also report a short readiness timeout while the service subsequently becomes healthy. The installer starts once, then rechecks the same service/config/profile and supported version up to fifteen times, two seconds apart. It does not repeatedly restart a slow-starting service or change its startup configuration.

The operator's supplied status showed the Gateway running and reachable after a one-second start timeout. Only baseline.json was present, with no agent Add approvals. That run did not complete crew registration or new UI installation. The shutdown drain warning is separate; this hotfix does not edit host systemd settings or grant operator scopes.

Download the R7.2 combined ZIP and its .zip.sha256 file from the R7.2 GitHub release, verify the archive checksum, extract into a fresh directory, verify SHA256SUMS and run:

```bash
python3 setup-command-deck.py --profile default --state-dir "$HOME/.openclaw"
```

Leave the normal managed Gateway running before setup; the installer handles approved maintenance. Review each agent separately. Existing verified crew are reused. Main/default/models/channels and the authored crew resources are preserved. Delegation remains separately approved. No host reboot or uninstall is required.

R7.2 reuses the exact production UI and crew bytes from the checksum-pinned R7.1 ZIP, verified by production run 45055852841. Only installer/test/packaging/documentation metadata changes. Installer tests include the native noninteractive-stop acknowledgment, a failed start followed by healthy status without another restart, and preservation of both primary/recovery failures.

No authenticated Ubuntu host is available to development. Provider-backed chats, delegation and full live installation remain unverified; the installer records actual host-side receipts when run.
