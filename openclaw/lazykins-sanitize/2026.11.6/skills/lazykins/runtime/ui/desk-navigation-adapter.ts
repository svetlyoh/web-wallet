type Navigation = {sessionKey:string;lastActiveSessionKey:string;selectedAgentId?:string};
type Persist = (url:string,profile:string|null|undefined,next:Navigation,ordinary:Navigation|undefined)=>Navigation|undefined;
// Cold boot must retain the ordinary tuple before the optional mode owner loads.
type Read=(url:string,profile:string|null|undefined,ordinary:Navigation)=>Navigation;
type RequestGuard=(url:string,profile:string|null|undefined,method:string,params?:unknown)=>void;
function savedCommand(url:string,profile:string|null|undefined):boolean {return localStorage.getItem(`lazykins.quiet-desk.v1:${url}:${encodeURIComponent(profile || "unpaired")}`)==="command";}
export const coldDeskRequest:RequestGuard=(url,profile,method,params)=>{
  const p=params as {sessionKey?:unknown;key?:unknown}|undefined;
  if(!(p?.sessionKey || p?.key || method==="sessions.create"))return;
  try {if(!savedCommand(url,profile))return;}catch{return;}
  throw new Error("Verify the Command Deck target first.");
};
export const deskNavigation:{write:Persist;read:Read;request:RequestGuard}={request:coldDeskRequest,read:(_url,_profile,ordinary)=>ordinary,write:(url,profile,next,ordinary)=>{
  try {return savedCommand(url,profile) ? ordinary : next;} catch {return next;}
}};
