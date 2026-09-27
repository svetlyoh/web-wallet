import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
if (process.env.CI !== 'true' || !process.env.OPENCLAW_STATE_DIR?.endsWith('gear-engine-openclaw')) {
  throw new Error('This test must run in the isolated CI Gateway.');
}
execFileSync('openclaw',['gateway','call','sessions.create','--params',JSON.stringify({key:'agent:main:gear-smoke',agentId:'main',label:'Gear Engine install smoke'}),'--json'],{stdio:'inherit'});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
  await mkdir('test-results',{recursive:true});
  await page.goto('http://127.0.0.1:18799/chat?session=agent%3Amain%3Agear-smoke#token=gear-engine-ci-fixture-token');
  await page.locator('svet-gear-engine-v1').getByRole('button',{name:/Activity gears/}).waitFor({timeout:60000});
  await page.locator('svet-gear-engine-v1').getByRole('button',{name:/Activity gears/}).click();
  await page.locator('svet-gear-engine-v1').getByRole('dialog').waitFor();
  await page.screenshot({path:'test-results/live-openclaw.png',fullPage:true});
  console.log('Real OpenClaw browser loaded the installed native plugin and opened its details.');
} catch(error) {
  await page.screenshot({path:'test-results/live-openclaw-failure.png',fullPage:true});
  console.log(await page.locator('body').innerText()); console.log(errors);
  throw error;
} finally {await browser.close();}
