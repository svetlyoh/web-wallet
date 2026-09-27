# Gear Engine for OpenClaw

Gear Engine adds three animated gears to the OpenClaw 2026.9.6 chat header. The gears show recent input, active processing, and recent browser UI delivery receipts using data already exposed by the authenticated Gateway.

The plugin does not add network clients, credentials, backend routes, or tools. Its browser bundle reads the current Gateway's authorized session data and renders a Control UI accessory.

## Install from ClawHub

```sh
openclaw plugins install clawhub:@svetlyoh/openclaw-gear-engine
openclaw plugins enable openclaw-gear-engine
openclaw config set gateway.controlUi.experimental.customPlugins true --strict-json
openclaw plugins reload openclaw-gear-engine --json
```

Reload the Control UI using the same Gateway's HTTPS URL or localhost. Open **Plugins → Customize UI** if the accessory does not appear.

This release supports OpenClaw 2026.9.6. It intentionally declares an exact plugin API and minimum Gateway version because the Control UI host API is version specific.

## Verify

```sh
openclaw plugins inspect openclaw-gear-engine --runtime --json
openclaw gateway call plugins.controlUi.list --json
```

The runtime status must be `loaded`, and the Gateway catalog must contain `openclaw-gear-engine`.

## Update

```sh
openclaw plugins update --all
```

Reload the Control UI after an update.

## Source and reversible installer

The source, tests, screenshots, and an installer that records and restores the prior Custom plugin UI setting are in the [Gear Engine source folder](https://github.com/svetlyoh/web-wallet/tree/master/openclaw/widgets/gear-engine).
