import { SCENARIOS } from './gear-core.mjs';
import './gear-element.mjs';
const root=document.getElementById('oc-gear-concept'), gear=root.querySelector('openclaw-gears');
const select=root.querySelector('[data-scenario]'), note=root.querySelector('[data-note]'), rate=root.querySelector('input[type=range]');
let state={...SCENARIOS[6],rate:40}, timers=[], cycle=false;
select.innerHTML=SCENARIOS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
function cancel(){timers.forEach(clearTimeout);timers=[];cycle=false;root.querySelector('[data-cycle]').textContent='Play cycle';}
function later(fn,ms){timers.push(setTimeout(fn,ms));}
function update(){
  gear.activity=state;select.value=state.id||'';
  root.querySelectorAll('[data-bit]').forEach(b=>{b.setAttribute('aria-pressed',String(!!(state.mask&Number(b.dataset.bit))));b.disabled=!!state.linked;});
  root.querySelectorAll('[data-state]').forEach(el=>el.textContent=state.offline?'Unknown':state.mask&Number(el.dataset.state)?state.stopping&&el.dataset.state==='2'?'Stopping':'Active':'Stopped');
  note.textContent=state.detail;rate.value=state.rate;rate.disabled=!!state.linked;root.querySelector('[data-rate]').textContent=state.linked?'Fixed ratio':state.rate+' tok/s';
  root.querySelector('[data-mode]').textContent=state.linked?'Carrier locked · gears meshed':'Clutches open · separate axial planes';
}
function choose(id){state={...SCENARIOS.find(s=>s.id===id),rate:id==='heat'?160:Number(rate.value)};update();}
select.addEventListener('change',()=>{cancel();choose(select.value);});
root.querySelectorAll('[data-bit]').forEach(b=>b.addEventListener('click',()=>{cancel();state={mask:state.mask^Number(b.dataset.bit),rate:Number(rate.value),detail:'Independent activity: each stopped gear stays parked in its own axial plane.'};state.id=SCENARIOS.find(s=>s.mask===state.mask)?.id;update();}));
rate.addEventListener('input',()=>{state.rate=Number(rate.value);update();});
root.querySelector('[data-stop]').addEventListener('click',()=>{
  cancel();const wasOther=!!state.other, hadDelivery=!!(state.mask&1);
  state={...state,linked:false,stopping:true,detail:'Stop requested. Waiting for the targeted run to acknowledge cancellation.'};update();
  later(()=>{state={...state,stopping:false,mask:wasOther?3:hadDelivery?1:0,detail:wasOther?'This run stopped. Another chat is still processing and sending.':hadDelivery?'Processing stopped. The message already in flight is still sending.':'Targeted work stopped. No outbound send was in flight.'};update();},600);
  if(hadDelivery&&!wasOther)later(()=>{state={...state,mask:0,detail:'The in-flight send was accepted by the channel. All gears are now parked.'};update();},3200);
});
root.querySelector('[data-cycle]').addEventListener('click',()=>{
  if(cycle){cancel();return;}cancel();cycle=true;root.querySelector('[data-cycle]').textContent='Pause cycle';
  const stages=['input','input-processing','processing','processing-delivery','delivery','idle'];let i=0;
  const step=()=>{choose(stages[i++%stages.length]);if(cycle)later(step,2600);};step();
});
window.addEventListener('pagehide',cancel,{once:true});update();
