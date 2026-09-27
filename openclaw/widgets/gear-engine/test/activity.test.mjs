import test from 'node:test';
import assert from 'node:assert/strict';
import {ActivityModel} from '../src/activity.ts';
const rows = [{key:'a',agentId:'main',hasActiveRun:true,status:'running'}, {key:'b',agentId:'main',hasActiveRun:false,status:'done'}];
const make = () => {const model = new ActivityModel(); model.connected = true; model.snapshot(rows); return model;};
test('all eight independent combinations; receipt afterglows expire', () => {
  for (let mask=0;mask<8;mask++) {
    const m=make(); m.snapshot([{...rows[0],hasActiveRun:!!(mask&2),status:mask&2?'running':'done'}]);
    if(mask&4)m.event('session.message',{sessionKey:'a',messageSeq:1,message:{role:'user'}},10);
    if(mask&1)m.event('chat',{sessionKey:'a',runId:'r',seq:1,state:'delta',deltaText:'visible'},10);
    assert.equal(m.view(20).mask,mask);
    assert.equal(m.view(200).mask,mask);
    assert.equal(m.view(550).mask,mask&2);
  }
});
test('input and UI update receipt spins use the threefold 540 ms window',()=>{
  const m=make();
  m.event('session.message',{sessionKey:'a',messageSeq:1,message:{role:'user'}},0);
  m.event('chat',{sessionKey:'a',runId:'r',seq:1,state:'delta',deltaText:'visible'},0);
  assert.equal(m.view(179).mask,7);
  assert.equal(m.view(180).mask,7);
  assert.equal(m.view(539).mask,7);
  assert.equal(m.view(540).mask,2);
});
test('model lifecycle text alone never claims delivery; duplicate and stale deltas do not refresh pulse',()=>{
  const m=make();
  m.event('agent',{sessionKey:'a',stream:'assistant',data:{text:'text'}},10);
  assert.equal(m.view(20).mask,2);
  const e={sessionKey:'a',runId:'r',seq:2,state:'delta',deltaText:'text'};
  m.event('chat',e,10); assert.equal(m.event('chat',e,180),false);
  assert.equal(m.event('chat',{...e,seq:1},180),false); assert.equal(m.view(200).mask,3);
  assert.equal(m.view(550).mask,2);
  assert.equal(m.event('chat',{...e,seq:3,state:'final',deltaText:undefined},210),false);
});
test('queued sessions and known approval waits park; unrelated active session survives',()=>{
  const m=make(); m.snapshot([{...rows[0],status:'queued'}, {...rows[1],hasActiveRun:true,status:'running'}]);
  m.event('agent',{sessionKey:'b',stream:'execution',data:{approval:{id:'p',state:'pending'}}},0);
  assert.equal(m.view(0).mask,0); assert.equal(m.view(0).queued,1); assert.equal(m.view(0).waiting,1);
  m.snapshot(rows); assert.equal(m.view(0).mask,2);
  m.snapshot([{...rows[0],hasActiveRun:false,status:'killed'},rows[1]]); assert.equal(m.view(0).mask,0);
});
test('scope loss erases metadata and pulses; ambiguous agent aliases are rejected',()=>{
  const m=make(); m.event('session.message',{sessionKey:'a',messageSeq:1,message:{role:'user',content:'must not retain'}},0);
  m.snapshot([rows[1]]); assert.equal(m.view(1).mask,0); assert.equal(JSON.stringify(m.view(1)).includes('must not retain'),false);
  m.snapshot([rows[0],{...rows[0],agentId:'other'}]);
  assert.equal(m.event('chat',{sessionKey:'a',runId:'r',seq:1,state:'delta',deltaText:'x'},0),false);
});
test('disconnect and failed snapshot are unknown; totals never become rates or activity',()=>{
  const m=make(); m.snapshot([{...rows[1],inputTokens:5000,outputTokens:20}]);
  assert.equal(m.view(0).mask,0); assert.equal(m.view(0).rows[0].inputTokens,5000);
  m.connected=false; assert.equal(m.view(0).unknown,true); assert.deepEqual(m.view(0).rows,[]);
  m.clear(); m.connected=true; assert.equal(m.view(0).unknown,true);
  m.snapshot(rows);m.error=true;assert.equal(m.view(0).mask,0);
});
test('session incarnation resets receipt ordering and rejects prior-incarnation events',()=>{
  const m=make();m.snapshot([{...rows[0],sessionId:'old'}]);
  m.event('session.message',{sessionKey:'a',sessionId:'old',message:{role:'user',__openclaw:{seq:50}}},0);
  m.snapshot([{...rows[0],sessionId:'new'}]);
  assert.equal(m.view(1).recentInput,false);
  assert.equal(m.event('session.message',{sessionKey:'a',sessionId:'old',messageSeq:51,message:{role:'user'}},1),false);
  assert.equal(m.event('session.message',{sessionKey:'a',sessionId:'new',messageSeq:1,message:{role:'user'}},1),true);
});
