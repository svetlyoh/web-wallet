# LazyKins and Sanitize — Linux operator guide

This package contains exactly two OpenClaw skills: `lazykins` (displayed as LazyKins) and `sanitize`. It was built for **2026.11.6 only**. Nothing is installed or activated on a live Linux host by creating this Windows package.

Copy the complete package to the Linux account that runs OpenClaw. Do not use sudo. If transferring the paired ZIP:

```bash
mkdir -p "$HOME/Documents/LazyKins-Sanitize"
unzip LazyKins-Sanitize-2026.11.6.zip -d "$HOME/Documents/LazyKins-Sanitize"
cd "$HOME/Documents/LazyKins-Sanitize"
```

Python 3 and the installed `openclaw` executable are needed. The ready-built UI requires no Node/pnpm toolchain on the Linux host. Check transfer checksums before running the package:

```bash
sha256sum -c SHA256SUMS
```

## Resolve the actual service target

Inspect the service method you already use and match its profile, state directory, config file and executable to these controls. Use safe, targeted native inspection; never paste a full configuration or token-bearing dashboard URL into a report.

```bash
openclaw --version
openclaw --profile default gateway status --deep
openclaw --profile default config file --json
openclaw --profile default agents list --json
```

Replace `default` when that is not the running service's profile. After inspecting the real inventory, set these four values explicitly. The examples below are path syntax examples, not an inferred Linux account or agent:

```bash
OC_PROFILE='default'
OC_STATE_DIR="$HOME/.openclaw"
OC_AGENT='main'
OC_WORKSPACE="$HOME/.openclaw/workspace"
```

Both controllers bind state to the selected target. The paired installer verifies that the agent's configured workspace matches `OC_WORKSPACE`. A shared workspace is inappropriate for independently scoped Sanitize voice; its controller refuses enable if another configured agent shares that workspace.

If the service has a separate custom config file, append `--config-path '/absolute/custom config.json'` to paired/LazyKins commands, and put `--config '/absolute/custom config.json'` before the Sanitize operation. If needed, use `--openclaw '/absolute/path/openclaw'` for paired/LazyKins commands, and `--openclaw-bin '/absolute/path/openclaw'` before the Sanitize operation. The controls do not auto-select another profile or restart a different service.

## Register both skills

If upgrading an existing LazyKins installation, restore its old custom UI root first. From this new transfer folder (before replacing the installed skill), run:

```bash
python3 skills/lazykins/scripts/lazykinsctl.py off \
  --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"
```

This uses the existing ownership receipt even after the engine upgrade. It never activates the old UI. Follow any reported reload/restart requirement. If the root was changed independently, it refuses to overwrite that change. Keep recovery data. Sanitize's existing SOUL policy is preserved while its skill files are updated.

```bash
python3 install-both.py install \
  --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR" \
  --agent "$OC_AGENT" --workspace "$OC_WORKSPACE"
openclaw --profile "$OC_PROFILE" skills info lazykins --agent "$OC_AGENT" --json
openclaw --profile "$OC_PROFILE" skills info sanitize --agent "$OC_AGENT" --json
openclaw --profile "$OC_PROFILE" skills check --agent "$OC_AGENT" --json
```

The native install scanner and installation policy remain enforced. A rejection stops installation; the script does not bypass it. Registration is sequential, so a later rejection can leave the first skill registered. No UI or voice is enabled by registration. Rerunning is idempotent for identical files. A subsequent bundled update can replace an earlier installer-owned skill only if the installed files still match the recorded inventory; edited or unowned files are preserved with a conflict.

The paired installer is convenient, not a runtime dependency. Each complete folder under `skills/` can also be installed independently with native `openclaw skills install '/path/to/skill' --as NAME --agent "$OC_AGENT"`. Do not install either in Codex's personal skill directory.

## Enable LazyKins

```bash
LK_CTL="$OC_WORKSPACE/skills/lazykins/scripts/lazykinsctl.py"
python3 "$LK_CTL" status --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"
python3 "$LK_CTL" install --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"
python3 "$LK_CTL" on --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"
```

The UI build is staged and checksum-verified outside the npm/system package, under `STATE_DIR/lazykins/builds/`. `on` changes only the owned custom UI root field through native schema-validated config commands. This serving change is Gateway-wide. Follow the reported restart requirement through your existing service manager; no automatic restart is performed. Reload the browser and verify the served build, pairing, chat streaming, Stop, approvals and routes.

Use the visible **Quiet Desk / OpenClaw view** switch to turn the skin on or off instantly. The same selector is available in Appearance. Both skills stay installed; changing skin does not change Sanitize. The choice is saved for this browser and authenticated profile, and switching preserves the current conversation and draft. Host-level `off` below is for full custom-root rollback, not normal skin switching. Existing widgets and third-party UI customizations need verification against the new Solid release before claiming compatibility.

Files refers to the selected agent's real workspace files. Tasks uses OpenClaw's actual tasks route. These destinations retain upstream capability and permission checks. Sanitize setup is explained in Settings; there is no toggle that pretends to change agent policy without a backend.

## Enable Sanitize independently

```bash
SAN_CTL="$OC_WORKSPACE/skills/sanitize/scripts/sanitizectl.py"
python3 "$SAN_CTL" --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR" \
  --agent "$OC_AGENT" --workspace "$OC_WORKSPACE" status
python3 "$SAN_CTL" --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR" \
  --agent "$OC_AGENT" --workspace "$OC_WORKSPACE" on
python3 "$SAN_CTL" --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR" \
  --agent "$OC_AGENT" --workspace "$OC_WORKSPACE" complexity balanced
```

Use `simple`, `balanced`, or `detailed`; simple is the default. The controller installs its marked English policy into this workspace's `SOUL.md`. It preserves identity, unrelated edits, Unicode, exact code/quotes, and authorization. Its private SQLite receipt holds complete prior SOUL bytes for crash recovery. Protect the state directory.

Inspect the selected harness and bootstrap budgets before activation. Ordinary default sessions refresh bootstrap files, but `never`, continuation-skip, lightweight and some child-agent transports can omit SOUL. A saved policy is not a model-output receipt. Test ordinary browser requests in all complexity modes, new and existing sessions, compaction and restart using `skills/sanitize/references/response-examples.md`. Do not use real sends or paid actions as fixtures.

## Disable and rollback

Browser-only layout change: click **OpenClaw view**. Host-level UI rollback:

```bash
python3 "$LK_CTL" off --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"
```

This restores the original root if still owned, preserving an original custom root and other config fields. If the original field was absent, the controller removes only `root` with a native conditional parent write. It refuses a credential-bearing parent because config reads redact credentials. For that specific refusal, pause concurrent administrative edits, inspect that `gateway.controlUi.root` still points to the recorded LazyKins build, then run a supervised native `openclaw --profile "$OC_PROFILE" config unset gateway.controlUi.root`. Do not overwrite a user-changed root. Keep the receipt until browser restoration is confirmed. The controller can reconcile that recorded pending rollback afterward.

Independent voice disable:

```bash
python3 "$SAN_CTL" --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR" \
  --agent "$OC_AGENT" --workspace "$OC_WORKSPACE" off
```

User-edited policy blocks cause a conflict; inspect the diff rather than force removal or restore a whole-file backup over later edits. External editors do not share the controller lock, so avoid simultaneous manual SOUL editing. If OpenClaw's CLI is unavailable after an update, put `--offline` before Sanitize's `status` or `off` operation against the exact recorded target. It never enables new policy offline.

`lazykinsctl.py uninstall` performs owned root rollback and clears its installation receipt while retaining recovery builds. Remove the two discovery folders only after both rollback checks succeed and only if they remain owned copies. Neither uninstall nor removal should delete chats, credentials, schedules, user themes, other plugins or agent files. Retain recovery data until no longer needed.

If a LazyKins operation was interrupted and `operation.lock` remains, verify no controller process is running and inspect the pending receipt before removing only that lock. Sanitize uses a stable advisory lock file; do not delete its active lock.

## OpenClaw updates

```bash
python3 "$LK_CTL" check-update --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"
```

A mismatch returns exit 2 and an actionable next step. Before upgrading, disable the custom root. Skills, SOUL policy and product state live outside the package and remain installed after an engine update; this persistence does not promise protocol or harness compatibility. If the host auto-updates while LazyKins is enabled, its connected-version gate pauses work controls on a mismatch. Shell rollback remains available even if UI startup fails. No periodic polling, automatic engine update or remote repair download is installed.

For each future version, build from its exact tagged source, review the narrow integration patch, run regression and visual checks, record provenance, and only then admit the new version. Follow `skills/lazykins/references/compatibility.md` and the shipped runtime build instructions. Keep the previous generation and a verified stock UI available. Sanitize must separately revalidate the matching harness before adding a new allowed baseline.
