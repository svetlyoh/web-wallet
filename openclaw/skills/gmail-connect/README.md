# Gmail Connect for OpenClaw (Ubuntu)

This folder contains `gmail-connect-0.1.0-openclaw.tar.gz`, a preview skill and local browser wizard. It uses Gmail API polling and does not edit the OpenClaw gateway configuration. It has passed offline tests; live authorization on a user's Ubuntu machine is still required.

SHA-256: `5e405b3297eb4ec8ea6738dd5933174c4be70b9f8831fe1731fa59669872f3b8`

Run these as your ordinary Ubuntu user, without sudo:

```bash
mkdir -p "$HOME/.local/share/openclaw-gmail-connect"
curl -fL "https://raw.githubusercontent.com/svetlyoh/web-wallet/master/openclaw/skills/gmail-connect/gmail-connect-0.1.0-openclaw.tar.gz" -o /tmp/gmail-connect-0.1.0-openclaw.tar.gz
echo "5e405b3297eb4ec8ea6738dd5933174c4be70b9f8831fe1731fa59669872f3b8  /tmp/gmail-connect-0.1.0-openclaw.tar.gz" | sha256sum -c -
tar -xzf /tmp/gmail-connect-0.1.0-openclaw.tar.gz -C "$HOME/.local/share/openclaw-gmail-connect"
openclaw skills install "$HOME/.local/share/openclaw-gmail-connect/gmail-connect"
python3 "$HOME/.local/share/openclaw-gmail-connect/gmail-connect/scripts/gmail_connect.py" wizard
```

The final command opens the local setup wizard. Select your own Google Cloud project, enable Gmail API, create or reuse a **Desktop** OAuth client, upload its downloaded JSON locally, authorize Gmail in your browser, then click **Verify Gmail**. You can reuse an existing Google project and Desktop client, but authorization for this app is separate from `gog`.

If you are SSH-only, forward port 8766 and use the private link printed by the wizard; see `references/operations.md` after extraction. Do not post that link or any client JSON in a public chat. The optional background monitor is separate from OpenClaw's gateway. Your existing Pub/Sub watcher can remain while you test read access; configure only one automatic notification workflow to avoid duplicates.

This is a ClawHub-ready skill source archive, **not an in-process OpenClaw plugin**. It has not been published on ClawHub. The extracted folder includes the full source, operational guide, and offline tests.
