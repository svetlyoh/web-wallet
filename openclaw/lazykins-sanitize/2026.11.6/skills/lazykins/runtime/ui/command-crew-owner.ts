import type { ApplicationContext } from "../app/context.ts";
import type { AgentsFilesGetResult, ConfigSnapshot } from "../api/types.ts";
import { normalizeBasePath } from "../app-route-paths.ts";
import { createChangeListeners } from "../../../src/shared/listeners.js";
import { canCallGatewayMethod } from "../lib/gateway-methods.ts";
import { getSafeLocalStorage } from "../local-storage.ts";
import { LAZYKINS_VERSION, quietDeskStorageKey } from "./quiet-desk-preference.ts";

export type CommandCrewId = "helm" | "jace" | "cruz";
export const COMMAND_CREW_IDS: readonly CommandCrewId[] = ["helm", "jace", "cruz"];
const BOOTSTRAP_FILES = ["AGENTS.md", "IDENTITY.md", "SOUL.md", "USER.md"] as const;
type BootstrapName = typeof BOOTSTRAP_FILES[number];
export type CommandCrewMetadata = {
  id: CommandCrewId; name: string; role: string; description: string;
  version: string; packageName: string; avatarPath: string; templatePath: string;
  sourceDirectory: string; templateSha256?: string; bootstrapHashes: Record<BootstrapName, string>; avatarSha256: string;
};
export type CommandCrewStatus = {
  state: "checking" | "missing" | "verified" | "review" | "blocked";
  message: string; actualAgentId?: string; avatarState?: "verified" | "unavailable" | "different";
};
export type CommandCrewDelegationReview = {helmId:string;targets:string[];existingTargets:string[];raw:string;baseHash:string;scope:string;client:NonNullable<ApplicationContext["gateway"]["snapshot"]["client"]>};
export type CommandCrewCatalog = { schemaVersion: 1; openclawVersion: string; agents: CommandCrewMetadata[] };
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): string { if (typeof value !== "string" || !value) throw new Error("Invalid bundled crew catalog."); return value; }
function hash(value: unknown): string { const result=text(value); if (!/^[a-f0-9]{64}$/.test(result)) throw new Error("Invalid bundled crew source hash."); return result; }
function asset(value: unknown): string {
  const result=text(value);
  if (!/^command-deck\/crew\/[A-Za-z0-9._/-]+$/.test(result) || result.split("/").some(part=>part === ".." || part === ".") || !/^[A-Za-z0-9_./-]+$/.test(result)) throw new Error("Invalid bundled crew asset path.");
  return result;
}
export function parseCommandCrewCatalog(value: unknown): CommandCrewCatalog {
  if (!record(value) || value.schemaVersion !== 1 || value.openclawVersion !== LAZYKINS_VERSION || !Array.isArray(value.agents) || value.agents.length !== 3) throw new Error("Bundled crew catalog does not match this OpenClaw build.");
  const rows=value.agents;
  const agents=COMMAND_CREW_IDS.map(id=>{
    const entry=rows.find((row: unknown)=>record(row) && row.id === id);
    if (!record(entry) || !record(entry.bootstrapHashes)) throw new Error("Bundled crew agent is missing.");
    return {id,name:text(entry.name),role:text(entry.role),description:text(entry.description),version:text(entry.version),packageName:text(entry.packageName),avatarPath:asset(entry.avatarPath),templatePath:asset(entry.templatePath),sourceDirectory:text(entry.sourceDirectory),avatarSha256:hash(entry.avatarSha256),...(entry.templateSha256 === undefined ? {} : {templateSha256:hash(entry.templateSha256)}),bootstrapHashes:{"AGENTS.md":hash(entry.bootstrapHashes["AGENTS.md"]),"IDENTITY.md":hash(entry.bootstrapHashes["IDENTITY.md"]),"SOUL.md":hash(entry.bootstrapHashes["SOUL.md"]),"USER.md":hash(entry.bootstrapHashes["USER.md"])}};
  });
  return {schemaVersion:1,openclawVersion:LAZYKINS_VERSION,agents};
}
function emptyStatuses(message="Checking the authenticated Gateway roster."): Record<CommandCrewId,CommandCrewStatus> {
  return {helm:{state:"checking",message},jace:{state:"checking",message},cruz:{state:"checking",message}};
}
export function commandCrewAssetPath(context: Pick<ApplicationContext,"resourceBasePath">, path: string): string {
  return `${normalizeBasePath(context.resourceBasePath)}/${asset(path)}`;
}

/** Read-only discovery owns crew admission. Bundled templates are never installed
 * through the catalog-only Gateway Add API or by guessing host filesystem paths. */
export class CommandCrewOwner {
  readonly state: {catalog:CommandCrewCatalog|null;statuses:Record<CommandCrewId,CommandCrewStatus>;busy:boolean;error:string;checkedAtMs:number|null;delegationBusy:boolean;delegationReview:CommandCrewDelegationReview|null;delegationMessage:string} = {catalog:null,statuses:emptyStatuses(),busy:false,error:"",checkedAtMs:null,delegationBusy:false,delegationReview:null,delegationMessage:"Delegation is not verified. Review Helm's target permissions separately."};
  private readonly changes=createChangeListeners({snapshot:true});
  readonly subscribe=this.changes.subscribe;
  private reading:Promise<void>|null=null;
  private generation=0;
  private references=0;
  private stopGateway:(()=>void)|undefined;
  private stopAgents:(()=>void)|undefined;
  private scope="";
  constructor(readonly context:ApplicationContext) {}
  status(id:CommandCrewId):CommandCrewStatus { return this.state.statuses[id]; }
  verifiedAgentId(id:CommandCrewId):string|null {
    return this.context.gateway.snapshot.phase === "connected" && this.context.gateway.snapshot.hello?.server?.version === LAZYKINS_VERSION && canCallGatewayMethod(this.context.gateway.snapshot,"agents.list","operator.read") && this.context.agents.state.agentsList?.agents.some(row=>row.id===this.status(id).actualAgentId) && this.scope === quietDeskStorageKey(this.context) && this.status(id).state === "verified" ? this.status(id).actualAgentId ?? null : null;
  }
  dismissed():boolean {
    try { return getSafeLocalStorage()?.getItem(quietDeskStorageKey(this.context)+":crew-intro-v1") === "dismissed"; } catch { return false; }
  }
  dismiss(value=true):void {
    try { getSafeLocalStorage()?.setItem(quietDeskStorageKey(this.context)+":crew-intro-v1",value ? "dismissed" : "show"); } catch { /* A blocked browser preference never changes Gateway state. */ }
    this.changes.publish();
  }
  bind():()=>void {
    this.references++;
    if (this.references === 1) {
      let client=this.context.gateway.snapshot.client;
      let phase=this.context.gateway.snapshot.phase;
      let scope=quietDeskStorageKey(this.context);
      this.stopGateway=this.context.gateway.subscribe(()=>{
        const snapshot=this.context.gateway.snapshot;
        const nextScope=quietDeskStorageKey(this.context);
        if (client===snapshot.client && phase===snapshot.phase && scope===nextScope) return;
        client=snapshot.client;phase=snapshot.phase;scope=nextScope;
        this.generation++;this.reading=null;this.state.checkedAtMs=null;this.state.error="";
        this.state.statuses=emptyStatuses("Reconnect, then retry crew discovery.");this.state.delegationReview=null;this.state.delegationMessage="Connection changed. Review delegation permissions again.";this.changes.publish();
        if (phase === "connected") void this.refresh();
      });
      this.stopAgents=this.context.agents.subscribe(()=>{
        const roster=this.context.agents.state.agentsList;
        if (roster) for (const id of COMMAND_CREW_IDS) {
          const actual=this.status(id).actualAgentId;
          if (actual && !roster.agents.some(row=>row.id===actual)) this.state.statuses[id]={state:"missing",message:"This agent is no longer in the current accessible roster. Verify the crew before reopening it."};
        }
        this.changes.publish();
      });
      void this.refresh();
    }
    return ()=>{
      this.references--;
      if (this.references===0) { this.generation++;this.reading=null;this.stopGateway?.();this.stopGateway=undefined;this.stopAgents?.();this.stopAgents=undefined; }
    };
  }
  canReviewDelegation():boolean {
    const snapshot=this.context.gateway.snapshot;
    return Boolean(this.verifiedAgentId("helm") && canCallGatewayMethod(snapshot,"config.get","operator.admin") && canCallGatewayMethod(snapshot,"config.patch","operator.admin"));
  }
  cancelDelegationReview():void { this.state.delegationReview=null;this.changes.publish(); }
  async reviewDelegation(targets:readonly CommandCrewId[]=["jace","cruz"]):Promise<void> {
    if (this.state.delegationBusy) return;
    this.state.delegationReview=null;this.state.delegationBusy=true;this.state.delegationMessage="Reading the existing Helm target policy...";this.changes.publish();
    const client=this.context.gateway.snapshot.client;
    const scope=quietDeskStorageKey(this.context);
    const current=()=>client===this.context.gateway.snapshot.client && scope===quietDeskStorageKey(this.context) && this.canReviewDelegation();
    try {
      if (!client || !current()) throw new Error("An authorized Gateway owner must review delegation permissions. Direct crew chats do not require this grant.");
      const requested=targets.filter(id=>id!=="helm").map(id=>this.verifiedAgentId(id));
      if (!requested.length || requested.some(id=>!id)) throw new Error("Verify each selected crew agent before granting it as a Helm target.");
      const selected=requested.filter((id):id is string=>Boolean(id));
      const snapshot=await client.request<ConfigSnapshot>("config.get",{});
      if (!current()) throw new Error("Crew or authority changed during review. Retry after discovery completes.");
      const config=snapshot.sourceConfig ?? snapshot.config;
      if (!snapshot.hash || snapshot.valid !== true || !record(config) || !record(config.agents) || !record(config.agents.entries)) throw new Error("The current config cannot be safely reviewed. Open native agent settings and retry.");
      const helmId=this.verifiedAgentId("helm");
      if (!helmId) throw new Error("Helm is no longer verified.");
      const entry=config.agents.entries[helmId];
      if (!record(entry)) throw new Error("Helm's existing agent configuration could not be located. No entry will be created implicitly.");
      if (entry.subagents !== undefined && !record(entry.subagents)) throw new Error("Helm's subagent policy needs review in native settings.");
      // Match native resolveSubagentSpawnTargetConfig: an agent override wins,
      // including [], otherwise retain its effective inherited default targets.
      const defaults=record(config.agents.defaults) ? config.agents.defaults.subagents : undefined;
      if (defaults !== undefined && !record(defaults)) throw new Error("Inherited subagent policy needs review in native settings.");
      const existing=(record(entry.subagents) ? entry.subagents.allowAgents : undefined) ?? (record(defaults) ? defaults.allowAgents : undefined);
      if (existing !== undefined && (!Array.isArray(existing) || existing.some(id=>typeof id!=="string"))) throw new Error("Helm's existing target allowlist cannot be safely merged.");
      const existingTargets=Array.isArray(existing) ? existing.filter((id):id is string=>typeof id === "string") : [];
      if (existingTargets.includes("*") || selected.every(id=>existingTargets.includes(id))) {
        this.state.delegationMessage="The selected targets are already configured. Effective tools, model, sandbox and operator policy still apply; no runtime delegation has been verified.";
        return;
      }
      const allowAgents=[...new Set([...existingTargets,...selected])];
      const raw=JSON.stringify({agents:{entries:{[helmId]:{subagents:{allowAgents}}}}},null,2);
      this.state.delegationReview={helmId,targets:selected,existingTargets,raw,baseHash:snapshot.hash,scope,client};
      this.state.delegationMessage="Review this exact addition. Existing targets are retained; no model, channel or global default is changed.";
    } catch(error) {
      if (client===this.context.gateway.snapshot.client && scope===quietDeskStorageKey(this.context)) this.state.delegationMessage=error instanceof Error ? error.message : "Delegation review failed.";
    } finally {this.state.delegationBusy=false;this.changes.publish();}
  }
  async approveDelegation():Promise<void> {
    const review=this.state.delegationReview;
    if (!review || this.state.delegationBusy) return;
    this.state.delegationBusy=true;this.changes.publish();
    const current=()=>review.client===this.context.gateway.snapshot.client && review.scope===quietDeskStorageKey(this.context) && this.canReviewDelegation() && this.verifiedAgentId("helm")===review.helmId && review.targets.every(id=>COMMAND_CREW_IDS.some(logical=>logical!=="helm" && this.verifiedAgentId(logical)===id));
    try {
      // Reconcile externally edited files/roster before the final current-authority
      // check. Gateway CAS rejects policy changes made after the reviewed hash.
      await this.refresh(true);
      if (!current() || this.state.delegationReview!==review) throw new Error("Crew or authority changed. Review delegation permissions again before applying.");
      const result=await review.client.request<{ok:boolean}>("config.patch",{raw:review.raw,baseHash:review.baseHash,response:"summary"});
      if (!current()) throw new Error("Connection or authority changed after submission. Reconcile native settings before any retry; the write outcome is not verified here.");
      if (result.ok!==true) throw new Error("Gateway did not acknowledge the permission change. Reconcile native settings before retrying.");
      this.state.delegationReview=null;
      this.state.delegationMessage="Targets configured. Effective tool/model policy still applies. No task was spawned and live delegation remains unverified.";
    } catch(error) {
      if (review.scope===quietDeskStorageKey(this.context)) this.state.delegationMessage=error instanceof Error ? error.message : "Permission change was not confirmed. Reconcile before retrying.";
      this.state.delegationReview=null;
    } finally {this.state.delegationBusy=false;this.changes.publish();}
  }
  refresh(force=false):Promise<void> {
    if (this.reading) return this.reading;
    const snapshot=this.context.gateway.snapshot;
    const client=snapshot.client;
    const scope=quietDeskStorageKey(this.context);
    const generation=++this.generation;
    this.scope=scope;
    this.state.busy=true;this.state.error="";this.state.checkedAtMs=null;this.state.statuses=emptyStatuses();this.changes.publish();
    const current=()=>generation===this.generation && client===this.context.gateway.snapshot.client && scope===quietDeskStorageKey(this.context) && this.context.gateway.snapshot.phase === "connected";
    this.reading=Promise.resolve().then(async()=>{
      try {
        if (!this.state.catalog) {
          const response=await fetch(commandCrewAssetPath(this.context,"command-deck/crew/catalog.json"),{cache:"no-store",signal:AbortSignal.timeout(15_000)});
          if (!response.ok) throw new Error("Bundled crew files could not load. Reinstall the complete Command Deck package and retry.");
          const catalog=parseCommandCrewCatalog(await response.json());
          if (generation!==this.generation || scope!==quietDeskStorageKey(this.context)) return;
          this.state.catalog=catalog;
        }
        if (!client || snapshot.phase !== "connected" || snapshot.hello?.server?.version !== LAZYKINS_VERSION) throw new Error("Connect to the matching OpenClaw Gateway to discover the crew.");
        if (!canCallGatewayMethod(this.context.gateway.snapshot,"agents.list","operator.read")) throw new Error("This operator cannot inspect the agent roster. Ask the Gateway owner to review crew setup.");
        const roster=await (force ? this.context.agents.refreshList() : this.context.agents.ensureList());
        if (!current()) return;
        if (!roster) throw new Error(this.context.agents.state.agentsError || "Gateway agent roster is unavailable.");
        const catalog=this.state.catalog;
        if (!catalog) throw new Error("Bundled crew catalog is unavailable.");
        for (const metadata of catalog.agents) {
          const canonical=roster.agents.find(candidate=>candidate.id === metadata.id);
          // Names only identify candidates; authored file hashes establish identity.
          // An occupied canonical ID is never silently mapped to another agent.
          const candidates=canonical ? [canonical] : roster.agents.filter(candidate=>candidate.name===metadata.name || candidate.identity?.name===metadata.name);
          if (!candidates.length) { this.state.statuses[metadata.id]={state:"missing",message:"Not installed. Review this proposed agent before adding it."};this.changes.publish();continue; }
          if (!canCallGatewayMethod(this.context.gateway.snapshot,"agents.files.get","operator.read")) {
            this.state.statuses[metadata.id]={state:"review",actualAgentId:canonical?.id,message:"Already present / needs review. This operator cannot verify its authored instruction files."};this.changes.publish();continue;
          }
          try {
            const verified=[];
            for (const row of candidates) {
              const files=await Promise.all(BOOTSTRAP_FILES.map(name=>client.request<AgentsFilesGetResult>("agents.files.get",{agentId:row.id,name})));
              if (!current()) return;
              const matches=files.every((result,index)=>result.agentId===row.id && !result.file.missing && result.file.name===BOOTSTRAP_FILES[index] && result.file.hash?.toLowerCase()===metadata.bootstrapHashes[BOOTSTRAP_FILES[index]]);
              if (matches) verified.push(row);
            }
            if (verified.length===1) {
              const row=verified[0];
              let avatarState:"verified"|"unavailable"|"different"="unavailable";
              const avatarUrl=row.identity?.avatarUrl;
              if (avatarUrl) {
                const url=new URL(avatarUrl,window.location.origin);
                if (url.origin===window.location.origin && url.pathname.includes("/avatar/") && !url.username && !url.password) {
                  try {
                    const response=await fetch(url,{cache:"no-store",credentials:"same-origin",redirect:"error",signal:AbortSignal.timeout(10_000)});
                    if (response.ok) {
                      const bytes=await response.arrayBuffer();
                      if (bytes.byteLength<=5*1024*1024) {
                        const digest=await crypto.subtle.digest("SHA-256",bytes);
                        const actual=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
                        avatarState=actual===metadata.avatarSha256 ? "verified" : "different";
                      }
                    }
                  } catch { /* Avatar availability is reported separately from instruction identity. */ }
                }
              }
              if (!current()) return;
              this.state.statuses[metadata.id]=avatarState==="different"
                ? {state:"review",actualAgentId:row.id,avatarState,message:"Authored files match, but the live avatar differs. Existing artwork is preserved; review this agent before adopting it as crew."}
                : {state:"verified",actualAgentId:row.id,avatarState,message:`Installed as ${row.id}. Authored bootstrap files verified. ${avatarState==="verified" ? "Live avatar verified." : "Bundled original avatar shown; live avatar verification is unavailable."} Delegation requires separate permission and runtime verification.`};
            } else this.state.statuses[metadata.id]={state:"review",actualAgentId:canonical?.id,message:verified.length>1 ? "Multiple agents match the authored files. Choose the intended actual ID in native settings; no automatic adoption is made." : "Already present / needs review. Its files differ from this crew release. Existing files and history are preserved; no replacement is attempted."};
          } catch {
            if (!current()) return;
            this.state.statuses[metadata.id]={state:"review",actualAgentId:canonical?.id,message:"Already present / needs review. Its authored files could not be verified under this operator's permissions."};
          }
          this.changes.publish();
        }
        if (current()) this.state.checkedAtMs=Date.now();
      } catch(error) {
        if (generation===this.generation && scope===quietDeskStorageKey(this.context)) {
          this.state.error=error instanceof Error ? error.message : "Crew discovery failed. Retry after reconnecting.";
          this.state.statuses=emptyStatuses(this.state.error);
          for (const id of COMMAND_CREW_IDS) this.state.statuses[id].state="blocked";
        }
      } finally {
        if (generation===this.generation) {this.state.busy=false;this.reading=null;this.changes.publish();}
      }
    });
    return this.reading;
  }
}
const owners=new WeakMap<ApplicationContext,CommandCrewOwner>();
export function getCommandCrewOwner(context:ApplicationContext):CommandCrewOwner {
  let owner=owners.get(context);
  if (!owner) {owner=new CommandCrewOwner(context);owners.set(context,owner);}
  return owner;
}
