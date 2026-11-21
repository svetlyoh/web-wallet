# Command Deck — Helm Crew expansion (Jace + Cruz) v1.0

**One downloadable ZIP** containing two complete, separate OpenClaw agent Template source projects and one Command Deck integration contract. This is **not** an executable installer and does **not** spawn running agents by itself.

## Included crew

- **Helm** (`helm`) — existing coordinator, shipped separately in `CommandDeck-Helm-v1.1.zip`.
- **Jace** (`jace`) — generalist with a strong execution / get-it-done instinct. Confident Gen Z delivery; clean, fast results.
- **Cruz** (`cruz`) — generalist with a strong discovery / verification instinct. Curious, sharp, detail-aware.

Jace and Cruz use original Vice City / GTA VI **mood-inspired** neon-night avatars, not game characters or licensed artwork. Both work with Helm's delegations and can receive direct chats in Command Deck.

## Files

```text
CommandDeck-Helm-Crew-v1.0/
  README.md
  jace-template/
    package.json, CLAW.md
    workspace/AGENTS.md, SOUL.md, IDENTITY.md, USER.md
    workspace/reference/{COLLABORATION,COMMUNICATION,WORKFLOW}.md
    workspace/avatars/jace.png, jace.svg
  cruz-template/ (same structure)
  integration/command-deck-crew.json
  docs/INSTALL_AND_VERIFY.md
  docs/CODEX_CREW_INTEGRATION.md
  FILE_MANIFEST.json
```

## User experience (intended)

- Enter **Command Deck** → Helm remains selected by default, pinned above Jace and Cruz.
- Jace and Cruz appear underneath Helm in the crew panel, with their actual avatars.
- Select Jace or Cruz → open that agent's own persistent conversation.
- Ask Helm for help → Helm may assign work to Jace and/or Cruz **only after** the relevant OpenClaw tools, agent allowlist, and owner approvals permit it.
- Exit Command Deck → regular OpenClaw default and all existing channel bindings remain unchanged.

## Status and safety

- Authored and packaged locally, **not installed or tested on your Gateway**.
- No new tool grants, skills, plugins, channel bindings, automations, heartbeat, paid models, or shared credentials.
- The JSON in `integration/` is a **Command Deck-specific proposed configuration contract**, not native `openclaw.json`.
- Review each Template and run native validation before installation. On a Gateway with agent ID conflicts, **do not** auto-create an alternative agent ID: prompt for a decision.

See `docs/INSTALL_AND_VERIFY.md` for commands and `docs/CODEX_CREW_INTEGRATION.md` for the minimal code needed in Command Deck. Agent personality files are finished; Codex should not recreate them.
