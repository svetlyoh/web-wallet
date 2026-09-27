// OpenClaw gear concept. No network, credentials, timers or framework dependencies.
export const TEETH = Object.freeze({ input: 18, processing: 36, delivery: 72 });
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export function rpmForRate(rate, phase) {
  const ranges = { input: [6, 34], processing: [4, 24], delivery: [3, 16] };
  const [lo, hi] = ranges[phase];
  return lo + (hi - lo) * clamp(Math.log1p(Math.max(0, rate ?? 0)) / Math.log1p(160));
}
export function linkedSpeeds(sunRpm, carrierRpm = 0) {
  return { processing: sunRpm, input: carrierRpm - 2 * (sunRpm - carrierRpm),
    delivery: carrierRpm - .5 * (sunRpm - carrierRpm) };
}
// Sampled 20-degree involute flanks; straight root transitions, not machining fillets.
// Internal gear is an even-odd ring around an involute-shaped tooth-space contour.
export function gearContour(teeth, internal = false, module = 2) {
  const r = teeth * module / 2, rb = r * Math.cos(Math.PI / 9);
  const root = internal ? r - module : r - 1.25 * module;
  const tip = internal ? r + 1.25 * module : r + module;
  const inv = radius => { const a = Math.acos(clamp(rb / radius, -1, 1)); return Math.tan(a) - a; };
  const half = radius => Math.PI / (2 * teeth) + inv(r) - inv(Math.max(rb, radius));
  const points = [], add = (rad, angle) => points.push([rad * Math.cos(angle), rad * Math.sin(angle)]);
  for (let n = 0; n < teeth; n++) {
    const a = n * Math.PI * 2 / teeth, low = Math.max(root, rb);
    add(root, a - half(low));
    for (let j = 0; j <= 8; j++) { const v = low + (tip-low)*j/8; add(v, a-half(v)); }
    for (let j = 1; j <= 4; j++) add(tip, a-half(tip)+2*half(tip)*j/4);
    for (let j = 8; j >= 0; j--) { const v=low+(tip-low)*j/8; add(v,a+half(v)); }
    add(root, a+half(low));
    const next = (n+1)*Math.PI*2/teeth-half(low);
    for (let j=1;j<=3;j++) add(root,a+half(low)+(next-a-half(low))*j/3);
  }
  return 'M'+points.map(p=>p.map(v=>v.toFixed(3)).join(',')).join('L')+'Z';
}
export function ringPath() {
  return 'M84,0A84,84 0 1,0 -84,0A84,84 0 1,0 84,0Z'+gearContour(72,true);
}
export const SCENARIOS = [
  {id:'idle', name:'000 · Idle', mask:0, detail:'No active work. Residual glow cools away.'},
  {id:'input', name:'100 · Input only', mask:4, detail:'Receiving a prompt or attachment; no model run has started.'},
  {id:'processing', name:'010 · Processing only', mask:2, detail:'Model or tool work is active; no outbound message is in flight.'},
  {id:'delivery', name:'001 · Delivery only', mask:1, detail:'Generation ended; an outbound send is still in flight.'},
  {id:'input-processing', name:'110 · Input + processing', mask:6, detail:'New input arrives while a run continues or accepts steering.'},
  {id:'input-delivery', name:'101 · Input + delivery', mask:5, detail:'Receiving a new message while an earlier reply is being sent.'},
  {id:'processing-delivery', name:'011 · Processing + delivery', mask:3, detail:'Generating while a preview, reply block, or tool message is being sent.'},
  {id:'all', name:'111 · All three', mask:7, detail:'Concurrent intake, model work, and outbound delivery.'},
  {id:'heat', name:'High token load', mask:7, heat:1, detail:'Blue shifts to violet with sustained simulated token load.'},
  {id:'late-stop', name:'Stop · send already in flight', mask:3, stop:true, detail:'Stop this run: processing brakes after acknowledgment; sending continues.'},
  {id:'other', name:'Stop · another chat continues', mask:7, other:true, detail:'Stop this run: other work keeps processing and delivery active.'},
  {id:'approval', name:'Waiting for approval', mask:0, wait:true, detail:'Processing is parked with an amber pause marker; approval is pending.'},
  {id:'retry', name:'Delivery retry backoff', mask:0, retry:true, detail:'A queued retry waits; the delivery gear is parked, not falsely sending.'},
  {id:'error', name:'Delivery failed', mask:0, error:true, detail:'Delivery failed. Red is a fault indicator, not token heat.'},
  {id:'offline', name:'Connection lost', mask:0, offline:true, detail:'Activity unknown. Freeze and reconcile on reconnect; do not claim idle.'},
  {id:'mechanical', name:'Linked gear demonstration', mask:7, linked:true, detail:'Carrier locked: 36-tooth sun +14 rpm; planet −28 rpm; ring −7 rpm.'}
];

// Proposed normalized telemetry reducer, NOT an existing OpenClaw wire API.
// Events are already authenticated and scoped by the production adapter.
export function createActivityStore() {
  const operations = new Map(), revisions = new Map();
  let epoch = '', connected = false;
  return {
    snapshot(s) { epoch=s.epoch; connected=true; operations.clear(); revisions.clear();
      for (const op of s.operations) { operations.set(op.id,{...op}); revisions.set(op.id,op.revision); } },
    disconnect() { connected=false; },
    apply(e) {
      if (!connected || e.epoch!==epoch || e.revision <= (revisions.get(e.id) ?? -1)) return false;
      revisions.set(e.id,e.revision); // retain terminal tombstones until next authoritative snapshot
      if (e.terminal) operations.delete(e.id); else operations.set(e.id,{...e});
      return true;
    },
    view() {
      const ops=[...operations.values()], active=ops.filter(x=>x.state==='active'||x.state==='stopping');
      return { connected, unknown:!connected, operations:ops,
        mask:connected ? active.reduce((m,x)=>m | ({input:4,processing:2,delivery:1}[x.phase]??0),0) : 0,
        counts:Object.fromEntries(['input','processing','delivery'].map(p=>[p,active.filter(x=>x.phase===p).length])) };
    }
  };
}
