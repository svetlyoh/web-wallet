# Codex implementation handoff — Command Deck with Helm, Jace & Cruz

**Revision:** 2.0 · **Date:** 2026-11-21  
**Scope:** Integrate three **already-authored** OpenClaw agents into the existing Command Deck desktop experience, with Helm as the Command Deck-only coordinator and Jace/Cruz as independently accessible crew members.  
**Status:** Integration specification; not a report of installed or tested functionality on the target Gateway.

> **Instructions to Codex:** Implement the app integration, not the agent personalities. Read this document and the repository's `AGENTS.md` first. Inspect the *actual* Command Deck codebase, the installed OpenClaw version, configuration schema, authenticated Gateway interfaces and agent/session capabilities. Make the narrowest supported changes. Preserve ordinary OpenClaw's default agent, channel bindings, chats and preferences. Use the two attached ZIPs as authoritative sources; do not regenerate Helm, Jace, Cruz, their avatars or character files. Report precisely what you implemented, tested and could not verify.

## 1. Required input ZIPs

Provide both archives alongside this handoff:

| Artifact | Contents | Treat as |
| --- | --- | --- |
| `CommandDeck-Helm-v1.1.zip` | `helm-template/`, Helm `SOUL.md` / `AGENTS.md` / identity / references / avatar; `integration/command-deck-helm.json` | Canonical source for **Helm v1.1** |
| `CommandDeck-Helm-Crew-Jace-Cruz-v1.0.zip` | `jace-template/`, `cruz-template/`, both agents' personality/operation/avatar files; `integration/command-deck-crew.json`; crew installation guidance | Canonical source for **Jace + Cruz v1.0** |

These ZIPs are **distribution containers**, not native single-click OpenClaw installation files. Each `*-template/` is a separate OpenClaw Template source project. Where the installed OpenClaw supports it, validate the source folders and use the normal reviewed Template Add/import process. Native `.tgz` bundles can be built *per agent* when required. The `integration/*.json` files define **Command Deck's proposed product behavior**; do **not** paste them directly into `openclaw.json`.

Bundle all three original Template assets as version-pinned, locally available resources within Command Deck. Avoid reliance on remote GitHub/ClawHub publication. Preserve original workspace files and artwork. Any proven compatibility change must be minimal, visible in the diff and documented, rather than silently altering an agent's personality.

## 2. Architectural rule: Helm's world inside Command Deck only

**Do not replace or reconfigure OpenClaw's global/default agent.** Treat Command Deck and standard OpenClaw Control UI as separate client entry points into the same authenticated Gateway, with separate UI-owned agent-selection preferences.

| Surface / action | Required behavior |
| --- | --- |
| Open **Command Deck** after successful setup | Show Helm as primary contact and coordinator; open Helm's authentic existing Home/main conversation by default, unless the user deliberately set a different Command Deck default. |
| View Agents / DMs | Pin **Helm first**, **Jace second**, **Cruz third** in a visually grouped *Helm's Crew* section. Show other existing OpenClaw agents below; do not hide or delete them. |
| Select Jace or Cruz | Open that agent's **own real persistent session**, with its own chat history and tools. The user talks directly to the chosen agent; the chat is **not** secretly forwarded through Helm. |
| Return to Helm | Restore Helm's own persistent chat, active delegation bar and any genuine child-task history. |
| Leave Command Deck / open standard OpenClaw | Preserve the ordinary UI's previously selected agent (e.g., `main`), OpenClaw global defaults, all external channels and existing sessions. No switch-back config write or Gateway restart. |
| Reenter Command Deck | Restore Command Deck's own chosen agent/default. Standard OpenClaw UI selection must not override it. |
| Crew setup fails / Gateway unavailable | Show a clear failure or pending state; let the user use already available agents. Never label a `main` conversation as Helm or fake a connected crew member. |

Implement Command Deck-owned `selectedAgentId` and `defaultAgentId` preferences, namespaced by connected Gateway and, as supported, operator/user. Keep them distinct from Control UI settings even if both UIs share a domain or reuse components. **Never** mutate `agents.defaults.systemAgent.agentId`, `main`, `talk.agentId`, channel bindings, ambient ownership, or Control UI's remembered selection as a side effect of opening Command Deck. Do not use `openclaw agents team create` for this feature: depending on configuration, that broader command can also establish an ambient system owner, which is not this product's goal.

## 3. Crew character and responsibility map (do not rewrite)

| Agent ID | Display name | Role in Command Deck | Special strengths | User-facing personality |
| --- | --- | --- | --- | --- |
| `helm` | **Helm** | Coordinator / default contact | Understands goals, routes eligible jobs, integrates results, presents one clear answer | Calm, confident, observant; Gen Z-inspired, ~80% capable / 20% playful |
| `jace` | **Jace** | The Closer / generalist | Execution, practical solutions, implementation, finishing work | Fast, confident, resourceful, quick-witted; natural Gen Z voice |
| `cruz` | **Cruz** | The Scout / generalist | Discovery, analysis, research, verifying claims | Curious, sharp, upbeat, subtly funny; natural Gen Z voice |

Both **Jace and Cruz are general-purpose agents**, not hard-coded skill restrictions. Helm may assign either agent tasks within actual permissions; it may work on simple requests itself. Both agents also have direct chats that function without Helm's participation.

All three use the *supplied* avatar assets and identity files. Original Vice City / GTA VI mood-inspired art is included for Jace and Cruz; do not use licensed GTA imagery or portray them as Rockstar game characters. Style principle: human, contemporary, minimal forced slang. For consequential actions and safety-critical matters, prioritize precision over humor.

## 4. Required first-run setup experience

Build a polished desktop onboarding flow, not an unrelated OpenClaw global onboarding flow:

1. **Meet Helm** — play the existing Command Deck introduction if present; display Helm's real bundled avatar and subtitle **“Keeps your AI crew in sync.”** Suggested copy: *“Meet Helm. Your crew's point person. Give Helm the goal, and it'll keep the team moving.”* Offer **Set up Command Deck crew** and **Not now**.
2. **Meet the Crew** — introduce two compact roster cards directly underneath Helm: **Jace — The Closer** and **Cruz — The Scout**, using their supplied avatars and brief descriptions. These are product cards, not fabricated OpenClaw agent records.
3. **Discover** — query the authenticated Gateway for real configured agent IDs and installation status of `helm`, `jace`, `cruz` before proposing changes. Detect whether matching IDs already belong to the supplied package or to unrelated user-owned agents. Never silently replace a user-owned agent or claim it is the authored crew member merely because its ID matches.
4. **Review** — offer a single coordinated onboarding *flow* with **three separately reviewable agent additions**. The owner must see exactly what each Template proposes and approve each actual installation. Provide clear choices to skip Jace/Cruz; Helm must still work alone. Do not silently grant delegation permissions, add plugins, subscribe models, or install background jobs.
5. **Provision** — add missing Helm, Jace and Cruz from their bundled Template sources using the version-supported authorized path. If the actual supported Template Add gives an unused ID different from the requested one, **verify the returned actual ID**; do not fake the requested ID. If a required target ID is already occupied, stop and request a human decision. Do not mutate another agent to force a match.
6. **Verify** — re-query the live roster and session availability. Verify avatar files, identity, instructions and agent session paths. Distinguish **installed**, **already present / needs review**, **not installed**, **blocked**, and **ready to delegate**. A working Helm chat does not prove cross-agent delegation works.
7. **Offer delegation setup** — separately present the exact proposed *Helm → Jace/Cruz* delegation permissions, the impact, and an owner-controlled approval. If the owner declines, leave the agents available for direct chat and display that delegation is not enabled.
8. **Finish** — open Helm's real chat, pin Helm above Jace and Cruz, and show the Helm Delegation bar with an accurate empty state until real tasks exist.

Setup must be **idempotent** across refresh, reconnect, restart and partial failures. Re-query and reconcile instead of blindly repeating Add, since adding a Template again can create another agent. Preserve existing user modifications in an existing workspace; never overwrite as part of an update. Support **Retry setup**, **Skip**, and **Review later**. A remote browser cannot assume it can access a local folder on the Gateway host; use the actual version's supported Template upload/plan flow or present a host-side manual step.

### Template implementation caveats to verify

- For current OpenClaw builds, consult `openclaw templates validate`, `openclaw templates build`, documented local `templates.add.plan` / `templates.add.apply` when appropriate, or the supported Control UI `.tgz` upload review. The live Gateway must authorize all add operations. **Do not invent an RPC, call an offline importer against a live Gateway, or assume these APIs exist on every older version.**
- A Template Add is an agent creation action; **do not install a second copy** just because Command Deck restarted. An existing agent is not an installed, version-managed Template that Command Deck may overwrite.
- The two distribution ZIPs are not native `.tgz` Template files; do not send the outer ZIP as a single agent package.
- Preserve existing OpenClaw authentication, pairing, origin protections, approval flow, tool policy, agent workspaces and session storage. Do not auto-upgrade OpenClaw simply for this feature.

## 5. Command Deck roster, chat, and layout

The desired sidebar is Discord-inspired, but with an original Command Deck identity:

```text
COMMAND DECK                         [Gateway connected]

  HELM'S CREW
  ┌─ 🧭 HELM  · Coordinator          [selected by default]
  │    Delegation: 0 active jobs
  ├─ ⚡ JACE  · The Closer           [direct chat]
  └─ 🔎 CRUZ  · The Scout            [direct chat]

  OTHER OPENCLAW AGENTS
    ...verified agents from Gateway...

  [Agents]   [Tasks]   [Settings]
```

This is a layout **concept**, not a claim that those entries are installed before setup.

- Reuse the actual bundled avatar PNG/SVG files. Display name and role subtitle come from Command Deck's versioned crew metadata, with availability/status grounded in the live Gateway. Do not show a fake “online” presence merely because an avatar exists.
- Keep Helm pinned at the top; Jace directly below, Cruz next. If either is uninstalled, show an unobtrusive **Add Jace** / **Add Cruz** pending entry that leads to owner-reviewed setup; **never** route clicks to another agent.
- Clicking an agent selects its real OpenClaw agent ID/session and preserves each conversation's history, scroll context and draft where feasible. Deep links may explicitly override initial UI selection without changing the saved Command Deck default.
- The default conversation composer speaks to Helm. When Jace/Cruz is selected, the composer speaks to the selected agent. Label which agent will actually receive the message.
- Offer easy **Back to Helm** and **Ask Helm to delegate** actions where appropriate. Do not intercept, reassign or copy private specialist chat content into Helm unless the user explicitly asks and the Gateway permits the transfer.
- Integrate with existing session search, splits and task queue when available. Do not build a second fake session store or parallel agent runtime.
- Optimize for desktop widths first, but retain accessible keyboard navigation, screen-reader labels, contrast and sensible responsive collapse behavior.

## 6. Helm Delegation bar — show real work, not theater

Keep the existing compact, expandable **Helm Delegation** bar on Helm's chat, ideally above or beside the composer. Add first-class display for **Jace** and **Cruz**:

**Suggested presentation stages:** `Request → Delegated → In progress → Review → Delivered`.

These stages are UI projections from confirmed events, **not promises that the Gateway emits those exact five states**. Only populate stages supported by actual session/spawn/result lifecycle information. For each genuine child job, show:

- Agent name/avatar (`Jace` / `Cruz`), task title, verified status, owning parent session, and relevant time if provided by the Gateway.
- Open the child run/session or task detail when permitted. If a job is canceled or fails, distinguish attempted cancellation from confirmed termination.
- A small useful summary of Helm's progress; detailed tool logs remain in an expandable view instead of cluttering the chat or external channels.
- A truthful empty state such as **“No active delegated tasks”**. When not authorized or unsupported: **“Delegation isn't configured yet”** or **“Live delegation status unavailable.”**

**Important:** `sessions_spawn` returning an *accepted* run is not proof of completion. Use genuine child lifecycle, task records and result notifications to transition UI states. Handle race conditions, reconnects, cancelled/archived tasks, and runs whose parent already completed. Do not simulate timers, fabricate work, or display a permanent “working” status from stale data.

## 7. Delegation permissions and policy

**The coordinator is a real agent (`helm`); the crew are real agents (`jace`, `cruz`).** Provisioning does not automatically grant Helm the right to spawn either.

- Inspect the installed OpenClaw build's actual tool set, role policies and multi-agent routing first. Current documentation describes `agents.entries.helm.subagents.allowAgents` for explicit `sessions_spawn.agentId` targets, subject to profile, operator and sandbox restrictions. Propose **only** `jace` and `cruz` as Helm's crew targets, after explicit owner approval, using the installed version's validated config mechanism.
- Prefer explicit target IDs and a conservative budget. Avoid `"*"` broad allowlists, surprise auto-spawn on onboarding, recursion or opening external channels. Consider setting Jace/Cruz to non-delegating children if compatible with the owner's existing policy and approved.
- Don't confuse a UI relationship with native OpenClaw permission grants. Agent metadata or a roster icon cannot confer access. `sessions_send` is separate from spawning and may require distinct policies; do not enable extra permissions without a demonstrated use case and approval.
- Helm selects whether to answer itself, assign Jace, assign Cruz or split clearly independent subtasks. Require bounded task briefs, ownership of artifacts and reconciliation of returned results. Do not turn a trivial request into an expensive multi-agent swarm.
- Ensure human approvals remain in force for external sends, purchases, destructive edits, publishing, credential changes and other high-impact actions. Neither Helm nor the crew grants itself more authority.

### Personality consistency in delegated runs (important)

**Test both direct chat and delegated-run voice.** Current official OpenClaw subagent documentation notes that a spawned child may receive only its workspace `AGENTS.md` as injected context, not its `SOUL.md`, `IDENTITY.md` or `USER.md`. Jace and Cruz currently describe their Gen Z voices primarily in `SOUL.md`, and `AGENTS.md` points to that file. Consequently, **do not assume a delegated child will automatically sound like its direct-chat persona**. Test each on the installed version. If confirmed, implement the smallest supported fix (e.g., concise character/voice guidance in the child-injected `AGENTS.md` or an approved supported bootstrap technique) and document the exact change. Maintain the original intent, safety constraints and the distinction between Jace and Cruz. Never use unauthorized prompt injection or undisclosed config modifications.

## 8. Quiet operation and security

- **Command Deck is desktop-first.** Do not require Discord, Telegram, WhatsApp, SMS or email. Keep external channels optional and unchanged. Do not add new notifications, channel bindings or broadcast messages by default.
- No automatic heartbeat/cron/automations, recurring model charges, paid model selection, account connections, model/provider changes or new credentials. A Command Deck activity panel is **not** a new scheduler.
- Keep agent workspaces, memory, chat histories and permissions separated according to the Gateway. Do not leak secrets into browser storage, app logs, UI URLs, screenshots or cross-agent tasks.
- Only show data actually accessible under the current authenticated operator. Respect Gateway roles and do not bypass tool/sandbox denials.
- Use a versioned, reversible integration in the existing Command Deck source code. Don't patch global `node_modules` or installed OpenClaw distribution assets as a permanent solution.

## 9. Implementation checklist (in order)

1. Inspect repository, local `AGENTS.md`, running OpenClaw version, actual installer/onboarding code, agent picker, chat state, task queue and Gateway permissions.
2. Unpack and version the three original Template folders; verify ZIP content and Template validation before wiring installation; define one Command Deck crew contract from the two bundled JSON files, mapping to existing app types without assuming either is native OpenClaw config.
3. Implement Gateway-backed agent discovery, identity/avatar resolution and safe first-run owner-reviewed creation with conflict/retry handling. Use version-supported native Template plan/apply or a documented fallback.
4. Add Meet Helm / Meet Crew first-run UI and a combined flow that explains individual agent approvals. Existing installed agents must not be modified without separate consent.
5. Implement independent, Command Deck-owned selected/default agent preferences. Helm initially selected; Jace/Cruz selectable; standard OpenClaw UI unchanged.
6. Build the Helm's Crew sidebar order and real direct conversations, including missing/blocked indicators and return-to-Helm navigation.
7. Expose owner-reviewed **Helm → Jace/Cruz** delegation proposal, and verify actual `agents_list`/spawn capabilities. If permissions remain unavailable, show honest state and leave direct chats working.
8. Extend Helm Delegation bar with real child-agent identities, genuine progress/results, graceful offline/unsupported states and no fake progress.
9. Run functional, security, regression and persona tests (below). Add accessible desktop UI checks. Confirm rollback and no duplicate agent creation.
10. Deliver the source diff, tests, exact setup/rollback commands, screenshot(s) if available, and an implementation report with outstanding blockers. **Do not spend time rewriting any of the three personas.**

## 10. Required acceptance tests

| # | Test | Must pass |
| --- | --- | --- |
| A1 | Fresh Gateway, zero crew agents | Intro shows Helm + Jace + Cruz as proposed additions; human approves actual creation of each agent; no silent writes. |
| A2 | Happy path installed crew | Exactly one intended `helm`, `jace`, `cruz` with validated real agent IDs, separate workspaces and genuine independent sessions. |
| A3 | Default isolation | Standard Control UI on `main` → open Command Deck = Helm → select Jace → exit → standard UI still `main` → reopen Command Deck = Jace (unless user reset default). No global config mutation. |
| A4 | Roster | Helm pinned first, Jace second, Cruz third, using supplied avatars; other user agents still available. Uninstalled crew clearly marked pending, not online. |
| A5 | Direct Jace chat | User message goes to Jace's real session; Jace answers in its authored voice without passing through Helm. History restored after switching. |
| A6 | Direct Cruz chat | Same as above for Cruz; distinction in style/capabilities remains clear. |
| A7 | Helm delegation to Jace | With reviewed native permission, Helm spawns/assigns a real Jace task; bar shows only confirmed state and result. |
| A8 | Helm delegation to Cruz | Same as above for Cruz; actual output comes back to Helm and is reviewed. |
| A9 | Delegated persona | Both agents' delegated-run behavior preserves essential individuality even where `SOUL.md` is not automatically injected; record fix if needed. |
| A10 | Permissions denied | Agents can still chat directly; Helm can't pretend to delegate and UI says exactly what's blocked. |
| A11 | Idempotency/conflicts | Relaunch, reconnect and partial setup do not create duplicates. Existing non-bundled `helm` / `jace` / `cruz` IDs are not overwritten, repurposed or silently renamed. |
| A12 | Gateway/Template API unavailable | Clear error or manual setup path; no fake success, no installation attempt via unsupported API. |
| A13 | Activity lifecycle | Accepted ≠ completed, terminal errors/cancellations reflected accurately; child session links respect permissions. |
| A14 | No collateral changes | OpenClaw global default, `main` agent, external channels (incl. Telegram/WhatsApp), old histories, provider credentials, skills and permissions unchanged except owner-approved targeted delegation. |
| A15 | Quiet & reversible | No automated notifications, heartbeat jobs, hidden cron schedules or agent deletion on disabling Command Deck. Existing history preserved. |

### Testing and result report

Use actual project test commands after inspection; do not invent scripts. Include unit/integration tests, build/lint checks, plus E2E validation against a disposable OpenClaw profile or test Gateway where possible. Record which OpenClaw versions were tested and which behaviors were supported, adapted or unavailable. Never claim an unrun live delegation test passed.

Document changed source files; reviewed agent source hashes; any modifications made to agent files; authenticated API methods used; effective delegation approvals; safety constraints; and exact install/enable/disable/rollback steps. On disable, remove only Command Deck-owned UI/config changes—not agents or conversations—unless the owner specifically and separately requests agent deletion.

## 11. Official documentation (check the installed version)

- Templates and reviewed Add/plan/apply: https://docs.openclaw.ai/cli/templates
- Agent configuration and delegation allowlists: https://docs.openclaw.ai/gateway/config-agents/entries-and-multi-agent
- Agent CLI (and broader team command side effects): https://docs.openclaw.ai/cli/agents
- Session tooling and authorization: https://docs.openclaw.ai/concepts/session-tool
- Subagent operations and injected context: https://docs.openclaw.ai/tools/subagents/operations
- Control UI: https://docs.openclaw.ai/web/control-ui
- Control UI sessions/sidebar: https://docs.openclaw.ai/web/control-ui/sessions-and-sidebar
- Control UI feature/RPC reference: https://docs.openclaw.ai/web/control-ui/feature-reference

---

### Definition of done

**Opening Command Deck feels like entering Helm's world:** Helm's welcome and main chat are the default; Jace and Cruz are visible underneath with their own avatars and direct conversations; Helm can delegate only to approved, actually available crew members; the delegation bar reports genuine work. **Leaving Command Deck returns the user to normal OpenClaw, unchanged.**
