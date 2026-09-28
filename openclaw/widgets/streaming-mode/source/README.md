# Source reference

`openclaw-2026.9.6-streaming-mode.patch` applies to OpenClaw commit `eb377ac59e6c9fd6c7705028034812becf00271b`.

The implementation uses OpenClaw's Lit components with browser-local feature state, shell and top-bar controls, and scoped layout CSS. It deliberately leaves the native composer, plugin accessory host, navigation state, overlays, and focus handling unchanged. The patch stays off by default and does not change Gateway configuration or data.

The checked-in Linux payload is built from that exact tree and includes the complete generated asset set, including the gzip and Brotli sidecars recorded by OpenClaw's asset manifest. The build uses `OPENCLAW_CONTROL_UI_BUILD_ID=2026.9.6-release-eb377ac59e6c-2026-09-23T16-33-12.144Z`, copied from the official `openclaw@2026.9.6` npm package's `dist/build-info.json`. OpenClaw rejects a Control UI whose embedded build identity differs from the running Gateway after restart.
