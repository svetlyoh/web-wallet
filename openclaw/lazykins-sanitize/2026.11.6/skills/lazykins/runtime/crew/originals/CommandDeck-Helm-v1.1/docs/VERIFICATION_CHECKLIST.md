# Verification checklist (for the receiving developer/operator)

- [ ] Extract ZIP and inspect source files before installation.
- [ ] Confirm `helm-template/package.json` contains `openclaw.template: "CLAW.md"`.
- [ ] Confirm `CLAW.md` has YAML frontmatter `schemaVersion: 1`, with `agent.id: helm`.
- [ ] Confirm no provider keys, secrets, passwords, channel credentials, default channel bindings, or scheduled jobs were packaged.
- [ ] On target machine: check `openclaw --version`, Templates support and template preview.
- [ ] Run `openclaw templates validate ./helm-template` and inspect diagnostics; resolve compatibility before installation.
- [ ] Review/add once and verify `openclaw agents list` includes the actual resulting ID.
- [ ] Verify Helm's `SOUL.md`, `AGENTS.md`, `IDENTITY.md`, avatar, and reference files are installed.
- [ ] Confirm `main` still exists and messaging channel bindings were not altered.
- [ ] Confirm default Helm selection happens in Command Deck only.
- [ ] Test direct chat; test delegated specialist run only after allowed agents and tools have been reviewed and configured.
- [ ] Confirm technical logs are not dumped into main chat; no automatic notifications.
- [ ] Confirm no recurring scheduled monitor runs until explicitly enabled.
- [ ] Confirm GUI uninstall does not remove installed agent data.

**Validation status:** Contents generated and locally parsed/checked; **not** CLI-tested on a real OpenClaw Gateway in this environment.
