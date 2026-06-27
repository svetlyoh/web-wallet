#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${HOME}/.config/lingry"
ENV_FILE="${CONFIG_DIR}/env"
BIN_DIR="${HOME}/.local/bin"
WRAPPER="${BIN_DIR}/lingry-openclaw"

mkdir -p "$CONFIG_DIR" "$BIN_DIR" "${HOME}/.lingry"
chmod 700 "$CONFIG_DIR" "${HOME}/.lingry"

read -r -p "Lingry API base URL [https://web-wallet.svetlyoh.workers.dev]: " API_BASE
API_BASE="${API_BASE:-https://web-wallet.svetlyoh.workers.dev}"

read -r -p "Would you like Lingry to automatically claim the free 0.025 SUGAR starter balance when a new local wallet is created? [Y/n] " CLAIM_STARTER
CLAIM_STARTER="${CLAIM_STARTER:-Y}"
if [[ "$CLAIM_STARTER" =~ ^[Nn]$ ]]; then
	AUTO_CLAIM="false"
else
	AUTO_CLAIM="true"
fi

cat > "$ENV_FILE" <<EOF
export LINGRY_API_BASE_URL="${API_BASE}"
export LINGRY_KEYSTORE_PATH="\$HOME/.lingry/keystore.json"
export LINGRY_WALLET_PASSPHRASE="\${LINGRY_WALLET_PASSPHRASE:-}"
export LINGRY_DEFAULT_LANGUAGE_CODE="W"
export LINGRY_DAILY_PICK_LANGUAGE_CODES="W,E"
export LINGRY_MAX_AUTO_COIN_FEE_SATOSHIS="2000"
export LINGRY_MAX_AUTO_TIP_SATOSHIS="250000"
export LINGRY_AGENT_REQUEST_TIMEOUT_MS="180000"
export LINGRY_AUTO_CLAIM_STARTER_GRANT="${AUTO_CLAIM}"
EOF
chmod 600 "$ENV_FILE"

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
source "${ENV_FILE}"
if [[ -z "\${LINGRY_WALLET_PASSPHRASE:-}" ]]; then
	read -r -s -p "Lingry wallet passphrase: " LINGRY_WALLET_PASSPHRASE
	echo
	export LINGRY_WALLET_PASSPHRASE
fi
exec node "${SKILL_DIR}/bin/lingry-agent.mjs" "\$@"
EOF
chmod 700 "$WRAPPER"

echo "Installed ${WRAPPER}"
echo "This sends only your new public address, public key, and a signature proving you control the new wallet."
echo "Your private key and wallet passphrase remain only on this computer."
echo "Run: lingry-openclaw create-wallet"
