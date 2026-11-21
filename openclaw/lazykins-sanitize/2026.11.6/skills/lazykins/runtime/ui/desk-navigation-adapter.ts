import { gatewayOriginScope } from "@openclaw/gateway-client/browser";
import { getSafeLocalStorage } from "../local-storage.ts";
type Navigation = {sessionKey:string;lastActiveSessionKey:string;selectedAgentId?:string};
type Read = (url:string,profile:string|null|undefined,ordinary:Navigation)=>Navigation;
type Persist = (url:string,profile:string|null|undefined,next:Navigation,ordinary:Navigation)=>Navigation;
let adapter:{read:Read;persist:Persist}|undefined;
export function registerDeskNavigationAdapter(read:Read,persist:Persist):void { adapter={read,persist}; }
export function deckAwareNavigation(url:string,profile:string|null|undefined,ordinary:Navigation):Navigation {
  return adapter?.read(url,profile,ordinary) ?? ordinary;
}
export function persistDeskNavigation(url:string,profile:string|null|undefined,next:Navigation,ordinary:Navigation):Navigation {
  if(adapter) return adapter.persist(url,profile,next,ordinary);
  // Cold boot can resolve a deep link before the optional appearance module loads.
  // Never let that preliminary Command route overwrite the ordinary selection.
  try {if(getSafeLocalStorage()?.getItem(`lazykins.quiet-desk.v1:${gatewayOriginScope(url)}:${encodeURIComponent(profile || "unpaired")}`)==="command") return ordinary;} catch { /* Native browser storage remains best effort. */ }
  return next;
}
