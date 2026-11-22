import { assertCommandSessionTarget } from "./command-session-policy.ts";
import { readDeckNavigation } from "./command-deck-navigation-storage.ts";
import { readDeckChoice, readDeckDefault, readDeckStartupOptIn, rememberDeckChoice, saveDeckStartup } from "./command-deck-preferences.ts";
import { coldDeskRequest, deskNavigation } from "./desk-navigation-adapter.ts";
import type { ApplicationContext } from "../app/context.ts";
import { loadGatewaySessionSelection, patchSettings } from "../app/settings.ts";
import { sessionRefFromPath } from "../app-session-route-paths.ts";
import { createChangeListeners } from "../../../src/shared/listeners.js";
import { openPreferredApplicationSession, sessionNavigationTarget } from "../lib/sessions/route-navigation.ts";
import { parseAgentSessionKey, resolveUiConversationIdentity } from "../lib/sessions/session-key.ts";
import { getCommandCrewOwner, COMMAND_CREW_IDS } from "./command-crew-owner.ts";
import { consumeDeckEntry, deskPreferenceKey, initialDeskLocation, type DeskNavigation } from "./desk-session-preferences.ts";
import { quietDeskStorageKey, readQuietDeskMode } from "./quiet-desk-preference.ts";

export class CommandDeckNavigation {
  readonly state={error:"",defaultAgentId:"helm",explicitOther:null as string|null,otherExpanded:false};
  private readonly changes=createChangeListeners({snapshot:true});
  readonly subscribe=this.changes.subscribe;
  private scope="";
  private applied=false;
  private opening=false;
  private desired="helm";
  private ordinary:DeskNavigation|null=null;
  private resume:DeskNavigation|null=null;
  private entryIntent=0;
  private stops:Array<()=>void>=[];
  private childRead:(key:string)=>boolean=()=>false;
  constructor(readonly context:ApplicationContext) {}
  private known(id:string):boolean {return Boolean(this.context.agents.state.agentsList?.agents.some(agent=>agent.id===id));}
  logical(id:string|null):typeof COMMAND_CREW_IDS[number]|undefined {
    if(!id)return undefined;
    return COMMAND_CREW_IDS.find(candidate=>getCommandCrewOwner(this.context).verifiedAgentId(candidate)===id);
  }
  start():()=>void {
    this.scope=quietDeskStorageKey(this.context);
    this.ordinary=loadGatewaySessionSelection(this.context.gateway.connection.gatewayUrl);
    this.applied=false;this.state.error="";this.state.explicitOther=null;this.state.otherExpanded=false;
    this.entryIntent=this.context.agentSelection.intentRevision;
    const url=this.context.gateway.connection.gatewayUrl;const profile=this.context.gateway.snapshot.selfUser?.id;
    const savedDefault=readDeckDefault(url,profile),optIn=readDeckStartupOptIn(url,profile);
    this.state.defaultAgentId=COMMAND_CREW_IDS.includes(savedDefault as typeof COMMAND_CREW_IDS[number]) || optIn===savedDefault ? savedDefault : "helm";
    this.resume=readDeckNavigation(url,profile);
    const fresh=consumeDeckEntry(url,profile);
    const route=fresh ? null : sessionRefFromPath(initialDeskLocation?.pathname || "/",this.context.basePath);
    const query=fresh ? null : new URLSearchParams(initialDeskLocation?.search).get("commandAgent");
    const explicit=query || route?.agentId;
    // Old main URLs/choices do not constitute a Command Deck startup opt-in.
    const choice=readDeckChoice(url,profile);
    const crewChoice=choice && choice!=="main" ? choice : null;
    const crewLink=explicit && (COMMAND_CREW_IDS.includes(explicit as typeof COMMAND_CREW_IDS[number]) || this.logical(explicit)) ? explicit : null;
    this.desired=optIn===this.state.defaultAgentId ? this.state.defaultAgentId : crewLink || crewChoice || this.state.defaultAgentId;
    if(optIn===this.desired)this.state.explicitOther=optIn;
    deskNavigation.request=(origin,user,method,params)=>{
      if(deskPreferenceKey(origin,user)!==this.scope || !this.current())return coldDeskRequest(origin,user,method,params);
      this.guardRequest(method,params);
    };
    const crew=getCommandCrewOwner(this.context);
    this.stops=[crew.subscribe(()=>this.reconcile()),this.context.gateway.subscribe(()=>this.reconcile()),this.context.agents.subscribe(()=>this.reconcile()),this.context.agentSelection.subscribe(()=>{
      if(this.current() && this.context.agentSelection.intentRevision>this.entryIntent){
        this.entryIntent=this.context.agentSelection.intentRevision;
        const id=this.context.agentSelection.state.selectedId,logical=this.logical(id);
        if(logical){this.state.explicitOther=null;this.applied=true;this.remember(logical);}
      }
      this.changes.publish();
    })];
    this.reconcile();return ()=>this.stop();
  }
  toggleOthers():void {this.state.otherExpanded=!this.state.otherExpanded;this.changes.publish();}
  private current():boolean {return this.scope===quietDeskStorageKey(this.context) && readQuietDeskMode(this.context)==="command";}
  private remember(id:string):void {
    try {rememberDeckChoice(this.context.gateway.connection.gatewayUrl,this.context.gateway.snapshot.selfUser?.id,id);}
    catch(error){this.state.error=String(error);}
  }
  guardStatus():{allowed:boolean;message:string;agentId:string|null;sessionKey:string|null} {
    const id=this.context.agentSelection.state.selectedId;
    const snapshot=this.context.gateway.snapshot;
    const key=readDeckNavigation(this.context.gateway.connection.gatewayUrl,snapshot.selfUser?.id)?.sessionKey || snapshot.sessionKey;
    const allowed=Boolean(this.current() && snapshot.phase==="connected" && id && (this.logical(id) || (this.state.explicitOther===id && this.known(id))) && parseAgentSessionKey(key)?.agentId===id);
    const helm=getCommandCrewOwner(this.context).status("helm");
    const message=allowed ? "" : snapshot.phase!=="connected" ? "Reconnect to verify the crew" : helm.state==="checking" ? "Verifying Helm" : getCommandCrewOwner(this.context).verifiedAgentId("helm") ? "Opening a verified crew chat" : helm.state==="missing" ? "Helm isn't installed yet" : "Helm needs verification";
    return {allowed,message,agentId:allowed ? id : null,sessionKey:allowed ? key : null};
  }
  private reconcile():void {
    if(!this.current())return;
    this.changes.publish();
    if(this.context.gateway.snapshot.phase!=="connected" || this.opening)return;
    const owner=getCommandCrewOwner(this.context);
    if(this.applied && !owner.state.busy && !this.guardStatus().allowed)this.applied=false;
    if(this.applied)return;
    const crew=owner,logical=COMMAND_CREW_IDS.find(id=>id===this.desired) || this.logical(this.desired);
    let target=this.state.explicitOther===this.desired && this.known(this.desired) ? this.desired : logical ? crew.verifiedAgentId(logical) : null;
    if(!target && (logical ? crew.status(logical).state!=="checking" : !crew.state.busy)){
      target=crew.verifiedAgentId("helm");
      if(target)this.state.error="The previous crew member is unavailable. Returned to verified Helm.";
    }
    if(target)this.openAgent(target,Boolean(this.state.explicitOther===target),this.resume?.selectedAgentId===target ? this.resume.sessionKey : undefined);
  }
  openAgent(id:string,other=false,sessionKey?:string):void {
    if(!this.current() || this.context.gateway.snapshot.phase!=="connected" || !(other ? this.known(id) : this.logical(id))){
      this.state.error="Verify this agent before opening its chat.";this.changes.publish();return;
    }
    const identity=resolveUiConversationIdentity({agentsList:this.context.agents.state.agentsList,hello:this.context.gateway.snapshot.hello},sessionKey || "main",id);
    if(parseAgentSessionKey(identity.sessionKey)?.agentId!==id){this.state.error="Command Deck requires an independently scoped agent session.";this.changes.publish();return;}
    this.applied=true;this.state.explicitOther=other ? id : null;
    const logical=this.logical(id);this.desired=logical || id;if(logical)this.remember(logical);
    const previous=this.context.router.getState();
    this.opening=true;
    try {openPreferredApplicationSession(this.context,identity.sessionKey,id);}finally{this.opening=false;}
    // A cold fail-closed read may have failed before crew verification completed.
    if(previous.matches.some(match=>match.status==="error"))void this.context.revalidate("chat").catch(error=>{this.state.error=String(error);this.changes.publish();});
    this.changes.publish();
  }
  makeDefault(id:string):void {
    if(!this.current() || !(this.logical(id) || (this.state.explicitOther===id && this.known(id))))return;
    this.saveStartup(this.logical(id) || id,!this.logical(id));
  }
  resetDefault():void {this.saveStartup("helm",false);}
  private saveStartup(id:string,other:boolean):void {
    try {saveDeckStartup(this.context.gateway.connection.gatewayUrl,this.context.gateway.snapshot.selfUser?.id,id,other);this.state.defaultAgentId=id;this.state.error="";}
    catch(error){this.state.error=String(error);}this.changes.publish();
  }
  bindChildReads(read:(key:string)=>boolean):()=>void {this.childRead=read;return ()=>{if(this.childRead===read)this.childRead=()=>false;};}
  guardRequest(method:string,params?:unknown):void {
    if(!this.current())return;
    const status=this.guardStatus();
    assertCommandSessionTarget(status,method,params,this.logical(status.agentId)==="helm" ? this.childRead : undefined);
  }
  private stop():void {
    for(const stop of this.stops)stop();this.stops=[];deskNavigation.request=coldDeskRequest;this.childRead=()=>false;
    const ordinary=this.ordinary;this.ordinary=null;this.state.explicitOther=null;
    if(!ordinary || this.scope!==quietDeskStorageKey(this.context) || readQuietDeskMode(this.context)==="command")return;
    this.context.agentSelection.set(ordinary.selectedAgentId ?? null);this.context.gateway.setSessionKey(ordinary.sessionKey);
    patchSettings({...ordinary,selectedAgentId:ordinary.selectedAgentId});
    this.context.navigate("chat",sessionNavigationTarget({context:this.context,face:"chat",sessionKey:ordinary.sessionKey,agentId:ordinary.selectedAgentId}).options);
  }
}
const navigators=new WeakMap<ApplicationContext,CommandDeckNavigation>();
export function getCommandDeckNavigation(context:ApplicationContext):CommandDeckNavigation {
  let owner=navigators.get(context);if(!owner){owner=new CommandDeckNavigation(context);navigators.set(context,owner);}return owner;
}
