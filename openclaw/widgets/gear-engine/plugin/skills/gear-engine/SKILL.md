---
name: gear-engine
description: Explain or troubleshoot the installed Gear Engine native OpenClaw activity widget, its receipt indicators, version requirements, and reversible installer.
---

Gear Engine is installed as a native UI plugin named `openclaw-gear-engine`. This skill describes it; loading the skill alone does not mount the widget.

The supported host is OpenClaw 2026.9.6. The widget appears in a reserved chat-header accessory row when Custom plugin UI is enabled. Use the same Gateway's HTTPS UI or localhost. Reload the browser after installation. Compact embedded panes may omit the host accessory slot.

Input is a brief recent user-message receipt. Processing shows authorized reported active sessions, excluding queued sessions and observed approval waits. Delivery is a brief browser UI-update receipt, not confirmation of external message delivery. Token rates are unavailable; displayed token totals are last-known session usage. The visible-session query is bounded to 200 rows and discloses truncation. Some provider waits are not exposed by this host API.

For troubleshooting, inspect `openclaw plugins inspect openclaw-gear-engine --runtime --json`, `openclaw gateway call plugins.controlUi.list --json`, and the browser's Plugins → Customize UI diagnostics. Check the installed version and `gateway.controlUi.experimental.customPlugins`. Do not weaken auth, origins, CSP, or pairing to load native assets.

The GitHub source and install/rollback instructions are at https://github.com/svetlyoh/web-wallet/tree/master/openclaw/widgets/gear-engine. The managed download's `scripts/install.mjs rollback` disables the widget and restores the UI setting recorded by the installer. Preserve the installer record while troubleshooting.
