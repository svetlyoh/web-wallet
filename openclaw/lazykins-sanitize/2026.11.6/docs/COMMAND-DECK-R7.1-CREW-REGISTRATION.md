# Command Deck R7.1: reviewed crew registration and main guard

Target: OpenClaw 2026.11.6 only. This preserves R7 and adds a guided fresh-install path. The three original agent Templates and artwork are unchanged. Existing main/whatnot-expert workspaces, histories, models, providers, skills and channel bindings are not replaced. No external bot accounts are created.

## Fresh Ubuntu installation: one guided setup command

Use an already onboarded **OpenClaw 2026.11.6** installation with a configured, ready default model and its native managed Gateway service. Run as its Ubuntu user, without sudo. Python 3.11+ is required. This ZIP does not install the OpenClaw engine or create provider/bot accounts.

After downloading and verifying the release ZIP, extract it into a new directory, enter that directory, and run:

```bash
sha256sum -c SHA256SUMS
python3 setup-command-deck.py --profile default --state-dir "$HOME/.openclaw"
```

Use the actual service profile/state directory if different; `--config-path` and `--openclaw` are available for custom targets. The wizard verifies the managed service and model readiness, asks for a maintenance window, stops only that verified native service, and restores an originally running service even if a later step fails. It separately reviews Templates Labs and each native agent Add, verifies all three bootstrap/avatar hashes and distinct workspaces, installs both skills, and enables the built UI only after all three agents are verified. Existing verified renamed crew are reused. Edited/colliding/shared agents require manual review, not overwrite or suffixes.

Type each displayed approval yourself after reviewing it; there is no blanket --yes flag. Declining an agent stops setup before UI activation and retains completed native agents. Rerunning reuses those verified agents. Receipt paths are printed and remain private under the selected state directory's lazykins folder. An uncertain Add must be inspected before retrying.

After service restoration, the wizard offers a **separate** narrow Helm-to-Jace/Cruz target permission review using native config hash checking. Declining it leaves direct crew chats available; approve it later in Crew setup & permissions. An allowlist does not override tool/sandbox/provider policy, and no model task is started during installation.

Open the usual OpenClaw dashboard, reload it and select **Enter Command Deck**. Helm is the initial verified crew chat. Jace and Cruz are independently selectable native agents. Ordinary main/default/models/channel bindings stay unchanged. Sanitize remains separately controlled. A service that was stopped initially stays stopped unless you explicitly approve starting it. Unmanaged or mismatched service installations use the manual procedure below.

## New behavior

Command Deck pauses its chat when no verified crew target is selected. It shows Helm setup/verification or reconnect actions; it does not use main as a fallback. Helm is the factory startup target. The last selected verified Jace/Cruz can be restored. If that crew member is unavailable, verified Helm is preferred; otherwise setup stays paused.

Other agents are behind Show other OpenClaw agents. Choosing OpenClaw Main (main) is a temporary, explicit selection. Opening it once does not change crew startup. Set selected agent as Command Deck startup is a separate deliberate action; Reset startup to Helm removes that opt-in. Old R7 incidental main selections and unmarked other-agent startup values are not treated as new opt-ins.

The existing navigation owner verifies the active agent/session at the request boundary. Unverified, unqualified and stale chat targets are rejected, including sends, history, edits/retries and aborts. Native confirmed child-history reads in Helm's existing delegation bar remain available. The paused pane is parked, hidden and inert; existing ordinary drafts are retained. Exiting restores the ordinary OpenClaw selection.

## Before maintenance: verify the actual target

Run on Ubuntu as the account that owns OpenClaw, without sudo. Python 3.11+ is required. Use the fresh extracted R7.1 directory, or point CREW_CTL to its installed LazyKins script. Do not run against an unrelated profile/state directory. First inspect the original service's profile, config and service owner:

```bash
openclaw --version
openclaw --profile default gateway status --deep
openclaw --profile default config file --json
openclaw --profile default agents list --json

OC_PROFILE='default'
OC_STATE_DIR="$HOME/.openclaw"
CREW_CTL="$PWD/skills/lazykins/scripts/crew-register.py"
umask 077
REVIEW_DIR="$(mktemp -d "$HOME/CommandDeck-Crew-Review.XXXXXX")"

python3 "$CREW_CTL" baseline --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"   --receipt "$REVIEW_DIR/baseline-before.json"
```

Use the values confirmed by the original service, not these examples if they differ. For a custom config, add --config-path to every helper command. For a custom executable, add --openclaw. The helper binds every receipt to the explicit profile, state directory and config. Baseline records are sanitized: model authorization identifiers and credentials are not copied into the inventory. Inspect the target and existing main/whatnot-expert records before proceeding. Keep receipts private; do not upload raw local plans to public GitHub.

## Review one agent at a time

Obtain the operator-approved maintenance window. Stop the original Gateway through its existing service owner. The helper never stops/kills/restarts services, guesses systemctl units, or starts a competing Gateway. Native local Template Add, including dry-run, enforces exclusive offline ownership. If native CLI refuses, resolve that condition through the original service owner; never bypass it.

Templates must be enabled according to this installed release's actual Settings > Labs/CLI diagnostics. The helper does not toggle Labs. OpenClaw 2026.11.6 source gates local Add; a later version's default-on documentation does not authorize changing this pinned host.

Review Helm first, with the Gateway stopped:

```bash
python3 "$CREW_CTL" review helm --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"   --receipt "$REVIEW_DIR/helm-review.json"
```

This validates and inspects the canonical bundled source, checks the actual CLI flags, re-queries the registry, and prints the actual native dry-run. Inspect the proposed ID, workspace, all files, warnings, readiness, dependencies/jobs and permissions. Review does not create an agent. A verified existing or uniquely verified renamed crew member is reused. Occupied/unverified/ambiguous IDs require manual resolution; no overwrite or suffix is applied.

Only after approving that specific plan, run the separate command:

```bash
python3 "$CREW_CTL" apply helm --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"   --receipt "$REVIEW_DIR/helm-review.json" --approve-agent helm
```

Application repeats the registry/source/dry-run checks and rejects changed receipt targets, source bytes or native plan integrity. It uses native templates add with explicit --agent-id. This pinned native implementation blocks an occupied explicit ID rather than silently selecting a suffix. No package, MCP, cron job or capability escalation is accepted by this helper.

Repeat review and separately approved apply for jace and cruz, using new per-agent receipt filenames. Both are optional. Do not approve all three by blindly replaying a batch. Each successful Add is checked against the returned actual ID/workspace, four authored bootstrap hashes and the original PNG avatar hash. Existing agent records are compared before/after; unexpected changes require inspection, not automatic rollback.

The immutable .outcome.json file records intent before Add; a separate .outcome.json.completed.json records successful verification. A missing completion receipt is an uncertain outcome, not permission to repeat Add. Inspect the registry/workspace and preserve receipts. A fresh review of an already verified agent returns reused/no change.

## Restart and verify

Restart only the original service owner after approved offline changes. Then:

```bash
openclaw --profile "$OC_PROFILE" agents list --json
python3 "$CREW_CTL" baseline --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"   --receipt "$REVIEW_DIR/baseline-after.json"
```

Check actual IDs, separate workspaces and bootstrap/avatar proofs. Reconnect Command Deck and choose Verify installed crew. Roster presence alone is insufficient to enable authored-crew chat. Bootstrap mismatch is manual review; preserve user edits rather than overwriting them.

## Delegation is a separate approval

Use the existing Review Helm delegation permissions action only after verifying each target. It displays a narrow native config diff for Helm's actual ID and the verified actual Jace/Cruz IDs, preserving inherited/explicit grants. Approval uses the reviewed native config hash. The patch introduces no wildcard; an existing wildcard is retained as a no-op. It changes no global default, creator/provenance tree, model, channel or cross-agent history policy.

Denied approval leaves direct crew chats available and delegation unconfigured. Configured allowlist targets do not prove effective sessions_spawn/tool/sandbox/provider permissions. Only after the owner authorizes a real task should Helm attempt an explicit native target run. The existing delegation bar shows actual child states; no work begins during setup.

## Live acceptance still required

The supplied user inventory displayed main and whatnot-expert but was truncated. It is a baseline clue, not a complete current registry or evidence that crew installation succeeded. The development environment has no authenticated Ubuntu connection unless the operator separately supplies one.

After registration, test short direct prompts separately with Helm/Jace/Cruz, then owner-authorized real Helm delegation to each approved crew target. Check actual send/session IDs, private histories, separate workspaces, child status/results, and direct versus delegated personality. Test missing-crew pause, skip, collision/partial outcome recovery, reload/reconnect, temporary main selection, explicit main startup/reset, exit-to-ordinary draft restoration, and mixed-profile refusal. Record inaccessible cases as unverified; synthetic browser tests are not live-provider evidence.

## Disable and recovery

Exit Command Deck to use ordinary OpenClaw. Reset startup to Helm affects only scoped UI preferences. To roll back the entire custom UI root, use the existing ownership-aware controller and follow its reported service requirement:

```bash
python3 "$HOME/.openclaw/workspace/skills/lazykins/scripts/lazykinsctl.py" off   --profile default --state-dir "$HOME/.openclaw"
```

Preserve the old UI ownership receipt and private agent creation receipts. No crew agent, workspace, conversation or channel is deleted on exit/disable. An approved delegation grant is separate: review the recorded prior override/inheritance and restore only that grant, preserving later operator changes. Never restore the entire config or delete an agent merely to disable the view.
