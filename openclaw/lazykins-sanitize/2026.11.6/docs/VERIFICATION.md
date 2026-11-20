# November 20 upgrade verification

Target: stable OpenClaw **2026.11.6**, commit `06afb10d3272cc9deaf38ca6a3b7b839d5935638`. The 2026.11.10 beta is excluded. The original 2026.9.6 bundles remain unchanged for recovery.

Controller suite: 40 tests, 39 passed and one POSIX-permissions check skipped on Windows. An independent source review verified latest config JSON/CAS, native skill install flags, source tracking and agent workspace targeting. An isolated upgrade scenario verified that the new LazyKins controller refuses an old recorded UI before writing config, reports incompatibility, preserves rollback, then admits a matching new build.

Sanitize retains the v1 policy/state format and ownership, admits only the two inspected releases, and checks a reported commit when available. Its persistent SOUL carrier was rechecked against latest bootstrap and Codex harness source. New unmanaged-thread carrier behavior is documented separately from the older release. Ordinary live model responses remain unverified without a connected host.

The UI changed from Lit to Solid. Reusing the earlier binary or merely changing its version field is not a valid upgrade. A new exact-source overlay and production build are required. Production build, strict native performance checks and browser verification passed in [Linux run 44797380473](https://github.com/svetlyoh/web-wallet/actions/runs/44797380473). All 40 controller tests passed on Linux. Helper tests alone were not used as proof of the browser port.

The skin selector must remain visible in both Quiet Desk and OpenClaw view, also available in Appearance, preserve the current draft and mounted transport, and persist for the authenticated browser/profile. Switching skins does not uninstall either skill or alter Sanitize policy.


## Verified package

Archive hashes and all 5,367 UI file hashes verified after download. Actual screenshots/results are included in the prebuilt ZIP under skills/lazykins/runtime/evidence/final. No connected production Linux host or ordinary model session was tested. Public skin CSS/font assets have separate enforced limits; native compiled-bundle limits are unchanged and enforced. Existing skin preference keys are retained across the upgrade. OpenClaw view retains the selector header intentionally.
