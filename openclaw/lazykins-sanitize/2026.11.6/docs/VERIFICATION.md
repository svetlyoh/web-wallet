# November 20 upgrade verification

Target: stable OpenClaw **2026.11.6**, commit `06afb10d3272cc9deaf38ca6a3b7b839d5935638`. The 2026.11.10 beta is excluded. The original 2026.9.6 bundles remain unchanged for recovery.

Controller suite: 40 tests, 39 passed and one POSIX-permissions check skipped on Windows. An independent source review verified latest config JSON/CAS, native skill install flags, source tracking and agent workspace targeting. An isolated upgrade scenario verified that the new LazyKins controller refuses an old recorded UI before writing config, reports incompatibility, preserves rollback, then admits a matching new build.

Sanitize retains the v1 policy/state format and ownership, admits only the two inspected releases, and checks a reported commit when available. Its persistent SOUL carrier was rechecked against latest bootstrap and Codex harness source. New unmanaged-thread carrier behavior is documented separately from the older release. Ordinary live model responses remain unverified without a connected host.

The UI changed from Lit to Solid. Reusing the earlier binary or merely changing its version field is not a valid upgrade. A new exact-source overlay and production build are required. UI verification remains pending until the Linux build job succeeds; helper tests are not evidence of a working browser port.

The skin selector must remain visible in both Quiet Desk and OpenClaw view, also available in Appearance, preserve the current draft and mounted transport, and persist for the authenticated browser/profile. Switching skins does not uninstall either skill or alter Sanitize policy.
