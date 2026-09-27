# OpenClaw Gear Engine — implementation handoff

Prepared September 27, 2026 UTC / September 26 Pacific. This package is a working visual prototype and an implementation specification, not an installed OpenClaw plugin. No changes have been made to the user's Ubuntu PC.

## Task for the Codex agent on Ubuntu

Implement the supplied three-gear activity indicator in the upper-right activity box of the user's existing OpenClaw Control UI. Inspect the actual page and installation first; the URL and screenshot of that box were not supplied here. Reuse its placement if present. Otherwise add a small dock in the upper-right of the chat content, with reserved space so it never covers messages, menus or Stop. Preserve current functionality. Build, test, and provide a reversible installation plus a patch/commit. Do not replace OpenClaw with a separate dashboard.

Use TypeScript + Lit + SVG and a single requestAnimationFrame loop. Port the supplied dependency-free JavaScript custom element to the existing Lit conventions. No GIF, sprite sheet, Three.js, LLM calls, remote animation service or new public port is needed. The standalone HTML is the design reference, not a production iframe.

Read this document, run `node --test test-core.mjs`, and open `openclaw-gears-preview.html` before implementing. The demo's synthetic timers and controls must not ship as live telemetry. `gear-core.mjs` contains reusable geometry, rate mapping, kinematics, scenarios and a normalized reducer; `gear-element.mjs` contains the renderer. `demo.mjs` drives simulated scenarios.

## Verified baseline and limits

GitHub's latest-release endpoint resolved to **v2026.9.6**, release SHA `eb377ac59e6c9fd6c7705028034812becf00271b`, during this research. Recheck the installed version and upstream stable release at implementation time. Moving docs may describe behavior newer than the installed release. Do not silently upgrade an installation just to match this document. [S1]

The Control UI is a Vite/Lit application served by the Gateway and uses its WebSocket connection. [S2] Source at v2026.9.6 was inspected directly. Relevant existing paths:

| Path | Use |
| --- | --- |
| `ui/src/app/app-shell-view.ts` | Locate the desktop content/dock mount |
| `ui/src/app/app-shell-chrome.ts` | Existing shell interactions and panel ownership |
| `ui/src/app/gateway-store.ts` | Existing connection, snapshots and `subscribeEvents` |
| `ui/src/pages/chat/chat-gateway.ts` | Existing chat event handling |
| `ui/src/components/app-topbar.ts` | **Mobile/narrow view only**; source says desktop hides it |
| `ui/src/components/lobster-pet.runtime.ts` | Existing pet lifecycle patterns; do not confuse decorative pet traffic with real activity |
| `src/infra/diagnostic-events.ts` | Internal diagnostic types for model usage, ingress, dispatch and delivery |
| `docs/web/control-ui/development.md` | Build and custom UI deployment guidance |

Older advice referring to `ui/src/ui/app-gateway.ts` or `ui/src/ui/controllers/chat.ts` does not match this verified release. Use repository search when paths change. The pet's `lobster-pet-traffic.ts` describes decorative visitors, not token/network telemetry.

## Visual specification

- Transparent 160 × 160 CSS-pixel square, 240 × 240 SVG viewBox; optional 128 px compact and 192 px large setting. Default 160 px is a design choice approximating a desktop pet, not a measured ChatGPT pet size.
- Three metal components: **I**, a small 18-tooth input planet; **P**, a larger 36-tooth processing sun; **D**, a 72-tooth internal delivery annulus. A subtle fixed support carries the planet axle. Exactly three toothed elements.
- Oblique view, mild metal shading, crisp involute flanks, visible axial gaps in independent mode. No opaque background, enclosing panel, smoke, flames, violent shake, constant sparks or sound.
- Motion means confirmed active work. A static badge distinguishes idle, queued, approval, retry wait, stopping, failed and unknown. Keep I/P/D identifiers stationary so rotation remains readable.
- Clicking the widget opens a small details popover: scope, active/queued counts for each lane, run/channel labels allowed by current authorization, observed/estimated token rates, last-known usage, delivery outcome, and connection status. Keyboard Enter/Space opens; Escape closes. Hover is optional.
- Default scope: all activity the signed-in operator is authorized to observe. Show “This chat” / “All visible work” in the popover. A tiny count badge explains why a gear continues after stopping the selected run. Do not expose hidden session names or aggregate their activity to unauthorized users.

## Mechanical accuracy and the necessary compromise

A permanently meshed planetary train cannot provide arbitrary independent motion. A shaft clutch alone does not make a stationary toothed gear independent while its teeth remain meshed. We therefore use an **axially separated planetary assembly for live status**: the three components rotate on separate parallel planes and are out of mesh. The connecting shafts and clutch hubs communicate the assembly; their motion is driven by independent activity signals. Treat this as an instrument inspired by a gearbox, not a claim that software moves a physical gearbox.

The live prototype keeps those planes separated at all times. Its “Linked gear demonstration” is an explicitly separate teaching mode, not a telemetry mode. It moves them into a common plane, locks the carrier and applies correct gear ratios. Do not auto-engage gears merely because all three lanes are active: their independent rates will almost never satisfy the mesh constraints.

Common module m=2 drawing units, 20° pressure angle, pitch radii `rp=18`, `rs=36`, `rr=72`, axle distance `a=54`. `Nr = Ns + 2 Np = 72`. External addendum m, dedendum 1.25m; internal tip radius rr−m and root radius rr+1.25m. The annulus uses inward-facing teeth, not outward teeth around a hollow disc.

For engaged gears, with carrier angular speed wc:

```text
36(ws − wc) + 72(wr − wc) = 0
36(ws − wc) + 18(wp − wc) = 0
```

With the carrier fixed and sun +14 rpm: planet −28 rpm, annulus −7 rpm. Integrate the sun angle once, derive planet/ring angles from it. Phase offsets in the supplied drawing are sun 0°, planet 10°, annulus tooth-space contour 2.5°. Both tooth contact points must remain phased across a revolution. [S9]

The demo uses sampled involute flanks with straight root transitions and an oblique projection. It is not a manufacturing model: no trochoidal root fillet, bearing loads, backlash solver, tooth-contact stress or dynamic torque simulation. Production should preserve kinematics, not add expensive mechanics irrelevant to a 160 px status indicator. If animating engagement, first separate or stop, align tooth phase, equalize contact velocity, slide into plane, then resume. Never let moving teeth visibly pass through each other. Production can omit the linked demonstration entirely.

The requested “small gear kicks off processing” is an event handoff: input decelerates after acceptance, processing accelerates at actual run start, with one brief light transfer along the shaft. It is not evidence that input tokens equal model prompt tokens. A fast input event may display for 180 ms for legibility; mark this as a recent-activity afterglow, not a live operation.

## Complete combination matrix

Bits are I/P/D, in that order. “On” means actively receiving, executing or sending; merely queued work is separately badged.

| I P D | Example | Motion |
| --- | --- | --- |
| 0 0 0 | Idle; or all work waiting for approval/backoff | All parked; waiting states retain specific static markers |
| 1 0 0 | Upload/intake before admission; short local command intake | Only input |
| 0 1 0 | Model inference, reasoning, tool execution, compaction | Only processing |
| 0 0 1 | Model finished; reply/media still in transport; direct message send | Only delivery |
| 1 1 0 | New input during a run; steering or another session receives work | Input and processing |
| 1 0 1 | New prompt arrives while an earlier reply is sending | Input and delivery |
| 0 1 1 | Generation with outbound preview edits, blocks or messaging tools | Processing and delivery |
| 1 1 1 | Simultaneous intake, generation/tools and outbound sends across visible work | All three independently |

Do not hard-code a sequential I→P→D state machine. Processing and sending overlap, sessions execute concurrently, and direct sends need no model call. OpenClaw queues serialize session work while allowing concurrency between sessions; steer, followup, collect and interrupt differ. Read configured behavior rather than assuming defaults. [S3]

## Additional scenarios and exact display rules

| Scenario | Required behavior |
| --- | --- |
| Local typing without submit | Optional quiet input pulse only while typing; label “Draft”, never count as tokens billed or Gateway intake. Default off. |
| Attachment/audio/video ingress | I rotates during known upload/staging; bytes or active state drive motion if token count unavailable. No fabricated tokens. |
| Debounce, collect or followup queue | I parks after acceptance; queue badge increases. P starts only on execution admission. |
| Steering mid-run | Brief I activity, P continues; attach input to target run; do not invent another model run. |
| Tool start/result/model continuation | P stays active across executing tools. A waiting tool/approval parks P if there is no other executing work. Tool result contributes to model input only when reported in actual usage. |
| Silent reasoning/no visible text | P remains active on lifecycle evidence with slow unknown-rate speed; no synthetic token rate. |
| Startup/context preparation | P slow, detail names preparation; rate unavailable until evidence. |
| Compaction/failover | P active while executing; amber parked during a known backoff; retain attempts and usage already consumed. |
| Streaming chunks/previews | D active only during actual send/edit operations; distinguish preview from final. Buffered generation alone is P. |
| Control UI WebSocket text rendering | D may briefly represent receipt/render of this chat's update, labeled “UI update”; never call that an external channel delivery receipt. |
| NO_REPLY/suppressed response | P can end without D. No fake send or success burst. |
| Messaging tool, cron, heartbeat, webhook, subagent announcement | Attribute to owner and channel; count real sends and model work. Don't add input merely because a timer fired. Tool/agent internal transfers belong to P unless an actual outbound delivery occurs. |
| Concurrent tools or child runs | P aggregates active operation IDs; count badge and details disclose multiplicity. Parent end does not clear children. |
| Approval or ask-user wait | Static pause/attention marker; other active operations may keep their lane spinning. A sent approval prompt can briefly activate D. |
| Rate-limit retry | Park affected lane during backoff; badge queued count; resume at actual retry start. |
| Partial multi-recipient failure | Track each transport attempt; D continues for remaining sends; show failed count; never globally declare delivered. |
| Known provider acceptance | Brief check marker then park when no sends remain. Say “Accepted by channel”, unless a stronger receipt exists. Recipient read is a separate fact. |
| Failed send | Stop that attempt, red D marker, retry state separately. No success animation. |
| Unknown transport outcome | Park with “Outcome unknown”; avoid blind resend. Reconcile with supported provider receipts/idempotency. |
| Disconnect/Gateway restart | Freeze, desaturate, label unknown/offline. Rebuild from an authorized snapshot before resuming; silence is not idle. |
| Background tab/reduced motion | Pause rendering, continue logical state handling; resume from current snapshot. Reduced motion uses static active markers and labels. |

OpenClaw channel streaming can send completed blocks or update temporary previews; it is not token-by-token delivery. This is why generating and delivering must be separately represented. [S4]

## Stop semantics

1. Reuse the existing Stop action and its exact selected-run/session scope. Do not create a widget-wide kill switch. Current documentation distinguishes exact-run `chat.abort` from the selected-session `sessions.abort` fallback; descendants and queued work depend on that path. [S5]
2. On request, add “Stopping” and an amber brake marker only to the target operations. Do not declare success on button click.
3. On confirmed terminal cancellation, decelerate those stopped components over approximately 130–220 ms. This coast is decorative; expose the confirmed state immediately to accessibility and details.
4. An outbound attempt that crossed its actual dispatch boundary stays in-flight until its own completion, error or unresolved outcome. Do not clear it because model execution ended. If no cancellation handle exists, do not claim it can be recalled.
5. Only cancel queued deliveries if OpenClaw's existing cancellation policy actually cancels them. This indicator must observe semantics, not change them.
6. Preserve unrelated runs, independent cron work and sends. Keep P or D moving while any authorized operation in that lane is still active.
7. If child cancellation is incomplete, keep the active child represented and show “Some child work is still stopping.” Partial text may remain in chat. A success acknowledgment is not proof every side effect was undone.

Prototype timing (600 ms acknowledgment, 3.2 s in-flight completion) is synthetic. Replace every timer with real events in production.

## Token speed and “heat”

Use a **token-load glow**, not literal hardware temperature. Steel means idle; electric blue means normal observed load; violet means sustained high token activity. Reserve amber for waits and red for failures. Do not imply that cloud token usage overheats the Ubuntu PC.

Maintain three independent signals: lane active state; throughput observation; recent load envelope. Never derive activity solely from a nonzero token total.

- I uses inbound payload tokenization only when available, otherwise active intake/byte rate. Full model prompt input includes context and tools and belongs to P's load, not I's user-message count.
- P uses per-model-call usage normalized by the source adapter. Preserve input/output/cache categories. Accumulate each unique response once; retry/reasoning usage follows the provider's semantics. Do not add reasoning or cache counts again if included in totals.
- D uses payload tokens/bytes actually being dispatched, not the provider's generated-output total. Sends generally incur no new generation tokens; delivery glow is a payload-volume visualization, never additional billing.

Confirmed OpenClaw UI token counts can update at completed-response boundaries rather than every text fragment. [S6] At those boundaries compute observed average `outputTokens / modelCallDurationSeconds`, labeled “last call average”. Do not divide a delayed bulk total by the UI event-arrival interval. If a tokenizer-based live estimate is supported, visibly label `~`/“estimated”; character count is not exact and must not enter billing. Unknown rates show `—` and a low busy speed. Keep the latest measured usage visible after the run ends without keeping gears active.

Suggested defaults (design parameters, not OpenClaw limits):

```text
q = clamp(log(1 + rate) / log(1 + 160), 0, 1)
input rpm      = 6 + 28q
processing rpm = 4 + 20q
delivery rpm   = 3 + 13q
```

These rates saturate to avoid aliasing tiny teeth. Smooth rates with a 0.75 s exponential average. Maintain a ten-second decaying recent-work envelope for each lane, incorporating measured prompt/payload volume where available; normalize against a configurable per-lane baseline. Raise glow over ~1.5 s and decay over ~4 s. A newly reported large prompt can add a measured-load pulse even if generation is slow. Keep speed and glow distinct: speed is throughput; glow reflects recent work. Once all gears are idle and cool, stop requestAnimationFrame entirely.

The prototype's single slider intentionally feeds all lanes and approximates heat from rate. Production must replace it with independent sources and the volume-aware envelope above. Do not display the demo slider or fabricated live rates in the actual UI.

## Telemetry adapter: what exists vs what must be added

| Existing surface | Use | Limitation |
| --- | --- | --- |
| Existing UI send/upload lifecycle | I activity for this browser | Does not observe every channel |
| Existing Gateway `chat`/`agent` events | Run/text/tool lifecycle for authorized subscriptions | Verify payload schemas and runtime differences |
| Typed message hooks `message_received`, `message_sending`, `message_sent` | Inbound facts and outbound outcomes | `message_sending` is preflight and another hook may cancel; it is not proof transport started [S7] |
| Internal `message.delivery.started/completed/error` diagnostics | Actual transport observation seam | v2026.9.6 types lack an attempt ID/run ID in their delivery base; not assumed to be a public browser feed [S8] |
| Internal `model.usage` diagnostics | Structured usage and duration | Source-specific cumulative/per-call semantics; not automatically a WS subscription [S8] |

First reuse already-authorized activity stores and run usage counters. For comprehensive all-channel tracking, implement a small metadata-only server aggregation layer if existing data cannot provide the correlation and snapshots. A frontend-only implementation must honestly label its limited scope; it cannot satisfy full all-channel coverage by guessing.

Create a proposed internal normalized contract (names below are NEW, not existing RPC names):

```ts
type Lane = 'input' | 'processing' | 'delivery';
type State = 'queued' | 'active' | 'waiting' | 'stopping' | 'unknown';
interface ActivityOperation {
  id: string;              // stable opaque operation ID
  revision: number;        // monotonic per operation
  phase: Lane;
  state: State;
  runId?: string;
  parentRunId?: string;
  sessionKey?: string;     // server visibility-filtered
  deliveryId?: string;
  attemptId?: string;
  channel?: string;
  kind?: 'model' | 'tool' | 'compaction' | 'preview' | 'reply' | 'media' | 'ui-update';
  rate?: { value: number; unit: 'tokens/s' | 'bytes/s'; quality: 'observed' | 'estimated' | 'last-call-average' };
  cancellable?: boolean;
}
interface ActivitySnapshot {
  schemaVersion: 1;
  epoch: string;           // changes on server aggregation reset
  seq: number;             // global stream sequence
  operations: ActivityOperation[];
}
```

Emit deduplicated operation updates and terminals with stream sequence, epoch and operation revision. Generate delivery/attempt IDs at the transport operation boundary, carry them through completion and cancellation, and correlate through existing execution context where available. Do not match concurrent sends using message text, channel + timestamp, or FIFO completion assumptions. If exact correlation is unavailable, preserve an uncorrelated aggregate and do not attribute it to the selected run.

The included reducer demonstrates per-ID ownership, revisions, tombstones and epoch changes. It intentionally is not a complete transport client. Production must also implement gap detection, snapshot+delta handoff without races, bounded retention and authorization changes. On reconnect: subscribe/buffer, fetch snapshot with watermark, replace state, apply only later deltas in sequence; alternatively use one atomic server subscription snapshot. On gap or buffer overflow: mark unknown and resnapshot. On scope loss: erase denied operations immediately. Keep terminal tombstones until a newer authoritative watermark makes replay safe; periodically compact using snapshots, not arbitrary eviction that can resurrect old work.

No new operator privileges, raw message bodies, recipients, tokens, tool arguments/results or secrets should enter this stream. Use the existing authenticated Gateway transport and exact current authorization checks. Do not weaken origins, pairing, CSP or auth to make the widget work. Observer failures must not block or modify message dispatch. Coalesce telemetry to at most 10 Hz, bound active records and queues, and keep handlers O(1) where practical. A backlog badge must show truncation if server limits are hit.

## Suggested implementation organization

Create files under the actual version's conventions, for example:

```text
ui/src/components/activity-gears.ts       Lit component and SVG view
ui/src/lib/activity-gears/geometry.ts     pure cached path generation
ui/src/lib/activity-gears/state.ts        normalized operation reducer
ui/src/lib/activity-gears/adapter.ts      existing stores → normalized state
ui/src/lib/activity-gears/motion.ts       angles, rpm and glow envelopes
ui/src/styles/activity-gears.css         transparent square + responsive dock
```

Register/mount once in the desktop shell or the existing upper-right box, not solely the mobile topbar. Subscribe once to the existing Gateway store; avoid a second WebSocket or per-frame RPC. Keep frame updates outside full Lit rerenders: cache SVG groups and update transforms/styles. Render geometry once. No timers/listeners after disconnect. Use a feature flag/preference to hide it without changing work.

Native browser APIs suffice. Font and labels inherit OpenClaw. Replace prototype colors with current theme tokens where appropriate, preserving blue/violet workload and amber/red semantic contrast. Test transparent rendering in light/dark themes. The demo's fixed I/P/D labels should be localized in accessibility descriptions.

## Ubuntu implementation and reversible deployment

Run these read-only discovery commands locally; do not paste secrets or full configuration into chat:

```bash
openclaw --version
command -v openclaw
readlink -f "$(command -v openclaw)"
openclaw gateway status
node --version
pnpm --version
openclaw config get gateway.controlUi.root
```

A missing root setting or unavailable pnpm is discovery, not a reason to reset/reinstall. Inspect the real service/install method and repository instructions. Use the repository's pinned Node/package-manager versions and lockfile. If a source checkout exists, make an isolated branch/worktree preserving user changes. Otherwise obtain an official checkout pinned to the **installed matching release**. Do not edit compiled global npm assets in place or run pnpm scripts inside a packaged CLI directory.

From the matching source checkout, following its build instructions:

```bash
pnpm install --frozen-lockfile
pnpm ui:build
```

For a UI-only implementation, stage `dist/control-ui` into a versioned directory owned by the current user and use the documented `gateway.controlUi.root` override after verifying the built UI matches the running Gateway. Preserve whether the prior setting was absent or its exact previous value. A root change requires a Gateway restart; use the existing service management command, not a second Gateway. Validate the current config CLI syntax with help before setting it. [S10]

If adding the comprehensive backend telemetry layer, build and deploy the corresponding modified Gateway and UI together through the existing installation method. A custom static UI root alone cannot add backend events. Preserve credentials, state, channels and service identity. Run focused tests and stage the change before any necessary restart; do not send real messages as a test without authorization. Mock transports cover delivery behavior.

Deliver: source commit/patch, exact compatible release/SHA, built artifact path, local install steps, feature flag, and rollback command tailored to the discovered service. Rollback restores the previous UI root (or unsets it if originally absent), restores the prior Gateway build if changed, and restarts only the existing service. Keep the previous artifact until validation succeeds. Retain the patch for upgrades; a pinned custom UI root does not update automatically with the CLI.

## Acceptance criteria

1. All eight combinations work independently; an off gear settles to zero rotation. Correct 18/36/72 geometry and linked ratio/phase assertions pass. No interpenetrating teeth in a claimed engaged mode.
2. Stop request versus acknowledgment, in-flight sends, unrelated runs, partial child cancellation and multiple delivery attempts behave as specified. Completed send means transport acceptance unless stronger evidence exists.
3. Duplicate/out-of-order events, terminal-before-start replay, dropped events, reconnect, Gateway restart and session switching do not leak or resurrect activity. Permission changes clear data.
4. Queued/backoff/approval states cannot masquerade as active sending or token consumption. Unknown usage stays unknown. Provider usage normalization is tested against multiple-call/retry/cache fixtures.
5. No false D activation from model text alone; preview/send/edit/media and `NO_REPLY` fixtures covered. No double counting of messaging-tool and final-reply receipts.
6. Keyboard, screen reader, reduced motion, high contrast, light/dark, 320 px viewport and 200% zoom work. No overlap with Stop or other controls. Status announcements are event-based, not per frame.
7. Geometry cached, one active RAF, no active animation loop at idle/cool, hidden/offscreen pause, full cleanup. No additional live model calls or transmission of private content. Measure frame cost on this Ubuntu PC; aim below 2 ms per frame and keep any filter optional on slow graphics. Do not claim a measured performance figure without profiling.
8. Build/typecheck plus focused reducer/adapter/component tests pass. Add a screenshot and a short recording of sequential cycle, high load and Stop-with-send. Installation and rollback are demonstrated locally without changing auth or channels.

## Research sources

Primary sources accessed September 27, 2026 UTC. Online docs are moving references; inspect the installed tag before implementation. Design parameters, normalized telemetry contract, animation rules and proposed file names above are original recommendations, not OpenClaw built-ins.

- **S1** Release: https://github.com/openclaw/openclaw/releases/tag/v2026.9.6
- **S2** UI architecture: https://docs.openclaw.ai/web/control-ui
- **S3** Queue/concurrency: https://docs.openclaw.ai/concepts/queue
- **S4** Streaming layers: https://docs.openclaw.ai/concepts/streaming
- **S5** Stop scope: https://docs.openclaw.ai/web/control-ui/chat ; pinned source https://github.com/openclaw/openclaw/blob/v2026.9.6/docs/web/control-ui/chat.md
- **S6** Usage timing/semantics: https://docs.openclaw.ai/reference/token-use
- **S7** Message hooks: https://docs.openclaw.ai/plugins/hooks/messages
- **S8** Diagnostic types: https://github.com/openclaw/openclaw/blob/v2026.9.6/src/infra/diagnostic-events.ts
- **S9** Gear kinematics reference: https://www.mathworks.com/help/sdl/ref/planetarygear.html
- **S10** UI build/custom root: https://docs.openclaw.ai/web/control-ui/development
- Runtime lifecycle reference: https://docs.openclaw.ai/concepts/agent-loop
- Pinned desktop shell: https://github.com/openclaw/openclaw/blob/v2026.9.6/ui/src/app/app-shell-view.ts
- Pinned event store: https://github.com/openclaw/openclaw/blob/v2026.9.6/ui/src/app/gateway-store.ts
- Pinned mobile topbar: https://github.com/openclaw/openclaw/blob/v2026.9.6/ui/src/components/app-topbar.ts

## Prompt to paste into Codex on the Ubuntu machine

> Implement the attached OpenClaw Gear Engine package in my existing OpenClaw Control UI's top-right activity box. Read CODEX-IMPLEMENTATION.md fully and inspect the live installation/version and actual page before editing. Use the supplied 160 px transparent three-gear SVG prototype, ported to TypeScript/Lit. Preserve all eight independent activity combinations, truthful token observations, per-run Stop and ongoing delivery. Use the existing authenticated Gateway connection and add correlated metadata-only telemetry where necessary for authorized all-channel coverage. Verify exact versioned APIs; proposed activity event names in the handoff are not existing APIs. Do not use fake timers or token values in production. Keep the current installation, settings and channels intact; stage a reversible patch, run the acceptance tests, then install through the existing deployment method. Report what was actually integrated, remaining telemetry gaps, tests, build/version and rollback steps. Do not claim successful delivery or complete cancellation without its own evidence.
