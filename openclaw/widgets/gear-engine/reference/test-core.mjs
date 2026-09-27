import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityStore, linkedSpeeds, gearContour, SCENARIOS, rpmForRate } from './gear-core.mjs';
test('all eight independent combinations are represented',()=>assert.equal(new Set(SCENARIOS.map(s=>s.mask)).size,8));
test('linked velocities satisfy sun/planet and planetary constraints',()=>{
  for(const c of [-12,0,9])for(const s of [-20,0,14]){const v=linkedSpeeds(s,c);
    assert.ok(Math.abs(36*(v.processing-c)+72*(v.delivery-c))<1e-9);
    assert.ok(Math.abs(36*(v.processing-c)+18*(v.input-c))<1e-9);}
});
test('involute paths finite, closed, bounded',()=>{for(const n of [18,36,72]){const d=gearContour(n,n===72);assert.ok(!/NaN|Infinity/.test(d));assert.ok(d.endsWith('Z'));}});
test('stop terminal removes only targeted operation; delivery and other run survive',()=>{
  const s=createActivityStore();s.snapshot({epoch:'a',operations:[{id:'run1',revision:1,phase:'processing',state:'active'},{id:'run2',revision:1,phase:'processing',state:'active'},{id:'send1',revision:1,phase:'delivery',state:'active'}]});
  s.apply({epoch:'a',id:'run1',revision:2,terminal:true});assert.equal(s.view().mask,3);assert.equal(s.view().counts.processing,1);
  s.apply({epoch:'a',id:'run2',revision:2,terminal:true});assert.equal(s.view().mask,1);
});
test('duplicates, old generations and stale resurrection rejected',()=>{const s=createActivityStore();s.snapshot({epoch:'new',operations:[]});
  assert.equal(s.apply({epoch:'old',id:'x',revision:2,state:'active',phase:'input'}),false);
  s.apply({epoch:'new',id:'x',revision:4,terminal:true});assert.equal(s.apply({epoch:'new',id:'x',revision:3,state:'active',phase:'input'}),false);assert.equal(s.view().mask,0);
  s.disconnect();assert.equal(s.view().unknown,true);assert.equal(s.apply({epoch:'new',id:'z',revision:1}),false);
});
test('queued and waiting work do not masquerade as active rotation',()=>{const s=createActivityStore();s.snapshot({epoch:'a',operations:[{id:'q',revision:1,phase:'delivery',state:'queued'},{id:'w',revision:1,phase:'processing',state:'waiting'}]});assert.equal(s.view().mask,0);});
test('speed is bounded and monotonic',()=>{for(const p of ['input','processing','delivery'])assert.ok(rpmForRate(10,p)<rpmForRate(160,p));assert.equal(rpmForRate(160,'processing'),rpmForRate(1e9,'processing'));});
