import { getSafeLocalStorage } from "../local-storage.ts";
import { deskPreferenceKey } from "./desk-session-preferences.ts";

export function readDeckChoice(gatewayUrl: string, profileId: string | null | undefined): string | null {
  try { return getSafeLocalStorage()?.getItem(deskPreferenceKey(gatewayUrl,profileId)+":command-selected-agent") || null; } catch { return null; }
}
export function rememberDeckChoice(gatewayUrl: string, profileId: string | null | undefined, agentId: string): void {
  const storage=getSafeLocalStorage(); if(!storage) throw new Error("Allow browser storage to remember the Command Deck agent.");
  storage.setItem(deskPreferenceKey(gatewayUrl,profileId)+":command-selected-agent",agentId);
}

export function readDeckDefault(gatewayUrl: string, profileId: string | null | undefined): string {
  try { return getSafeLocalStorage()?.getItem(deskPreferenceKey(gatewayUrl, profileId) + ":command-default-agent") || "helm"; }
  catch { return "helm"; }
}
export function writeDeckDefault(gatewayUrl: string, profileId: string | null | undefined, agentId: string): void {
  const storage = getSafeLocalStorage();
  if (!storage) throw new Error("Allow browser storage to save the Command Deck default.");
  storage.setItem(deskPreferenceKey(gatewayUrl, profileId) + ":command-default-agent", agentId);
}
