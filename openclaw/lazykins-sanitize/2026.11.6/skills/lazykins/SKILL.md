---
name: lazykins
description: Install and manage LazyKins modes for OpenClaw's Linux Control UI, including Quiet Desk and Command Deck, browser mode entry/exit, compatibility checks and reversible host deployment.
metadata: {"openclaw":{"requires":{"bins":["python3","openclaw"]},"os":["linux"]}}
---

# LazyKins

OpenClaw underneath. LazyKins on top. Quiet Desk and Command Deck are modes in one installed UI; Sanitize remains independent.

Identify the Linux host, selected OpenClaw profile and state directory. Inspect status first. These script operations belong to this skill, not to OpenClaw's native CLI:

```bash
python3 "{baseDir}/scripts/lazykinsctl.py" status --profile PROFILE --state-dir STATE_DIR
```

For install, repair, enable, or a post-upgrade check, read [compatibility](references/compatibility.md). For navigation, independent browser controls and Sanitize setup, read [Quiet Desk](references/quiet-desk.md).

Use the same command with `install`, `on`, `off`, `check-update`, `repair`, or `uninstall`. Pass an explicit `--config-path` when the selected profile uses a custom config file. `install` verifies and stages local static assets; `on` points the Gateway at that build. This serving change affects the entire Gateway. The Quiet Desk/OpenClaw view selector affects this browser's profile only. `off` restores the original custom-root setting if still owned. It does not disable Sanitize. `repair` verifies and restages the shipped generation; it never downloads repairs or overwrites modified builds.

After activation, follow the config reload hint and verify the browser's actual served build, authentication, chat, Stop, approvals and navigation. Report configured state separately from browser verification. Never say active merely because the config was saved. Preserve unrelated config and customizations. Do not weaken skill installation gates, authentication or plugin permissions.

Use the lower-left mode entry buttons and top-right exit control for normal layout changes. Exit changes presentation, not running work, scheduled jobs, voice policy or installed skills. For “Go back to OpenClaw view,” use this browser control; do not change a Gateway-wide root for a request scoped to one browser. For complete host rollback, use `off`. `uninstall` restores the root and retains recovery builds; skill discovery removal is separate. Never remove conversations, credentials, themes, agent files, or other plugins.

Command Deck's priority queue requires its optional, separately validated native backend. Without it, show the unavailable state; native Workboard is not a replacement for priority semantics. Installing or enabling the backend requires the native plugin scanner/capability flow and explicit operator action. Entering a mode never installs a backend or creates/sends/schedules work.

Only 2026.11.6 is verified. Skills and persistent settings live outside the package and survive package updates. Future releases need a matching-source build and regression checks before activation; no blanket compatibility claim.
