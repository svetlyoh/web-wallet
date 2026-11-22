import { gatewayOriginScope } from "@openclaw/gateway-client/browser";
import { createEffect, onSettled, Show } from "solid-js";
import { useApplication } from "../lib/reactive/context.ts";
import { projectOwner } from "../lib/reactive/projection.ts";
import { getCommandCrewOwner, COMMAND_CREW_IDS } from "./command-crew-owner.ts";
import { CommandCrewSetup } from "./command-crew-setup.tsx";
import { getCommandDeckNavigation } from "./command-deck-navigation.ts";
import { HelmDelegationBar } from "./command-deck-helm-delegation.tsx";
import { quietDeskStorageKey } from "./quiet-desk-preference.ts";

export function CommandDeckSurface(props:{sessionKey:string;onGuardChange?:(blocked:boolean)=>void}) {
  const context=useApplication();const gateway=projectOwner(context.gateway,owner=>owner.snapshot);
  const scope=()=>{gateway.revision();return quietDeskStorageKey(context);};
  return <Show when={scope()} keyed>{()=> <CommandDeckSurfaceBody sessionKey={props.sessionKey} onGuardChange={props.onGuardChange}/>}</Show>;
}
function CommandDeckSurfaceBody(props:{sessionKey:string;onGuardChange?:(blocked:boolean)=>void}) {
  const context=useApplication();const crew=getCommandCrewOwner(context);const navigation=getCommandDeckNavigation(context);
  const discovery=projectOwner(crew,owner=>owner.state);
  const selected=projectOwner(context.agentSelection,owner=>owner.state.selectedId);
  const agents=projectOwner(context.agents,owner=>owner.state.agentsList?.agents ?? []);
  const prefs=projectOwner(navigation,owner=>owner.state);
  onSettled(()=>{const stopCrew=crew.bind();const stopNavigation=navigation.start();return ()=>{stopNavigation();stopCrew();};});
  const guard=()=>{prefs.revision();discovery.revision();selected.revision();gateway.revision();return navigation.guardStatus();};
  const gateway=projectOwner(context.gateway,owner=>owner.snapshot);
  createEffect(()=>!guard().allowed,blocked=>{props.onGuardChange?.(blocked);});
  const setupOpen=()=>{discovery.revision();return !crew.dismissed();};
  const helm=()=>{discovery.revision();return crew.verifiedAgentId("helm");};
  const contact=()=>{
    const logical=COMMAND_CREW_IDS.find(id=>{discovery.revision();return crew.verifiedAgentId(id)===selected.read();});
    const metadata=logical ? discovery.read().catalog?.agents.find(agent=>agent.id===logical) : null;
    const actual=agents.read().find(agent=>agent.id===selected.read());
    if(!guard().allowed)return "Crew setup required";
    return metadata ? `${metadata.name} · ${metadata.role}` : actual?.name || actual?.identity?.name || selected.read() || "Select an available agent";
  };
  return <section class="command-deck-crew-surface" aria-label="Command Deck crew">
    <div class="command-deck-contact"><span>{guard().allowed ? `Chatting with ${contact()}` : "Crew setup required"}</span>
      <Show when={helm() && selected.read()!==helm()}><button type="button" onClick={()=>{const id=helm();if(id)navigation.openAgent(id);}}>{new Text("Back to Helm")}</button></Show>
      <button type="button" onClick={()=>crew.dismiss(!crew.dismissed())}>{new Text("Crew setup")}</button>
    </div>
    <Show when={!guard().allowed}><section class="command-deck-pending" role="status"><strong>{guard().message}</strong><p>{new Text("Chat is paused. No message will fall back to main.")}</p><button type="button" onClick={()=>crew.dismiss(false)}>{new Text("Set up crew")}</button><button type="button" disabled={discovery.read().busy} onClick={()=>void crew.refresh(true)}>{new Text("Verify")}</button><Show when={gateway.read().phase!=="connected"}><button type="button" onClick={()=>context.gateway.start()}>{new Text("Reconnect")}</button></Show></section></Show>
    <Show when={guard().allowed}><p class="command-deck-target">{new Text("Agent ID: ")}{guard().agentId}{new Text(" · Session: ")}{guard().sessionKey}{new Text(" · ")}{gateway.read().phase}{new Text(" · Gateway: ")}{gatewayOriginScope(context.gateway.connection.gatewayUrl)}</p></Show>
    <Show when={setupOpen()}><CommandCrewSetup onOpenAgent={id=>navigation.openAgent(id)} onClose={()=>crew.dismiss(true)}/></Show>
    <Show when={prefs.read().error}><p role="alert">{prefs.read().error}</p></Show>
    <Show when={helm() && selected.read()===helm()}><HelmDelegationBar sessionKey={props.sessionKey} agentId={helm()!}/></Show>
  </section>;
}
