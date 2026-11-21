# Command Deck integration handoff — thin app code only

**Goal:** Bundle the authored `helm-template/` with Command Deck's desktop distribution and make Helm available as the pinned default coordinator on initial setup. The personality, identity, delegation playbook, avatar, and no-heartbeat defaults are already authored. **Do not regenerate them in Codex.**

## Required app behavior

1. **Discovery:** At first launch, use the already-authenticated OpenClaw Gateway client to list agents and determine whether `helm` exists. Do not change `main`, any existing specialist, account bindings, or gateway defaults.
2. **Provisioning:** If `helm` is missing, show the exact authored template from the Command Deck bundle and request review and the normal administrator action to install. Prefer a supported native Template plan/apply operation, after verifying capabilities in the installed release. If unsupported, offer a clearly labeled guided manual setup using supported `agents add` and documented workspace file operations; do not fake success or patch global configs blindly.
3. **Idempotency:** Re-opening setup should not duplicate Helm. If a user-created `helm` exists, offer to use it, rename the bundled target, or cancel. Never overwrite another agent's files without explicit consent.
4. **Default experience:** After confirmed installation, select `agentId=helm` as Command Deck's own default chat, pin Helm at top, and show the bundled branding. This should be a **Command Deck preference**, not a global routing or channel binding change. Users may choose another default.
5. **Delegation:** Discover available specialist agent IDs and current permissions. Show an opt-in, reviewable configuration of Helm's allowed specialist targets, appropriate native agent-to-agent session/tool grants, and any model/cost limits. The template alone **cannot** install a named delegate roster or guarantee that delegation works. Follow actual Gateway schemas and approval flows; never invent a tool or RPC.
6. **Conversation UI:** Open Helm's persistent main chat when selected, show verified task/subagent runs in a side panel, and allow direct chat with any specialist. Distinguish persistent agents, conversation sessions, and one-off subagent tasks.
7. **Updates:** Normalize real Gateway task events for UI state. Do not present guessed progress as confirmed. Main chat stays low-noise; logs go into the expandable task panel.
8. **Security:** No default Telegram/WhatsApp/Discord channel bindings; no secret storage in package files or logs. Preserve Gateway auth, admin review, and permission boundaries. No scheduled checks by default.
9. **Failure/rollback:** If installation or agent binding fails, preserve the existing installation and offer retry after diagnosing. Removing the Command Deck UI must **not automatically delete Helm or its conversation history**. Deleting Helm is an explicit separate decision.
10. **Compatibility:** Test against the actual installed OpenClaw version. The older 2026.9.6 baseline may not support the newer Template API; provide a fallback rather than upgrading without permission.

## Acceptance tests

- Fresh supported installation: Helm created once, appears first, is selected by default, and has icon/identity/instructions.
- Existing OpenClaw agents including main remain unchanged.
- Existing Helm conflict produces a safe choice rather than overwrite.
- Specialist unavailable/not allowed: Helm reports limitation without fake delegation.
- Allowed specialist: a bounded run appears with accurate status and a verified result.
- External actions require appropriate approvals; no channel notifications or cron jobs appear during initial setup.
- Restart Command Deck: identity and pinned default persist without re-creating Helm.
- Deactivating Command Deck UI does not delete any OpenClaw user data.

## References

- https://docs.openclaw.ai/cli/templates
- https://docs.openclaw.ai/cli/agents
- https://docs.openclaw.ai/concepts/multi-agent
- https://docs.openclaw.ai/gateway/config-tools/sessions-and-subagents
- https://docs.openclaw.ai/web/control-ui/feature-reference

## Helm v1.1 personality update

Preserve and install `workspace/SOUL.md` through the template bootstrap. Keep its Gen Z–inspired, grown-up 80/20 tone intact, unless the user changes voice preferences. The runtime must not depend on UI-only text for Helm’s personality: validate that the created agent actually receives the personality instructions.
