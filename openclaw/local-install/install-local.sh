#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STREAMING_DIR="$ROOT/streaming-mode"
GEAR_DIR="$ROOT/gear-engine"

usage() {
  cat <<'EOF'
Usage: bash install-local.sh [all|streaming|gear|status|rollback-streaming|rollback-gear]

  all                 Install/update Streaming Mode and Gear Engine from this folder.
  streaming           Repair or install Streaming Mode, then register its local skill.
  gear                Install/update Gear Engine from this folder.
  status              Show Streaming Mode and Gear Engine status.
  rollback-streaming  Restore the original OpenClaw Control UI backup.
  rollback-gear       Disable Gear Engine and restore its prior UI setting.
EOF
}

fail() {
  printf 'Local OpenClaw update failed: %s\n' "$1" >&2
  exit 1
}

[[ "$(uname -s)" == "Linux" ]] || fail "this bundle supports Linux only."
command -v node >/dev/null 2>&1 || fail "node is required on PATH."
command -v openclaw >/dev/null 2>&1 || fail "openclaw is required on PATH."
[[ -f "$STREAMING_DIR/SKILL.md" ]] || fail "missing local Streaming Mode folder."
[[ -f "$STREAMING_DIR/scripts/install.mjs" ]] || fail "missing Streaming Mode installer."
[[ -f "$GEAR_DIR/scripts/install.mjs" ]] || fail "missing Gear Engine installer."
[[ -f "$GEAR_DIR/plugin/openclaw.plugin.json" ]] || fail "missing Gear Engine plugin."

if [[ -f "$ROOT/SHA256SUMS.txt" ]]; then
  command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required to verify this bundle."
  printf 'Verifying the local bundle...\n'
  (cd "$ROOT" && sha256sum -c SHA256SUMS.txt)
fi

install_streaming() {
  printf 'Installing the corrected Streaming Mode payload from the local folder...\n'
  node "$STREAMING_DIR/scripts/install.mjs" install

  printf 'Registering the same local folder as the shared OpenClaw skill...\n'
  openclaw skills install "$STREAMING_DIR" --as streaming-mode --global --force
  printf 'Streaming Mode is installed from local files. Hard-refresh the Control UI; no Gateway restart is needed.\n'
}

install_gear() {
  printf 'Installing Gear Engine from the local folder...\n'
  node "$GEAR_DIR/scripts/install.mjs" install
}

show_status() {
  node "$STREAMING_DIR/scripts/install.mjs" status
  if ! openclaw plugins inspect openclaw-gear-engine --runtime --json; then
    printf 'Gear Engine is not currently available to the Gateway.\n' >&2
  fi
}

case "${1:-all}" in
  all)
    install_streaming
    install_gear
    ;;
  streaming)
    install_streaming
    ;;
  gear)
    install_gear
    ;;
  status)
    show_status
    ;;
  rollback-streaming)
    node "$STREAMING_DIR/scripts/install.mjs" rollback
    ;;
  rollback-gear)
    node "$GEAR_DIR/scripts/install.mjs" rollback
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
