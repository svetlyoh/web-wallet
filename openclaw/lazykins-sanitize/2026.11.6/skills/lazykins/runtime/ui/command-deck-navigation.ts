import { readDeckNavigation } from "./command-deck-navigation-storage.ts";
import { readDeckChoice, readDeckDefault, rememberDeckChoice, writeDeckDefault } from "./command-deck-preferences.ts";
import type { ApplicationContext } from "../app/context.ts";
import { selectApplicationSession } from "../app/agent-selection.ts";
import { loadGatewaySessionSelection, patchSettings } from "../app/settings.ts";
import { sessionRefFromPath } from "../app-session-route-paths.ts";
import { createChangeListeners } from "../../../src/shared/listeners.js";
import { sessionNavigationTarget } from "../lib/sessions/route-navigation.ts";
import { parseAgentSessionKey, resolveUiConversationIdentity } from "../lib/sessions/session-key.ts";
import { getCommandCrewOwner, COMMAND_CREW_IDS } from "./command-crew-owner.ts";
import { consumeDeckEntry, initialDeskPath, initialDeskAgentOverride,  type DeskNavigation } from "./desk-session-preferences.ts";
import { quietDeskStorageKey, readQuietDeskMode } from "./quiet-desk-preference.ts";

export class CommandDeckNavigation {
  readonly state={error:"",defaultAgentId:"helm"};
  private readonly changes=createChangeListeners({snapshot:true});
  readonly subscribe=this.changes.subscribe;
  private scope="";
  private applied=false;
  private desired="helm";
  private ordinary:DeskNavigation|null=null;
  private resume:DeskNavigation|null=null;
  private entryIntent=0;
  private stops:Array<()=>void>=[];
  constructor(readonly context:ApplicationContext) {}
  private known(id:string):boolean { return Boolean(this.context.agents.state.agentsList?.agents.some(agent=>agent.id===id)); }
  private admitted(id:string):boolean {
    const crew=COMMAND_CREW_IDS.find(candidate=>candidate===id);
    return crew ? getCommandCrewOwner(this.context).verifiedAgentId(crew) === id : this.known(id);
  }
  start():()=>void {
    this.scope=quietDeskStorageKey(this.context);
    this.ordinary=loadGatewaySessionSelection(this.context.gateway.connection.gatewayUrl);
    this.applied=false;this.state.error="";
    this.entryIntent=this.context.agentSelection.intentRevision;
    const url=this.context.gateway.connection.gatewayUrl;const profile=this.context.gateway.snapshot.selfUser?.id;
    this.state.defaultAgentId=readDeckDefault(url,profile);
    this.resume=readDeckNavigation(url,profile);
    const freshEntry=consumeDeckEntry(url,profile);
    const explicit=freshEntry ? null : sessionRefFromPath(initialDeskPath,this.context.basePath);
    const queryOverride=freshEntry ? null : initialDeskAgentOverride;
    const choice=readDeckChoice(url,profile);
    const ordinaryAgent=this.ordinary.selectedAgentId || parseAgentSessionKey(this.ordinary.sessionKey)?.agentId || this.context.gateway.snapshot.assistantAgentId;
    // An old ordinary chat URL on first upgrade is not a Command Deck choice.
    // A different agent deep link or explicit commandAgent override remains deliberate.
    const explicitAgent=queryOverride || (explicit && (choice || explicit.agentId!==ordinaryAgent) ? explicit.agentId : null);
    this.desired=explicitAgent || choice || this.state.defaultAgentId;
    if(explicitAgent && !queryOverride && this.known(explicitAgent)) this.applied=true;
    const crew=getCommandCrewOwner(this.context);
    this.stops=[crew.subscribe(()=>this.reconcile()),this.context.gateway.subscribe(()=>this.reconcile()),this.context.agents.subscribe(()=>this.reconcile()),this.context.agentSelection.subscribe(()=>{
      if(this.current() && (this.applied || this.context.agentSelection.intentRevision>this.entryIntent)) {
        this.applied=true;
        const id=this.context.agentSelection.state.selectedId;
        if(id && this.known(id)) {try {rememberDeckChoice(url,profile,id);}catch(error){this.state.error=String(error);this.changes.publish();}}
      }
    })];
    this.reconcile();
    return ()=>this.stop();
  }
  private current():boolean { return this.scope===quietDeskStorageKey(this.context) && readQuietDeskMode(this.context)==="command"; }
  private reconcile():void {
    if(!this.current() || this.context.gateway.snapshot.phase!=="connected" || this.applied) return;
    const logical=COMMAND_CREW_IDS.find(id=>id===this.desired);
    const target=logical ? getCommandCrewOwner(this.context).verifiedAgentId(logical) : this.desired;
    if(target && this.admitted(target)) this.openAgent(target,false,this.resume?.selectedAgentId===target ? this.resume.sessionKey : undefined);
  }
  openAgent(agentId:string, existingUserAgent=false, sessionKey?:string):void {
    if(!this.current() || this.context.gateway.snapshot.phase!=="connected" || !(existingUserAgent ? this.known(agentId) : this.admitted(agentId))) {
      this.state.error="This agent is not verified or available. Review crew setup or choose an available agent.";this.changes.publish();return;
    }
    this.applied=true;this.state.error="";
    const identity=resolveUiConversationIdentity({agentsList:this.context.agents.state.agentsList,hello:this.context.gateway.snapshot.hello},sessionKey || "main",agentId);
    try { rememberDeckChoice(this.context.gateway.connection.gatewayUrl,this.context.gateway.snapshot.selfUser?.id,agentId); }
    catch(error) {this.state.error=error instanceof Error ? error.message : "The selected agent could not be saved.";}
    selectApplicationSession({selection:this.context.agentSelection,gateway:this.context.gateway,sessionKey:identity.sessionKey,agentId});
    const target=sessionNavigationTarget({context:this.context,face:"chat",sessionKey:identity.sessionKey,agentId});
    this.context.navigate("chat",target.options);this.changes.publish();
  }
  makeDefault(agentId:string):void {
    if(!this.current() || !this.admitted(agentId)) return;
    try {writeDeckDefault(this.context.gateway.connection.gatewayUrl,this.context.gateway.snapshot.selfUser?.id,agentId);this.state.defaultAgentId=agentId;this.state.error="";}
    catch(error){this.state.error=error instanceof Error ? error.message : "Default could not be saved.";}
    this.changes.publish();
  }
  private stop():void {
    for(const stop of this.stops) stop();this.stops=[];
    const ordinary=this.ordinary;this.ordinary=null;
    if(!ordinary || this.scope!==quietDeskStorageKey(this.context) || readQuietDeskMode(this.context)==="command") return;
    this.context.agentSelection.set(ordinary.selectedAgentId ?? null);
    this.context.gateway.setSessionKey(ordinary.sessionKey);
    patchSettings({...ordinary,selectedAgentId:ordinary.selectedAgentId});
    const target=sessionNavigationTarget({context:this.context,face:"chat",sessionKey:ordinary.sessionKey,agentId:ordinary.selectedAgentId});
    this.context.navigate("chat",target.options);
  }
}
const navigators=new WeakMap<ApplicationContext,CommandDeckNavigation>();
export function getCommandDeckNavigation(context:ApplicationContext):CommandDeckNavigation {
  let owner=navigators.get(context);if(!owner){owner=new CommandDeckNavigation(context);navigators.set(context,owner);}return owner;
}
