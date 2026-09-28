# Gmail Connect for OpenClaw (Ubuntu)

**Preview 0.1.2** · Guided local browser setup · Direct Gmail API · No public tunnel or gateway edits

## Skill card

| | |
|---|---|
| What it does | Authorize a Gmail account in a local browser wizard, search/read messages through OpenClaw, and optionally monitor new mail or send an individually reviewed message. |
| Platform | Ubuntu Linux, Python 3.10+, existing OpenClaw with host execution. |
| Access | Gmail read-only by default; optional Gmail send. OAuth Desktop client belongs to each installer. |
| Data | OAuth tokens and cached metadata in owner-only local files; not encrypted at rest. Same-user processes can access them. |
| Network | Google OAuth and Gmail API; browser links to Google Cloud Console and Google Account. Wizard listens on 127.0.0.1 only. |
| Changes | Optional separate user systemd monitor; does not change the OpenClaw gateway, hooks, models, or channels. |
| Status | Offline tests pass; live Ubuntu/Gmail acceptance and ClawHub security audit are pending. No guaranteed scan rating. |

## Install from GitHub tarball

On your Ubuntu OpenClaw machine:

```bash
mkdir -p "$HOME/Downloads/gmail-connect-release"
cd "$HOME/Downloads/gmail-connect-release"
curl -fL --retry 3 -o gmail-connect-0.1.2-openclaw.tar.gz https://raw.githubusercontent.com/svetlyoh/web-wallet/master/openclaw/skills/gmail-connect/gmail-connect-0.1.2-openclaw.tar.gz
echo "5a64351737f2bf0414d16a787594870c83dd720fe3a60657bd344ef080041b01  gmail-connect-0.1.2-openclaw.tar.gz" | sha256sum -c -
tar -xzf gmail-connect-0.1.2-openclaw.tar.gz
openclaw agents list
openclaw skills install ./gmail-connect --agent main
```

Replace `main` if the agent you want to use has a different ID. Ask that agent: **Use Gmail Connect to connect my Gmail account.** If host execution is unavailable, run `python3 "$HOME/.openclaw/workspace/skills/gmail-connect/scripts/gmail_connect.py" wizard` in the Ubuntu desktop terminal and follow its private browser link. The setup workspace now expands into complete project, Gmail API, consent, test-user, Desktop-client, authorization, and verification instructions with direct Google links.

OpenClaw installs a folder, not the `.tar.gz` directly. Review [`gmail-connect/SKILL.md`](gmail-connect/SKILL.md) and the included code before installation. Avoid running the wizard as root or uploading credentials to chat.

## ClawHub publication

The nested [`gmail-connect/`](gmail-connect/) directory is the publishable skill folder. Import that folder from this public GitHub repository while signed in as the repository owner, or download the archive and run `clawhub skill publish ./gmail-connect --slug gmail-connect --name "Gmail Connect" --version 0.1.2 --dry-run` from its extracted parent. Real publishing requires your ClawHub account and releases the skill under MIT-0. The security audit runs after submission; inspect the listing's security-audit page and address its actual findings.
