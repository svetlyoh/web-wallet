import { gearContour, ringPath, linkedSpeeds, rpmForRate, clamp } from './gear-core.mjs';
let instance = 0;
export class OpenClawGears extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:'open'}); this.uid='ocg'+(++instance);
    this.state={mask:0,rate:35,heat:0}; this.angle=[10,0,2.5]; this.speed=[0,0,0]; this.heat=[0,0,0];
    this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    this.visible=true; this.frame=0; this.last=0;
    this.tick=this.tick.bind(this); this.wake=this.wake.bind(this);
  }
  connectedCallback() {
    this.render();
    this.observer=new IntersectionObserver(e=>{this.visible=e[0].isIntersecting;this.wake();});this.observer.observe(this);
    document.addEventListener('visibilitychange',this.wake);this.motion.addEventListener('change',this.wake); this.wake();
  }
  disconnectedCallback() {
    cancelAnimationFrame(this.frame);this.frame=0;this.observer?.disconnect();
    document.removeEventListener('visibilitychange',this.wake);this.motion.removeEventListener('change',this.wake);
  }
  set activity(v) {
    const enteringLinked=v.linked&&!this.state.linked;
    this.state={mask:0,rate:35,heat:0,...v};
    if(enteringLinked) {this.angle=[10,0,2.5];this.speed=[0,0,0];}
    this.updateStatus();this.wake();
  }
  get activity() {return {...this.state};}
  wake() {if(!this.isConnected)return; if(document.hidden||!this.visible){cancelAnimationFrame(this.frame);this.frame=0;this.last=0;return;}
    if(!this.frame){this.last=0;this.frame=requestAnimationFrame(this.tick);}}
  render() {
    const u=this.uid;
    const gear=(kind,path,index,holes='')=>`<g data-lane="${index}"><g class="shadow-body" transform="translate(0 5)"><path d="${path}" fill-rule="evenodd"/></g><g class="face"><path class="metal" d="${path}" fill-rule="evenodd"/><path class="energy" d="${path}" fill-rule="evenodd"/>${holes}</g></g>`;
    const spokes = (r,count) => Array.from({length:count},(_,i)=>{const a=i*2*Math.PI/count;return `<circle cx="${r*Math.cos(a)}" cy="${r*Math.sin(a)}" r="4.1" class="recess"/>`;}).join('');
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;width:160px;height:160px;contain:layout style;--steel-a:#e1e6ee;--steel-b:#526178;--steel-c:#a6b3c7;--edge:#8293aa;--ink:light-dark(#25334b,#e2e9f4);color-scheme:light dark}
      svg{display:block;width:100%;height:100%;overflow:visible}.metal{fill:url(#${u}-metal);stroke:var(--edge);stroke-width:.65;stroke-linejoin:round}.shadow-body{fill:#29384e;stroke:#526079;stroke-width:.65}.recess{fill:#33435a;stroke:#a8b6c9;stroke-width:.8}.energy{fill:var(--energy,#389bff);opacity:var(--heat,0);filter:url(#${u}-bloom);pointer-events:none}.hub{fill:url(#${u}-hub);stroke:#bac9db;stroke-width:1}.bearing{fill:none;stroke:#73849d;stroke-width:3}.rail{fill:none;stroke:#718399;stroke-width:2;opacity:.65}.badge{fill:var(--ink);font:500 14px system-ui;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:light-dark(#f8fafc,#172131);stroke-width:3px}.marker{fill:#75c9ff;stroke:#29384e;stroke-width:1}.fault{fill:#ed6579}.wait{fill:#e9ad4c}.status{font:600 9px system-ui;letter-spacing:1.1px;fill:var(--ink);text-anchor:middle}.brake{stroke:#e9ad4c;stroke-width:4;fill:none;stroke-linecap:round}.axes{opacity:.65}
    </style><svg viewBox="0 0 240 240" role="img" aria-label="OpenClaw input, processing, and delivery activity">
      <defs><linearGradient id="${u}-metal" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="var(--steel-a)"/><stop offset=".38" stop-color="var(--steel-c)"/><stop offset=".62" stop-color="var(--steel-b)"/><stop offset="1" stop-color="var(--steel-c)"/></linearGradient>
      <radialGradient id="${u}-hub"><stop stop-color="#d4e0ee"/><stop offset=".7" stop-color="#53647e"/><stop offset="1" stop-color="#26364f"/></radialGradient>
      <filter id="${u}-bloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.5"/></filter></defs>
      <g class="axes"><path class="rail" d="M112 156L120 115M166 156L182 67"/></g>
      <g data-plane="2">${gear('delivery',ringPath(),2,`<circle class="bearing" r="79"/><circle class="marker" cx="79" cy="0" r="3"/>`)}</g>
      <g data-plane="1">${gear('processing',gearContour(36),1,spokes(24,6)+`<circle class="hub" r="12"/><circle class="recess" r="4"/><circle class="marker" cx="0" cy="-30" r="2"/>`)}</g>
      <g data-plane="0">${gear('input',gearContour(18),0,`<circle class="hub" r="10"/><circle class="recess" r="3.5"/><circle class="marker" cx="0" cy="-14" r="1.7"/>`)}</g>
      <text class="badge" data-label="0">I</text><text class="badge" data-label="1">P</text><text class="badge" data-label="2">D</text>
      <path class="brake" d="M108 106L108 117M115 106L115 117" style="display:none"/>
      <text class="status" x="120" y="223" data-caption></text>
    </svg>`;
    this.groups=[0,1,2].map(i=>this.shadowRoot.querySelector(`[data-lane="${i}"]`));
    this.planes=[0,1,2].map(i=>this.shadowRoot.querySelector(`[data-plane="${i}"]`));
    this.labels=[0,1,2].map(i=>this.shadowRoot.querySelector(`[data-label="${i}"]`)); this.updateStatus();
  }
  updateStatus() {
    if(!this.groups)return;const s=this.state;
    const statuses=['Input','Processing','Delivery'].map((p,i)=>`${p}: ${s.offline?'unknown':s.mask&[4,2,1][i]?'active':'stopped'}`).join('; ');
    this.shadowRoot.querySelector('svg').setAttribute('aria-label',statuses);
    this.shadowRoot.querySelector('[data-caption]').textContent=s.offline?'OFFLINE':s.error?'SEND FAILED':s.wait?'APPROVAL':s.retry?'RETRY WAIT':s.stopping?'STOPPING':s.linked?'LINKED':'INDEPENDENT';
    this.shadowRoot.querySelector('.axes').style.display=s.linked?'none':'';
    this.shadowRoot.querySelector('.brake').style.display=(s.wait||s.stopping)?'':'none';
    const centers=s.linked?[[174,127],[120,127],[120,127]]:[[182,72],[120,114],[112,156]];
    centers.forEach(([x,y],i)=>{this.planes[i].setAttribute('transform',`translate(${x} ${y}) scale(1 .74)`);
      this.labels[i].setAttribute('x',i===2?x-78:x);this.labels[i].setAttribute('y',i===2?y:y-1);});
  }
  tick(time) {
    this.frame=0;const dt=this.last?Math.min((time-this.last)/1000,.05):0;this.last=time;
    const s=this.state, keys=['input','processing','delivery'], linked=linkedSpeeds(14);
    let animating=false;
    for(let i=0;i<3;i++) {
      const active=!!(s.mask&[4,2,1][i])&&!s.offline;
      const target=active?(s.linked?linked[keys[i]]:rpmForRate(s.rate,keys[i])*[-1,1,-1][i]):0;
      this.speed[i]+=(target-this.speed[i])*(1-Math.exp(-dt/(active?.25:.13)));
      if(Math.abs(this.speed[i])<.02&&!active)this.speed[i]=0;
      const htarget=active?(.10+.65*clamp((s.rate??0)/160)+.23*(s.heat??0)):0;
      this.heat[i]+=(htarget-this.heat[i])*(1-Math.exp(-dt/(htarget>this.heat[i]?1.6:4)));
      if(!this.motion.matches&&!s.offline)this.angle[i]+=this.speed[i]*6*dt;
      this.groups[i].querySelector('.face').setAttribute('transform',`rotate(${this.angle[i]})`);
      this.groups[i].querySelector('.shadow-body').setAttribute('transform',`translate(0 5) rotate(${this.angle[i]})`);
      const h=this.motion.matches?htarget:this.heat[i];
      this.groups[i].style.setProperty('--energy',s.error&&i===2?'#ed6579':(s.wait&&i===1)||(s.retry&&i===2)?'#e9ad4c':`hsl(${205+clamp((h-.35)/.55)*65} 95% 64%)`);
      this.groups[i].style.setProperty('--heat',s.error&&i===2||s.wait&&i===1||s.retry&&i===2?'.42':String(h*.48));
      this.groups[i].style.opacity=s.offline?'.45':active?'1':'.70';
      if(!this.motion.matches&&(active||Math.abs(this.speed[i])>.02||this.heat[i]>.01))animating=true;
    }
    if(animating&&!document.hidden&&this.visible&&!s.offline)this.frame=requestAnimationFrame(this.tick);
  }
}
if(!customElements.get('openclaw-gears'))customElements.define('openclaw-gears',OpenClawGears);
