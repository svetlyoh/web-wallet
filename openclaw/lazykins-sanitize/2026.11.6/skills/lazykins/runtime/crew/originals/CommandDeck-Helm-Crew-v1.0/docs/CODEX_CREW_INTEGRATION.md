# Minimal Codex handoff — expose Jace and Cruz under Helm

These agent personalities, instructions, avatars and native Template sources are **already authored**. Codex should not spend time generating them. Integrate the two Template packages as bundled setup assets in the existing Command Deck distribution and implement just the needed app behavior.

## Inputs
- `CommandDeck-Helm-v1.1.zip`: existing Helm source and Command Deck Helm integration handoff.
- This archive: `jace-template/`, `cruz-template/`, `integration/command-deck-crew.json`.

## Expected app behavior
1. Enter Command Deck → real Helm agent remains the default, pinned at the top, with its existing intro and delegation bar.
2. Display two crew entries underneath Helm, with **original Jace and Cruz avatars**, distinct role subtitles, and accurate agent presence derived from Gateway discovery.
3. During reviewed onboarding, offer `Add crew` to create missing Jace/Cruz from the bundled local Template sources via a **documented version-compatible install pathway**; don't silently create agents or duplicate conflicting IDs. Never auto-run a command on an arbitrary connected remote Gateway.
4. Each crew entry opens that agent's **own** real session; preserve its chat history when switching back to Helm. The owner can DM them directly.
5. Configure or propose the needed native **Helm → Jace / Cruz** delegation allowlist and permitted session tools **only after owner review**. Do not bypass OpenClaw permissions. Check actual runtime grant/capabilities: no fabricated allowlist or task status.
6. Helm can decide which one to delegate to, split independent tasks, or work alone. Show only real delegated run statuses in the Helm delegation bar (no fake "working" indicator).
7. Preserve the existing `main` agent, global defaults, all external channel bindings and the regular OpenClaw UI's remembered selection. Command Deck settings stay namespaced to Command Deck.
8. The JSON in this ZIP is a product-side *proposal* — validate it and map to the actual app's schema; do **not** paste it into `openclaw.json`.

## Constraints and acceptance
Inspect actual repository `AGENTS.md`, current Gateway version, Template RPCs, authenticated agent-list and session methods before coding. Reuse current app infrastructure, authentication, approvals, and tests. Bundle and pin asset version. No new background jobs, Telegram/Discord integration, model switching, privileges or provider keys. Add integration tests for approved-first setup, idempotence, conflicts, list ordering, agent session switching, and no mutation to the standard UI. Report exact code changed, tested behaviors and remaining blockers honestly.
