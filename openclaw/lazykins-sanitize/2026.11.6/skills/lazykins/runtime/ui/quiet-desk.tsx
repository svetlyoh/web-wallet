import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";
import { controlUiPublicAssetPath } from "../app/public-assets.ts";
import { LAZYKINS_VERSION, type DeskMode } from "./quiet-desk-preference.ts";

export function DeskModeSwitch(props: { mode: DeskMode; onChange(mode: DeskMode): void }) {
  return <button type="button" class="btn btn--sm lazykins-mode-switch"
    aria-label={props.mode === "quiet" ? "OpenClaw view" : "Quiet Desk view"}
    onClick={() => props.onChange(props.mode === "quiet" ? "openclaw" : "quiet")}>
    {new Text(props.mode === "quiet" ? "OpenClaw view" : "Quiet Desk view")}
  </button>;
}
export function DeskAppearance(props: { mode: DeskMode; error: string | null; onChange(mode: DeskMode): void }) {
  return <section class="lazykins-settings" aria-label="LazyKins appearance">
    <h2>{new Text("LazyKins \u00b7 Quiet Desk")}</h2>
    <p>{new Text("A comfortable place to think.")}</p>
    <label>{new Text("Interface ")}<select aria-label="Interface appearance" value={props.mode}
      onChange={(event) => props.onChange(event.currentTarget.value === "quiet" ? "quiet" : "openclaw")}>
      <option value="quiet">Quiet Desk</option><option value="openclaw">OpenClaw</option>
    </select></label>
    <p class="lazykins-note">{new Text("Saved for this browser and signed-in profile. Switching views keeps your conversation and draft open.")}</p>
    <Show when={props.error}><p role="alert">{props.error}</p></Show>
    <details><summary>{new Text("Reply style and personal themes")}</summary>
      <p>{new Text("Sanitize is managed independently for the selected agent workspace. Ask the agent to inspect or enable the sanitize skill for persistent English replies.")}</p>
      <p>{new Text("Personal themes remain available in the appearance controls below. The bundled Quiet Desk theme definition can also be imported through OpenClaw's theme catalog.")}</p>
    </details>
  </section>;
}
export function DeskCompatibilityFailure(props: { version: string }) {
  return <main class="lazykins-compatibility" role="alert">
    <h1>Quiet Desk needs a matching OpenClaw build</h1>
    <p>{new Text(`This interface was built for OpenClaw ${LAZYKINS_VERSION}. The connected Gateway reports ${props.version}.`)}</p>
    <p>{new Text("Run the LazyKins check-update control script. Use off to restore the host's original dashboard until a matching build is verified.")}</p>
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
      <p>Reload this page. If the problem persists, run the LazyKins off control script on the host to restore the original dashboard.</p>
      <button type="button" class="btn" onClick={() => props.onFallback()}>{new Text("Open OpenClaw view")}</button>
      <button type="button" class="btn" onClick={() => window.location.reload()}>Reload</button>
    </main>}>
      <Show when={ready() || (failed() && props.mode === "openclaw")} fallback={<p role="status">{new Text("Loading Quiet Desk appearance...")}</p>}>{props.children}</Show>
    </Show>
  </>;
}
