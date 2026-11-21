import { registerDeskNavigationAdapter } from "./desk-navigation-adapter.ts";
import { gatewayOriginScope } from "@openclaw/gateway-client/browser";
import { getSafeLocalStorage } from "../local-storage.ts";

export type DeskMode = "quiet" | "openclaw" | "command";
export type DeskNavigation = { sessionKey: string; lastActiveSessionKey: string; selectedAgentId?: string };
const modes = new Map<string, DeskMode>();
const navigation = new Map<string, DeskNavigation>();
const entered = new Set<string>();
export const initialDeskPath = typeof window === "undefined" ? "/" : window.location.pathname;
export const initialDeskAgentOverride = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("commandAgent");
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
  if (!storage) throw new Error("Browser storage is unavailable. Allow site storage to save this appearance choice.");
  const key = deskPreferenceKey(gatewayUrl, profileId);
  const previous=readDeskMode(gatewayUrl,profileId);
  storage.setItem(key, mode);
  if(mode === "command" && previous !== "command") entered.add(key);
  modes.set(key, mode);
}
export function readDeckNavigation(gatewayUrl: string, profileId: string | null | undefined): DeskNavigation | null {
  const key = deskPreferenceKey(gatewayUrl, profileId) + ":command-navigation";
  try {
    const value = JSON.parse(getSafeLocalStorage()?.getItem(key) ?? "null");
    if (value && typeof value.sessionKey === "string" && typeof value.lastActiveSessionKey === "string" &&
        (value.selectedAgentId === undefined || typeof value.selectedAgentId === "string")) return value;
  } catch { /* The current tab can retain its own selection if browser storage fails. */ }
  return navigation.get(key) ?? null;
}
export function deckAwareNavigation(gatewayUrl: string, profileId: string | null | undefined, ordinary: DeskNavigation): DeskNavigation {
  return readDeskMode(gatewayUrl, profileId) === "command" ? readDeckNavigation(gatewayUrl, profileId) ?? ordinary : ordinary;
}
export function persistDeskNavigation(gatewayUrl: string, profileId: string | null | undefined, next: DeskNavigation, ordinary: DeskNavigation): DeskNavigation {
  if (readDeskMode(gatewayUrl, profileId) !== "command") return next;
  const key = deskPreferenceKey(gatewayUrl, profileId) + ":command-navigation";
  navigation.set(key, next);
  try { getSafeLocalStorage()?.setItem(key, JSON.stringify(next)); } catch { /* Preserve the ordinary tuple even on quota failure. */ }
  return ordinary;
}

registerDeskNavigationAdapter(persistDeskNavigation);
