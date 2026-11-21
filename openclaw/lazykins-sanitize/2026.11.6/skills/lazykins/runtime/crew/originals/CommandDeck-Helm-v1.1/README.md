# Helm — Command Deck coordinator agent

**Version:** 1.1.0 (author-created source package, 21 November 2026)
**Agent ID:** `helm` | **Display name:** Helm | **Role:** coordinator

Helm is Command Deck's preconfigured AI team coordinator. It's the first contact in Command Deck's desktop-first, Discord-inspired multi-agent workspace. It discovers authorized specialists, delegates bounded jobs, checks the work, and gives the owner a clear result. The owner can still speak directly with any specialist.

## What is in this ZIP?

- `helm-template/` — an authored OpenClaw *Template source project*: `package.json`, `CLAW.md`, and the agent's workspace documents (`SOUL.md` defines the Gen Z–inspired style) and avatar. This contains the agent setup itself, **not a running agent**.
- `integration/` — a small JSON product contract and an integration handoff for Command Deck. **Not executable software**; its fields are Command Deck design values, not official Gateway configuration keys.
- `docs/` — overview, permissions, onboarding, and verification checklist.

## Install using current OpenClaw Template functionality

1. Extract this ZIP onto the **same machine as the OpenClaw Gateway**.
2. Make sure Templates are available for the installed version, and enable **Settings → Labs → Templates** where necessary. OpenClaw 2026.9.6 and some earlier builds may not support this Template flow; check rather than assuming.
3. From the directory containing `helm-template/`, preview the package:

   ```bash
   openclaw templates validate ./helm-template
   openclaw templates inspect ./helm-template
   ```

4. After reviewing its contents and permissions, install it:

   ```bash
   openclaw templates add ./helm-template
   ```

5. Verify with `openclaw agents list`, then select Helm in the UI and send a simple test message. The Template importer may need Gateway-admin authorization.

**Do not run `templates add` repeatedly.** The OpenClaw Template flow creates an ordinary agent; a repeat can create a duplicate or conflict. Check `openclaw agents list` first.

### Optional archive import

A ZIP is not the native OpenClaw Template-import archive. After validating on a machine with the supported CLI, build the native `.tgz` using:

```bash
openclaw templates build ./helm-template --out ./helm-1.1.0.tgz
```

You can then use the Templates Import flow in supported OpenClaw versions. This ZIP was **not** validated by a running OpenClaw CLI or installed on your PC.

## Voice update in v1.1

Helm now defaults to **Gen Z–inspired, grown-up** conversation: around 80% sharp, practical coordination and 20% warmth/wit. This is established in `SOUL.md`, the template root instructions, and the communication reference. No forced memes, no unverified work claims, and no jokes in sensitive or high-stakes situations.

## Design choices

- Helm is an **independent agent**, not a replacement for `main`.
- No Telegram, WhatsApp, or Discord binding is installed or requested.
- No automatic cron/heartbeat monitoring is turned on. Scheduled checks require a separate opt-in.
- No credentials, providers, paid model choices, or broad subagent permissions are included.
- Helm's instructions enforce human approval for sending, publishing, purchases, deletion, or production changes.
- The only code still needed in Command Deck is the **installer/onboarding/UI adapter**, including native agent creation review, permitted specialist allowlisting, default chat selection, and task status presentation.

## Source references

- https://docs.openclaw.ai/cli/templates
- https://docs.openclaw.ai/cli/agents
- https://docs.openclaw.ai/reference/templates/roles/coordinator/workspace/AGENTS
- https://docs.openclaw.ai/concepts/multi-agent
- https://docs.openclaw.ai/concepts/agent-workspace
