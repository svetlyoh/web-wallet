import { Show } from "solid-js";
import type { DeskMode } from "./quiet-desk-preference.ts";

export function DeskAppearance(props: { mode: DeskMode; error: string | null; onChange(mode: DeskMode): void }) {
  return <section class="lazykins-settings" aria-label="LazyKins appearance">
    <h2>{new Text("LazyKins \u00b7 Quiet Desk")}</h2>
    <label>{new Text("Interface ")}<select aria-label="Interface appearance" value={props.mode}
      onChange={(event) => props.onChange(event.currentTarget.value === "command" ? "command" : event.currentTarget.value === "quiet" ? "quiet" : "openclaw")}>
      <option value="openclaw">OpenClaw</option><option value="quiet">Quiet Desk</option><option value="command">Command Deck</option>
    </select></label>
    <p class="lazykins-note">{new Text("Saved for this browser and profile.")}</p>
    <Show when={props.error}><p role="alert">{props.error}</p></Show>
      <p>{new Text("Ask the agent to enable Sanitize for this workspace. It also affects other channels.")}</p>
  </section>;
}
