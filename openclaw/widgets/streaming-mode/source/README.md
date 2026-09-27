# Source reference

`openclaw-2026.9.6-streaming-mode.patch` applies to OpenClaw commit `eb377ac59e6c9fd6c7705028034812becf00271b`.

The implementation uses OpenClaw's Lit components and native mobile navigation drawer. It adds a browser-local feature state, shell and top-bar controls, a per-chat composer state, scoped CSS, and focused persistence tests. The patch stays off by default and does not change Gateway configuration or data.

The checked-in Linux payload is built from that exact tree and includes the complete generated asset set, including the gzip and Brotli sidecars recorded by OpenClaw's asset manifest.
