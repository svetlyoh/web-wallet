import type {Session} from './host.ts';

const record = (x: unknown): Record<string, unknown> | null =>
  typeof x === 'object' && x !== null && !Array.isArray(x) ? x as Record<string, unknown> : null;
const measured = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined;

/** Only presentation metadata is retained; no message bodies, tool data, or recipients. */
export class ActivityModel {
  rows: readonly Session[] = [];
  connected = false;
  ready = false;
  truncated = false;
  error = false;
  private pulses = new Map<string, {input: number; update: number}>();
  private sequences = new Map<string, number>();
  private approvals = new Map<string, Set<string>>();
  private normalize: (key: string) => string;
  constructor(normalize: (key: string) => string = (key) => key) { this.normalize = normalize; }

  clear() {
    this.rows = []; this.ready = false; this.error = false; this.truncated = false;
    this.pulses.clear(); this.sequences.clear(); this.approvals.clear();
  }
  snapshot(rows: readonly Session[], truncated = false) {
    this.rows = rows.slice(0, 200).map(row => ({
      key: this.normalize(row.key), agentId: row.agentId,
      label: row.label ?? row.displayName, hasActiveRun: row.hasActiveRun,
      status: row.status, inputTokens: measured(row.inputTokens), outputTokens: measured(row.outputTokens),
    }));
    const allowed = new Set(this.rows.map(row => this.identity(row.key, row.agentId)));
    for (const key of this.pulses.keys()) if (!allowed.has(key)) this.pulses.delete(key);
    for (const key of this.approvals.keys()) if (!allowed.has(key)) this.approvals.delete(key);
    for (const row of this.rows) if (row.hasActiveRun === false) this.approvals.delete(this.identity(row.key, row.agentId));
    for (const key of this.sequences.keys()) if (!allowed.has(key.split('\u0000')[0])) this.sequences.delete(key);
    this.ready = true; this.error = false; this.truncated = truncated || rows.length > 200;
  }
  identity(key: string, agent?: string) { return JSON.stringify([agent ?? '', this.normalize(key)]); }
  event(name: string, value: unknown, now: number) {
    if (!this.connected || !this.ready || this.error) return false;
    const event = record(value);
    if (!event || typeof event.sessionKey !== 'string') return false;
    const sessionKey = this.normalize(event.sessionKey);
    const candidates = this.rows.filter(row => row.key === sessionKey &&
      (typeof event.agentId !== 'string' || row.agentId === event.agentId));
    // Unscoped aliases must never attribute one agent's event to another.
    if (candidates.length !== 1) return false;
    const row = candidates[0];
    const id = this.identity(row.key, row.agentId);
    if (name === 'agent' && event.stream === 'execution') {
      const approval = record(record(event.data)?.approval);
      if (!approval || typeof approval.id !== 'string') return false;
      const pending = this.approvals.get(id) ?? new Set<string>();
      if (approval.state === 'pending') pending.add(approval.id);
      else if (approval.state === 'resolved') pending.delete(approval.id);
      else return false;
      if (pending.size > 64) { this.error = true; return true; }
      this.approvals.set(id, pending); return true;
    }
    const message = record(event.message);
    const input = name === 'session.message' && message?.role === 'user';
    const update = name === 'chat' && (event.state === 'delta' || event.state === 'final') &&
      ((typeof event.deltaText === 'string' && event.deltaText.length > 0) || message !== null);
    if (!input && !update) return false;
    // The SDK events carry sequence; missing sequencing means no decorative replay guess.
    const seq = input ? measured(record(message?.__openclaw)?.seq) ?? measured(event.messageSeq) : measured(event.seq);
    if (seq === undefined) return false;
    const stream = input ? 'message' : `chat:${typeof event.runId === 'string' ? event.runId : ''}`;
    const seqKey = `${id}\u0000${stream}`;
    if (seq <= (this.sequences.get(seqKey) ?? -1)) return false;
    if (!this.sequences.has(seqKey) && this.sequences.size >= 1024) {
      this.error = true; return true;
    }
    this.sequences.set(seqKey, seq);
    const pulse = this.pulses.get(id) ?? {input: 0, update: 0};
    // This is explicitly a recent receipt afterglow, never a live transport timer.
    if (input) pulse.input = now + 180;
    if (update) pulse.update = now + 180;
    this.pulses.set(id, pulse);
    return true;
  }
  view(now: number, selected?: {sessionKey: string; agentId?: string}) {
    const rows = selected ? this.rows.filter(row => row.key === this.normalize(selected.sessionKey) &&
      (!selected.agentId || row.agentId === selected.agentId)) : this.rows;
    const unknown = !this.connected || !this.ready || this.error ||
      rows.some(row => row.hasActiveRun === undefined) || (selected !== undefined && rows.length !== 1);
    let active = 0, queued = 0, failed = 0, waiting = 0, recentInput = false, recentUpdate = false;
    for (const row of rows) {
      const id = this.identity(row.key, row.agentId);
      const paused = (this.approvals.get(id)?.size ?? 0) > 0 && row.hasActiveRun === true;
      if (paused) waiting++;
      if (row.status === 'queued') queued++;
      else if (row.hasActiveRun === true && !paused) active++;
      if (row.status === 'failed' || row.status === 'timeout') failed++;
      const pulse = this.pulses.get(id);
      recentInput ||= !!pulse && pulse.input > now;
      recentUpdate ||= !!pulse && pulse.update > now;
    }
    const usable = this.connected && this.ready && !this.error;
    return {
      mask: usable ? (recentInput ? 4 : 0) | (active ? 2 : 0) | (recentUpdate ? 1 : 0) : 0,
      connected: this.connected, unknown, active, queued, failed, waiting,
      scopeLabel: selected ? 'This chat' : 'All visible work (up to 200 sessions)',
      rows: usable ? rows.map(row => ({key: row.key, label: row.label ?? row.key,
        status: (this.approvals.get(this.identity(row.key, row.agentId))?.size ?? 0) > 0 && row.hasActiveRun ? 'Approval wait' : row.status ?? 'Unknown',
        inputTokens: row.inputTokens, outputTokens: row.outputTokens})) : [],
      recentInput: usable && recentInput, recentUpdate: usable && recentUpdate,
      truncated: this.truncated,
    };
  }
}
