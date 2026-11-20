import { Show } from "solid-js";
import { LAZYKINS_VERSION, type DeskMode } from "./quiet-desk-preference.ts";

export function DeskModeSwitch(props: { mode: DeskMode; onChange(mode: DeskMode): void }) {
  return <button type="button" class="btn btn--sm lazykins-mode-switch"
    aria-label={props.mode === "quiet" ? "OpenClaw view" : "Quiet Desk view"}
    onClick={() => props.onChange(props.mode === "quiet" ? "openclaw" : "quiet")}>
    {props.mode === "quiet" ? "OpenClaw view" : "Quiet Desk view"}
  </button>;
}
export function DeskAppearance(props: { mode: DeskMode; error: string | null; onChange(mode: DeskMode): void }) {
  return <section class="lazykins-settings" aria-label="LazyKins appearance">
    <h2>LazyKins Â· Quiet Desk</h2>
    <p>A comfortable place to think.</p>
    <label>Interface <select aria-label="Interface appearance" value={props.mode}
      onChange={(event) => props.onChange(event.currentTarget.value === "quiet" ? "quiet" : "openclaw")}>
      <option value="quiet">Quiet Desk</option><option value="openclaw">OpenClaw</option>
    </select></label>
    <p class="lazykins-note">Saved for this browser and signed-in profile. Switching views keeps your conversation and draft open.</p>
    <Show when={props.error}><p role="alert">{props.error}</p></Show>
    <details><summary>Reply style and personal themes</summary>
      <p>Sanitize is managed independently for the selected agent workspace. Ask the agent to inspect or enable the sanitize skill for persistent English replies.</p>
      <p>Personal themes remain available in the appearance controls below. The bundled Quiet Desk theme definition can also be imported through OpenClaw's theme catalog.</p>
    </details>
  </section>;
}
export function DeskCompatibilityFailure(props: { version: string }) {
  return <main class="lazykins-compatibility" role="alert">
    <h1>Quiet Desk needs a matching OpenClaw build</h1>
    <p>This interface was built for OpenClaw {LAZYKINS_VERSION}. The connected Gateway reports {props.version}.</p>
    <p>Run the LazyKins <code>check-update</code> control script. Use <code>off</code> to restore the host's original dashboard until a matching build is verified.</p>
  </main>;
}
