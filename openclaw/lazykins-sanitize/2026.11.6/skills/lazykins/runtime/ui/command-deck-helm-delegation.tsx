import { getCommandDeckNavigation } from "./command-deck-navigation.ts";
import { createEffect, For, onSettled, Show } from "solid-js";
import { createChangeListeners } from "../../../src/shared/listeners.js";
import { useApplication } from "../lib/reactive/context.ts";
import { projectOwner } from "../lib/reactive/projection.ts";
import { SubagentsPanelData } from "../pages/chat/subagents-panel-data.ts";
import { isUnfinishedSubagent } from "../pages/chat/chat-spawned-subagent.ts";
import { parseAgentSessionKey } from "../lib/sessions/session-key.ts";
import { sessionNavigationTarget } from "../lib/sessions/route-navigation.ts";
import { selectApplicationSession } from "../app/agent-selection.ts";
import { getCommandCrewOwner, COMMAND_CREW_IDS, commandCrewAssetPath } from "./command-crew-owner.ts";

export function HelmDelegationBar(props:{sessionKey:string;agentId:string}) {
  const context=useApplication();const changed=createChangeListeners({snapshot:true});
  const data=new SubagentsPanelData(context,()=>changed.publish());
  const state=projectOwner({subscribe:changed.subscribe},()=>data);
  const gateway=projectOwner(context.gateway,owner=>owner.snapshot);
  const crew=getCommandCrewOwner(context);const discovery=projectOwner(crew,owner=>owner.state);
  createEffect(()=>({sessionKey:props.sessionKey,agentId:props.agentId}),input=>data.sync({...input,presented:true}));
  onSettled(()=>{const release=getCommandDeckNavigation(context).bindChildReads(key=>data.rows.some(row=>row.session.key===key && Boolean(COMMAND_CREW_IDS.find(id=>crew.verifiedAgentId(id)===parseAgentSessionKey(key)?.agentId))));return ()=>{release();data.dispose();};});
  const active=()=>state.read().rows.filter(row=>isUnfinishedSubagent(row.session)).length;
  const nativeActive=()=>state.read().nativeSnapshot?.children.filter(child=>child.status==="running").length ?? 0;
  const metadata=(key:string)=>{const id=parseAgentSessionKey(key)?.agentId;discovery.revision();const logical=COMMAND_CREW_IDS.find(candidate=>crew.verifiedAgentId(candidate)===id);return logical ? discovery.read().catalog?.agents.find(agent=>agent.id===logical) : undefined;};
  return <details class="command-helm-delegation">
    <summary>{new Text("Helm Delegation")}{new Text(" · ")}{gateway.read().phase!=="connected" ? "Unavailable" : state.read().hasResult ? `${active()} session jobs · ${state.read().nativeSnapshot ? `${nativeActive()} provider runs` : "provider coverage unavailable"}` : "Checking activity…"}</summary>
    <p class="command-deck-note">{new Text("Only confirmed child activity is shown. Configured targets do not prove permission to run a task.")}</p>
    <Show when={gateway.read().phase!=="connected" || state.read().readError}><p role="status">{new Text("Live delegation status unavailable. Reconnect or review permissions.")}</p></Show>
    <Show when={gateway.read().phase==="connected" && state.read().hasResult && !state.read().readError && !active() && !nativeActive()}><p>{new Text("No active OpenClaw child tasks")}</p></Show>
    <For each={state.read().rows} keyed={row=>row.session.key}>{row=><div class="command-helm-child">
      <Show when={metadata(row().session.key)}>{entry=><img src={commandCrewAssetPath(context,entry().avatarPath)} alt="" width="28" height="28"/>}</Show>
      <span><strong>{metadata(row().session.key)?.name ?? parseAgentSessionKey(row().session.key)?.agentId ?? "Agent"}</strong><small>{row().session.displayName || row().session.label || row().session.key}</small><small>{isUnfinishedSubagent(row().session) ? "In progress" : row().session.status ?? "Status unavailable"}</small></span>
      <button type="button" onClick={()=>{const key=row().session.key;const id=parseAgentSessionKey(key)?.agentId;selectApplicationSession({selection:context.agentSelection,gateway:context.gateway,sessionKey:key,agentId:id});context.navigate("chat",sessionNavigationTarget({context,face:"chat",sessionKey:key,agentId:id}).options);}}>{new Text("Open task")}</button>
    </div>}</For>
    <Show when={state.read().nativeSnapshot}><section aria-label="Provider-native delegation"><p class="command-deck-note">{new Text("Provider-native observations; these are not navigable OpenClaw session handles.")}</p><For each={state.read().nativeSnapshot?.children}>{child=><p>{child.label}{new Text(" · ")}{child.status}</p>}</For></section></Show>
    <Show when={state.read().nativeError}><p role="status">{new Text("Provider-native activity unavailable.")}</p></Show>
  </details>;
}
