# Gmail Connect for OpenClaw (Ubuntu)

**Preview 0.1.1** · Local browser setup · Direct Gmail API · No public tunnel or gateway edits

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
curl -fL --retry 3 -o gmail-connect-0.1.1-openclaw.tar.gz https://raw.githubusercontent.com/svetlyoh/web-wallet/master/openclaw/skills/gmail-connect/gmail-connect-0.1.1-openclaw.tar.gz
echo "c02314f059a8818ebce9c0e232f2a6a62ef3e2c1631ad04e17d1470c02047e39  gmail-connect-0.1.1-openclaw.tar.gz" | sha256sum -c -
tar -xzf gmail-connect-0.1.1-openclaw.tar.gz
openclaw skills install ./gmail-connect
```

Ask OpenClaw: **Use Gmail Connect to connect my Gmail account.** If host execution is unavailable, run `python3 "$HOME/Downloads/gmail-connect-release/gmail-connect/scripts/gmail_connect.py" wizard` in the Ubuntu desktop terminal and follow its private browser link. The Google project, Gmail API, OAuth consent, and Desktop client are created in Google's UI.

OpenClaw installs a folder, not the `.tar.gz` directly. Review [`gmail-connect/SKILL.md`](gmail-connect/SKILL.md) and the included code before installation. Avoid running the wizard as root or uploading credentials to chat.

## ClawHub publication

The nested [`gmail-connect/`](gmail-connect/) directory is the publishable skill folder. Import that folder from this public GitHub repository while signed in as the repository owner, or download the archive and run `clawhub skill publish ./gmail-connect --slug gmail-connect --name "Gmail Connect" --version 0.1.1 --dry-run` from its extracted parent. Real publishing requires your ClawHub account and releases the skill under MIT-0. The security audit runs after submission; inspect the listing's security-audit page and address its actual findings.
