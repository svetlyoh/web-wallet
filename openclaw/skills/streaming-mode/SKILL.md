---
name: streaming-mode
description: Install, verify, update, or roll back the bundled Streaming Mode Control UI for OpenClaw 2026.9.6 on Linux.
metadata:
  openclaw:
    requires:
      bins:
        - node
        - npm
        - openclaw
        - sh
        - tar
    envVars:
      - name: OPENCLAW_INSTALL_ROOT
        required: false
        description: Optional path to the OpenClaw package directory when automatic discovery cannot locate it.
      - name: OPENCLAW_STATE_DIR
        required: false
        description: Optional OpenClaw state directory; defaults to ~/.openclaw.
    os:
      - linux
    emoji: "📺"
    homepage: https://github.com/svetlyoh/web-wallet/tree/master/openclaw/skills/streaming-mode
---

# OpenClaw Streaming Mode

Use this skill when the user asks to install, update, check, troubleshoot, or roll back Streaming Mode. It replaces only the installed OpenClaw 2026.9.6 Control UI directory and keeps the first original UI as a rollback backup.

## Safety and compatibility

- Run only on Linux with OpenClaw 2026.9.6. The installer refuses every other host version before changing files.
- Run commands from this skill directory so `scripts/install.mjs` can find the bundled payload.
- Do not use `sudo`, weaken file permissions, disable checksum verification, or download a replacement payload.
- The bundle requires no credentials and makes no network requests during installation.
- Existing native Control UI plugins remain enabled. Streaming Mode keeps the `session-header` accessory host mounted, so the Gear Engine widget remains visible and responsive while Streaming Mode is active.
- The installer verifies the bundled archive against `payload/manifest.json`, stages the new UI, and swaps directories atomically.
- The payload is built from the OpenClaw source commit recorded in the manifest. Its upstream MIT license and third-party notices are included under `licenses/`.
- State and the first backup are stored under `${OPENCLAW_STATE_DIR:-~/.openclaw}`. Preserve them until the user no longer needs rollback.
- If automatic discovery cannot locate OpenClaw, set `OPENCLAW_INSTALL_ROOT` only to the package directory whose `package.json` name is `openclaw`.

## Check status

Run:

```sh
node scripts/install.mjs status
```

Report the detected OpenClaw version and whether Streaming Mode is active.

## Install or update

When the user asks to install or update, run:

```sh
node scripts/install.mjs install
```

The backup and copy step can take a couple of minutes. Do not interrupt it. On success, tell the user to hard-refresh the Control UI. The Gateway does not need a restart.

## Roll back

When the user asks to remove or roll back Streaming Mode, run:

```sh
node scripts/install.mjs rollback
```

Rollback refuses to overwrite a Control UI that no longer carries the Streaming Mode marker. On success, tell the user to hard-refresh the browser tab.

## Troubleshooting

- A version error means this bundle does not support the installed OpenClaw release. Leave the installation unchanged.
- A checksum error means the bundled payload is incomplete or altered. Reinstall the skill from ClawHub; do not bypass the check.
- A discovery error means the OpenClaw package could not be found from the `openclaw` binary or global npm root. Set `OPENCLAW_INSTALL_ROOT` to the verified package directory and retry.
- If rollback reports no tracked backup, do not copy files manually. Report the state path shown by the installer.
