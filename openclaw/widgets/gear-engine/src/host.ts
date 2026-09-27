// Structural subset of the public ControlUiHost v1 contract at OpenClaw 2026.9.6.
// Browser bundles deliberately have no dependency on OpenClaw implementation files.
export interface Session {
  key: string; agentId?: string; sessionId?: string; label?: string; displayName?: string;
  hasActiveRun?: boolean; status?: string; inputTokens?: number; outputTokens?: number;
}
export interface Roster {
  result: {sessions: readonly Session[]; hasMore?: boolean; totalCount?: number} | null;
  loading: boolean; error: string | null;
}
export interface ViewContext {
  host: Host; signal: AbortSignal; presented: boolean;
  props: {sessionKey: string; agentId?: string};
}
export interface Host {
  apiVersion: 1; signal: AbortSignal;
  connection: {connected: boolean; canRead: boolean};
  redact(text: string): string;
  subscribe(listener: () => void): () => void;
  onEvent(event: string, listener: (payload: unknown) => void): () => void;
  sessions: {
    normalizeKey(key: string): string;
    observe(query: {limit: number; includeGlobal: boolean; includeUnknown: boolean; includeDerivedTitles: boolean; includeLastMessage: boolean}, listener: (snapshot: Roster) => void): {refresh(): Promise<void>; dispose(): void};
  };
  ui: {registerAccessory(value: {
    id: string; placement: 'session-header';
    mount(container: HTMLElement, context: ViewContext): {
      update(context: ViewContext): void; dispose(): void;
    };
  }): () => void};
}
