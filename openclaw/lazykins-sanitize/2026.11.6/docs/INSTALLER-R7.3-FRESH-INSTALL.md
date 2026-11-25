# R7.3: one guided install for Quiet Desk and Command Deck

November 25, 2026. Supported engine: OpenClaw **2026.11.6 only**.

## Before installation

Use Ubuntu as the same non-root user that owns OpenClaw. Requires Python 3.11+, curl, unzip, an onboarded OpenClaw 2026.11.6 with a configured working model and native managed Gateway service. The engine/provider login is an OpenClaw prerequisite; the bundle does not create accounts, install a different engine, select a model, or promise compatibility with later releases. If OpenClaw has just been installed, finish its native onboarding/model/service setup first. Keep the usual Gateway running before this installer; it manages approved maintenance itself.

## One installation

Download the combined R7.3 ZIP and its .zip.sha256 from the R7.3 release, verify the archive checksum, extract into a new directory, then run `bash install.sh`. The wrapper verifies every bundled checksum before executing setup and saves a private installation log under your home directory. No local patch or developer toolchain is needed.

The wizard verifies the installed version, model readiness, exact profile/state/config and managed service target. Native model exit code 2 (usable but expiring authorization) warns and continues; actual unavailable/expired/indeterminate requirements still block. No model/default/credential is changed. This includes correctly configured Luna 6 and other supported native models.

Service stop uses native --force acknowledgment only after the existing typed maintenance approval. An originally running service is restored on failure/cancellation. A short native startup timeout is reconciled against the same service/version rather than repeatedly restarting it. A recovery failure cannot hide the original error.

Review Templates Labs if needed, then each missing native agent separately: Helm, Jace and Cruz. Existing verified crew are reused; edited/colliding/shared workspaces are not overwritten. Original authored personas/avatars and the production UI remain unchanged. Main stays the ordinary default. Both LazyKins and Sanitize skills are installed; Sanitize activation remains separate.

If native Add changes only Main's binding count upwards, the private receipt records the actual Add and field delta. Setup shows Main's current bindings and asks for the separate typed approval KEEP REVIEWED MAIN ROUTING. This retains the observed routes; it does not create a binding or claim to know its origin. Declining stops without deleting the newly added crew. Other existing-agent changes, including model/workspace/default changes, remain a hard stop. No Add is silently repeated.

## Completion and delegation

After crew registration, authored-file and per-agent model checks, the installer enables the UI and verifies Gateway readiness. Optional delegation is separately reviewed. If unavailable, declined, or a write is unconfirmed, direct crew/UI setup still finishes and the limit is reported accurately. An uncertain write is never automatically repeated. Use Command Deck > Crew setup & permissions > Review Helm delegation permissions to read the current policy and finish with an authorized owner. Effective tool/provider policies still apply; no task is launched by setup.

Reload the usual dashboard. Choose Quiet Desk or Enter Command Deck. Command Deck opens verified Helm, supports independent Jace/Cruz chats and retains Main behind deliberate selection. Exit returns to ordinary OpenClaw. Nothing requires uninstalling a mode to switch layouts.

## Verification and limits

The operator reported successful complete crew/UI setup on chad-OptiPlex-3020 after the targeted expiry-warning correction and preservation review of Main's Telegram binding. That is operator-supplied evidence, not remote access or an independent provider/delegation test. R7.3 incorporates those corrections and retains required reviews rather than claiming it can never fail.

The production UI/assets are reused byte-for-byte from verified R7.1 (build run 45055852841). Installer/controller/preservation checks and archive/payload hashes are verified separately for this release. All live provider responses, delegated tasks and arbitrary future Ubuntu configurations are not certified by these fixtures.
