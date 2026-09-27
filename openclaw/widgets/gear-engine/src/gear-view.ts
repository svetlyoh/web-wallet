import { LitElement, css, html, svg, nothing, type PropertyValues } from 'lit';

export type GearRow = { key: string; label: string; status: string; inputTokens?: number; outputTokens?: number };
export type GearActivity = {
  mask: number; connected: boolean; unknown: boolean; active: number; queued: number; failed: number; waiting?: number;
  scopeLabel: string; rows: readonly GearRow[]; recentInput: boolean; recentUpdate: boolean; truncated: boolean;
};

const EMPTY: GearActivity = { mask: 0, connected: false, unknown: true, active: 0, queued: 0, failed: 0,
  scopeLabel: 'All visible work', rows: [], recentInput: false, recentUpdate: false, truncated: false };
// Generated once: sampled 20-degree involute flanks, with straight root transitions.
function contour(teeth: number, internal = false) {
  const radius = teeth, base = radius * Math.cos(Math.PI / 9);
  const root = internal ? radius - 2 : radius - 2.5, tip = internal ? radius + 2.5 : radius + 2;
  const involute = (r: number) => { const a = Math.acos(Math.min(1, base / r)); return Math.tan(a) - a; };
  const half = (r: number) => Math.PI / (2 * teeth) + involute(radius) - involute(Math.max(base, r));
  const points: string[] = [];
  const add = (r: number, a: number) => points.push(`${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`);
  for (let n = 0; n < teeth; n++) {
    const a = n * 2 * Math.PI / teeth, low = Math.max(root, base);
    add(root, a - half(low));
    for (let j = 0; j <= 8; j++) { const r = low + (tip - low) * j / 8; add(r, a - half(r)); }
    for (let j = 1; j <= 4; j++) add(tip, a - half(tip) + 2 * half(tip) * j / 4);
    for (let j = 8; j >= 0; j--) { const r = low + (tip - low) * j / 8; add(r, a + half(r)); }
    add(root, a + half(low));
    const next = (n + 1) * 2 * Math.PI / teeth - half(low);
    for (let j = 1; j <= 3; j++) add(root, a + half(low) + (next - a - half(low)) * j / 3);
  }
  return `M${points.join('L')}Z`;
}
const PATHS = [contour(18), contour(36), `M84,0A84,84 0 1,0 -84,0A84,84 0 1,0 84,0Z${contour(72, true)}`];
const CENTERS = [[182, 72], [120, 114], [112, 156]];
const BITS = [4, 2, 1];
const RPM = [-6, 4, -3]; // Activity-only speeds. These are never a token-rate estimate.
let sequence = 0;

export class GearView extends LitElement {
  static properties = { activity: { attribute: false }, presented: { type: Boolean },
    size: { state: true }, concealed: { state: true }, expanded: { state: true } };
  declare activity: GearActivity;
  declare presented: boolean;
  private declare size: number;
  private declare concealed: boolean;
  private declare expanded: boolean;
  private readonly uid = `svet-gears-${++sequence}`;
  private frame = 0;
  private last = 0;
  private angles = [10, 0, 2.5];
  private speeds = [0, 0, 0];
  private visible = true;
  private observer?: IntersectionObserver;
  private motion?: MediaQueryList;
  private faces: Element[] = [];
  private shadows: Element[] = [];

  constructor() {
    super(); this.activity = { ...EMPTY }; this.presented = true; this.size = 160;
    this.concealed = false; this.expanded = false;
    try {
      const saved = JSON.parse(localStorage.getItem('svet-gear-engine-v1') || '{}');
      if ([128, 160, 192].includes(saved.size)) this.size = saved.size;
      this.concealed = saved.hidden === true;
    } catch { /* Storage is optional, including in restricted browser contexts. */ }
  }

  connectedCallback() {
    super.connectedCallback();
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.motion.addEventListener('change', this.wake);
    document.addEventListener('visibilitychange', this.wake);
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(entries => { this.visible = entries[0]?.isIntersecting ?? false; this.wake(); });
      this.observer.observe(this);
    }
  }
  disconnectedCallback() {
    super.disconnectedCallback(); this.stop(); this.observer?.disconnect();
    this.motion?.removeEventListener('change', this.wake);
    document.removeEventListener('visibilitychange', this.wake);
    document.removeEventListener('keydown', this.escape);
  }
  protected updated(changed: PropertyValues) {
    this.faces = [...this.renderRoot.querySelectorAll('[data-face]')];
    this.shadows = [...this.renderRoot.querySelectorAll('[data-shadow]')];
    this.paintAngles();
    if (changed.has('presented') && !this.presented) this.close();
    this.wake();
  }
  private stop() { cancelAnimationFrame(this.frame); this.frame = 0; this.last = 0; }
  private canAnimate() {
    return this.isConnected && this.presented && !this.concealed && this.visible && !document.hidden &&
      !this.motion?.matches && this.activity.connected && !this.activity.unknown &&
      ((this.activity.mask & 7) !== 0 || this.speeds.some(speed => Math.abs(speed) > .02));
  }
  private wake = () => {
    if (!this.canAnimate()) { this.stop(); this.speeds = [0, 0, 0]; return; }
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  };
  private tick = (time: number) => {
    this.frame = 0;
    if (!this.canAnimate()) { this.last = 0; return; }
    const dt = this.last ? Math.min((time - this.last) / 1000, .05) : 0; this.last = time;
    BITS.forEach((bit, i) => {
      const active = Boolean(this.activity.mask & bit), target = active ? RPM[i] : 0;
      this.speeds[i] += (target - this.speeds[i]) * (1 - Math.exp(-dt / (active ? .1 : .035)));
      if (!active && Math.abs(this.speeds[i]) <= .02) this.speeds[i] = 0;
      this.angles[i] = (this.angles[i] + this.speeds[i] * 6 * dt) % 360;
    });
    this.paintAngles(); if (this.canAnimate()) this.frame = requestAnimationFrame(this.tick); else this.last = 0;
  };
  private paintAngles() {
    this.faces.forEach(el => el.setAttribute('transform', `rotate(${this.angles[Number(el.getAttribute('data-face'))]})`));
    this.shadows.forEach(el => el.setAttribute('transform', `translate(0 5) rotate(${this.angles[Number(el.getAttribute('data-shadow'))]})`));
  }
  private save() { try { localStorage.setItem('svet-gear-engine-v1', JSON.stringify({ size: this.size, hidden: this.concealed })); } catch { /* Optional. */ } }
  private escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && this.expanded) { event.stopPropagation(); this.close(); } };
  private close = () => {
    const panel = this.renderRoot.querySelector<HTMLElement>('.details');
    if (panel?.matches(':popover-open')) panel.hidePopover();
    this.expanded = false; document.removeEventListener('keydown', this.escape);
  };
  private toggle = async () => {
    if (this.expanded) { this.close(); return; }
    this.expanded = true; await this.updateComplete;
    const panel = this.renderRoot.querySelector<HTMLElement>('.details');
    if (!panel) return;
    if (typeof panel.showPopover === 'function') panel.showPopover();
    const bounds = this.getBoundingClientRect();
    panel.style.top = `${Math.max(8, Math.min(bounds.bottom, innerHeight - panel.offsetHeight - 8))}px`;
    panel.style.left = `${Math.max(8, Math.min(bounds.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 8))}px`;
    document.addEventListener('keydown', this.escape);
    panel.querySelector<HTMLButtonElement>('.close')?.focus();
  };
  private status() {
    const a = this.activity;
    if (!a.connected) return 'Disconnected · activity unknown';
    if (a.unknown) return 'Activity unknown';
    return `${a.active} active · ${a.queued} queued${a.waiting ? ` · ${a.waiting} approval wait` : ''}${a.failed ? ` · ${a.failed} failed` : ''}`;
  }
  private gear(i: number) {
    const a = this.activity, active = a.connected && !a.unknown && Boolean(a.mask & BITS[i]);
    const glow = active || (i === 0 && a.recentInput) || (i === 2 && a.recentUpdate);
    const [x, y] = CENTERS[i];
    return svg`<g transform="translate(${x} ${y}) scale(1 .74)" opacity=${!a.connected || a.unknown ? '.45' : active ? '1' : '.76'}>
      <g data-shadow=${i} class="shadow"><path d=${PATHS[i]} fill-rule="evenodd"/></g>
      <g data-face=${i}><path class="metal" d=${PATHS[i]} fill-rule="evenodd" fill=${`url(#${this.uid}-metal)`}/>
        ${glow ? svg`<path class="energy" d=${PATHS[i]} fill-rule="evenodd"/>` : nothing}
        ${i === 2 ? svg`<circle class="bearing" r="79"/><circle class="marker" cx="79" cy="0" r="3"/>` : svg`
          ${i === 1 ? Array.from({ length: 6 }, (_, n) => svg`<circle class="recess" cx=${24 * Math.cos(n * Math.PI / 3)} cy=${24 * Math.sin(n * Math.PI / 3)} r="4.1"/>`) : nothing}
          <circle class="hub" r=${i === 0 ? 10 : 12} fill=${`url(#${this.uid}-hub)`}/><circle class="recess" r="3.5"/>
          <circle class="marker" cx="0" cy=${i === 0 ? -14 : -30} r="2"/>`}
      </g></g>`;
  }
  render() {
    if (!this.presented) return nothing;
    const a = this.activity;
    return html`<div class="widget" style=${`--gear-size:${this.size}px`}>
      ${this.concealed ? html`<button class="reveal" @click=${() => { this.concealed = false; this.save(); }}>Show gears</button>` : html`
      <button class="instrument" aria-label=${`Activity gears. ${this.status()}. Open details`} aria-expanded=${this.expanded}
        aria-controls=${`${this.uid}-details`} @click=${this.toggle}>
        <svg viewBox="0 0 240 240" aria-hidden="true"><defs>
          <linearGradient id=${`${this.uid}-metal`} x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#e1e6ee"/><stop offset=".38" stop-color="#a6b3c7"/><stop offset=".62" stop-color="#526178"/><stop offset="1" stop-color="#a6b3c7"/></linearGradient>
          <radialGradient id=${`${this.uid}-hub`}><stop stop-color="#d4e0ee"/><stop offset=".7" stop-color="#53647e"/><stop offset="1" stop-color="#26364f"/></radialGradient>
        </defs><path class="rail" d="M112 156L120 115M166 156L182 67"/>
        ${this.gear(2)}${this.gear(1)}${this.gear(0)}
        <text class="badge" x="182" y="71">I</text><text class="badge" x="120" y="113">P</text><text class="badge" x="34" y="156">D</text>
        <text class="caption" x="120" y="232">${!a.connected || a.unknown ? 'UNKNOWN' : a.active ? `${a.active} ACTIVE` : a.waiting ? 'APPROVAL' : a.failed ? `${a.failed} FAILED` : a.queued ? `${a.queued} QUEUED` : 'IDLE'}</text></svg>
      </button>`}
      <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">${this.status()}</span>
      <section class="details" id=${`${this.uid}-details`} popover="auto" role="dialog" aria-label="Gear activity details"
        ?data-fallback-open=${this.expanded && typeof HTMLElement.prototype.showPopover !== 'function'}
        @toggle=${(event: Event) => { if ((event as Event & { newState?: string }).newState === 'closed') { this.expanded = false; document.removeEventListener('keydown', this.escape); } }}>
        <header><strong>Activity gears</strong><button class="close" aria-label="Close details" @click=${() => { this.close(); this.renderRoot.querySelector<HTMLButtonElement>('.instrument')?.focus(); }}>×</button></header>
        <p><strong>${a.scopeLabel}</strong><br>${this.status()}</p>
        <dl><dt>I · Input receipt</dt><dd>${a.recentInput ? 'Recent input receipt · 540 ms afterglow' : 'No recent receipt'}</dd>
          <dt>P · Reported session activity</dt><dd>${a.active} active; ${a.queued} queued. Active sessions can include provider waits.</dd>
          <dt>D · UI update receipt</dt><dd>${a.recentUpdate ? 'Recent UI update · 540 ms afterglow' : 'No recent UI update'}. This does not confirm external channel delivery.</dd>
          <dt>Token rates</dt><dd>Unavailable. Slow rotation indicates reported activity, not token throughput.</dd></dl>
        ${a.rows.length ? html`<ul>${a.rows.map(row => html`<li><strong>${row.label}</strong> — ${row.status}
          ${row.inputTokens !== undefined || row.outputTokens !== undefined ? html`<small>Last known tokens: input ${row.inputTokens ?? 'unavailable'} · output ${row.outputTokens ?? 'unavailable'}</small>` : nothing}</li>`)}</ul>` : nothing}
        <p class="note">Per-session token counts are last known usage, not additional billing. ${a.truncated ? 'The session list is truncated; counts cover the returned sessions only.' : ''}</p>
        <label>Gear size <select .value=${String(this.size)} @change=${(event: Event) => { this.size = Number((event.target as HTMLSelectElement).value); this.save(); }}><option value="128">Compact</option><option value="160">Standard</option><option value="192">Large</option></select></label>
        <button class="hide" @click=${() => { this.close(); this.concealed = true; this.save(); }}>Hide gears</button>
      </section></div>`;
  }
  static styles = css`
    :host{display:block;flex:none;color:inherit;contain:style;font:inherit}
    .widget{position:relative;display:flex;justify-content:flex-end}
    button,select{font:inherit;color:inherit}button{cursor:pointer}button:focus-visible,select:focus-visible{outline:2px solid currentColor;outline-offset:3px}
    .instrument{display:block;border:0;padding:0;background:transparent;width:var(--gear-size,160px);height:var(--gear-size,160px);color:inherit}
    svg{display:block;width:100%;height:100%;overflow:visible}.metal{stroke:#8293aa;stroke-width:.65;stroke-linejoin:round}.shadow{fill:#29384e;stroke:#526079;stroke-width:.65}
    .recess{fill:#33435a;stroke:#a8b6c9;stroke-width:.8}.energy{fill:#389bff;opacity:.2}.hub{stroke:#bac9db;stroke-width:1}
    .bearing{fill:none;stroke:#73849d;stroke-width:3}.rail{fill:none;stroke:#718399;stroke-width:2;opacity:.65}
    .badge{fill:currentColor;font:600 14px system-ui;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:var(--bg,#172131);stroke-width:2px}
    .marker{fill:#75c9ff;stroke:#29384e;stroke-width:1}.caption{font:600 10px system-ui;letter-spacing:.8px;fill:currentColor;text-anchor:middle}
    .details{display:none;position:fixed;inset:auto;margin:0;box-sizing:border-box;width:360px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;z-index:1000;padding:16px;border:1px solid var(--border,#718399);border-radius:12px;background:var(--bg,Canvas);color:var(--text,CanvasText);box-shadow:0 10px 32px #0004;font:13px/1.5 system-ui}
    .details:popover-open,.details[data-fallback-open]{display:block}.details header{display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:15px}.close{border:0;background:transparent;font-size:24px;line-height:1;padding:4px 8px}
    dt{font-weight:600;margin-top:10px}dd{margin:2px 0}ul{padding-left:18px;max-height:180px;overflow:auto}li{overflow-wrap:anywhere;margin:8px 0}small{display:block}.note{font-size:12px;opacity:.8}
    label{display:flex;align-items:center;justify-content:space-between;gap:16px}select,.hide,.reveal{border:1px solid var(--border,#718399);border-radius:6px;padding:6px 10px;background:var(--bg,Canvas);color:var(--text,CanvasText)}.hide{margin-top:12px}
    .sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    @media(max-width:400px){.instrument{width:128px;height:128px}}
    @media(forced-colors:active){.metal,.hub{fill:Canvas;stroke:CanvasText}.shadow{fill:Canvas;stroke:CanvasText}.recess,.marker{fill:Highlight;stroke:CanvasText}.badge,.caption{fill:CanvasText;stroke:none}.energy{fill:Highlight;opacity:.6}.bearing,.rail{stroke:CanvasText}}
  `;
}
if (!customElements.get('svet-gear-engine-v1')) customElements.define('svet-gear-engine-v1', GearView);
