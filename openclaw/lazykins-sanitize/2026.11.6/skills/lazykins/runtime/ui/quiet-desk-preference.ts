import type { ApplicationContext } from "../app/context.ts";
import { deskPreferenceKey, readDeskMode, writeDeskMode } from "./desk-session-preferences.ts";
export type { DeskMode } from "./desk-session-preferences.ts";
import type { DeskMode } from "./desk-session-preferences.ts";

export const LAZYKINS_VERSION = "2026.11.6";
export const LAZYKINS_SHA = "06afb10d3272cc9deaf38ca6a3b7b839d5935638";

// This browser-only presentation preference never writes Gateway/profile config.
// The existing origin normalizer removes credentials; authenticated profiles
// cannot inherit another participant's layout selection on this browser.
export function quietDeskStorageKey(context: ApplicationContext): string {
  return deskPreferenceKey(context.gateway.connection.gatewayUrl, context.gateway.snapshot.selfUser?.id);
}
export function readQuietDeskMode(context: ApplicationContext): DeskMode {
  return readDeskMode(context.gateway.connection.gatewayUrl, context.gateway.snapshot.selfUser?.id);
}
export function saveQuietDeskMode(context: ApplicationContext, mode: DeskMode): string | null {
  try { writeDeskMode(context.gateway.connection.gatewayUrl, context.gateway.snapshot.selfUser?.id, mode); return null; }
  catch(error) { return error instanceof Error ? error.message : "The appearance choice could not be saved."; }
}
export function isQuietDeskCompatible(version: string | undefined): boolean {
  return version === LAZYKINS_VERSION;
}
