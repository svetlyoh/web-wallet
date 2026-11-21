import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import type { ApplicationContext } from "./src/app/context.ts";
import { CommandCrewOwner, parseCommandCrewCatalog } from "./src/lazykins/command-crew-owner.ts";

// Runs in the isolated pinned upstream ui/ directory. The mock transport
// exercises the production plain owner, never a second implementation.
const runtime=path.resolve(process.argv[2] ?? "../crew");
const catalog=parseCommandCrewCatalog(JSON.parse(await fs.readFile(path.join(runtime,"catalog.json"),"utf8")));
const originalFetch=globalThis.fetch;
const memory=new Map<string,string>();
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>memory.get(key) ?? null,setItem:(key:string,value:string)=>memory.set(key,value)}});
globalThis.fetch=async()=>new Response(JSON.stringify(catalog),{status:200,headers:{"Content-Type":"application/json"}});
type Row={id:string;name:string;identity?:{name:string}};
function fixture(rows:Row[], hashes:Record<string,Record<string,string>>={}, existingTargets:string[]=["existing-specialist"]) {
  const calls:Array<{method:string;params:Record<string,unknown>}>=[];
  const listeners=new Set<()=>void>();
  const roster={defaultId:"main",mainKey:"main",scope:"per-sender",agents:rows};
  const snapshot={phase:"connected",client:null as unknown,hello:{server:{version:"2026.11.6"},features:{methods:["agents.list","agents.files.get","config.get","config.patch"]},auth:{role:"operator",scopes:["operator.admin","operator.read"]}},selfUser:{id:"owner-a"}};
  let patchFailure=false;
  let changedDuringRefresh=false;
  let configHash="reviewed-config-revision";
  let inheritedTargets:string[]|null=null;
  const client={request:async(method:string,params:Record<string,unknown>)=>{
    calls.push({method,params});
    if(method==="agents.files.get") {
      const agentId=String(params.agentId);const name=String(params.name);
      return {agentId,workspace:`/workspaces/${agentId}`,file:{name,path:`/workspaces/${agentId}/${name}`,missing:false,hash:hashes[agentId]?.[name] ?? "0".repeat(64)}};
    }
    if(method==="config.get") return {valid:true,hash:configHash,sourceConfig:{agents:{...(inheritedTargets===null ? {} : {defaults:{subagents:{allowAgents:inheritedTargets}}}),entries:Object.fromEntries(rows.map(row=>[row.id,{name:row.name,subagents:inheritedTargets===null ? {allowAgents:[...existingTargets]} : {}}]))}}};
    if(method==="config.patch") {if(patchFailure || params.baseHash!==configHash)throw new Error("Config changed; review again.");return {ok:true};}
    throw new Error(`Unexpected Gateway method ${method}`);
  }};
  snapshot.client=client;
  const value={resourceBasePath:"",basePath:"",gateway:{snapshot,connection:{gatewayUrl:"ws://127.0.0.1:18789"},subscribe:(notify:()=>void)=>{listeners.add(notify);return()=>listeners.delete(notify);}},agents:{subscribe:()=>()=>{},state:{agentsList:roster,agentsError:null},ensureList:async()=>roster,refreshList:async()=>{if(changedDuringRefresh){snapshot.hello.auth.scopes=[];for(const notify of [...listeners])notify();}return roster;}}};
  // SAFETY: This production-owner proof supplies exactly the context fields it
  // reads. Unused application capabilities are intentionally absent.
  const context=value as unknown as ApplicationContext;
  return {owner:new CommandCrewOwner(context),calls,snapshot,context,roster,inheritTargets:(targets:string[])=>{inheritedTargets=targets;},setPatchFailure:()=>{patchFailure=true;},changeHash:()=>{configHash="concurrently-changed-revision";},revokeDuringRefresh:()=>{changedDuringRefresh=true;}};
}
const metadata=(id:string)=>catalog.agents.find(row=>row.id===id)!;
const coreRows=[{id:"main",name:"Main"},{id:"helm",name:"Helm"},{id:"jace",name:"Jace"},{id:"cruz",name:"Cruz"}];
const knownHashes=Object.fromEntries(catalog.agents.map(row=>[row.id,row.bootstrapHashes]));
const observations:string[]=[];
try {
  const missing=fixture([{id:"main",name:"Main"}]);await missing.owner.refresh();
  assert.equal(missing.owner.status("helm").state,"missing");
  assert.equal(missing.owner.verifiedAgentId("helm"),null);
  assert.equal(missing.calls.length,0);
  observations.push("Fresh discovery performs no install, config write, turn or delegation.");

  const ready=fixture(coreRows,knownHashes);await ready.owner.refresh();
  for(const id of ["helm","jace","cruz"] as const)assert.equal(ready.owner.verifiedAgentId(id),id);
  assert.equal(ready.calls.filter(call=>call.method==="agents.files.get").length,12);
  assert.equal(ready.calls.some(call=>call.method==="config.get" || call.method==="config.patch"),false);

  const renamed=fixture([{id:"main",name:"Main"},{id:"helm-v2",name:"Helm"},{id:"jace-v2",name:"Jace"}],{"helm-v2":metadata("helm").bootstrapHashes,"jace-v2":metadata("jace").bootstrapHashes});
  await renamed.owner.refresh();assert.equal(renamed.owner.verifiedAgentId("helm"),"helm-v2");assert.equal(renamed.owner.verifiedAgentId("jace"),"jace-v2");
  await renamed.owner.reviewDelegation(["jace"]);
  assert.deepEqual(renamed.owner.state.delegationReview?.targets,["jace-v2"]);
  await renamed.owner.approveDelegation();
  const renamedPatch=renamed.calls.find(call=>call.method==="config.patch");assert(renamedPatch);
  assert.deepEqual(JSON.parse(String(renamedPatch.params.raw)),{agents:{entries:{"helm-v2":{subagents:{allowAgents:["existing-specialist","jace-v2"]}}}}});
  observations.push("Renamed actual IDs require authored file hashes and flow into the reviewed permission patch.");

  const collision=fixture([...coreRows,{id:"helm-v2",name:"Helm"}],{...knownHashes,helm:{},"helm-v2":metadata("helm").bootstrapHashes});
  await collision.owner.refresh();assert.equal(collision.owner.status("helm").state,"review");assert.equal(collision.owner.verifiedAgentId("helm"),null);
  assert.equal(collision.calls.some(call=>call.method!=="agents.files.get"),false);
  const ambiguous=fixture([{id:"helm-one",name:"Helm"},{id:"helm-two",name:"Helm"}],{"helm-one":metadata("helm").bootstrapHashes,"helm-two":metadata("helm").bootstrapHashes});
  await ambiguous.owner.refresh();assert.equal(ambiguous.owner.status("helm").state,"review");assert.equal(ambiguous.owner.verifiedAgentId("helm"),null);
  observations.push("Occupied mismatched IDs and ambiguous authored candidates never auto-adopt, rename or overwrite agents.");

  await ready.owner.reviewDelegation();
  const proposal=ready.owner.state.delegationReview;assert(proposal);assert.deepEqual(proposal.targets,["jace","cruz"]);
  assert.equal(ready.calls.some(call=>call.method==="config.patch"),false);
  await ready.owner.approveDelegation();
  const patch=ready.calls.find(call=>call.method==="config.patch");assert(patch);
  assert.equal(patch.params.baseHash,"reviewed-config-revision");assert.equal(patch.params.response,"summary");
  assert.deepEqual(JSON.parse(String(patch.params.raw)),{agents:{entries:{helm:{subagents:{allowAgents:["existing-specialist","jace","cruz"]}}}}});
  assert.equal(ready.owner.state.delegationReview,null);assert.match(ready.owner.state.delegationMessage,/live delegation remains unverified/);
  observations.push("Only explicit approval writes a CAS-bound narrow Helm target union, preserving existing targets and making no default/channel/model writes.");

  const inherited=fixture(coreRows,knownHashes);inherited.inheritTargets(["inherited-specialist"]);
  await inherited.owner.refresh();await inherited.owner.reviewDelegation();
  assert.deepEqual(inherited.owner.state.delegationReview?.existingTargets,["inherited-specialist"]);
  await inherited.owner.approveDelegation();
  const inheritedPatch=inherited.calls.find(call=>call.method==="config.patch");assert(inheritedPatch);
  assert.deepEqual(JSON.parse(String(inheritedPatch.params.raw)),{agents:{entries:{helm:{subagents:{allowAgents:["inherited-specialist","jace","cruz"]}}}}});
  const inheritedWildcard=fixture(coreRows,knownHashes);inheritedWildcard.inheritTargets(["*"]);
  await inheritedWildcard.owner.refresh();await inheritedWildcard.owner.reviewDelegation();await inheritedWildcard.owner.approveDelegation();
  assert.equal(inheritedWildcard.owner.state.delegationReview,null);
  assert.match(inheritedWildcard.owner.state.delegationMessage,/already configured/);
  assert.equal(inheritedWildcard.calls.some(call=>call.method==="config.patch"),false);
  observations.push("Inherited default targets survive an explicit Helm target addition; an inherited wildcard is a no-op rather than silently narrowing existing policy.");

  const stale=fixture(coreRows,knownHashes);await stale.owner.refresh();await stale.owner.reviewDelegation();stale.changeHash();await stale.owner.approveDelegation();
  assert.equal(stale.calls.filter(call=>call.method==="config.patch").length,1);assert.match(stale.owner.state.delegationMessage,/Config changed/);assert.equal(stale.owner.state.delegationReview,null);
  const revoked=fixture(coreRows,knownHashes);await revoked.owner.refresh();await revoked.owner.reviewDelegation();revoked.revokeDuringRefresh();await revoked.owner.approveDelegation();
  assert.equal(revoked.calls.some(call=>call.method==="config.patch"),false);
  observations.push("Concurrent config changes reject without retries; authority loss during pre-dispatch reconciliation prevents the write.");
  console.log(JSON.stringify({passed:true,observations},null,2));
} finally {globalThis.fetch=originalFetch;}
