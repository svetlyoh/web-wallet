# Command Deck with Helm, Jace and Cruz - R7

Target: OpenClaw 2026.11.6, exact source 06afb10d3272cc9deaf38ca6a3b7b839d5935638. No engine update is performed. The ordinary main agent, model/provider configuration and external channel bindings are not replaced.

## Included sources

Helm 1.1.0, Jace 1.0.0 and Cruz 1.0.0 are bundled under `skills/lazykins/runtime/crew/`. The supplied extracted distributions and manifests are preserved under `originals/`; all 44 original files were hash-verified. Original ZIP containers were not supplied. The separate `sources/` projects adapt only CLAW manifest syntax to this release, including removal of a redundant body that conflicts with an explicit SOUL file. All workspace personalities, identity, user/reference files and PNG/SVG artwork remain byte-identical. See the preservation inventory and COMPATIBILITY.md.

The build uses this exact OpenClaw release's native validateTemplateProject/buildTemplateProject APIs to produce one .tgz per agent. These are local resources, not remote catalog publications. The outer R7 ZIP is the paired LazyKins/Sanitize distribution, not an agent Template.

## Install the UI update

Use the same fresh-folder, checksum, old-root off, install-both, LazyKins install/on sequence as the operator guide. Follow the reported Gateway restart requirement and hard-refresh. Agent addition is a separate reviewed step below. Nothing silently creates agents, chooses a paid model, changes credentials, enables a plugin or grants delegation.

## First-run setup

Enter Command Deck. Meet Helm and the two crew cards use the original bundled avatars. Discovery checks the authenticated real roster and four bootstrap file hashes. Matching IDs alone are insufficient. A changed or unrelated occupied ID is marked needs review; no overwrite is offered. A uniquely matching renamed agent can be admitted only after its real files match, with the actual ID retained. Live avatar hashes are checked when the native endpoint is available; unavailable verification is stated explicitly.

2026.11.6 has no supported browser upload/Add RPC for these local bundles. Its Add Gateway RPC takes a remote catalog coordinate only, and templates.status is not a live handler. This package therefore offers a supported host-side review fallback, not a simulated Install button. Templates must be owner-enabled in Settings > Labs. The UI never enables that flag. Both Add dry-run and application require the selected Gateway stopped and local-state ownership released.

On the Gateway host, from the freshly extracted R7 transfer folder, set:

```bash
OC_PROFILE='default'
CREW="$PWD/skills/lazykins/runtime/crew/sources"
```

Stop the selected Gateway with the existing service manager. For a standard CLI-managed installation:

```bash
openclaw --profile "$OC_PROFILE" gateway stop
```

Review Helm separately:

```bash
openclaw --profile "$OC_PROFILE" templates validate "$CREW/helm-template" --json
openclaw --profile "$OC_PROFILE" templates inspect "$CREW/helm-template" --json
openclaw --profile "$OC_PROFILE" templates add "$CREW/helm-template" --agent-id helm --dry-run --json
```

Only after reviewing and approving that plan:

```bash
openclaw --profile "$OC_PROFILE" templates add "$CREW/helm-template" --agent-id helm --json
```

Repeat the same three review commands and the separate approved Add for Jace and Cruz, substituting `jace-template` / `jace` and `cruz-template` / `cruz`. Either is optional; Helm can work alone. Existing IDs or workspace conflicts are a stop/review condition, not permission to overwrite. Inspect the actual returned agent ID after each Add. Do not blindly repeat after an uncertain result.

After the approved additions, restart the original service (standard CLI: `openclaw --profile "$OC_PROFILE" gateway start`). Check `openclaw --profile "$OC_PROFILE" agents list --json`, reconnect the browser, and choose Verify installed crew. Browser downloads contain a native `package/` directory inside each .tgz; extract it before using the native CLI, as the per-card commands show.

## Defaults, direct conversations and privacy

After verified setup, Helm is Command Deck's initial contact. The roster pins Helm, Jace, Cruz in that order; unavailable entries lead to review, while all other accessible user agents remain listed. Direct Jace/Cruz chats target their own native Home conversations, using the configured native main key and real IDs. No private crew chat is copied or forwarded to Helm. Back to Helm only navigates; it does not send a task.

Command Deck owns separate Gateway/operator-scoped selected/default preferences and a separate remembered navigation tuple. It uses native chat/session owners. Leaving restores the ordinary UI's remembered chat and agent without a Gateway restart or global-default configuration write. Reentry restores the selected Command Deck agent. Use selected agent as default changes only the Command Deck preference. Explicit agent deep links are supported; `?commandAgent=ID` is an explicit Command Deck-only override after verification and is ignored on a later fresh mode-entry action.

## Separate delegation approval

Crew installation grants no spawn permission. Review Helm delegation permissions reads the current native config and shows the exact targeted patch. It unions only verified Jace/Cruz actual IDs with Helm's effective existing targets, including inherited defaults. Existing wildcard permissions are preserved as a no-op, not introduced or narrowed. Approval refreshes identities, rechecks current authorization, and uses the reviewed config hash for native CAS. Record the prior Helm override/inherited state before approving if you will need to restore it later. This action may require a native Gateway reload.

Configured targets are not proof that the model tool agents_list, sessions_spawn, sandbox or provider policy permits a run. No task starts during setup. Actual tasks are requested in Helm's chat under existing approvals and tool policy. The Helm Delegation bar reuses the native child-session owner. Session-backed jobs and provider-native running observations are counted separately; provider observation IDs are not treated as session handles. Only confirmed native states are shown; acceptance is never labeled delivered/completed.

## Disable and rollback

Exit Command Deck returns to the normal UI and keeps agents, histories and workspaces. Full owned UI-root rollback:

```bash
python3 "$HOME/.openclaw/workspace/skills/lazykins/scripts/lazykinsctl.py" off --profile default --state-dir "$HOME/.openclaw"
```

Follow the reported restart requirement. This does not delete agents or revert an explicit owner-approved delegation grant. To revoke that grant, review Helm's native subagent allowlist and restore its recorded pre-approval override, or remove that override if it was previously inherited, preserving any later owner changes. Actual renamed IDs must be used. Do not restore the whole configuration or delete a crew agent as part of skin rollback.

## Verification boundaries

Preservation, native Template validation/build, synthetic production-owner authorization tests and actual built-UI browser checks are recorded with the package. The live Ubuntu Gateway is not connected to this build environment. Real agent creation on that host, direct model personality, successful provider-backed delegation, and delegated-run voice are not certified. Original personality files are preserved; no speculative child-prompt personality patch is added. Use the supplied handoff acceptance table on a disposable/approved host before relying on those unverified behaviors.
