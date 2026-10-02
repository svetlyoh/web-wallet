#!/usr/bin/env bash
set -euo pipefail

# Run as the Linux/macOS user who owns the OpenClaw installation; do not use sudo.
repository='https://github.com/svetlyoh/web-wallet.git'
folder='openclaw/widgets/streaming-mode'
source_dir="${STREAMING_MODE_SOURCE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/openclaw-streaming-mode-source}"

case "$(uname -s)" in
  Linux|Darwin) ;;
  *) echo 'Use this download installer on Linux/macOS, or install the ClawHub skill from Windows PowerShell.' >&2; exit 1 ;;
esac
for command in git node openclaw; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is missing: $command" >&2
    exit 1
  fi
done

if [[ -e "$source_dir" ]]; then
  if [[ ! -d "$source_dir/.git" ]]; then
    echo "Download destination already exists and is not this checkout: $source_dir" >&2
    exit 1
  fi
  actual_remote="$(git -C "$source_dir" remote get-url origin)"
  if [[ "$actual_remote" != "$repository" ]]; then
    echo "Download destination has another origin: $source_dir" >&2
    exit 1
  fi
  dirty="$(git -C "$source_dir" status --porcelain)"
  branch="$(git -C "$source_dir" branch --show-current)"
  if [[ -n "$dirty" || "$branch" != 'master' ]]; then
    echo "Download checkout has local changes or another branch. Preserve those changes before retrying: $source_dir" >&2
    exit 1
  fi
  git -C "$source_dir" pull --ff-only origin master
else
  mkdir -p "$(dirname "$source_dir")"
  git clone --depth 1 --filter=blob:none --sparse --branch master "$repository" "$source_dir"
fi
git -C "$source_dir" sparse-checkout set "$folder"

printf '\nDownload complete. Backup, installation, and verification can take a couple more minutes. Please do not interrupt them.\n\n'
node "$source_dir/$folder/scripts/install.mjs" install
printf '\nUpdate with this same command at any time. Roll back with:\nnode "%s/%s/scripts/install.mjs" rollback\n' "$source_dir" "$folder"
