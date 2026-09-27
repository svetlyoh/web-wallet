import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=resolve('.');
const server=createServer(async(req,res)=>{
  const path=resolve(root,`.${new URL(req.url,'http://localhost').pathname}`);
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return}
  try{const data=await readFile(path);res.setHeader('Content-Type',extname(path)==='.html'?'text/html':'text/javascript');res.end(data)}
  catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,...(process.platform==='win32'&&chrome?{executablePath:chrome}:{})});
try{
  await mkdir('test-results',{recursive:true});
  const page=await browser.newPage({viewport:{width:1100,height:800}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/test/harness.html`);
  const gear=page.locator('svet-gear-engine-v1');
  await gear.getByRole('button',{name:/Activity gears/}).waitFor();
  await page.waitForFunction(()=>document.querySelector('svet-gear-engine-v1')?.activity.unknown===false);
  await page.screenshot({path:'test-results/idle.png',fullPage:true});
  const before=await page.evaluate(()=>fixture.frames);await page.waitForTimeout(220);
  assert.equal(await page.evaluate(()=>fixture.frames),before,'idle must have no RAF');
  await page.evaluate(()=>fixture.rows([{key:'agent:main:a',agentId:'main',label:'Research task',hasActiveRun:true,status:'running',inputTokens:1200,outputTokens:200}]));
  await page.waitForFunction(()=>document.querySelector('svet-gear-engine-v1').activity.mask===2);
  await page.waitForFunction(()=>fixture.frames>2);
  await page.screenshot({path:'test-results/active.png',fullPage:true});
  await gear.getByRole('button',{name:/Activity gears/}).focus();await page.keyboard.press('Enter');
  await gear.getByRole('dialog').waitFor({state:'visible'});
  assert.match(await gear.getByRole('dialog').innerText(),/does not confirm external channel delivery/);
  await page.keyboard.press('Escape');await gear.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('svet-gear-engine-v1').activity.mask===0);
  await page.waitForTimeout(250); // Confirmed stop is immediate; decorative coast settles within 220 ms.
  const stopped=await page.evaluate(()=>fixture.frames);await page.waitForTimeout(220);
  assert.equal(await page.evaluate(()=>fixture.frames),stopped);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>fixture.rows([{key:'agent:main:a',agentId:'main',label:'Research task',hasActiveRun:true,status:'running'}]));
  await page.waitForFunction(()=>document.querySelector('svet-gear-engine-v1').activity.mask===2);
  const reduced=await page.evaluate(()=>fixture.frames);await page.waitForTimeout(220);
  assert.equal(await page.evaluate(()=>fixture.frames),reduced);
  await page.setViewportSize({width:320,height:640});await page.evaluate(()=>document.body.classList.add('light'));
  await page.screenshot({path:'test-results/narrow-light.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'320px overflow');
  const tightGear=await page.evaluate(()=>{
    document.querySelector('#accessory').style.width='80px';
    const instrument=document.querySelector('svet-gear-engine-v1').shadowRoot.querySelector('.instrument');
    const {width,height}=instrument.getBoundingClientRect();
    const svg=instrument.querySelector('svg').getBoundingClientRect();
    const style=getComputedStyle(instrument);
    return {width,height,svgWidth:svg.width,svgHeight:svg.height,cssWidth:style.width,cssHeight:style.height};
  });
  assert.ok(tightGear.width<=80,'gear must fit an 80px accessory slot');
  assert.ok(Math.abs(tightGear.width-tightGear.height)<1,`gear must keep its square aspect ratio: ${JSON.stringify(tightGear)}`);
  await page.evaluate(()=>fixture.access(false));
  await page.waitForFunction(()=>document.querySelector('svet-gear-engine-v1').activity.rows.length===0);
  await page.evaluate(()=>fixture.dispose());assert.equal(await page.evaluate(()=>fixture.subscriptions),0);
  assert.deepEqual(errors,[]);console.log('Native plugin mount, run activity, stop, keyboard, idle RAF, reduced motion, 320px, scope erasure and disposal passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
