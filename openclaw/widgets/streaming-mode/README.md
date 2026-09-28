# OpenClaw Streaming Mode

An optional Control UI view for OBS and video streaming. It gives the conversation the full window, increases transcript text to at least 18 px with 1.6 line spacing and a 60-character reading measure, keeps navigation in a drawer, and lets you minimize the composer. The setting is off by default and is remembered in that browser.

Compatible host: **OpenClaw 2026.9.6** (source `eb377ac59e6c9fd6c7705028034812becf00271b`). The installer stops before changing files on any other version and never upgrades OpenClaw.

## Install or update on Linux

### Local folder (recommended for direct PC-to-PC updates)

Create the self-contained transfer folder on Windows with [`openclaw/local-install/prepare-local-bundle.ps1`](../../local-install/prepare-local-bundle.ps1), copy it to the Linux PC by USB or a local share, then run:

```bash
cd ~/Documents/OpenClaw-Local-Updates
bash install-local.sh streaming
```

The command verifies the copied files, applies the corrected payload directly from the folder, and registers the same local folder as the shared `streaming-mode` skill. To update later, replace the local bundle and rerun the command. `openclaw skills update --all` does not refresh local-folder installs.

### ClawHub

```bash
openclaw skills install @svetlyoh/streaming-mode
```

Then ask your OpenClaw agent: **Install Streaming Mode using the streaming-mode skill.** The skill uses its bundled, checksum-verified payload and keeps the original Control UI for rollback. Update the skill later with `openclaw skills update --all`, then ask the agent to install the updated payload.

The installer now verifies the official Gateway build identity in `dist/build-info.json` before changing files and refuses a payload built for a different Gateway artifact.

### Direct from GitHub

Run this as the Linux account that owns and runs the existing OpenClaw installation, without `sudo`:

```bash
curl -fL https://raw.githubusercontent.com/svetlyoh/web-wallet/master/openclaw/widgets/streaming-mode/scripts/download-install.sh -o /tmp/openclaw-streaming-install.sh && bash /tmp/openclaw-streaming-install.sh
```

The command downloads only this folder, verifies the prebuilt payload, saves the original Control UI under `~/.openclaw`, installs Streaming Mode, and verifies the installed marker. Backup and installation can take a couple of minutes; the installer prints a message before that quiet step. You do **not** need to uninstall first, rebuild OpenClaw, or restart the Gateway.

Hard-refresh the Control UI browser tab after the command completes. Use **Streaming Mode** at the bottom of the desktop sidebar. On a compact or phone layout, open the navigation drawer first. While streaming, use **Exit stream** in the top bar and **Minimize composer** below the conversation.

Re-run the same one-line command to update this feature. The first original backup is retained for rollback.

## Roll back

```bash
node "${XDG_DATA_HOME:-$HOME/.local/share}/openclaw-streaming-mode-source/openclaw/widgets/streaming-mode/scripts/install.mjs" rollback
```

Then hard-refresh the browser tab. Rollback restores the exact Control UI saved by the first install. The Gateway does not need a restart.

Roll back **before** uninstalling the skill. Removing a skill removes its instructions and bundled installer; it does not modify the already installed OpenClaw application files or delete the rollback backup.

If the skill was already removed, stop the Gateway and recover directly from GitHub:

```bash
curl -fL https://raw.githubusercontent.com/svetlyoh/web-wallet/master/openclaw/widgets/streaming-mode/scripts/install.mjs -o /tmp/openclaw-streaming-recover.mjs && node /tmp/openclaw-streaming-recover.mjs rollback
```

Start OpenClaw normally afterward and hard-refresh the browser.

## Fixed restart failure

The original payload carried a generated development build identity. OpenClaw 2026.9.6 accepted its files before restart, but the restarted Gateway compared that identity with the immutable ID in the official npm package and rejected the UI as stale. The corrected payload carries the official `2026.9.6-release-eb377ac59e6c-2026-09-23T16-33-12.144Z` identity, and the installer checks both the manifest and extracted `index.html` before swapping directories.

## Gear Engine compatibility

The existing Gear Engine plugin remains installed and enabled because this package changes only `dist/control-ui`. Streaming Mode keeps OpenClaw's native `session-header` accessory host mounted, so the gears remain visible while streaming. The gear instrument scales down inside a narrow accessory slot while preserving its square SVG aspect ratio. Gear Engine's own activity, animation, settings, and rollback remain separate.

## Why this is a patch

OpenClaw 2026.9.6 plugins can add a session-header accessory, but they cannot replace the whole application shell, sidebar, or composer. A skill also cannot change browser layout. The repository therefore ships a version-locked, prebuilt Control UI patch with a backup, checksum, repeatable update command, and rollback.

## Verification

The source patch and QA evidence are in `source/` and `qa/`. Automated checks cover preference persistence and unavailable browser storage, normal-mode restoration, drawer behavior, composer minimize/restore, 1280×720, 800×400, 390×844, horizontal overflow, and the complete Gear Engine compatibility contract: native accessory host, `session-header` placement, and responsive gear sizing.

Installer tests:

```bash
npm test
```

Source build reference:

```bash
git clone https://github.com/openclaw/openclaw.git
git -C openclaw checkout eb377ac59e6c9fd6c7705028034812becf00271b
git -C openclaw apply /path/to/source/openclaw-2026.9.6-streaming-mode.patch
OPENCLAW_CONTROL_UI_BUILD_ID=2026.9.6-release-eb377ac59e6c-2026-09-23T16-33-12.144Z pnpm -C openclaw ui:build
```
