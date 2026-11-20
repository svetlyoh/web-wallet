# Command Desk queue backend

This is the actual durable Command Desk queue, ported from the existing
`lazykins-command-desk` plugin. It is optional infrastructure for the combined
LazyKins UI modes, not another user-facing skill and not an alias for Workboard.
Sanitize remains the only voice-policy owner. This backend imports no voice module,
injects no prompt, and registers no voice RPC.

The source-validated host is OpenClaw **2026.11.6**, release commit
`06afb10d3272cc9deaf38ca6a3b7b839d5935638`. Service startup refuses other host
versions before opening state. Node requirements match that host:
`>=24.16.0 <25 || >=26.1.0`.

Plugin ID `lazykins-command-desk` and state path
`<active-state-dir>/lazykins-command-desk/tasks.sqlite3` stay unchanged. Schema v1
and queue row `queue-v1` remain readable without migration. Do not delete that
directory when replacing code or disabling the plugin. SQLite access stays in a
private worker; CAS rejects conflicting writers and shared authority revocation
rejects work after service stop. This is plugin-owned state, not trusted-only shared
OpenClaw storage. Backups may contain task prompts; keep them private.

Existing optional `voiceAgents`, `profile`, and `skillRoot` config fields still pass
validation for upgrades. They are deprecated, ignored, and produce a warning. No new
config fields are required. The host service context owns the active state directory.

## Real queue behavior

P1/P2/P3 use FIFO tie-breaking and ten-minute aging, with one dispatched job at a
time. Scheduled intent becomes eligible at its explicit timestamp. Pending work can
change priority or cancel with optimistic `expectedVersion`; dispatched work cannot
be paused/canceled by this queue. Retry creates new work and requires an explicit new
idempotency key. It cannot undo effects and is not an automatic resume.

Dispatch records intent before submitting a native Cron `at` job with an `agentTurn`
payload and `session:<canonical-session-key>` target. Native delivery is `none` and
jobs are retained for restart reconciliation. Lost submission acknowledgements are
blocked when no corresponding native job can be established; there is no automatic
duplicate submission. An observed native `completionStatus: succeeded` event can
mark success. A job-list `lastRunStatus: ok` without the observed completion event
remains blocked for source-conversation review, because it does not establish the
semantic outcome. Late terminal events cannot rewrite a terminal task.

The native Gateway service scheduler owns a coalescing two-second reconciliation
callback. This admits future scheduled work and reconciles real native job state;
it is not a browser poller, second WebSocket, agent turn, or model retry loop. Service
stop cancels timed dispatch, revokes storage, drains admitted operations, and closes
the worker. Existing native Cron jobs remain owned by the native scheduler after
plugin disable; disabling presentation or queue admission does not cancel already
submitted external effects.

## Browser contract

All methods below require `operator.admin`, as registered in native descriptors:

| Method | Input | Result |
| --- | --- | --- |
| `commanddesk.tasks.list` | `{}` | `{schemaVersion:1, revision, tasks, capabilities}` |
| `commanddesk.tasks.create` | `{sessionKey,title,message,idempotencyKey,priority?,scheduleAtMs?,timezone?,sourceRunId?}` | Saved task |
| `commanddesk.tasks.priority` | `{id,priority,expectedVersion?}` | Updated pending task |
| `commanddesk.tasks.cancel` | `{id,expectedVersion?}` | Canceled pending task |
| `commanddesk.tasks.retry` | `{id,idempotencyKey}` | New task; source linkage retained |

Priorities are integer 1, 2, or 3. `scheduleAtMs` is an explicit future UTC epoch
millisecond value or absent/null. Timezone is an IANA name; clients should supply
the user's resolved timezone explicitly. Session keys must match
`agent:<agent-id>:<session>`; this admin-only plugin does not grant a non-admin
participant new cross-agent access.

Task fields include `id`, `title`, `message`, `sessionKey`, `priority`,
`idempotencyKey`, `scheduleAtMs`, `timezone`, `createdAtMs`, `updatedAtMs`, `status`,
`version`, `sourceRunId`, plus observed `dispatchStartedAtMs`, `jobId`, `runId`, and
`error`. Per-task capabilities are `{priority,cancel,retry,pause:false,resume:false}`.
List capabilities are `{priority:true,pause:false,stopRunning:false,concurrency:1,
scope:"Command Desk-owned jobs",schedulerEnabled:boolean|null}`.

The existing Gateway event transport broadcasts
`plugin.lazykins-command-desk.changed`, payload `{revision}`, admin scope. Clients
refresh from list after this invalidation, reject stale connection/request receipts,
and gate controls on the connected method catalog plus current authorization. If
the plugin/methods are absent, the queue is unavailable; showing Workboard does not
mean this queue was installed. No voice method exists in this backend.

## Native install, replacement, and rollback

Use the same service account and explicit profile/state/config as the Gateway.
`OC_BACKEND` must be this reviewed directory on the actual Gateway host. These
commands are native OpenClaw commands, not executed by this package during tests.

```bash
export OPENCLAW_PROFILE="$OC_PROFILE"
export OPENCLAW_STATE_DIR="$OC_STATE_DIR"
export OPENCLAW_CONFIG_PATH="$OC_CONFIG_PATH"
openclaw --profile "$OC_PROFILE" plugins inspect lazykins-command-desk --runtime --json
openclaw --profile "$OC_PROFILE" plugins validate --root "$OC_BACKEND" --json
openclaw --profile "$OC_PROFILE" plugins install "$OC_BACKEND" --force --accept-capabilities
openclaw --profile "$OC_PROFILE" plugins inspect lazykins-command-desk --runtime --json
```

The local-source `--force` acknowledges the reviewed arbitrary source and permits a
same-ID replacement. It does not bypass install policy. Capability consent remains
native; no official trust, allowlist rewrite, permission gate disabling, or manual
DB edit is used. When a local Gateway runs, install routes through it and drains the
old plugin generation before replacement. A lost reply must be reconciled using
inspect before retrying. If an operator wants staging without changing activation,
add `--no-enable`: that preserves activation policy and does not disable an already
enabled plugin.

```bash
# Repair activation only after inspecting a failed installation; do not reinstall blindly.
openclaw --profile "$OC_PROFILE" plugins reload lazykins-command-desk --wait --accept-capabilities --json
# Stop new queue admission, preserving queue data and existing native jobs.
openclaw --profile "$OC_PROFILE" plugins disable lazykins-command-desk
```

This port does not run `plugins update`: native updates require exclusive offline
custody and follow the tracked source, which may be the old source directory. A
reviewed replacement from this exact local folder uses `plugins install --force`
instead. Code rollback to the former plugin also needs a host version supported by
that plugin; the old 2026.9.6 build is not a valid rollback on a 2026.11.6 host. Keep
the prior reviewed compatible code generation or disable the optional plugin.

## Verification commands and limits

Portable Node tests need no installed dependencies and use isolated state under
`tests/`:

```bash
cd "$OC_BACKEND"
node --test tests/backend.test.js
```

The native seam proof requires the exact release checkout and its matching installed
dependencies/toolchain. It uses the actual manifest/config validator, production
plugin loader, native service lifecycle/scheduler, native Cron store and run method,
native `cron_changed` hook routing, and production private SQLite worker. The agent
runner is synthetic and never sends email or performs a real model call:

```bash
node --import "$OC_SOURCE/scripts/tsx.mjs" "$OC_BACKEND/tests/native-proof.mts" "$OC_SOURCE"
```

Portable tests do not prove the native seam. The native proof does not test a live
Gateway WebSocket authentication handshake, browser rendering, real approvals,
model execution, or production service reload. Inspect CI/native-proof output before
claiming that seam passed; no live plugin is registered by this development work.

Exact tagged contracts inspected: `src/plugins/plugin-registration.types.ts`,
`service-cron.ts`, `service-scheduler.types.ts`, `gateway-events.ts`,
`registry-registrars-network.ts`, `hook-gateway.types.ts`, and native plugin CLI
install/update guides in `docs/cli/plugins/`. The public service Cron wrapper
normalizes the native input and guards its final commit against service/scheduler
retirement; this backend does not import private core modules at runtime.
