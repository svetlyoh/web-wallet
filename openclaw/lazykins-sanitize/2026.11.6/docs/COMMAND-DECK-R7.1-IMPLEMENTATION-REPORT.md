# Command Deck R7.1 implementation report

Date: November 22, 2026. Target: OpenClaw **2026.11.6** only, exact source `06afb10d3272cc9deaf38ca6a3b7b839d5935638`.

## Outcome and registration status

R7.1 adds a guided fresh Ubuntu installer and the incremental crew/main guard corrections. Helm, Jace and Cruz are native OpenClaw agent Templates, not channel bot accounts or additional skills. The new combined ZIP includes the built UI, original authored crew resources, two separate skills and `setup-command-deck.py`. The wizard performs reviewed native agent registration before enabling Command Deck. It does not install the OpenClaw engine or onboard a provider. An onboarded 2026.11.6 installation with a ready default model and a matching native managed Gateway is required.

**No Ubuntu host was accessed or modified during development.** The operator's truncated inventory displayed main and whatnot-expert only; it does not prove complete registry absence. A noninteractive SSH reachability attempt to the supplied host name failed before authentication/remote commands. No agent creation receipts, actual new IDs/workspaces, permission grants, provider messages or delegation results exist from that host in this report. Helm/Jace/Cruz registration remains unverified until the wizard runs there.

## First-run installer

`setup-command-deck.py` uses the existing deployment/paired-skill owners and new reviewed `crew-register.py` helper. It verifies version, config, profile/state directory, existing main workspace, default and per-crew model readiness without live probes, UI payload hashes and the native managed service identity. An unrelated custom UI root or ambiguous/mismatched service is refused. It never guesses systemctl units or starts a competing Gateway.

After explicit maintenance approval it stops the selected native service, separately reviews Templates Labs if needed and separately reviews each missing agent's native inspect/validate/dry-run, files, workspace and warnings. There is no blanket --yes. Approved Add uses the explicit canonical ID and native exclusive offline ownership. Registry/source/plan integrity are rechecked before effect; existing agent records and exact new ID/workspace/bootstrap/avatar proofs are checked afterward. Occupied, partial, edited, ambiguous or shared agents require manual review. Verified uniquely renamed crew are reused. No overwrites, silent suffixes or automatic deletes occur.

A separate immutable pending receipt precedes Add; successful verification is a different completion receipt. An uncertain Add is never blindly replayed. Setup receipts remain private under the selected state's lazykins folder. Stopping/cancelling midway preserves completed native agents and restores an originally running native service in finally. All three crew must verify before the fresh-install wizard enables the UI. The manual helper/UI still supports a Helm-only installation with other crew pending. Existing paired skill install retains native skill scanning/policy. Sanitize activation is not changed.

After service restoration, optional delegation is separately reviewed. It reuses the native semantics already used by the browser owner: Helm's explicit allowAgents override, including [], wins over inherited defaults; existing effective targets are retained; actual verified Jace/Cruz IDs are added. Existing wildcard is a no-op; no wildcard is introduced. Native config.get hash and config.patch baseHash reject stale approval. No other permissions/defaults/models/channels are changed, and no task is spawned. Actual deployment diff and receipt IDs are host-generated; none were applied here.

## Incremental UI/request changes

The existing Command Deck navigation owner remains authoritative. Verified Helm is factory startup; last deliberately selected verified Jace/Cruz is remembered. A missing selection falls back to verified Helm or pauses, never incidental main. Other OpenClaw agents begin collapsed on each entry. Main is labeled and explicitly selected; temporary Main does not become startup. A separate startup action saves opt-in; reset returns to Helm. Exiting restores the ordinary native selection/drafts without changing Gateway defaults.

The existing GatewayBrowserClient now supports a beforeRequest guard, installed through the existing gateway-store and a lightweight cold-boot adapter. The lazy mode policy checks current connection/profile, verified actual agent, qualified selected session and explicit other-agent selection. Missing/stale/wrong/ambiguous chat targets are rejected before dispatch, including send/history/edit/retry/abort and session creation. Native confirmed child history remains available to the existing Helm delegation bar. There is no replacement delegation scheduler, registry or transport.

The native router outlet parks the original retained composer while Command Deck is paused, preserving native direct-child layout and drafts. Settings remain accessible for crew setup. Quiet Desk/Command Deck icons, exits, Conversations back link, mobile stop control and normal mode behavior remain covered by the production browser fixtures.

Main defaults, main/whatnot-expert workspaces/history/models/providers/channel bindings and canonical authored agent assets are preserved. No Telegram/Discord/WhatsApp accounts, creator-tree relationships, cron jobs or paid tasks are created by setup. An allowlist alone does not prove effective sessions_spawn/tool/sandbox/provider authority.

## Validation and limits

Local Python suite: 60 tests discovered; 59 passed, one POSIX-permission test skipped on Windows. Original 44 R7 controller/preservation cases remain included. New registration and first-run cases cover per-agent approvals, sanitized baseline, changed profile/registry/plan refusal, collisions, renamed reuse, shared-workspace refusal, uncertain Add no replay, service target mismatch, restoration on failure, unsupported running version and native delegation merge/CAS.

Pinned patch applies cleanly against the exact unmodified source and its twelve native integration inputs. Production build/native transport/browser/performance and release ZIP checks are recorded in the final release evidence below when complete. Earlier fixture passes were synthetic and do not count as Ubuntu/provider verification.

| Acceptance | Development evidence | Host/provider status |
| --- | --- | --- |
| C1-C3 missing crew, skip, Helm-only | Production browser fixtures; helper approvals/refusals | Not verified on Ubuntu |
| C4-C5 individual crew Add, collision/partial recovery | Native-built authored Templates; helper native-command fixtures and hash checks | No real Add performed here |
| C6-C10 reload, scoped sends, collapsed others, ordinary restoration, temporary Main/startup reset | Production browser and transport-boundary fixtures | Live sessions/channels unverified |
| C11 real approved delegation | Existing native child projection tested with synthetic running/completed events | Provider-backed delegation unverified |
| C12 denied/unavailable delegation | Permission owner remains separate; no implicit grant/task; config merge tests | Effective host/tool policy unverified |
| C13 idempotency/profile separation | Receipt identity, collision/reuse/mixed profile tests and scoped browser preferences | Actual host rerun unverified |
| C14 regressions/security | Original preservation/controller suite, production UI/native transport/build gates | Existing host records not directly read |

Build-only precompression uses the native startup asset selectors and pinned [zopfli 0.4.3](https://pypi.org/project/zopfli/0.4.3/), with a SHA-256-checked Linux wheel. It accepts only smaller gzip sidecars after verifying both old/new decompression equal the exact original JavaScript bytes. No performance ceilings are raised and the Ubuntu installer needs no added dependency.

## Ubuntu install and recovery

Extract the new combined release ZIP, verify SHA256SUMS and run:

```bash
python3 setup-command-deck.py --profile default --state-dir "$HOME/.openclaw"
```

Use your actual service values if different. Review and type each requested approval. After completion reload the usual dashboard and click Enter Command Deck. Independently check native agents list, per-agent workspace/bootstrap proofs in the private receipts, short direct chats for all three, and then a separately authorized Helm delegation to each target. Those provider-backed checks may incur normal provider usage and are not run automatically.

Exit Command Deck for ordinary OpenClaw. Use Reset startup to Helm to remove a scoped other-agent startup preference. For full custom UI rollback, run the ownership-aware controller as the same service user, then restart only the verified native Gateway if required:

```bash
python3 "$HOME/.openclaw/workspace/skills/lazykins/scripts/lazykinsctl.py" off --profile default --state-dir "$HOME/.openclaw"
openclaw --profile default gateway restart
```

For custom targets use the same state/config environment as installation; do not reuse default examples against another service. Keep receipts and original workspaces. Disabling the UI does not remove crew agents/history or revert separately approved delegation/Labs settings. Review those exact host-specific configuration changes in native settings if desired; do not remove inherited/pre-existing grants or delete agents as automatic rollback. Original R7 release remains available unchanged.
