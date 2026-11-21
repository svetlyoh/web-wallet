import type { ApplicationContext } from "../app/context.ts";
import { createChangeListeners } from "../../../src/shared/listeners.js";
import { canCallGatewayMethod } from "../lib/gateway-methods.ts";
import { LAZYKINS_VERSION, quietDeskStorageKey } from "./quiet-desk-preference.ts";
import { getSafeLocalStorage } from "../local-storage.ts";

export type CommandTask = {
  id:string; title:string; sessionKey:string; priority:1|2|3; version:number;
  status:"queued"|"scheduled"|"running"|"completed"|"failed"|"canceled"|"blocked";
  createdAtMs:number; scheduleAtMs:number|null; timezone:string; error?:string;
  capabilities:{priority:boolean;cancel:boolean;retry:boolean;pause:false;resume:false};
};
export type CommandQueueResult = {schemaVersion:1;revision:number;tasks:CommandTask[];capabilities:{concurrency:number;scope:string;priority:boolean;pause:boolean;stopRunning:boolean;schedulerEnabled:boolean|null}};
type Operation = "list"|"create"|"priority"|"cancel"|"retry";
function record(value:unknown):value is Record<string,unknown> {return Boolean(value && typeof value === "object" && !Array.isArray(value));}
function isResult(value: unknown): value is CommandQueueResult {
  if(!record(value) || value.schemaVersion !== 1 || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || !Array.isArray(value.tasks) || !record(value.capabilities)) return false;
  const caps=value.capabilities;
  if(typeof caps.concurrency !== "number" || !Number.isSafeInteger(caps.concurrency) || caps.concurrency < 1 || typeof caps.scope !== "string" || typeof caps.priority !== "boolean" || caps.pause !== false || caps.stopRunning !== false || (caps.schedulerEnabled !== null && typeof caps.schedulerEnabled !== "boolean")) return false;
  return value.tasks.every((task:unknown)=> record(task) && typeof task.id === "string" && typeof task.title === "string" && typeof task.sessionKey === "string" && (task.priority === 1 || task.priority === 2 || task.priority === 3) && typeof task.version === "number" && Number.isSafeInteger(task.version) && typeof task.status === "string" && ["queued","scheduled","running","completed","failed","canceled","blocked"].includes(task.status) && typeof task.createdAtMs === "number" && (task.scheduleAtMs === null || typeof task.scheduleAtMs === "number") && typeof task.timezone === "string" && (task.error === undefined || typeof task.error === "string") && record(task.capabilities) && typeof task.capabilities.cancel === "boolean" && typeof task.capabilities.priority === "boolean" && typeof task.capabilities.retry === "boolean" && task.capabilities.pause === false && task.capabilities.resume === false);
}

/** Queue admission and receipts remain synchronous plain TypeScript. The view
 * projects these facts; the optional server plugin alone owns durable jobs. */
export class CommandQueueOwner {
  result: CommandQueueResult|null = null;
  busy = false;
  preparing = false;
  stale = true;
  error = "";
  private generation = 0;
  private live = false;
  private reading: Promise<void>|null = null;
  private again = false;
  private readonly changes = createChangeListeners();
  readonly subscribe = this.changes.subscribe;
  private readonly scope: string;
  constructor(readonly context: ApplicationContext) { this.scope=quietDeskStorageKey(context); }
  can(operation:Operation):boolean {
    const snapshot=this.context.gateway.snapshot;
    return this.scope === quietDeskStorageKey(this.context) && snapshot.hello?.server?.version === LAZYKINS_VERSION && canCallGatewayMethod(snapshot,`commanddesk.tasks.${operation}`,"operator.admin");
  }
  bind():()=>void {
    this.live=true;
    let client=this.context.gateway.snapshot.client;
    let phase=this.context.gateway.snapshot.phase;
    let profile=quietDeskStorageKey(this.context);
    let hello=this.context.gateway.snapshot.hello;
    const stopGateway=this.context.gateway.subscribe(()=>{
      const snapshot=this.context.gateway.snapshot;
      const scope=quietDeskStorageKey(this.context);
      const changed=client!==snapshot.client || phase!==snapshot.phase || profile!==scope || hello!==snapshot.hello;
      if(changed){client=snapshot.client;phase=snapshot.phase;profile=scope;hello=snapshot.hello;this.generation++;this.reading=null;this.busy=false;this.stale=true;this.error="";this.result=null;}
      if(!this.can("list")){this.result=null;this.busy=false;this.stale=true;}
      this.changes.publish();
      if(changed && this.can("list")) void this.refresh();
    });
    const stopEvents=this.context.gateway.subscribeEvents(event=>{
      if(event.event === "plugin.lazykins-command-desk.changed" && this.can("list")) void this.refresh();
    });
    if(this.can("list")) void this.refresh();
    return ()=>{this.live=false;this.generation++;stopGateway();stopEvents();};
  }
  refresh():Promise<void> {
    if(!this.can("list") || !this.live) return Promise.resolve();
    if(this.reading){this.again=true;return this.reading;}
    const client=this.context.gateway.snapshot.client!;
    const generation=this.generation;
    const scope=quietDeskStorageKey(this.context);
    const current=()=>this.live && generation===this.generation && client===this.context.gateway.snapshot.client && scope===quietDeskStorageKey(this.context) && this.can("list");
    this.reading=(async()=>{
      try{
        const result=await client.request<unknown>("commanddesk.tasks.list",{});
        if(!current()) return;
        if(!isResult(result)) throw new Error("Unsupported queue response. Use a matching Command Deck backend.");
        if(result.revision >= (this.result?.revision ?? -1)){this.result=result;this.stale=false;this.error="";this.changes.publish();}
      }catch(error){if(current()){this.error=error instanceof Error ? error.message : "Queue read failed";this.stale=true;this.changes.publish();}}
      finally{if(current()){this.reading=null;if(this.again){this.again=false;void this.refresh();}}}
    })();
    return this.reading;
  }
  async mutate(operation:Exclude<Operation,"list">,params:Record<string,unknown>):Promise<boolean> {
    if(this.busy || !this.can(operation)) return false;
    if(operation !== "create" && !this.result?.tasks.some(task => task.id === params.id && task.version === params.expectedVersion)) {this.error="Queue changed. Reconcile before editing.";this.changes.publish();return false;}
    const client=this.context.gateway.snapshot.client!;
    const generation=this.generation;
    const scope=quietDeskStorageKey(this.context);
    const current=()=>this.live && generation===this.generation && client===this.context.gateway.snapshot.client && scope===quietDeskStorageKey(this.context) && this.can(operation);
    this.busy=true;this.error="";this.changes.publish();
    try{
      // No awaited preparation occurs between this current authority check and effect.
      if(!current()) return false;
      await client.request(`commanddesk.tasks.${operation}`,params);
      if(!current()) return false;
      await this.refresh();
      return current();
    }catch(error){if(current()){this.error=error instanceof Error ? error.message : "Queue acknowledgement is unknown. Reconcile before retrying.";this.stale=true;this.changes.publish();}return false;}
    finally{if(current()){this.busy=false;this.changes.publish();}}
  }
  async intent(input:unknown,scheduleAtMs:number|null = null):Promise<{id:string;fingerprint:string;scheduleAtMs:number|null}> {
    const generation=this.generation;
    const client=this.context.gateway.snapshot.client;
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(input)));
    const fingerprint=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
    if(!this.live || generation!==this.generation || client!==this.context.gateway.snapshot.client || this.scope!==quietDeskStorageKey(this.context)) throw new Error("Connection changed. Review the task before submitting.");
    const key=this.scope+":command-intents";
    const storage=getSafeLocalStorage();
    if(!storage) throw new Error("Allow browser storage before creating queued work.");
    const intents:Record<string,{id:string;scheduleAtMs:number|null}>=JSON.parse(storage.getItem(key) ?? "{}");
    if(intents[fingerprint] && typeof intents[fingerprint].id === "string") return {...intents[fingerprint],fingerprint};
    if(Object.keys(intents).length>=20) throw new Error("Reconcile pending requests before creating more jobs.");
    const id=crypto.randomUUID();intents[fingerprint]={id,scheduleAtMs};storage.setItem(key,JSON.stringify(intents));
    return {id,fingerprint,scheduleAtMs};
  }
  private async withIntent(input:Record<string,unknown>,operation:"create"|"retry",params:Record<string,unknown>):Promise<boolean> {
    if(this.busy || this.preparing || !this.can(operation)) return false;
    const generation=this.generation;
    this.preparing=true;this.changes.publish();
    try {
      const intent=await this.intent(input,typeof params.scheduleAtMs === "number" ? params.scheduleAtMs : null);
      if(!this.live || generation!==this.generation || !this.can(operation)) return false;
      const ok=await this.mutate(operation,{...params,...(operation === "create" ? {scheduleAtMs:intent.scheduleAtMs} : {}),idempotencyKey:intent.id});
      if(ok && generation===this.generation) this.acknowledge(intent.fingerprint);
      return ok;
    } finally {this.preparing=false;this.changes.publish();}
  }
  create(input:Record<string,unknown>,scheduleChoice:Record<string,unknown>):Promise<boolean> {return this.withIntent({...input,scheduleAtMs:undefined,...scheduleChoice},"create",input); }
  retry(task:CommandTask):Promise<boolean> {return this.withIntent({retry:task.id,version:task.version},"retry",{id:task.id,expectedVersion:task.version});}
  acknowledge(fingerprint:string):void {
    try{const storage=getSafeLocalStorage();const key=quietDeskStorageKey(this.context)+":command-intents";const intents:Record<string,{id:string;scheduleAtMs:number|null}>=JSON.parse(storage?.getItem(key) ?? "{}");delete intents[fingerprint];storage?.setItem(key,JSON.stringify(intents));}catch{/* Retained receipt keeps retries idempotent. */}
  }
}
