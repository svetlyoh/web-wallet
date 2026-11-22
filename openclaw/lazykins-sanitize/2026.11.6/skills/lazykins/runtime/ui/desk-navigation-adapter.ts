type Navigation = {sessionKey:string;lastActiveSessionKey:string;selectedAgentId?:string};
type Persist = (url:string,profile:string|null|undefined,next:Navigation,ordinary:Navigation|undefined)=>Navigation|undefined;
// Cold boot must retain the ordinary tuple before the optional mode owner loads.
type Read=(url:string,profile:string|null|undefined,ordinary:Navigation)=>Navigation;
type RequestGuard=(url:string,profile:string|null|undefined,method:string,params?:unknown)=>void;
function savedCommand(url:string,profile:string|null|undefined):boolean {try{return localStorage.getItem(`lazykins.quiet-desk.v1:${url}:${encodeURIComponent(profile || "unpaired")}`)==="command";}catch{return false;}}
export const coldDeskRequest:RequestGuard=(url,profile,method,params)=>{
  const p=params as {sessionKey?:unknown;key?:unknown}|undefined;
  if(!(p?.sessionKey || p?.key || method==="sessions.create"))return;
  if(!savedCommand(url,profile))return;
  throw new Error("Verify crew first.");
};
export const deskNavigation:{write:Persist;read:Read;request:RequestGuard}={request:coldDeskRequest,read:(_url,_profile,ordinary)=>ordinary,write:(url,profile,next,ordinary)=>{
  return savedCommand(url,profile) ? ordinary : next;
}};
