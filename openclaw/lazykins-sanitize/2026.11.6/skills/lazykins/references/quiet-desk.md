# Quiet Desk controls

The UI is a scoped overlay on the pinned upstream shell. It preserves an upstream rendering branch for OpenClaw view. Conversations use actual upstream sessions, Tasks opens the native Workboard destination when its plugin is available, and Files is the selected agent's upstream workspace file surface. Availability remains subject to upstream permissions and capabilities.

Use the browser view selector to switch layout without changing the Gateway root. Appearance remains with the upstream authenticated profile and its Appearance settings. Existing upstream navigation, mobile drawer focus, Settings, approvals, Stop, links, attachments and copyable code remain available. No extra WebSocket, retry loop or model pass is introduced.

Sanitize is independent and agent scoped. It can affect that agent's prose on other channels. Enabling LazyKins does not silently enable voice changes. If no verified backend is available, provide the Sanitize setup command rather than an ornamental toggle. Use Sanitize's `status`, `on`, `off`, and `complexity` controls against the exact configured agent/workspace.

Keep engine activity, warnings, failures and approval requests visible. Never invent a completion from prose or provide a send button for an unverified draft. The older Lit Streaming Mode and Gear Engine integrations are not certified for the new Solid release. Preserve their configuration and native accessory surfaces; do not copy their old UI bundle over this build or claim current compatibility without a matching port and host verification.
