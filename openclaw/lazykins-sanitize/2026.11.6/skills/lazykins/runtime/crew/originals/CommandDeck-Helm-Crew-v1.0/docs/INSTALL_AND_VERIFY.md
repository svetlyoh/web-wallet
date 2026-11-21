# Install, validate and verify the two crew agents

## Before setup
- Obtain owner's approval to add agents. Confirm Helm v1.1 is already available or install it separately.
- Extract this ZIP onto the OpenClaw Gateway host if using the `templates add` CLI. These paths are **source folders**, not a ZIP directly accepted as a single two-agent Template.
- Find the actual OpenClaw version and check `openclaw templates --help` and `openclaw agents list` for support.

## Native Template validation
```bash
cd /path/to/CommandDeck-Helm-Crew-v1.0
openclaw templates validate ./jace-template
openclaw templates validate ./cruz-template
openclaw templates dev ./jace-template
openclaw templates dev ./cruz-template
```
Preview and consent to each agent addition before applying. Verify no conflicting existing IDs, no plugin or automation requirements and no unexpected new permissions.

## Optional install via CLI (Gateway host)
```bash
openclaw templates add ./jace-template --json
openclaw templates add ./cruz-template --json
openclaw agents list
```
If the installed OpenClaw release lacks supported Template operations, use its documented agent-creation flow to provision separate workspaces **without overwriting** existing agents; get the owner's approval first. Do not guess commands or claim success.

## Alternative: import via native `.tgz` files in Control UI
On a machine with native CLI, run:
```bash
openclaw templates build ./jace-template --out ./jace-template-1.0.tgz
openclaw templates build ./cruz-template --out ./cruz-template-1.0.tgz
```
In Control UI, use Customize → Templates → Import (if available in that version). Import each validated `.tgz` separately and confirm its review card. **This outer ZIP is a distribution envelope, not a native `.tgz` Template archive.**

## Helm delegation
Adding these agents does **not** automatically grant Helm permissions to delegate to them. Review the installed version's `agents_list` and session/delegation grants; explicitly allow only `jace` and `cruz` as Helm's intended crew targets where supported. Keep human approvals for sensitive actions. See `docs/CODEX_CREW_INTEGRATION.md`.

## Acceptance checks
1. Exactly one configured `helm`, one `jace`, one `cruz`; unique workspaces and per-agent sessions.
2. Each agent responds with its own name, icon and Gen Z-inspired but useful personality.
3. All three are selectable in Command Deck; Helm stays default **only inside** Command Deck.
4. A genuine Helm delegation reaches Jace; another reaches Cruz; their actual returned results appear in Helm's real task state. Never mock completion.
5. Direct message to Jace/Cruz works without routing through Helm.
6. Existing `main` agent, standard Control UI state, Telegram/WhatsApp bindings and permissions unchanged.
7. No background heartbeat, automation, or channel notifications installed.
8. Existing `jace` or `cruz` name conflict raises a human-reviewed decision rather than overwriting or duplicating.

## Recovery
Command Deck must retain standard OpenClaw navigation if crew setup fails. Disable crew visibility or change Command Deck-only selection without deleting agent workspaces or history. Manual agent removal is an owner decision after backups.
