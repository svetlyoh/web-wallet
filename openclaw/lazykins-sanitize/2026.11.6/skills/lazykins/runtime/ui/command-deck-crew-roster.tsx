import { For, onSettled, Show } from "solid-js";
import { useApplication } from "../lib/reactive/context.ts";
import { projectOwner } from "../lib/reactive/projection.ts";
import { getCommandCrewOwner, COMMAND_CREW_IDS, commandCrewAssetPath } from "./command-crew-owner.ts";
import { getCommandDeckNavigation } from "./command-deck-navigation.ts";

export function CommandDeckCrewRoster() {
  const context=useApplication();const crew=getCommandCrewOwner(context);const navigation=getCommandDeckNavigation(context);
  const discovery=projectOwner(crew,owner=>owner.state);
  const agents=projectOwner(context.agents,owner=>owner.state.agentsList?.agents ?? []);
  const selected=projectOwner(context.agentSelection,owner=>owner.state.selectedId);
  const prefs=projectOwner(navigation,owner=>owner.state);
  onSettled(()=>crew.bind());
  const verified=(id:typeof COMMAND_CREW_IDS[number])=>{discovery.revision();return crew.verifiedAgentId(id);};
  return <section class="command-crew-roster" aria-label="Command Deck agents">
    <h2>{new Text("Helm’s Crew")}</h2>
    <For each={COMMAND_CREW_IDS}>{id=>{
      const metadata=()=>discovery.read().catalog?.agents.find(agent=>agent.id===id);
      const status=()=>{discovery.revision();return crew.status(id);};
      return <button type="button" class={["command-crew-agent",{active:Boolean(verified(id) && selected.read()===verified(id))}]}
        aria-label={verified(id) ? `Chat with ${metadata()?.name ?? id}` : `Review ${metadata()?.name ?? id}`}
        onClick={()=>{const actual=verified(id);if(actual)navigation.openAgent(actual);else crew.dismiss(false);}}>
        <Show when={metadata()}>{entry=><img src={commandCrewAssetPath(context,entry().avatarPath)} alt="" width="36" height="36"/>}</Show>
        <span><strong>{metadata()?.name ?? id[0].toUpperCase()+id.slice(1)}</strong><small>{metadata()?.role ?? "Crew setup"}</small><small>{status().state === "verified" ? "Installed" : status().state === "missing" ? "Add agent" : status().state === "checking" ? "Checking…" : "Needs review"}</small></span>
      </button>;
    }}</For>
    <h2>{new Text("Other OpenClaw agents")}</h2>
    <For each={agents.read().filter(agent=>!COMMAND_CREW_IDS.some(id=>verified(id)===agent.id))} keyed={agent=>agent.id}>{agent=>
      <button type="button" class={["command-crew-other",{active:selected.read()===agent().id}]} onClick={()=>navigation.openAgent(agent().id,true)}>
        <span>{agent().name || agent().identity?.name || agent().id}</span>
      </button>
    }</For>
    <button type="button" class="command-crew-secondary" onClick={()=>crew.dismiss(false)}>{new Text("Crew setup & permissions")}</button>
    <Show when={verified("helm")}><button type="button" class="command-crew-secondary" onClick={()=>{const id=verified("helm");if(id)navigation.openAgent(id);}}>{new Text("Back to Helm")}</button></Show>
    <p class="command-deck-note">{new Text("Default: ")}{prefs.read().defaultAgentId}</p>
    <button type="button" class="command-crew-secondary" disabled={!selected.read()} onClick={()=>{const id=selected.read();if(id)navigation.makeDefault(id);}}>{new Text("Use selected agent as default")}</button>
    <Show when={prefs.read().error}><p role="alert">{prefs.read().error}</p></Show>
  </section>;
}
