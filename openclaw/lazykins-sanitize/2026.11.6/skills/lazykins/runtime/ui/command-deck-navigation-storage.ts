import { getSafeLocalStorage } from "../local-storage.ts";
import { registerDeskNavigationAdapter } from "./desk-navigation-adapter.ts";
import { deskPreferenceKey, readDeskMode, type DeskNavigation } from "./desk-session-preferences.ts";
const navigation = new Map<string, DeskNavigation>();
export function readDeckNavigation(gatewayUrl: string, profileId: string | null | undefined): DeskNavigation | null {
  const key = deskPreferenceKey(gatewayUrl, profileId) + ":command-navigation";
  try {
    const value = JSON.parse(getSafeLocalStorage()?.getItem(key) ?? "null");
    if (value && typeof value.sessionKey === "string" && typeof value.lastActiveSessionKey === "string" &&
        (value.selectedAgentId === undefined || typeof value.selectedAgentId === "string")) return value;
  } catch { /* The current tab can retain its own selection if browser storage fails. */ }
  return navigation.get(key) ?? null;
}
export function deckAwareNavigation(gatewayUrl: string, profileId: string | null | undefined, ordinary: DeskNavigation | undefined): DeskNavigation | undefined {
  return readDeskMode(gatewayUrl, profileId) === "command" ? readDeckNavigation(gatewayUrl, profileId) ?? ordinary : ordinary;
}
export function persistDeskNavigation(gatewayUrl: string, profileId: string | null | undefined, next: DeskNavigation, ordinary: DeskNavigation | undefined): DeskNavigation | undefined {
  if (readDeskMode(gatewayUrl, profileId) !== "command") return next;
  const key = deskPreferenceKey(gatewayUrl, profileId) + ":command-navigation";
  navigation.set(key, next);
  try { getSafeLocalStorage()?.setItem(key, JSON.stringify(next)); } catch { /* Preserve the ordinary tuple even on quota failure. */ }
  return ordinary;
}

registerDeskNavigationAdapter(persistDeskNavigation);
