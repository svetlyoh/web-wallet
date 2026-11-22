import assert from "node:assert/strict";
import { assertCommandSessionTarget } from "./src/lazykins/command-session-policy.ts";
import { GatewayBrowserClient } from "./src/api/gateway.ts";
const pending={allowed:false,agentId:null,sessionKey:null};
const helm={allowed:true,agentId:"helm",sessionKey:"agent:helm:main"};
const jace={allowed:true,agentId:"jace",sessionKey:"agent:jace:main"};
const methods=["chat.send","chat.edit","chat.retry","chat.history","chat.abort","chat.startup","sessions.describe","sessions.patch","sessions.create","artifacts.upload","commanddesk.tasks.create"];
for(const method of methods){
  assert.throws(()=>assertCommandSessionTarget(pending,method,{sessionKey:"agent:main:main",agentId:"main"}),/blocked/);
  assert.throws(()=>assertCommandSessionTarget(helm,method,{sessionKey:"agent:main:main",agentId:"main"}),/blocked/);
  assert.throws(()=>assertCommandSessionTarget(jace,method,{}),/blocked/);
  assert.doesNotThrow(()=>assertCommandSessionTarget(jace,method,{sessionKey:"agent:jace:main",agentId:"jace"}));
}
assert.throws(()=>assertCommandSessionTarget(jace,"chat.send",{sessionKey:"agent:jace:other"}),/blocked/);
assert.doesNotThrow(()=>assertCommandSessionTarget(jace,"sessions.create",{agentId:"jace"}));
assert.doesNotThrow(()=>assertCommandSessionTarget(jace,"sessions.create",{key:"agent:jace:new-proof"}));
assert.throws(()=>assertCommandSessionTarget(jace,"sessions.create",{sessionKey:"agent:jace:main"}),/blocked/);
assert.throws(()=>assertCommandSessionTarget(jace,"sessions.patchMany",{keys:["agent:jace:main","agent:main:main"]}),/blocked/);
assert.doesNotThrow(()=>assertCommandSessionTarget(pending,"agents.list",{}));
assert.doesNotThrow(()=>assertCommandSessionTarget(pending,"sessions.list",{agentId:"main"}));
const child="agent:jace:subagent:proof";
assert.doesNotThrow(()=>assertCommandSessionTarget(helm,"chat.history",{sessionKey:child},key=>key===child));
assert.throws(()=>assertCommandSessionTarget(helm,"chat.send",{sessionKey:child},()=>true),/blocked/);
assert.throws(()=>assertCommandSessionTarget(pending,"chat.history",{sessionKey:child},()=>true),/blocked/);
let sent=0;
const client=new GatewayBrowserClient({url:"ws://127.0.0.1:18789",beforeRequest:(method,params)=>assertCommandSessionTarget(pending,method,params)});
await assert.rejects(client.request("chat.send",{sessionKey:"agent:main:main"},{onSent:()=>sent++}),/blocked/);
assert.equal(sent,0);
console.log(JSON.stringify({commandSessionGuardPassed:true,checkedMethods:methods,blockedBeforeTransport:true}));
