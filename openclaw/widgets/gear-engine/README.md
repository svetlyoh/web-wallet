# OpenClaw Gear Engine

A native OpenClaw plugin with three SVG gears in a reserved, right-aligned chat-header row. The compiled widget ships here, so Linux users do not need to build OpenClaw, install Codex, or ask an agent to write code.

Compatible host: **OpenClaw 2026.9.6** (source `eb377ac59e6c9fd6c7705028034812becf00271b`). Other versions stop before changes; this installer never upgrades OpenClaw. Native UI APIs are experimental, so additional versions need verification before being added.

## Install on Linux

### Local folder (recommended for direct PC-to-PC updates)

Create the self-contained transfer folder on Windows with [`openclaw/local-install/prepare-local-bundle.ps1`](../../local-install/prepare-local-bundle.ps1), copy it to the Linux PC by USB or a local share, then run:

```bash
cd ~/Documents/OpenClaw-Local-Updates
bash install-local.sh gear
```

Rebuild and replace the local bundle when the source changes, then rerun the same command. The installer uses the bundled plugin directory and makes no GitHub or ClawHub request.

### ClawHub

```bash
openclaw plugins install clawhub:@svetlyoh/openclaw-gear-engine
openclaw plugins enable openclaw-gear-engine
openclaw config set gateway.controlUi.experimental.customPlugins true --strict-json
openclaw plugins reload openclaw-gear-engine --json
```

This is the standard ClawHub package route. Reload the Control UI after the commands finish. Future catalog updates use `openclaw plugins update --all`.

### Direct from GitHub

Run this as the Linux account that runs your existing OpenClaw Gateway, without `sudo`. The Gateway must already be running. You need `curl`, `git`, `node`, and `openclaw` on PATH.

```bash
curl -fL https://raw.githubusercontent.com/svetlyoh/web-wallet/master/openclaw/widgets/gear-engine/scripts/download-install.sh -o /tmp/openclaw-gear-install.sh && bash /tmp/openclaw-gear-install.sh
```

This downloads the widget folder, installs its prebuilt native plugin, enables it and OpenClaw's **Custom plugin UI** setting, reloads the plugin, and verifies its entry in the running Gateway's UI catalog. It records the previous setting for rollback. Re-running the command updates the downloaded files and repeats verification.

Then reload your usual OpenClaw Control UI. Use the connected Gateway's **HTTPS address or localhost**; plain HTTP on a LAN IP cannot authenticate native plugin assets. This is an OpenClaw host requirement, and the installer does not change authentication or network settings. On the Linux machine, `openclaw dashboard` can open the normal local UI.

The gear accessory appears automatically on ordinary chat panes. Compact embedded panes omit OpenClaw's accessory slot. The SVG scales down without distortion when a narrow or streaming layout reduces its available width. Click the gears for details, size, or Hide; use the scope selector for this chat or visible work. The existing Stop button continues to own cancellation.

## What the gears mean

| Gear | Live source | Meaning |
|---|---|---|
| I | Authorized `session.message` user receipt | 540 ms recent-input afterglow; not an upload progress meter |
| P | Authorized session snapshot | Reported active sessions; queued sessions park; known approval events park the affected session |
| D | Sequenced `chat` updates received by the browser | 540 ms UI-update afterglow; **not external channel delivery confirmation** |

The widget observes up to 200 authorized sessions and flags truncated results. It uses OpenClaw's existing authenticated connection and session owner, with no extra socket, public port, model call, or telemetry server. It retains presentation metadata only. Session input/output token counts remain visible as last-known usage; token rates remain unavailable because this API does not provide per-call duration. Unknown/disconnected state freezes motion. Some provider waits are not exposed by the host, so reported active sessions can include those waits.

This is the installable native-API edition. The broader transport-attempt tracking, all-channel sends, volume-based token glow, and precise per-operation cancellation from the original design require additional server contracts and are not implemented here. The original design is retained under `reference/` for that future work.

## Rollback

```bash
node "${XDG_DATA_HOME:-$HOME/.local/share}/openclaw-gear-engine-source/openclaw/widgets/gear-engine/scripts/install.mjs" rollback
```

Rollback disables this plugin and restores the prior Custom plugin UI setting if it still has the value the installer set. Plugin files remain available for diagnosis or reinstall. Reload browser tabs afterward. A failed install attempts this same recovery and reports any incomplete recovery. An existing installation of the same plugin ID that this installer does not own is preserved and requires deliberate migration.

## Development and verification

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The source is TypeScript + Lit + SVG. The self-contained browser bundle is checked in under `plugin/dist/control-ui/`; no npm install runs on the user's machine. The GitHub workflow checks the build and browser behavior, then installs and rolls back against an isolated Linux Gateway at the exact supported version, without channel/model credentials.

The bundled skill provides usage and troubleshooting instructions only. Installing the plugin performs the actual integration.

Host references: [Native feature plugins](https://docs.openclaw.ai/plugins/feature-plugins), [plugin installation](https://docs.openclaw.ai/cli/plugins/install), [versioned UI contract](https://github.com/openclaw/openclaw/blob/v2026.9.6/src/plugin-sdk/control-ui.ts).
