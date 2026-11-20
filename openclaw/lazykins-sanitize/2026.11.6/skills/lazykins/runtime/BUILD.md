# Quiet Desk for OpenClaw 2026.11.6

This generation is an actual Solid 2 overlay port. It targets only upstream tag `v2026.11.6`, commit `06afb10d3272cc9deaf38ca6a3b7b839d5935638`. The older 2026.9.6 Lit bundle is not reused or certified for this release.

## Build a new verified payload

Use an isolated pristine source checkout, supported Node 24.18, the source-pinned pnpm 12.15.0, and sufficient disk space. The wrapper refuses another source SHA, package version, toolchain pin, changed integration inputs, dirty checkout, fuzzy patch, existing output directory, or failed browser proof.

```sh
git clone --depth 1 --branch v2026.11.6 https://github.com/openclaw/openclaw.git /tmp/openclaw-quiet-desk-2026.11.6
cd /tmp/openclaw-quiet-desk-2026.11.6
corepack enable
corepack prepare pnpm@12.15.0 --activate
pnpm install --frozen-lockfile
pnpm --filter openclaw-control-ui exec playwright install --with-deps chromium
python3 /path/to/skills/lazykins/runtime/scripts/build.py --source /tmp/openclaw-quiet-desk-2026.11.6 --output /path/to/skills/lazykins/runtime/payload
```

`--check` performs read-only pin/hash and `git apply --check` validation before dependencies are installed. A build uses the upstream `pnpm ui:build` pipeline, including its Solid compiler, route splitting, CSP/service-worker inventories, and asset compression. Source maps and the build input diagnostic file are omitted from the deployable copy, matching release packaging; production bytes otherwise stay unmodified. Notices retain OpenClaw MIT, upstream third-party notices, and bundled Inter 4.1 OFL. Inter is local, never fetched by the browser.

The production verifier uses the pinned upstream mock-Gateway harness and real Chromium against emitted files. It retains distinct attempt artifacts. On success the wrapper copies screenshots/results into `runtime/evidence/final`, builds the exact file-hash manifest, then publishes a new output directory atomically. No verified payload exists until this succeeds. A failed CI attempt must retain its `.artifacts/lazykins-verification` directory for diagnosis.

## Integration ownership

Seven upstream files have narrowly pinned connections. Separate LazyKins TS/TSX/CSS modules own presentation. The original sidebar branch, session list, menus, identity, routes, authorization, composer, approvals, transport, and page loaders remain native. The browser header remains visible in both layouts so the user can always return to Quiet Desk. The Appearance selector uses the same preference action. A view switch preserves the chat island and never creates a socket, poller, retry loop, or send request. Keys contain the existing credential-free Gateway origin scope and authenticated profile ID.

OpenClaw 2026.11.6 removed the old Tasks route. The Tasks link now opens its native Workboard plugin destination, with an explicit enabled-plugin caveat; no task data or success state is fabricated. Files opens the selected agent's real workspace files, not a global artifact index. Settings retains all native administrative navigation. Sanitize is separately managed and has no pretend UI toggle.

The standard theme gets the Quiet Desk warm light/dark palette. Existing personal theme selection is preserved. The bundled `assets/quiet-desk-theme.json` is an optional theme catalog definition; UI theme import and selection remain OpenClaw-owned actions in Appearance. No preference change imports or applies a theme automatically.

The native composer still swaps Stop for Send when a sendable follow-up exists. A Quiet Desk-only secondary control uses exactly `renderChatAbortActionSolid` and the existing live `onAbort` callback; this deliberate presentation difference preserves Stop without adding another cancellation owner. Voice controls retain their original branch.

Handshake gating permits the existing preconnection authentication/bootstrap flow. Once connected, missing or mismatched version is a visible refusal before work controls. Future updates keep the skill instructions installed, but require a newly pinned port and proof; there is no broad compatibility assertion.

## Verification status and limits

Local source/pin/patch syntax checks are recorded separately from production CI. The current Windows workspace cannot install the new complete dependency graph within its disk budget; it must not reuse the older Lit dependencies. The public Linux GitHub Actions job supplies the exact new dependencies and actual build/browser proof. Until it passes, this generation is source prepared, not a tested installable UI payload.

Even a passing synthetic-Gateway production test does not prove a live Linux deployment, real model stream, native browser zoom, Workboard plugin execution, real approvals, existing streaming-mode adapter, or gear widget telemetry. Those remain host checks. The old Lit streaming patch cannot safely be transplanted into Solid; the port does not claim that migration is finished.

Inter provenance: `https://raw.githubusercontent.com/rsms/inter/v4.1/docs/font-files/InterVariable.woff2` and `https://raw.githubusercontent.com/rsms/inter/v4.1/LICENSE.txt`. Upstream project/tag provenance is preserved in the exact source SHA and manifest. No private host configuration, credentials, or user transcript is bundled.
