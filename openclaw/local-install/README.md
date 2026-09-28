# Local OpenClaw updates

This creates a self-contained Linux folder for Streaming Mode and Gear Engine. Installation and later updates use only that folder; they do not fetch GitHub or ClawHub.

## Build the transfer folder on Windows

From `Open_Claw3` in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\github-web-wallet\openclaw\local-install\prepare-local-bundle.ps1
```

The command creates these two local artifacts beside `github-web-wallet`:

- `OpenClaw-Local-Updates\` — a ready-to-copy folder
- `OpenClaw-Local-Updates.zip` — the same folder packaged for USB, a network share, or another direct PC transfer

The bundle includes SHA-256 checksums. It contains the prebuilt payloads, so the Linux computer does not need source code or build tools.

## Install or update on the Linux OpenClaw PC

Copy the folder or ZIP to the Linux PC. If you copied the ZIP:

```bash
mkdir -p ~/Documents/OpenClaw-Local-Updates
unzip OpenClaw-Local-Updates.zip -d ~/Documents/OpenClaw-Local-Updates
```

Run the installer as the same Linux account that runs OpenClaw, without `sudo`:

```bash
cd ~/Documents/OpenClaw-Local-Updates
bash install-local.sh all
```

For only the current Control UI repair, run:

```bash
bash install-local.sh streaming
```

The streaming action applies the corrected payload first, then registers the same folder as a shared OpenClaw skill. This order repairs the Control UI even if an older or removed skill caused the current UI to fail. It does not restart the Gateway. Hard-refresh the browser when it finishes.

For later updates, replace this local bundle with the newer folder and rerun the same command. `openclaw skills update --all` updates ClawHub-tracked skills only and does not refresh local-folder installs.

Other actions:

```bash
bash install-local.sh status
bash install-local.sh rollback-streaming
bash install-local.sh rollback-gear
```

Streaming Mode remains version-locked to the official OpenClaw 2026.9.6 build identity. The installer stops before changing files if the installed Gateway or payload does not match.

