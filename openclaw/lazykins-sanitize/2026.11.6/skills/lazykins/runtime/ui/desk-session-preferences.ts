import { gatewayOriginScope } from "@openclaw/gateway-client/browser";
import { getSafeLocalStorage } from "../local-storage.ts";

export type DeskMode = "quiet" | "openclaw" | "command";
export type DeskNavigation = { sessionKey: string; lastActiveSessionKey: string; selectedAgentId?: string };
const modes = new Map<string, DeskMode>();
const entered = new Set<string>();
export const initialDeskLocation = globalThis.location && {pathname:location.pathname,search:location.search};
export function consumeDeckEntry(gatewayUrl: string, profileId: string | null | undefined): boolean {
  const key=deskPreferenceKey(gatewayUrl,profileId); const value=entered.has(key); entered.delete(key); return value;
}
export function deskPreferenceKey(gatewayUrl: string, profileId: string | null | undefined): string {
  return `lazykins.quiet-desk.v1:${gatewayOriginScope(gatewayUrl)}:${encodeURIComponent(profileId || "unpaired")}`;
}
export function readDeskMode(gatewayUrl: string, profileId: string | null | undefined): DeskMode {
  const key = deskPreferenceKey(gatewayUrl, profileId);
  let mode = modes.get(key);
  if (!mode) {
    try { const saved = getSafeLocalStorage()?.getItem(key); mode = saved === "quiet" || saved === "command" ? saved : "openclaw"; }
    catch { mode = "openclaw"; }
    modes.set(key, mode);
  }
  return mode;
}
export function writeDeskMode(gatewayUrl: string, profileId: string | null | undefined, mode: DeskMode): void {
  const storage = getSafeLocalStorage();
  if (!storage) throw new Error("Allow browser storage to save this mode.");
  const key = deskPreferenceKey(gatewayUrl, profileId);
  const previous=readDeskMode(gatewayUrl,profileId);
  storage.setItem(key, mode);
  if(mode === "command" && previous !== "command") entered.add(key);
  modes.set(key, mode);
}
