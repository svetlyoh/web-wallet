(function(){
'use strict';

var KEY='sugarchain_polygon_plaza_panic_progress',W=960,H=540,WW=120,WH=92,SX=5.1,SY=2.5;
var ENTRY_COST = 1;
var CONTINUE_COST = 1;
var MAX_CONTINUES = 5;
var FLOW = {
	IDLE: 'idle',
	AWAIT_START: 'awaiting_start_payment',
	STARTING_RUN: 'starting_run',
	IN_RUN: 'in_run',
	PAUSED: 'paused',
	GAME_OVER: 'game_over',
	AWAIT_CONTINUE: 'awaiting_continue_payment',
	RESUMING: 'resuming_from_continue',
	RUN_ENDED: 'run_ended'
};

var Z=[{n:'Atrium Court',a:'#173a61',b:'#112949',f1:'#24b4c2',f2:'#189fb1',c:'#ffd66a'},{n:'Arcade Row',a:'#2f2865',b:'#22194f',f1:'#40c9ff',f2:'#268ec4',c:'#ff83cb'},{n:'Toy Boutique',a:'#49265c',b:'#2e1c4a',f1:'#ff9e72',f2:'#ff7b5d',c:'#7dffe0'},{n:'Food Kiosk Alley',a:'#50332b',b:'#37241f',f1:'#ffc567',f2:'#f49d49',c:'#8fe4ff'},{n:'Electro Showcase',a:'#203652',b:'#16243f',f1:'#66b6ff',f2:'#4486d8',c:'#ffe58d'},{n:'Skybridge',a:'#28483f',b:'#1a342d',f1:'#7ce0ca',f2:'#4db8a0',c:'#ff9ed3'}];

var C=[{id:'tech-ace',name:'Arcade Tech Ace',speed:34,rate:0.11,bomb:46,bombs:3,col:'#71edff',acc:'#ffe38c',perk:'Balanced all-rounder.'},{id:'safety-cadet',name:'Mall Safety Cadet',speed:30,rate:0.1,bomb:56,bombs:2,col:'#a7bbff',acc:'#ff9090',perk:'Big bomb radius, slower strafe.'},{id:'neon-skater',name:'Neon Skater',speed:39,rate:0.13,bomb:40,bombs:3,col:'#f781ff',acc:'#79fff0',perk:'Fast movement, lighter bombs.'}];

var E=[{id:'capsule-drone',hp:7,speed:16,score:140,col:'#ffd56f'},{id:'receipt-wraith',hp:5,speed:20,score:120,col:'#89ffe6'},{id:'service-bot',hp:9,speed:13,score:160,col:'#84b9ff'},{id:'sticker-mine',hp:4,speed:0,score:110,col:'#ff98ad'}];

var B=[{n:'Prize Core Cycler',hp:230,col:'#9de9ff'},{n:'Neon Serpent Sign',hp:270,col:'#ff9ccf'},{n:'Escalator Colossus',hp:320,col:'#ffd57d'}],SEQ=[0,2,1];

var S={in:false,vis:false,open:false,run:false,pause:false,over:false,flow:FLOW.IDLE,t0:0,zone:0,stage:1,wave:1,waves:0,sclock:48,sdmg:0,rclock:0,score:0,high:0,lives:3,combo:1,cc:0,secrets:0,hidden:0,bombs:3,maxBombs:3,speedBonus:0,bossKills:0,char:C[0].id,walletBalance:0,gameBalance:0,startingSessionBalance:0,sessionSugarSpent:0,pendingSpendAmount:0,entryCost:ENTRY_COST,continueCost:CONTINUE_COST,gameBalanceInitialized:false,spendPending:false,pendingSpendContext:null,continuesUsed:0,runId:0,keys:{},touch:{up:false,down:false,left:false,right:false},holdFire:false,holdBomb:false,p:{x:60,y:64,z:0,vx:0,vy:0,dx:0,dy:-1,cd:0,inv:0},en:[],bul:[],eb:[],pk:[],fx:[],pr:[],boss:null,sec:{p:0,u:false,phones:[]}};

var U={};

function cl(v,a,b){return v<a?a:(v>b?b:v)} function rn(a,b){return a+Math.random()*(b-a)} function ri(a,b){return Math.floor(rn(a,b+1))} function pick(a){return a[Math.floor(Math.random()*a.length)]}
function d2(ax,ay,bx,by){var dx=ax-bx,dy=ay-by;
return dx*dx+dy*dy} function cfg(){for(var i=0;
i<C.length;
i++){if(C[i].id===S.char){return C[i]}}return C[0]}
function tone(f,d,t,g){try{if(!window.AudioContext&&!window.webkitAudioContext){return} if(!S.ac){S.ac=new(window.AudioContext||window.webkitAudioContext)()} var c=S.ac,o=c.createOscillator(),k=c.createGain(),n=c.currentTime;
o.type=t||'triangle';
o.frequency.value=f;
k.gain.value=0.0001;
o.connect(k);
k.connect(c.destination);
k.gain.exponentialRampToValueAtTime(g||0.05,n+0.01);
k.gain.exponentialRampToValueAtTime(0.0001,n+d);
o.start(n);
o.stop(n+d+0.03)}catch(e){}}
function getTicker(){try{return (window.getConfig && window.getConfig().ticker) || 'SUGAR'}catch(e){return 'SUGAR'}}
function getDecimals(){try{return Number((window.getConfig && window.getConfig().decimals) || 8)}catch(e){return 8}}
function roundAmount(v){var d = Math.pow(10, getDecimals());return Math.round(Number(v || 0) * d) / d}
function formatAmount(v){return roundAmount(v).toFixed(getDecimals())}
function isWalletReady(){try{return !!(window.globalData && window.globalData.keys && window.globalData.address)}catch(e){return false}}
function isWalletBalanceHydrated(){try{return !!(window.globalData && window.globalData.balance !== undefined && window.globalData.balance !== null)}catch(e){return false}}
function getWalletBalance(){try{return Number(window.amountFormat ? window.amountFormat(window.globalData.balance) : window.globalData.balance) || 0}catch(e){return 0}}
function syncWalletBalanceOnly(){
	S.walletBalance = Math.max(0, getWalletBalance());
}
function refreshWalletBalanceLikeBomberman(){
	var value = Number(getWalletBalance());
	if (!isFinite(value) || value < 0) { value = 0; }
	S.walletBalance = value;
	if (!S.gameBalanceInitialized) {
		S.startingSessionBalance = value;
		S.gameBalance = value;
		S.sessionSugarSpent = 0;
		S.gameBalanceInitialized = true;
		return;
	}
	// Match Bomberman: keep game balance equal before any run/session spending starts.
	if (S.flow === FLOW.IDLE && S.runId === 0 && S.continuesUsed === 0 && S.score === 0 && S.sessionSugarSpent === 0) {
		S.startingSessionBalance = value;
		S.gameBalance = value;
	}
}
function initializeSessionBalanceFromWallet(){
	syncWalletBalanceOnly();
	S.startingSessionBalance = S.walletBalance;
	S.sessionSugarSpent = 0;
	S.pendingSpendAmount = 0;
	S.gameBalance = S.walletBalance;
	S.gameBalanceInitialized = true;
}
function ensureSessionBalanceInitialized(){
	if (S.gameBalanceInitialized) { return true; }
	if (!isWalletBalanceHydrated()) { return false; }
	initializeSessionBalanceFromWallet();
	return true;
}
function showBalanceLoadingState(){
	if(U.walletBalance){U.walletBalance.textContent='Loading balance...'}
	if(U.gameBalance){U.gameBalance.textContent='Loading balance...'}
	if(U.sessionSpent){U.sessionSpent.textContent='Loading balance...'}
	if(U.playPaid){U.playPaid.disabled=true}
}
function applyConfirmedSpend(amount){
	var spend = roundAmount(Math.max(0, Number(amount) || 0));
	S.sessionSugarSpent = roundAmount(S.sessionSugarSpent + spend);
	S.gameBalance = roundAmount(Math.max(0, S.gameBalance - spend));
}
function setFlow(next){ S.flow = next; }
function status(t,v){if(!U.status){return}U.status.textContent=t;
U.status.className='ppp-status'+(v?' '+v:'')} function ticker(t,v){if(!U.ticker){return}U.ticker.textContent=t;
U.ticker.className='ppp-ticker'+(v?' '+v:'')}
function proj(x,y,z){return{x:(W*0.5)+(x-y)*SX,y:102+(x+y)*SY-(z*1.6)}} function wz(x,y){if(!(x>80&&y<26)){return 0} return cl(((x-80)/40)*11,0,11)}
function resetTransient(){S.en=[];
S.bul=[];
S.eb=[];
S.pk=[];
S.fx=[];
S.pr=[];
S.boss=null;
S.sec={p:0,u:false,phones:[]}}
function buildProps(){S.pr=[];
var t=['directory','arcade','prize','food','toy','electronics','planter','kiosk'];
for(var i=0;
i<25;
i++){var x=rn(10,WW-12),y=rn(8,WH-8);
if(x>48&&x<72&&y>52&&y<72){continue}var type=pick(t),hp=(type==='planter'||type==='kiosk')?5:3;
S.pr.push({type:type,x:x,y:y,z:wz(x,y),r:type==='kiosk'?4.2:3.2,hp:hp,hidden:Math.random()>0.76,dead:false,blink:Math.random()*Math.PI*2})}var ph=[];
while(ph.length<3){var px=rn(16,WW-16),py=rn(12,WH-12);
if(px>75&&py<30){continue}ph.push({type:'payphone',x:px,y:py,z:wz(px,py),r:3.5,hp:2,hidden:false,dead:false,seq:ph.length,blink:rn(0,Math.PI*2)})}S.sec.phones=ph;
for(var p=0;
p<ph.length;
p++){S.pr.push(ph[p])}}
function spawnEnemy(t,c){var e=ri(0,3),x=e===0?rn(6,WW-6):(e===1?WW-4:(e===2?rn(6,WW-6):4)),y=e===2?WH-4:(e===3?rn(5,WH-5):(e===0?4:rn(5,WH-5))),hp=t.hp+Math.floor(S.stage*0.75);
S.en.push({id:t.id,x:x,y:y,z:wz(x,y),r:2.8+(t.id==='service-bot'?0.6:0),hp:hp,mhp:hp,speed:t.speed+(S.stage*0.9),col:t.col,score:t.score,cd:rn(0.7,1.8),w:rn(0,Math.PI*2),carrier:!!c})}
function spawnWave(){var c=4+S.stage+Math.floor(S.wave*0.6);
for(var i=0;
i<c;
i++){spawnEnemy(pick(E),false)}if(Math.random()>0.72){spawnEnemy(pick(E),true)}ticker('Wave '+S.wave+' incoming. Break props for secrets.','')}
function spawnBoss(){var t=B[(Math.floor(S.stage/3)-1)%B.length],hp=t.hp+S.stage*30;
S.boss={n:t.n,x:WW*0.5,y:20,z:wz(WW*0.5,20),r:7,hp:hp,mhp:hp,cd:0.7,dash:2.6,ph:0,col:t.col};
status('Boss event: '+t.n+'. Watch for lane sweeps.','danger');
ticker('Boss online. Bomb weak points for burst score.','danger');
tone(180,0.2,'sawtooth',0.1)}
function startStage(n){S.stage=n;
S.zone=(n-1)%Z.length;
S.wave=1;
S.waves=2+Math.floor(n/2);
S.sclock=cl(56-n*1.05,34,56);
S.sdmg=0;
resetTransient();
buildProps();
S.p.x=58;
S.p.y=68;
S.p.z=wz(S.p.x,S.p.y);
if(n%3===0){spawnBoss()}else{spawnWave()}status('Stage '+n+' started. Keep combo alive.','')}
function beginRun(){var c=cfg();
setFlow(FLOW.STARTING_RUN);
S.runId += 1;
S.run=true;
S.pause=false;
S.over=false;
S.rclock=0;
S.score=0;
S.lives=3;
S.combo=1;
S.cc=0;
S.secrets=0;
S.hidden=0;
S.speedBonus=0;
S.bossKills=0;
S.continuesUsed=0;
S.maxBombs=c.bombs;
S.bombs=c.bombs;
startStage(1);
setFlow(FLOW.IN_RUN);
overlay(false);
ticker('Run hot. One more stage. One more secret.','')}
function addScore(b){var p=Math.floor(b*S.combo);
S.score+=p;
if(S.score>S.high){S.high=S.score;
save()}S.cc=3.1;
S.combo=cl(S.combo+0.1,1,9)}
function endRun(r){S.run=false;
S.pause=false;
S.over=true;
setFlow(FLOW.GAME_OVER);
var nd=S.sdmg===0?900:0,bb=S.bossKills*1300,sum='Score '+Math.floor(S.score)+' | Secrets '+S.secrets+' | Speed bonus '+S.speedBonus+' | Boss bonus '+bb+(nd?' | No-damage +'+nd:'');
if(nd){S.score+=nd}S.score+=bb;
if(S.score>S.high){S.high=S.score;
save()}status('Run over: '+(r||'Out of lives')+'. Tap Play Again instantly.','warn');
overlay(true,'RUN OVER',sum+'. Fast restart recommended.');
openGameOverModal(sum);
tone(122,0.24,'sawtooth',0.12);
hud()}
function hurt(n){if(!S.run||S.pause||S.over||S.flow!==FLOW.IN_RUN||S.p.inv>0){return}S.lives-=n;
S.p.inv=1.1;
S.sdmg+=n;
S.combo=Math.max(1,S.combo-0.9);
S.cc=0;
ticker('Hit taken. Rebuild chain now.','danger');
tone(190,0.1,'square',0.09);
if(S.lives<=0){endRun('Cabinet overload')}}
function shoot(){if(!S.run||S.pause||S.over||S.flow!==FLOW.IN_RUN||S.p.cd>0){return}var c=cfg(),dx=S.p.dx,dy=S.p.dy,nr=null,best=999999;
for(var i=0;
i<S.en.length;
i++){var e=S.en[i],dd=d2(S.p.x,S.p.y,e.x,e.y);
if(dd<best){best=dd;
nr=e}}if(S.boss&&d2(S.p.x,S.p.y,S.boss.x,S.boss.y)<best){nr=S.boss}if(nr){var lx=nr.x-S.p.x,ly=nr.y-S.p.y,ll=Math.sqrt(lx*lx+ly*ly)||1;
dx=lx/ll;
dy=ly/ll}S.p.cd=c.rate;
S.bul.push({x:S.p.x+dx*2,y:S.p.y+dy*2,z:S.p.z+1.2,vx:dx*82,vy:dy*82,life:1.4,dmg:3.1});
S.fx.push({x:S.p.x,y:S.p.y,z:S.p.z+1,r:3,life:0.2,col:'#95f7ff'});
tone(590,0.05,'triangle',0.05)}
function bomb(){if(!S.run||S.pause||S.over||S.flow!==FLOW.IN_RUN){return}if(S.bombs<=0){ticker('No bombs left.','warn');return}var c=cfg(),r2=c.bomb*c.bomb,k=0;
S.bombs--;
for(var i=S.en.length-1;
i>=0;
i--){var e=S.en[i];
if(d2(S.p.x,S.p.y,e.x,e.y)<=r2){e.hp-=18;
if(e.hp<=0){S.en.splice(i,1);
addScore(e.score+60);
if(Math.random()>0.52){spawnPickup(e.x,e.y,'token')}k++}}}if(S.boss&&d2(S.p.x,S.p.y,S.boss.x,S.boss.y)<=r2*1.2){S.boss.hp-=35;
addScore(220)}S.eb=[];
S.fx.push({x:S.p.x,y:S.p.y,z:S.p.z,r:8.5,life:0.42,col:'#ffde7e'});
ticker('Bomb deployed. '+k+' targets popped.','warn');
tone(230,0.18,'sawtooth',0.1);
tone(440,0.12,'triangle',0.08)}
function spawnPickup(x,y,t){var k=t||(Math.random()>0.75?'combo':'score');
S.pk.push({x:x,y:y,z:wz(x,y)+1.2,r:2.1,age:0,k:k})}
function secretPhone(p){if(!p||p.type!=='payphone'||S.sec.u){return}var ex=SEQ[S.sec.p];
if(p.seq===ex){S.sec.p++;
ticker('Secret tone '+S.sec.p+'/3 confirmed.','warn');
tone(640+S.sec.p*80,0.09,'triangle',0.08);
if(S.sec.p>=SEQ.length){S.sec.u=true;
S.secrets++;
addScore(1200);
spawnEnemy({id:'bonus-carrier',hp:8,speed:22,score:650,col:'#fff097'},true);
status('Secret carrier unlocked. Burst it before escape.','warn')}}else{S.sec.p=0;
ticker('Wrong payphone order. Sequence reset.','danger');
tone(210,0.08,'square',0.08)}}
function propHit(px,py,d){for(var i=0;
i<S.pr.length;
i++){var p=S.pr[i];
if(p.dead){continue}if(d2(px,py,p.x,p.y)<=Math.pow(p.r+1.2,2)){p.hp-=d;
secretPhone(p);
S.fx.push({x:p.x,y:p.y,z:p.z+1,r:2.1,life:0.2,col:'#9deeff'});
if(p.hp<=0){p.dead=true;
addScore(70);
if(p.hidden){S.hidden++;
spawnPickup(p.x,p.y,Math.random()>0.6?'bomb':'combo');
ticker('Hidden pickup from '+p.type+'.','warn')}}return true}}return false}
function enemyShot(e,s){var dx=S.p.x-e.x,dy=S.p.y-e.y,l=Math.sqrt(dx*dx+dy*dy)||1;
S.eb.push({x:e.x,y:e.y,z:e.z+1.4,vx:(dx/l)*s,vy:(dy/l)*s,life:2.2,r:1.2,col:'#ffc193'})}
function stageBonus(){var sb=Math.max(0,Math.floor(S.sclock*52)),lb=S.sdmg<2?520:0;
S.score+=sb+lb;
S.speedBonus+=sb;
status('Stage clear. Speed +'+sb+(lb?' | Low damage +'+lb:'')+'.','warn');
tone(540,0.12,'triangle',0.07);
tone(720,0.18,'triangle',0.07)}
function stageFlow(){if(S.boss){if(S.boss.hp<=0){S.boss=null;
S.bossKills++;
S.score+=1600;
stageBonus();
startStage(S.stage+1)}return}if(S.en.length===0){if(S.waves>0){S.waves--;
S.wave++;
spawnWave()}else{stageBonus();
startStage(S.stage+1)}}}
function update(dt){if(!S.run||S.pause||S.over){return}S.rclock+=dt;
S.sclock-=dt;
if(S.sclock<=0){hurt(1);
S.sclock=12;
ticker('Lockdown pulse. Keep pace.','danger')}var c=cfg(),mx=0,my=0;
if(S.keys.ArrowLeft||S.keys.KeyA||S.touch.left){mx--}if(S.keys.ArrowRight||S.keys.KeyD||S.touch.right){mx++}if(S.keys.ArrowUp||S.keys.KeyW||S.touch.up){my--}if(S.keys.ArrowDown||S.keys.KeyS||S.touch.down){my++}var l=Math.sqrt(mx*mx+my*my);
if(l>0){mx/=l;
my/=l;
S.p.dx=mx;
S.p.dy=my}S.p.vx=mx*c.speed;
S.p.vy=my*c.speed;
S.p.x=cl(S.p.x+S.p.vx*dt,4,WW-4);
S.p.y=cl(S.p.y+S.p.vy*dt,4,WH-4);
S.p.z=wz(S.p.x,S.p.y);
if(S.p.cd>0){S.p.cd-=dt}if(S.p.inv>0){S.p.inv-=dt}if(S.cc>0){S.cc-=dt}else{S.combo=Math.max(1,S.combo-dt*0.45)}if(S.holdFire){shoot()}
for(var i=S.bul.length-1;
i>=0;
i--){var b=S.bul[i];
b.x+=b.vx*dt;
b.y+=b.vy*dt;
b.z=wz(b.x,b.y)+1.2;
b.life-=dt;
if(b.life<=0||b.x<0||b.x>WW||b.y<0||b.y>WH){S.bul.splice(i,1);
continue}if(propHit(b.x,b.y,b.dmg)){S.bul.splice(i,1);
continue}var hit=false;
for(var ei=S.en.length-1;
ei>=0;
ei--){var e=S.en[ei];
if(d2(b.x,b.y,e.x,e.y)<=Math.pow(e.r+0.8,2)){e.hp-=b.dmg;
if(e.hp<=0){S.en.splice(ei,1);
addScore(e.score);
if(e.carrier){S.secrets++;
S.score+=760;
spawnPickup(e.x,e.y,'secret');
ticker('Carrier burst. Secret token!','warn')}if(Math.random()>0.52){spawnPickup(e.x,e.y,Math.random()>0.8?'combo':'score')}}hit=true;
break}}if(!hit&&S.boss&&d2(b.x,b.y,S.boss.x,S.boss.y)<=Math.pow(S.boss.r+0.9,2)){S.boss.hp-=b.dmg;
addScore(42);
hit=true}if(hit){S.bul.splice(i,1)}}
for(i=S.eb.length-1;
i>=0;
i--){b=S.eb[i];
b.x+=b.vx*dt;
b.y+=b.vy*dt;
b.z=wz(b.x,b.y)+1;
b.life-=dt;
if(b.life<=0||b.x<-4||b.x>WW+4||b.y<-4||b.y>WH+4){S.eb.splice(i,1);
continue}if(d2(b.x,b.y,S.p.x,S.p.y)<=Math.pow(2.3+1.1,2)){S.eb.splice(i,1);
hurt(1)}}
for(i=S.en.length-1;
i>=0;
i--){var en=S.en[i];
en.w+=dt*3;
if(en.id!=='sticker-mine'){var ex=S.p.x-en.x,ey=S.p.y-en.y,el=Math.sqrt(ex*ex+ey*ey)||1;
en.x+=(ex/el)*en.speed*dt+Math.sin(en.w)*1.1*dt;
en.y+=(ey/el)*en.speed*dt+Math.cos(en.w*0.8)*1.1*dt}en.x=cl(en.x,3,WW-3);
en.y=cl(en.y,3,WH-3);
en.z=wz(en.x,en.y);
en.cd-=dt;
if(en.cd<=0){en.cd=en.id==='receipt-wraith'?rn(0.7,1.2):rn(1.2,2.2);
enemyShot(en,en.id==='receipt-wraith'?41:33)}if(d2(en.x,en.y,S.p.x,S.p.y)<=Math.pow(en.r+2.3,2)){hurt(1)}}
if(S.boss){var dx=S.p.x-S.boss.x,dy=S.p.y-S.boss.y,dl=Math.sqrt(dx*dx+dy*dy)||1;
S.boss.cd-=dt;
S.boss.dash-=dt;
if(S.boss.dash<=0){S.boss.dash=rn(2,3.2);
S.boss.ph=0.3}var sp=S.boss.ph>0?24:10;
if(S.boss.ph>0){S.boss.ph-=dt}S.boss.x+=(dx/dl)*sp*dt;
S.boss.y+=(dy/dl)*sp*dt;
S.boss.x=cl(S.boss.x,8,WW-8);
S.boss.y=cl(S.boss.y,8,WH-8);
S.boss.z=wz(S.boss.x,S.boss.y);
if(S.boss.cd<=0){S.boss.cd=rn(0.6,1.05);
for(var k=0;
k<5;
k++){var a=Math.atan2(dy,dx)+(k-2)*0.22;
S.eb.push({x:S.boss.x,y:S.boss.y,z:S.boss.z+2,vx:Math.cos(a)*46,vy:Math.sin(a)*46,life:2.2,r:1.4,col:S.boss.col})}}if(d2(S.boss.x,S.boss.y,S.p.x,S.p.y)<=Math.pow(S.boss.r+2.3,2)){hurt(1)}}
for(i=S.pk.length-1;
i>=0;
i--){var p=S.pk[i];
p.age+=dt;
if(p.age>10){S.pk.splice(i,1);
continue}if(d2(p.x,p.y,S.p.x,S.p.y)<=13){if(p.k==='score'){addScore(110)}else if(p.k==='combo'){S.combo=cl(S.combo+0.9,1,9);
S.cc=3.1}else if(p.k==='bomb'){S.bombs=cl(S.bombs+1,0,S.maxBombs)}else if(p.k==='token'){addScore(200);
S.hidden++}else if(p.k==='secret'){addScore(860);
S.secrets++}else{S.lives=cl(S.lives+1,0,6)}S.pk.splice(i,1);
tone(870,0.06,'triangle',0.06)}}
for(i=S.fx.length-1;
i>=0;
i--){S.fx[i].life-=dt;
if(S.fx[i].life<=0){S.fx.splice(i,1)}} stageFlow();
hud()}
function prism(ctx,x,y,z,w,d,h,t,a,b){var p1=proj(x,y,z+h),p2=proj(x+w,y,z+h),p3=proj(x+w,y+d,z+h),p4=proj(x,y+d,z+h),q1=proj(x,y+d,z),q2=proj(x+w,y+d,z),q3=proj(x+w,y,z);
ctx.beginPath();
ctx.moveTo(p4.x,p4.y);
ctx.lineTo(p3.x,p3.y);
ctx.lineTo(q2.x,q2.y);
ctx.lineTo(q1.x,q1.y);
ctx.closePath();
ctx.fillStyle=a;
ctx.fill();
ctx.beginPath();
ctx.moveTo(p3.x,p3.y);
ctx.lineTo(p2.x,p2.y);
ctx.lineTo(q3.x,q3.y);
ctx.lineTo(q2.x,q2.y);
ctx.closePath();
ctx.fillStyle=b;
ctx.fill();
ctx.beginPath();
ctx.moveTo(p1.x,p1.y);
ctx.lineTo(p2.x,p2.y);
ctx.lineTo(p3.x,p3.y);
ctx.lineTo(p4.x,p4.y);
ctx.closePath();
ctx.fillStyle=t;
ctx.fill()}
function drawFloor(ctx,z){ctx.fillStyle=z.a;
ctx.fillRect(0,0,W,H);
var g=ctx.createLinearGradient(0,0,0,H);
g.addColorStop(0,'rgba(255,255,255,0.06)');
g.addColorStop(1,'rgba(0,0,0,0.38)');
ctx.fillStyle=g;
ctx.fillRect(0,0,W,H);
for(var x=0;
x<=WW;
x+=8){for(var y=0;
y<=WH;
y+=8){var p=proj(x,y,wz(x,y)),r=proj(x+8,y,wz(x+8,y)),b=proj(x,y+8,wz(x,y+8)),rb=proj(x+8,y+8,wz(x+8,y+8));
ctx.beginPath();
ctx.moveTo(p.x,p.y);
ctx.lineTo(r.x,r.y);
ctx.lineTo(rb.x,rb.y);
ctx.lineTo(b.x,b.y);
ctx.closePath();
ctx.fillStyle=((x+y)/8)%2===0?z.f1:z.f2;
ctx.globalAlpha=0.32;
ctx.fill()}}ctx.globalAlpha=1;
prism(ctx,88,6,0,26,18,9,'#9ad4ff','#5f93c9','#76abd8');
prism(ctx,82,18,0,8,10,4,'#f2be65','#cb8f43','#dfa757')}
function drawProp(ctx,p,z,t){if(p.dead){return}var k=p.z;
if(p.type==='directory'){prism(ctx,p.x-1.5,p.y-1.2,k,3,2.4,6.5,'#87f1ff','#4cb1b8','#66c9d3')}else if(p.type==='arcade'){prism(ctx,p.x-1.8,p.y-1.2,k,3.2,2.5,5.6,'#6cc8ff','#466bb8','#5f8fd1')}else if(p.type==='prize'){prism(ctx,p.x-2,p.y-1.6,k,4,3.2,4.7,'#9ef4ff','#66a7c4','#86c3db')}else if(p.type==='food'){prism(ctx,p.x-1.7,p.y-1.4,k,3.4,2.8,3.2,'#ffc875','#d59048','#e8a95f')}else if(p.type==='electronics'){prism(ctx,p.x-1.8,p.y-1.5,k,3.5,3,4.2,'#8bd0ff','#5489c0','#699fda')}else if(p.type==='toy'){prism(ctx,p.x-1.8,p.y-1.2,k,3.4,2.4,3.8,'#ff9bcc','#d16da2','#e384b4')}else if(p.type==='payphone'){prism(ctx,p.x-1.3,p.y-1.1,k,2.6,2.2,5.4,'#b4d0dc','#6f8f9c','#8daab8')}else if(p.type==='planter'){prism(ctx,p.x-1.6,p.y-1.4,k,3.2,2.8,2.3,'#93c29d','#5e8a68','#73a67e')}else{prism(ctx,p.x-1.6,p.y-1.4,k,3.3,2.8,4.9,'#f4db8d','#b99f58','#d0b96e')}var s=proj(p.x,p.y,k+6.2);
ctx.fillStyle='rgba(255,255,255,0.55)';
ctx.fillRect(s.x-2,s.y-1,4,2);
if(p.type==='payphone'&&!S.sec.u){ctx.fillStyle=SEQ[S.sec.p]===p.seq? '#ffe37f':z.c;
ctx.fillRect(s.x-1.4,s.y+1,2.8,2.1)}if(p.hidden){ctx.fillStyle='rgba(255,248,182,'+(0.45+Math.sin(t*4+p.blink)*0.2)+')';
ctx.fillRect(s.x+3,s.y-2,2,2)}}
function drawActor(ctx,e,b){var s=proj(e.x,e.y,e.z+(b?6:2.8)),r=b?20:10;
ctx.save();
ctx.translate(s.x,s.y);
ctx.fillStyle=e.col;
ctx.beginPath();
ctx.arc(0,0,r,0,Math.PI*2);
ctx.fill();
ctx.fillStyle='rgba(255,255,255,0.35)';
ctx.fillRect(-r*0.5,-r*0.6,r*0.8,r*0.26);
ctx.fillStyle='#10253f';
ctx.fillRect(-r*0.42,-2,r*0.84,4);
ctx.restore()}
function draw(){if(!U.ctx){return}var ctx=U.ctx,z=Z[S.zone];
drawFloor(ctx,z);
var t=S.rclock;
for(var i=0;
i<S.pr.length;
i++){drawProp(ctx,S.pr[i],z,t)}for(i=0;
i<S.pk.length;
i++){var p=S.pk[i],pp=proj(p.x,p.y,p.z+Math.sin((t+p.age)*8)*0.7);
ctx.fillStyle=p.k==='combo'?'#84fcff':(p.k==='bomb'?'#ffd27a':(p.k==='secret'?'#ff9ce4':'#fff1a2'));
ctx.beginPath();
ctx.arc(pp.x,pp.y,p.k==='secret'?5.5:4.2,0,Math.PI*2);
ctx.fill()}for(i=0;
i<S.en.length;
i++){drawActor(ctx,S.en[i],false)}if(S.boss){drawActor(ctx,S.boss,true)}for(i=0;
i<S.eb.length;
i++){var eb=S.eb[i],es=proj(eb.x,eb.y,eb.z);
ctx.fillStyle=eb.col;
ctx.beginPath();
ctx.arc(es.x,es.y,3.2,0,Math.PI*2);
ctx.fill()}for(i=0;
i<S.bul.length;
i++){var b=S.bul[i],bs=proj(b.x,b.y,b.z);
ctx.fillStyle='#92f7ff';
ctx.fillRect(bs.x-2.2,bs.y-1.1,4.4,2.2)}var p=proj(S.p.x,S.p.y,S.p.z+3),c=cfg();
ctx.save();
ctx.translate(p.x,p.y);
ctx.fillStyle=c.col;
ctx.beginPath();
ctx.arc(0,0,10,0,Math.PI*2);
ctx.fill();
ctx.fillStyle=c.acc;
ctx.fillRect(-6,-9,12,4);
ctx.fillStyle='#fff';
ctx.fillRect(-4,-2,3,3);
ctx.fillRect(1,-2,3,3);
if(S.p.inv>0){ctx.strokeStyle='rgba(255,146,146,0.9)';
ctx.lineWidth=2.4;
ctx.beginPath();
ctx.arc(0,0,13,0,Math.PI*2);
ctx.stroke()}ctx.restore();
for(i=0;
i<S.fx.length;
i++){var f=S.fx[i],fp=proj(f.x,f.y,f.z);
ctx.globalAlpha=cl(f.life*2.2,0,0.8);
ctx.strokeStyle=f.col;
ctx.lineWidth=2;
ctx.beginPath();
ctx.arc(fp.x,fp.y,f.r*(1+(0.4-f.life)),0,Math.PI*2);
ctx.stroke();
ctx.globalAlpha=1}ctx.fillStyle='rgba(0,0,0,0.38)';
ctx.fillRect(0,H-38,W,38);
ctx.fillStyle='#bbecff';
ctx.font='15px Trebuchet MS, sans-serif';
ctx.fillText('Zone: '+z.n+' | Stage Clock: '+Math.max(0,S.sclock).toFixed(1)+'s | Secret Chain: '+S.sec.p+'/3',13,H-13)}
function hud(){if(!U.hScore){return}
refreshWalletBalanceLikeBomberman();
if(!ensureSessionBalanceInitialized()){
	showBalanceLoadingState();
	return;
}
U.hScore.textContent=Math.floor(S.score).toString();
U.hHigh.textContent=Math.floor(S.high).toString();
U.hLives.textContent=S.lives.toString();
U.hCombo.textContent=S.combo.toFixed(1)+'x';
U.hBombs.textContent=S.bombs.toString();
U.hTimer.textContent=S.rclock.toFixed(1)+'s';
U.hStage.textContent=S.stage.toString();
U.hZone.textContent=Z[S.zone].n;
U.hSecrets.textContent=S.secrets.toString()+' | Hidden '+S.hidden;
if(U.walletBalance){U.walletBalance.textContent=formatAmount(S.walletBalance)+' '+getTicker()}
if(U.gameBalance){U.gameBalance.textContent=formatAmount(S.gameBalance)+' '+getTicker()}
if(U.sessionSpent){U.sessionSpent.textContent=formatAmount(S.sessionSugarSpent)+' '+getTicker()}
if(U.runState){U.runState.textContent=S.flow}
if(U.continuesUsed){U.continuesUsed.textContent=String(S.continuesUsed)}
if(U.playPaid){U.playPaid.disabled=!canStartPaidRun()}
if(U.continueBtn){U.continueBtn.disabled=!canContinue()}
}
function loop(ts){if(!S.in){return}if(!S.t0){S.t0=ts}var dt=Math.min((ts-S.t0)/1000,0.05);
S.t0=ts;
if(S.vis&&S.open){update(dt);
draw()}window.requestAnimationFrame(loop)}
function overlay(sh,t,c){if(!U.ov){return}if(!sh){U.ov.classList.add('d-none');
return}U.ov.classList.remove('d-none');
U.ovt.textContent=t||'Paused';
U.ovc.textContent=c||'Cabinet paused.'}
function open(){S.open=true;
if(U.arc){U.arc.classList.remove('d-none')}if(U.launch){U.launch.classList.add('d-none')}status('Cabinet loaded. Start a run to begin.','');
hud()}
function close(){if(S.spendPending){return}S.open=false;
S.run=false;
S.pause=false;
S.over=false;
setFlow(FLOW.RUN_ENDED);
if(U.arc){U.arc.classList.add('d-none')}if(U.launch){U.launch.classList.remove('d-none')}overlay(false);
hideSpendModal();
hideGameOverModal();
status('Cabinet closed. Wallet state remains untouched.','');
ticker('Exited cleanly. Come back for one more run.','')}
function pause(v){if(S.flow===FLOW.AWAIT_START||S.flow===FLOW.AWAIT_CONTINUE||S.spendPending){return}if(!S.run||S.over){return}S.pause=v;
if(v){setFlow(FLOW.PAUSED);
overlay(true,'PAUSED','Combo timer frozen. Resume when ready.')}else{setFlow(FLOW.IN_RUN);
overlay(false);
ticker('Back in action.','')}}
function canStartPaidRun(){return S.gameBalanceInitialized && isWalletReady() && !S.spendPending && (S.flow===FLOW.IDLE||S.flow===FLOW.RUN_ENDED) && S.gameBalance>=S.entryCost}
function canContinue(){return S.gameBalanceInitialized && S.flow===FLOW.GAME_OVER && !S.spendPending && S.continuesUsed<MAX_CONTINUES && S.gameBalance>=S.continueCost}
function openSpendModal(context){
	if(!U.spendModal){return}
	S.pendingSpendContext=context;
	S.spendPending=false;
	U.spendError.classList.add('d-none');
	U.spendError.textContent='';
	U.spendConfirm.disabled=false;
	U.spendCancel.disabled=false;
	var projected=Math.max(0,S.gameBalance-context.cost);
	U.spendCopy.innerHTML='<b>'+context.title+'</b><br>'+context.description+'<br><br>Wallet balance (real): '+formatAmount(S.walletBalance)+' '+getTicker()+'<br>Game balance: '+formatAmount(S.gameBalance)+' '+getTicker()+'<br>After spend (game): '+formatAmount(projected)+' '+getTicker()+'<br>Spend now?';
	U.spendModal.classList.remove('d-none');
}
function hideSpendModal(){if(U.spendModal){U.spendModal.classList.add('d-none')}S.pendingSpendContext=null}
function openGameOverModal(note){
	if(!U.gameOverModal){return}
	var left=Math.max(0,MAX_CONTINUES-S.continuesUsed);
	U.gameOverCopy.textContent='Score: '+Math.floor(S.score)+'. Stage: '+S.stage+'. Continues left: '+left+'. '+(note||'');
	U.gameOverModal.classList.remove('d-none');
	if(U.continueBtn){U.continueBtn.disabled=!canContinue()}
}
function hideGameOverModal(){if(U.gameOverModal){U.gameOverModal.classList.add('d-none')}}
function requestEntrySpend(){
	refreshWalletBalanceLikeBomberman();
	if(!ensureSessionBalanceInitialized()){status('Loading balance...','warn');showBalanceLoadingState();return}
	if(!isWalletReady()){status('Open your wallet first before starting.','danger');return}
	if(S.spendPending){return}
	if(S.gameBalance<S.entryCost){status('Not enough Sugar to play','danger');return}
	setFlow(FLOW.AWAIT_START);
	S.pendingSpendAmount=S.entryCost;
	openSpendModal({type:'entry',cost:S.entryCost,title:'Play for 1 Sugar',description:'Starting a run spends '+S.entryCost+' '+getTicker()+'.'});
}
function requestContinueSpend(){
	if(S.spendPending){return}
	refreshWalletBalanceLikeBomberman();
	if(!ensureSessionBalanceInitialized()){status('Loading balance...','warn');showBalanceLoadingState();return}
	if(S.gameBalance<S.continueCost){status('Not enough Sugar to continue','danger');openGameOverModal('Not enough Sugar to continue.');return}
	setFlow(FLOW.AWAIT_CONTINUE);
	S.pendingSpendAmount=S.continueCost;
	hideGameOverModal();
	openSpendModal({type:'continue',cost:S.continueCost,title:'Continue for 1 Sugar',description:'Continue spend is explicit every time. Score and stage progress are preserved.'});
}
function handleSpendCancel(){
	if(S.spendPending){return}
	var wasContinue=S.pendingSpendContext&&S.pendingSpendContext.type==='continue';
	hideSpendModal();
	S.pendingSpendAmount=0;
	overlay(false);
	if(wasContinue){
		setFlow(FLOW.GAME_OVER);
		openGameOverModal('Continue purchase canceled');
		status('Continue purchase canceled','warn');
	}else{
		setFlow(FLOW.IDLE);
		status('Start purchase canceled','warn');
	}
}
function confirmSpend(){
	if(!S.pendingSpendContext||S.spendPending){return}
	var ctx={type:S.pendingSpendContext.type,cost:S.pendingSpendContext.cost};
	S.spendPending=true;
	S.pendingSpendAmount=ctx.cost;
	U.spendConfirm.disabled=true;
	U.spendCancel.disabled=true;
	overlay(true,'Waiting for wallet approval...','Waiting for wallet approval...');
	status('Waiting for wallet approval...','');
	window.setTimeout(function(){
		refreshWalletBalanceLikeBomberman();
		if(!ensureSessionBalanceInitialized()){
			S.spendPending=false;
			U.spendConfirm.disabled=false;
			U.spendCancel.disabled=false;
			U.spendError.classList.remove('d-none');
			U.spendError.textContent='Loading balance...';
			overlay(false);
			hud();
			return;
		}
		if(S.gameBalance<ctx.cost){
			S.spendPending=false;
			U.spendConfirm.disabled=false;
			U.spendCancel.disabled=false;
			U.spendError.classList.remove('d-none');
			U.spendError.textContent=ctx.type==='entry'?'Not enough Sugar to play':'Not enough Sugar to continue';
			overlay(false);
			if(ctx.type==='continue'){
				hideSpendModal();
				S.pendingSpendAmount=0;
				setFlow(FLOW.GAME_OVER);
				openGameOverModal('Continue failed.');
				status('Not enough Sugar to continue','danger');
			}else{
				status('Not enough Sugar to play','danger');
			}
			hud();
			return;
		}
		refreshWalletBalanceLikeBomberman();
		applyConfirmedSpend(ctx.cost);
		S.spendPending=false;
		S.pendingSpendAmount=0;
		hideSpendModal();
		overlay(false);
		if(ctx.type==='entry'){
			beginRun();
			status('Play for 1 Sugar confirmed. Run started.','success');
		}else{
			S.continuesUsed+=1;
			S.lives=2;
			S.p.inv=2.2;
			S.combo=1;
			S.cc=0;
			S.over=false;
			S.pause=false;
			S.run=true;
			setFlow(FLOW.RESUMING);
			hideGameOverModal();
			setFlow(FLOW.IN_RUN);
			status('Run resumed','success');
			ticker('Run resumed','warn');
		}
		hud();
	},320);
}
function bindTouch(id,key,act){var el=document.getElementById(id);
if(!el){return}var d=function(e){e.preventDefault();
if(key){S.touch[key]=true}if(act){act()}};
var u=function(e){e.preventDefault();
if(key){S.touch[key]=false}};
el.addEventListener('touchstart',d,{passive:false});
el.addEventListener('touchend',u,{passive:false});
el.addEventListener('mousedown',d);
el.addEventListener('mouseup',u);
el.addEventListener('mouseleave',u)}
function bind(){function on(id,cb){var el=document.getElementById(id);
if(el){el.addEventListener('click',function(e){e.preventDefault();
cb()})}}on('ppp-open-cabinet-btn',function(){open()});
on('ppp-start-run-btn',function(){requestEntrySpend()});
on('ppp-cancel-entry-btn',function(){if(S.spendPending){return}hideSpendModal();
if(S.flow===FLOW.AWAIT_START){setFlow(FLOW.IDLE)}
status('Start purchase canceled','warn')});
on('ppp-close-cabinet-btn',function(){close()});
on('ppp-pause-btn',function(){pause(true)});
on('ppp-resume-btn',function(){pause(false)});
on('ppp-newrun-btn',function(){requestEntrySpend()});
on('ppp-exit-btn',function(){close()});
if(U.ovp){U.ovp.addEventListener('click',function(e){e.preventDefault();
if(S.flow===FLOW.GAME_OVER){requestContinueSpend()}else{requestEntrySpend()}})}if(U.ovs){U.ovs.addEventListener('click',function(e){e.preventDefault();
close()})}
on('ppp-spend-cancel',function(){handleSpendCancel()});
on('ppp-spend-confirm',function(){confirmSpend()});
on('ppp-continue-btn',function(){requestContinueSpend()});
on('ppp-quit-btn',function(){hideGameOverModal();
setFlow(FLOW.RUN_ENDED);
status('Run ended.','warn');
overlay(true,'Run Ended','Play for 1 Sugar to start again.')});
bindTouch('ppp-touch-up','up');
bindTouch('ppp-touch-down','down');
bindTouch('ppp-touch-left','left');
bindTouch('ppp-touch-right','right');
bindTouch('ppp-touch-shoot',null,function(){shoot()});
bindTouch('ppp-touch-bomb',null,function(){bomb()});
bindTouch('ppp-touch-pause',null,function(){pause(!S.pause)});

window.addEventListener('keydown',function(e){S.keys[e.code]=true;
if(e.code==='Space'){S.holdFire=true;
shoot();
e.preventDefault()}if(e.code==='KeyE'){if(!S.holdBomb){bomb()}S.holdBomb=true;
e.preventDefault()}if(e.code==='KeyP'||e.code==='Escape'){pause(!S.pause);
e.preventDefault()}if(e.code==='Enter'){if(U.spendModal&&!U.spendModal.classList.contains('d-none')&&!S.spendPending){confirmSpend();
e.preventDefault()}else if(U.gameOverModal&&!U.gameOverModal.classList.contains('d-none')&&canContinue()){requestContinueSpend();
e.preventDefault()}}});

window.addEventListener('keyup',function(e){S.keys[e.code]=false;
if(e.code==='Space'){S.holdFire=false}if(e.code==='KeyE'){S.holdBomb=false}});
if(U.canvasWrap){U.canvasWrap.addEventListener('contextmenu',function(e){if(S.flow!==FLOW.IN_RUN&&S.flow!==FLOW.PAUSED){return}
e.preventDefault();
pause(!S.pause)})}}
function chars(){if(!U.ch){return}U.ch.innerHTML='';
for(var i=0;
i<C.length;
i++){(function(c){var b=document.createElement('button');
b.type='button';
b.className='btn '+(S.char===c.id?'btn-warning':'btn-outline-info')+' ppp-btn';
b.textContent=c.name+' - '+c.perk;
b.addEventListener('click',function(){S.char=c.id;
save();
chars();
status(c.name+' selected. Ready for plaza panic.','')});
U.ch.appendChild(b)})(C[i])}}
function load(){var d={high:0,char:C[0].id};
try{var r=window.localStorage.getItem(KEY);
if(!r){return d}var p=JSON.parse(r),ok=C.some(function(c){return c.id===p.char});
return{high:p.high||0,char:ok?p.char:C[0].id}}catch(e){return d}} function save(){try{window.localStorage.setItem(KEY,JSON.stringify({high:S.high,char:S.char}))}catch(e){}}
function attach(root){U.root=document.getElementById(root||'ppp-root');
if(!U.root){return false}U.launch=document.getElementById('ppp-launch');
U.arc=document.getElementById('ppp-arcade');
U.status=document.getElementById('ppp-status');
U.ticker=document.getElementById('ppp-ticker');
U.canvas=document.getElementById('ppp-canvas');
U.ov=document.getElementById('ppp-overlay');
U.ovt=document.getElementById('ppp-overlay-title');
U.ovc=document.getElementById('ppp-overlay-copy');
U.ovp=document.getElementById('ppp-overlay-primary');
U.ovs=document.getElementById('ppp-overlay-secondary');
U.ch=document.getElementById('ppp-character-list');
U.walletBalance=document.getElementById('ppp-wallet-balance');
U.gameBalance=document.getElementById('ppp-game-balance');
U.sessionSpent=document.getElementById('ppp-session-spent');
U.runState=document.getElementById('ppp-run-state');
U.continuesUsed=document.getElementById('ppp-continues-used');
U.playPaid=document.getElementById('ppp-start-run-btn');
U.spendModal=document.getElementById('ppp-spend-modal');
U.spendCopy=document.getElementById('ppp-spend-copy');
U.spendError=document.getElementById('ppp-spend-error');
U.spendCancel=document.getElementById('ppp-spend-cancel');
U.spendConfirm=document.getElementById('ppp-spend-confirm');
U.gameOverModal=document.getElementById('ppp-gameover-modal');
U.gameOverCopy=document.getElementById('ppp-gameover-copy');
U.continueBtn=document.getElementById('ppp-continue-btn');
U.hScore=document.getElementById('ppp-hud-score');
U.hHigh=document.getElementById('ppp-hud-high-score');
U.hLives=document.getElementById('ppp-hud-lives');
U.hCombo=document.getElementById('ppp-hud-combo');
U.hBombs=document.getElementById('ppp-hud-bombs');
U.hTimer=document.getElementById('ppp-hud-timer');
U.hStage=document.getElementById('ppp-hud-stage');
U.hZone=document.getElementById('ppp-hud-zone');
U.hSecrets=document.getElementById('ppp-hud-secrets');
if(!U.canvas){return false}U.canvas.width=W;
U.canvas.height=H;
U.ctx=U.canvas.getContext('2d');
return true}
function init(root){if(S.in){return}if(!attach(root)){return}var p=load();
S.high=p.high;
S.char=p.char;
refreshWalletBalanceLikeBomberman();
ensureSessionBalanceInitialized();
chars();
bind();
hud();
overlay(true,'POLYGON PLAZA PANIC','Launch a fast score run. Shoot, bomb, chain, and uncover hidden routes.');
status('Cabinet idle. Launch when ready.','');
ticker('A lost 1999-style cabinet hums to life.','');
S.in=true;
S.vis=false;
window.requestAnimationFrame(loop)}
function vis(name){S.vis=name==='games-polygon-plaza-panic';
if(!S.vis&&S.run){pause(true)}
if(S.vis){hud()}}
function reset(){S.run=false;
S.pause=false;
S.open=false;
S.over=false;
setFlow(FLOW.IDLE);
S.runId=0;
S.score=0;
S.continuesUsed=0;
S.sessionSugarSpent=0;
S.startingSessionBalance=0;
S.t0=0;
resetTransient();
if(U.arc){U.arc.classList.add('d-none')}if(U.launch){U.launch.classList.remove('d-none')}overlay(true,'POLYGON PLAZA PANIC','Session reset. Pick loadout and start instantly.');
status('Session reset. Wallet systems untouched.','');
ticker('Reset complete. One more run?','');
S.gameBalanceInitialized=false;
refreshWalletBalanceLikeBomberman();
ensureSessionBalanceInitialized();
hud()}
window.PolygonPlazaPanicGameModule={init:init,onPanelVisibilityChange:vis,resetSession:reset,handleActionButton:shoot};

})();



