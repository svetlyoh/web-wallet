import { getSafeLocalStorage } from "../local-storage.ts";
type Navigation = {sessionKey:string;lastActiveSessionKey:string;selectedAgentId?:string};
type Persist = (url:string,profile:string|null|undefined,next:Navigation,ordinary:Navigation)=>Navigation;
// Cold boot must retain the ordinary tuple before the optional mode owner loads.
export let persistDeskNavigation:Persist=(url,profile,next,ordinary)=>{
  try {return getSafeLocalStorage()?.getItem(`lazykins.quiet-desk.v1:${url}:${encodeURIComponent(profile || "unpaired")}`)==="command" ? ordinary : next;} catch {return next;}
};
export function registerDeskNavigationAdapter(persist:Persist):void {persistDeskNavigation=persist;}
