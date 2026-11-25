#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
for tool in python3 openclaw sha256sum tee; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done
[[ -t 0 ]] || { echo "Run from an interactive terminal as the OpenClaw service user, without sudo." >&2; exit 1; }
sha256sum --quiet -c SHA256SUMS
LOG="$(mktemp "$HOME/CommandDeck-install.XXXXXX.log")"
chmod 600 "$LOG"
echo "Private installer log: $LOG"
if python3 setup-command-deck.py --profile "${OC_PROFILE:-default}" --state-dir "${OC_STATE_DIR:-$HOME/.openclaw}" "$@" 2>&1 | tee "$LOG"; then
  echo "Installer finished. Reload your usual OpenClaw dashboard for Quiet Desk and Command Deck."
else
  echo "Setup stopped. Keep the private log and receipts; inspect the reported error before retrying." >&2
  exit 1
fi
