# LazyKins and Sanitize â€” OpenClaw 2026.11.6

Updated and verified November 20, 2026 against stable [OpenClaw 2026.11.6](https://github.com/openclaw/openclaw/releases/tag/v2026.11.6), source `06afb10d3272cc9deaf38ca6a3b7b839d5935638`. Newer beta releases are excluded.

[Download Modes R4](https://github.com/svetlyoh/web-wallet/releases/tag/lazykins-modes-2026.11.6-r4). Use the combined `LazyKins-Modes-2026.11.6-r4.zip`; this source folder does not contain the generated UI payload.

[Full installation and rollback guide](docs/OPERATOR-GUIDE.md) · [Verification](docs/VERIFICATION.md)

## Install on Linux

Copy `LazyKins-Modes-2026.11.6-r4.zip` to Downloads. Run as the same Linux user that runs OpenClaw, without sudo. Requires Python 3.11+ and OpenClaw **2026.11.6**.

```bash
openclaw --version
python3 --version
BUNDLE="$(mktemp -d "$HOME/LazyKins-Modes-r2.XXXXXX")"
unzip ~/Downloads/LazyKins-Modes-2026.11.6-r4.zip -d "$BUNDLE"
cd "$BUNDLE"
sha256sum -c SHA256SUMS
openclaw --profile default agents list --json
```

Set the actual profile, state directory, agent ID and workspace from your service/inventory. These are default examples; the installer refuses a mismatched workspace:

```bash
OC_PROFILE='default'
OC_STATE_DIR="$HOME/.openclaw"
OC_AGENT='main'
OC_WORKSPACE="$HOME/.openclaw/workspace"

# Restore an earlier LazyKins root before replacing skills; harmless if not enabled.
python3 skills/lazykins/scripts/lazykinsctl.py off --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"
python3 install-both.py install --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR" --agent "$OC_AGENT" --workspace "$OC_WORKSPACE"

LK="$OC_WORKSPACE/skills/lazykins/scripts/lazykinsctl.py"
SAN="$OC_WORKSPACE/skills/sanitize/scripts/sanitizectl.py"
python3 "$LK" install --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"
python3 "$LK" on --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR"
python3 "$SAN" --profile "$OC_PROFILE" --state-dir "$OC_STATE_DIR" --agent "$OC_AGENT" --workspace "$OC_WORKSPACE" on
```

Follow the reported Gateway restart requirement through your existing service manager, then reload the browser. Custom config paths and recovery cases are covered in the full guide.

## Switch modes without uninstalling

Use **Enter Quiet Desk** or **Enter Command Deck** at the lower left. Each mode has a top-right **Exit** button returning to OpenClaw. Appearance also offers all three choices. The browser/profile preference is retained, including the older Quiet Desk key. Mode changes preserve the draft and connection.

Command Deck's optional priority queue backend is separate and is not included in this ready-built ZIP. Without a configured compatible backend and administrator authority, the panel reports unavailable and offers native Activity. Layout switching does not enable any backend.

Sanitize is independent: the skin switch never changes agent voice. Use `sanitizectl.py ... off` to remove its owned SOUL policy, or `complexity simple|balanced|detailed` to change detail. This affects the selected agent's other channels too.

## Scope and verification

The old Lit UI was ported to Solid; its binary is not reused. The generated ZIP includes the exact-source production build receipt and browser evidence for native OpenClaw, Quiet Desk and Command Deck. Native bundle budgets remain enforced. Local theme CSS and fonts use separate explicit limits.

This is not a live deployment receipt or proof of ordinary model style compliance. Check actual pairing, agent responses, service restart, native zoom and your plugins on the Linux host. Legacy Streaming Mode/Gear Engine integrations need their own latest-version verification. Installed skills and voice state live outside the engine package; future releases require explicit revalidation.

## Screenshots

Current mode screenshots and browser receipts are inside the ready ZIP at `skills/lazykins/runtime/evidence/final/`.

## Apps and returning to chat

The lower-left Apps button expands or collapses the Quiet Desk and Command Deck entries, each with a native OpenClaw icon. Selecting one changes the layout; it does not start a new session or alter Sanitize. On Quiet Desk Conversations, the visible Back to chat link returns through OpenClaw chat routing. It has a 44px touch target and does not rely on browser history.
