import { gatewayOriginScope } from "@openclaw/gateway-client/browser";
import type { ApplicationContext } from "../app/context.ts";
import { getSafeLocalStorage } from "../local-storage.ts";

export const LAZYKINS_VERSION = "2026.11.6";
export const LAZYKINS_SHA = "06afb10d3272cc9deaf38ca6a3b7b839d5935638";
export type DeskMode = "quiet" | "openclaw";

// This browser-only presentation preference never writes Gateway/profile config.
// The existing origin normalizer removes credentials; authenticated profiles
// cannot inherit another participant's layout selection on this browser.
export function quietDeskStorageKey(context: ApplicationContext): string {
  return `lazykins.quiet-desk.v1:${gatewayOriginScope(context.gateway.connection.gatewayUrl)}:${encodeURIComponent(context.gateway.snapshot.selfUser?.id ?? "unpaired")}`;
}
export function readQuietDeskMode(context: ApplicationContext): DeskMode {
  try { return getSafeLocalStorage()?.getItem(quietDeskStorageKey(context)) === "openclaw" ? "openclaw" : "quiet"; }
  catch { return "quiet"; }
}
export function saveQuietDeskMode(context: ApplicationContext, mode: DeskMode): string | null {
  try {
    const storage = getSafeLocalStorage();
    if (!storage) return "Browser storage is unavailable. Allow site storage to save this appearance choice.";
    storage.setItem(quietDeskStorageKey(context), mode);
    return null;
  } catch { return "The appearance choice could not be saved. Allow site storage and try again."; }
}
export function isQuietDeskCompatible(version: string | undefined): boolean {
  return version === LAZYKINS_VERSION;
}
