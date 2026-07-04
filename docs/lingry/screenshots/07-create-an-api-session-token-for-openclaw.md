# Create an API session token for OpenClaw

## Screenshot file

`07-create-an-api-session-token-for-openclaw.jpg`

## Purpose

Menu: API Session. The API Session screen lets OpenClaw users create a Lingry session token for local OpenClaw tools. After signing in, the user opens Menu > API Session, creates a token, copies it, and adds it to their OpenClaw environment. The screen also shows the token expiration date, so users know when they need to refresh it. Lingry API session tokens are valid for about 30 days.

## What the user sees

The API Session screen shows a redacted session-token field, an expiration timestamp, and Create API Session Token, Copy Token, and Revoke Token buttons. The page warns users to use the token only for a local OpenClaw skill and never paste it into chat, GitHub, shell history, or shared files.

## User action

Open Menu, choose API Session, create an API session token, copy it, and paste it only into the local OpenClaw environment file.

## Expected result

The local OpenClaw tools can authenticate to Lingry until the displayed token expiration date, after which the user refreshes the token from the same screen.

## Agent guidance

Guide OpenClaw users to store the token only in their private local environment. Never ask them to paste the token into chat, GitHub, screenshots, shell history, logs, or shared files.

## OpenClaw terminal note

After copying the token from Lingry, the user should paste it only into a private terminal prompt:

```bash
umask 077
mkdir -p "$HOME/.openclaw"

read -rsp "Paste Lingry session token: " NEW_LINGRY_TOKEN
printf '\n'

tmpfile="$(mktemp)"
[ -f "$HOME/.openclaw/.env" ] && grep -v '^LINGRY_SESSION_TOKEN=' "$HOME/.openclaw/.env" > "$tmpfile"
printf 'LINGRY_SESSION_TOKEN=%s\n' "$NEW_LINGRY_TOKEN" >> "$tmpfile"
mv "$tmpfile" "$HOME/.openclaw/.env"
chmod 600 "$HOME/.openclaw/.env"

unset NEW_LINGRY_TOKEN
unset LINGRY_SESSION_TOKEN
openclaw gateway restart
```

## Alt text

Lingry API Session screen showing a redacted session token, an expiration date, Create API Session Token, Copy Token, and Revoke Token buttons.

## Privacy review

Confirmed: This image contains no wallet private key, seed phrase, recovery phrase, wallet passphrase, session token, API key, email address, phone number, personal name, browser autofill detail, sensitive account balance, sensitive transaction record, or terminal history containing credentials.
