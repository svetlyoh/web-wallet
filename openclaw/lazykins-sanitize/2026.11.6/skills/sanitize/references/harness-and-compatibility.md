# Verified releases and live-host checks

Latest source inspected: `latest-2026.11.6`, clean detached release HEAD
`06afb10d3272cc9deaf38ca6a3b7b839d5935638`, package version `2026.11.6`.
The release was selected from the stable channel on November 20, 2026; a newer
beta is not admitted. Legacy source validation is retained for `2026.9.6`,
SHA `eb377ac59e6c9fd6c7705028034812becf00271b`. No intermediate or future
version is inferred compatible. These records use tagged source, not live docs.

The following paths belong to that checkout:

- `src/agents/workspace-bootstrap-policy.ts`: SOUL.md is a canonical bootstrap file.
- `src/agents/bootstrap-files.ts` directly calls `loadWorkspaceBootstrapFiles` while
  preparing the run. `src/agents/workspace.ts` reopens canonical paths with guarded
  identity validation even on cache hits. The old `bootstrap-cache.ts` intermediary
  is absent in 2026.11.6; no dependency on it is required by this skill.
- `src/agents/bootstrap-files.ts`: `contextInjection` defaults to `always`; `never`,
  `continuation-skip`, and lightweight paths can intentionally omit bootstrap context.
- `src/agents/embedded-agent-helpers/bootstrap-limits.ts`: default per-file budget is 20,000
  characters; configured per-agent/default budgets and total fitting still apply.
- `extensions/codex/src/app-server/attempt-workspace-context.ts` prepares persona
  separately from user input. `run-attempt-context.ts` includes shared persona in a
  refreshable section; `thread-requests.ts` joins that section to native developer
  instructions when a managed parent-local inference route is unavailable.
- `docs/plugins/codex-harness-reference/workspace-bootstrap-files.md`: managed direct
  stdio app-servers (including Desktop executables launched for Computer Use) carry
  SOUL, identity, and user context in parent-only model instructions. Native child
  agents do not automatically inherit that newly delivered persona. On connections
  without a managed inference relay, shared SOUL instead uses a refreshable thread
  developer section that children can inherit. Changed/removed sections cold-resume
  ordinary persistent threads with current instructions; native compaction keeps
  that configuration. Incognito uses injected developer messages and can temporarily
  restore creation-time instructions after compaction or in a fresh child. Personal
  USER overlays are excluded from the unmanaged fallback, which does not change this
  skill's shared SOUL policy. These newer carrier improvements do not establish live
  compliance, and they do not apply retroactively to the older release's source.
  Existing histories and full-history forks can keep old policy text after off.
- `src/cli/profile.ts`: explicit state/config environment overrides are retained when
  selecting the same profile. The controller sets all three together, so inherited
  service defaults cannot silently redirect the explicit target.
- `src/commands/agents.commands.list.ts` and `docs/cli/agents.md`: the verified inventory
  command is `openclaw --profile PROFILE agents list --json`, an array with `id` and
  `workspace`. Native CLI inspection can initialize its own admission metadata; the
  sanitize controller does not read or edit OpenClaw's databases.
- `docs/tools/skills.md`: workspace `skills/` discovery, name/description frontmatter,
  and `{baseDir}` references are supported. Slash exposure remains subject to the
  agent's eligibility and user-invocable skill policy; discovery is not proof of a
  particular browser command having run.

The controller requires an existing absolute/resolvable workspace and state directory.
It calls the trusted CLI using an argument array, an explicit profile, and explicit
OPENCLAW_STATE_DIR / OPENCLAW_CONFIG_PATH. Supply `--config` when the service uses a
custom separate configuration. The workspace must match the selected inventory
entry; enabling a workspace shared with another agent is refused to keep scope clear.
These commands inspect the local installation; a separate remote Gateway's release
must also be confirmed before deployment. Never print token-bearing dashboard URLs
or whole configuration files as evidence.

For enable/update, inspect the selected agent's `contextInjection` setting and the
effective per-file/total bootstrap budgets through safe individual native config
queries. The appended policy must fit completely without truncating required existing
context. The controller does not modify those settings and reports runtime verification
as false. With `never` or a path that omits SOUL, leave sanitize disabled and report the
limitation; do not weaken a policy gate or add a second injection without verified need.

No runtime plugin is installed: the ordinary default harness consumes the persistent
SOUL policy. No extra model call, polling, external dependency, or transcript mutation
is introduced. If the user's actual harness differs, verify the smallest supported
adapter separately before claiming coverage.

## Updates and rollback

Install skill assets under the selected workspace's `skills/sanitize/`, outside the
OpenClaw package. Retain `<state-dir>/sanitize/` and SOUL.md across updates. This
preserves the installed files and setting; it does not prove future compatibility.
Only exact stable versions 2026.9.6 and 2026.11.6 are admitted for `on` or complexity
changes. Status reports a mismatch on every other version. A printed commit hash that
differs from its supported tag also blocks these mutations. If the CLI prints no hash,
only its exact stable version label is checked; status records the source tag used
for validation, not a measured installation hash. Revalidate tagged harness behavior,
inventory/profile contracts, and fixture replies before adding another baseline to
the controller. Existing v1 SQLite state and policy bytes remain readable without
schema migration; changing supported releases does not replace a user-edited block.
Status exposes both the validated host release and the last policy-writing release.
An offline rollback retains that writing provenance. No automatic Gateway upgrades
or hidden version polling occur.

`off` can remove a verified owned block after an update. If CLI inspection is broken,
use explicit recorded targets with `--offline off`; this path trusts only the existing
SQLite ownership record and never creates a policy. Removing the block does not
withdraw instructions previously recorded in a conversation. A new normal session
provides the clearest disable verification.

The controller serializes its own writers with an advisory workspace lock, uses
SQLite synchronous durable revision backups, and atomically replaces SOUL.md with
preserved permissions. An interrupted file/state commit is reconciled from the
recorded before/after bytes on the next mutation; status reports pending recovery.
If external edits match neither revision, it refuses to restore stale backups over
them. Existing user-edited policy blocks, duplicate/damaged/untracked markers,
symlinks/hard-link aliases, and cross-profile ownership also produce conflicts.

External editors do not share the advisory lock. The controller rechecks bytes
immediately before replacement but cannot guarantee against an editor writing in
the final check/rename interval. Avoid simultaneous manual SOUL edits. Linux/Windows
filesystem crash durability and filesystem ACLs beyond basic modes are not proven
by the portable tests. Private backup rows contain the agent's prior SOUL content;
keep the product state directory private. Do not use full-file backup restoration as
routine off; it would erase later unrelated edits.

## Verification status

Portable automated tests exercise the actual control API and CLI argument boundary
in isolated temporary workspaces inside this package. They prove file ownership,
preservation, rollback, targeting, crash reconciliation, and writer serialization.
They cannot prove a model follows style instructions or a remote running Gateway has
reloaded them. Run the fixture matrix in `response-examples.md` as ordinary browser
requests on the real Linux host after activation, for new/existing sessions,
compaction, restart, each complexity, and disable. No real email or paid action is
needed. Record observed prose and protected content, not private benchmark messages.
