export type CommandTarget={allowed:boolean;agentId:string|null;sessionKey:string|null};
const DISCOVERY=new Set(["chat.metadata","sessions.list","sessions.subscribe","sessions.unsubscribe","sessions.messages.subscribe"]);
export function assertCommandSessionTarget(target:CommandTarget,method:string,params?:unknown,childRead?:(key:string)=>boolean):void {
  const p=(params && typeof params==="object" ? params : {}) as Record<string,unknown>;
  if(DISCOVERY.has(method) || (!/^(chat\.|sessions\.|session\.|artifacts\.upload|commanddesk\.tasks\.create|commanddesk\.voice\.control)/.test(method) && p.sessionKey===undefined))return;
  const reference=p.reference && typeof p.reference==="object" ? (p.reference as {key?:unknown}).key : undefined;
  const keys=[p.sessionKey,p.key,p.parentSessionKey,p.targetSessionKey,reference,...(Array.isArray(p.keys) ? p.keys : [])].filter((key):key is string=>typeof key==="string");
  if(target.allowed && ["chat.history","sessions.describe"].includes(method) && keys.length===1 && childRead?.(keys[0]))return;
  const declared=p.agentId;
  const resolution=method==="sessions.resolve" && typeof p.shortId==="string" && declared===target.agentId;
  const creation=method==="sessions.create" && declared===target.agentId;
  const correctKeys=creation ? keys.every(key=>key.startsWith(`agent:${target.agentId}:`)) : keys.every(key=>key===target.sessionKey);
  if(!target.allowed || (declared!==undefined && declared!==target.agentId) || (!keys.length && !resolution && !creation) || !correctKeys){
    throw new Error("Command Deck blocked a stale or unverified session target. Select verified crew, or explicitly choose an agent under Show other OpenClaw agents.");
  }
}
