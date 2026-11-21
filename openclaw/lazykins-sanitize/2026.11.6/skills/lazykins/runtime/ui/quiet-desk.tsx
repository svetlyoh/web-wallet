import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";
import { Icon } from "../components/solid/icon.tsx";
import { controlUiPublicAssetPath } from "../app/public-assets.ts";
import { LAZYKINS_VERSION, type DeskMode } from "./quiet-desk-preference.ts";

export function DeskModeSwitch(props: { mode: DeskMode; onChange(mode: DeskMode): void }) {
  return <Show when={props.mode !== "openclaw"}><button type="button" class="btn btn--sm lazykins-mode-switch"
    aria-label={props.mode === "command" ? "Exit Command Deck" : "Exit Quiet Desk"}
    onClick={() => props.onChange("openclaw")}>
    {new Text(props.mode === "command" ? "Exit Command Deck" : "Exit Quiet Desk")}
  </button></Show>;
}
export function DeskModeEntries(props: { mode: DeskMode; compact?: boolean; onChange?: (mode: DeskMode) => string | null }) {
  const [error, setError] = createSignal<string | null>(null);
  const [open, setOpen] = createSignal(true);
  return <div class={["lazykins-mode-entries", {"lazykins-mode-entries--compact": props.compact}]}>
    <button type="button" class="lazykins-apps-toggle" aria-label="Apps" aria-expanded={open() ? "true" : "false"} title="Apps" onClick={() => setOpen(value => !value)}><Icon name="layoutGrid" /><span>{new Text("Apps")}</span></button>
    <Show when={open()}><div class="lazykins-apps-list">
    <Show when={props.mode !== "quiet"}><button type="button" aria-label="Enter Quiet Desk" title="Enter Quiet Desk" disabled={!props.onChange}
      onClick={() => setError(props.onChange?.("quiet") ?? null)}><Icon name="moon" /><Show when={!props.compact}><span>{new Text("Quiet Desk")}</span></Show></button></Show>
    <Show when={props.mode !== "command"}><button type="button" aria-label="Enter Command Deck" title="Enter Command Deck" disabled={!props.onChange}
      onClick={() => setError(props.onChange?.("command") ?? null)}><Icon name="layoutGrid" /><Show when={!props.compact}><span>{new Text("Command Deck")}</span></Show></button></Show>
    </div></Show>
    <Show when={error()}><p class="lazykins-entry-error" role="alert">{error()}</p></Show>
  </div>;
}
export function DeskCompatibilityFailure(props: { version: string }) {
  return <main class="lazykins-compatibility" role="alert">
    <h1>Quiet Desk needs a matching OpenClaw build</h1>
    <p>{new Text(`Built for OpenClaw ${LAZYKINS_VERSION}; connected Gateway: ${props.version}.`)}</p>
    <p>{new Text("Run LazyKins check-update, or off to restore the original dashboard.")}</p>
  </main>;
}

// Public theme assets participate in OpenClaw's existing build-ID cache and
// offline inventory. Wait for this one local sheet before exposing work controls;
// a failed load is visible and never silently paints a broken interface.
export function DeskStyles(props: { resourceBasePath: string; mode: DeskMode; onFallback(): void; children: JSX.Element }) {
  const [ready, setReady] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  return <>
    <link rel="stylesheet" data-lazykins-styles="quiet-desk"
      href={controlUiPublicAssetPath("themes/lazykins-quiet-desk.css", props.resourceBasePath)}
      onLoad={() => setReady(true)} onError={() => setFailed(true)} />
    <Show when={!failed() || props.mode === "openclaw"} fallback={<main class="callout danger" role="alert">
      <h1>Quiet Desk styles could not load</h1>
      <p>Reload or open OpenClaw view. Host rollback: LazyKins off.</p>
      <button type="button" class="btn" onClick={() => props.onFallback()}>{new Text("Open OpenClaw view")}</button>
      <button type="button" class="btn" onClick={() => window.location.reload()}>Reload</button>
    </main>}>
      <Show when={ready() || (failed() && props.mode === "openclaw")} fallback={<p role="status">{new Text("Loading Quiet Desk appearance...")}</p>}>{props.children}</Show>
    </Show>
  </>;
}
