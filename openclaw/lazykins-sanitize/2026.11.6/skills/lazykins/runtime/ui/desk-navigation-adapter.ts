type Navigation = {sessionKey:string;lastActiveSessionKey:string;selectedAgentId?:string};
type Persist = (url:string,profile:string|null|undefined,next:Navigation,ordinary:Navigation|undefined)=>Navigation|undefined;
// Cold boot must retain the ordinary tuple before the optional mode owner loads.
type Read=(url:string,profile:string|null|undefined,ordinary:Navigation)=>Navigation;
export const deskNavigation:{write:Persist;read:Read}={read:(_url,_profile,ordinary)=>ordinary,write:(url,profile,next,ordinary)=>{
  try {return localStorage.getItem(`lazykins.quiet-desk.v1:${url}:${encodeURIComponent(profile || "unpaired")}`)==="command" ? ordinary : next;} catch {return next;}
}};
