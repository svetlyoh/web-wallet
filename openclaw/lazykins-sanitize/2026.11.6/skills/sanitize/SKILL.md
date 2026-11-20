---
name: sanitize
description: Enable, disable, inspect, and adjust OpenClaw's persistent English response style. Use when the user asks for calmer language, simpler explanations, less jargon, or simple, balanced, or detailed reply settings. Preserve facts, code, sources, uncertainty, and approval boundaries.
---

Manage voice through the bundled controller, not a reminder in conversation history.
The source-validated stable releases are **OpenClaw 2026.11.6** and legacy
**2026.9.6**. This skill survives package updates when installed in the agent
workspace, but other releases require revalidation. Source validation and portable
control tests do not establish live model compliance.

1. Identify the host, explicit profile, active state directory, agent ID, and configured
   workspace. Use the same service owner's account. Do not guess a default agent or
   confuse this with Codex's personal skill directory. Read
   [the harness and compatibility notes](references/harness-and-compatibility.md).
2. Run `status` first. Always supply the four target arguments. For a separate custom
   config, also supply `--config`. The controller verifies the CLI version and agent
   inventory and refuses an incorrect or shared workspace on enable.
3. Use `on`, `off`, or `complexity simple|balanced|detailed`, then inspect the result.
   `simple` is the default. Complexity can be saved while disabled and takes effect
   when enabled. Run `status` again after any failure or interruption.
4. Enabling installs a marked policy in the selected agent's `SOUL.md`. It affects that
   workspace's normal replies on other channels too. Preserve identity and unrelated
   text; never overwrite an edited owned block, change `AGENTS.md`, rewrite replies or
   tool calls, or install a redundant prompt injection plugin.
5. Report **policy saved**, scope, complexity, compatibility, and any conflict. A saved
   policy is not evidence of active model behavior. Verify an ordinary response in
   the browser using [the fixture checks](references/response-examples.md). Check the
   configured bootstrap budgets and context-injection mode first. Fresh and existing
   sessions, compaction, and service restart need live-host checks.

The script operations below belong to this skill; they are not `openclaw` subcommands.
Use subprocess argument arrays; never turn user prose into a shell command.

```bash
python3 "{baseDir}/scripts/sanitizectl.py" \
  --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR" \
  --agent "$OC_AGENT" --workspace "$OC_WORKSPACE" status
# Use the same target arguments with: on | off | complexity simple|balanced|detailed
```

Status/removal remain available on an upgraded host. For a broken/unavailable CLI,
`--offline status` and `--offline off` work only with existing metadata for the exact
recorded target. Inspect a conflict instead of forcing removal. Removal touches only
the verified owned block and its insertion separator, preserving later unrelated
changes. It does not erase instructions already present in conversation history.

The SQLite state and private backups live at `<state-dir>/sanitize/controller.sqlite3`.
A stable `.sanitize-control.lock` serializes this controller in the workspace. Leave
that lock file in place; deleting an active lock can defeat serialization. LazyKins
is optional, and its activation or removal does not enable or disable this skill.
