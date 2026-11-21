import { gatewayOriginScope } from "@openclaw/gateway-client/browser";
import { getSafeLocalStorage } from "../local-storage.ts";
type Navigation = {sessionKey:string;lastActiveSessionKey:string;selectedAgentId?:string};
type Persist = (url:string,profile:string|null|undefined,next:Navigation,ordinary:Navigation)=>Navigation;
let adapter:Persist|undefined;
export function registerDeskNavigationAdapter(persist:Persist):void { adapter=persist; }
export function persistDeskNavigation(url:string,profile:string|null|undefined,next:Navigation,ordinary:Navigation):Navigation {
  if(adapter) return adapter(url,profile,next,ordinary);
  // Cold boot can resolve a deep link before the optional appearance module loads.
  // Never let that preliminary Command route overwrite the ordinary selection.
  try {if(getSafeLocalStorage()?.getItem(`lazykins.quiet-desk.v1:${gatewayOriginScope(url)}:${encodeURIComponent(profile || "unpaired")}`)==="command") return ordinary;} catch { /* Native browser storage remains best effort. */ }
  return next;
}
