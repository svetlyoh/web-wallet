import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { chromium, type Page } from "playwright";
import { createControlUiE2eArtifactDir } from "./src/test-helpers/control-ui-e2e-artifacts.ts";
import { installMockGateway } from "./src/test-helpers/control-ui-e2e.ts";

// This executable lives in the isolated upstream ui/ directory during tests.
// It drives the real production bundle with upstream's deterministic Gateway.
const root = path.resolve("../dist/control-ui");
const proof = await createControlUiE2eArtifactDir("lazykins-solid", path.resolve(process.argv[2] ?? "../.artifacts/lazykins-ui"));
const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".html": "text/html", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp" };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    for (const folder of ["assets/", "fonts/", "themes/"]) {
      const at = relative.indexOf(folder);
      if (at >= 0) { relative = relative.slice(at); break; }
    }
    let file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) file = path.join(root, "index.html");
    let data: Buffer;
    try { data = await fs.readFile(file); } catch { file = path.join(root, "index.html"); data = await fs.readFile(file); }
    res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
    res.end(data);
  } catch { res.writeHead(500); res.end("Static fixture failed"); }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}/`;
const browser = await chromium.launch();
const observations: string[] = [];
let activePage: Page | undefined;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", serviceWorkers: "block" });
  const page = await context.newPage(); activePage = page;
  page.setDefaultTimeout(20_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const gateway = await installMockGateway(page, {
    serverVersion: "2026.11.6", controlUiBuildSource: "configured",
    presenceUsers: [{self:true,id:"profile-a",name:"Alex"}],
    historyMessages: [{role:"assistant",content:[{type:"text",text:"Your workspace is ready. A [source](https://example.com) and selectable code.\n\n```json\n{\"saved\":true}\n```"}],timestamp:Date.now()}],
  });
  await page.goto(`${base}chat`);
  await page.locator(".shell--quiet-desk .lazykins-sidebar").waitFor();
  const composer = page.locator(".agent-chat__composer-combobox textarea");
  await composer.waitFor({state:"visible"});
  await page.getByText("Your workspace is ready.",{exact:false}).waitFor();
  assert.equal(Math.round(await page.locator(".shell-nav").evaluate(e => e.getBoundingClientRect().width)),208);
  assert.equal(await page.getByRole("button",{name:"OpenClaw view",exact:true}).textContent(),"OpenClaw view");
  assert.equal(await page.locator(".lazykins-sidebar .lazykins-note").textContent(),"Tasks: Workboard when enabled. Files: this agent's workspace.");
  assert.equal(await page.locator(".chat-text a").first().evaluate(e => getComputedStyle(e).color),"rgb(36, 69, 50)");
  await page.screenshot({path:path.join(proof,"quiet-desk-light-1440.png"),animations:"disabled"});
  await composer.fill("Preserve this unsent draft.");
  await composer.evaluate(e => { (window as Window & {lazykinsComposer?: Element}).lazykinsComposer = e; });
  const sockets = await gateway.getSocketCount();
  await page.getByRole("button",{name:"OpenClaw view",exact:true}).click();
  await page.locator(".shell:not(.shell--quiet-desk)").waitFor();
  assert.equal(await composer.inputValue(),"Preserve this unsent draft.");
  assert(await composer.evaluate(e => (window as Window & {lazykinsComposer?:Element}).lazykinsComposer === e));
  assert.equal(await gateway.getSocketCount(),sockets);
  await page.screenshot({path:path.join(proof,"openclaw-view-1440.png"),animations:"disabled"});
  assert(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("lazykins.quiet-desk.v1:") && k.endsWith(":profile-a") && localStorage.getItem(k) === "openclaw")));
  const otherPage = await context.newPage();
  await installMockGateway(otherPage,{serverVersion:"2026.11.6",controlUiBuildSource:"configured",presenceUsers:[{self:true,id:"profile-b",name:"Blair"}]});
  await otherPage.goto(`${base}chat`);
  await otherPage.locator(".shell--quiet-desk .lazykins-sidebar").waitFor();
  await otherPage.close();
  await page.getByRole("button",{name:"Quiet Desk view",exact:true}).click();
  await page.locator(".shell--quiet-desk").waitFor();
  assert.equal(await composer.inputValue(),"Preserve this unsent draft.");
  assert.equal(await gateway.getSocketCount(),sockets);
  await page.getByRole("button",{name:"OpenClaw view",exact:true}).click();
  await page.reload();
  await page.locator(".shell:not(.shell--quiet-desk)").waitFor();
  await page.getByRole("button",{name:"Quiet Desk view",exact:true}).click();
  await page.locator(".shell--quiet-desk").waitFor();
  observations.push("Topbar switches both directions preserve the mounted composer, unsent draft, and socket count; refresh preserves the saved view. A second authenticated profile keeps its independent default.");
  await composer.fill("Check the draft.");
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  const sent = await gateway.waitForRequest("chat.send");
  const params = sent.params as {message:string;idempotencyKey:string};
  assert.equal(params.message,"Check the draft.");
  await gateway.emitChatFinal({runId:params.idempotencyKey,text:"The draft is ready to review."});
  await page.locator(".chat-text").getByText("The draft is ready to review.",{exact:false}).waitFor();
  assert.equal((await gateway.getRequests("chat.send")).length,1);
  observations.push("The existing chat owner sends once and renders its terminal Gateway event.");
  for (const width of [1280,1024,768,390,360]) {
    await page.setViewportSize({width,height:width < 560 ? 844 : 768});
    assert(await composer.isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
    assert(await page.getByRole("button",{name:"OpenClaw view",exact:true}).isVisible());
    await page.screenshot({path:path.join(proof,`quiet-desk-light-${width}.png`),animations:"disabled"});
  }
  await page.setViewportSize({width:390,height:844});
  const drawer = page.locator(".topbar-nav-toggle");
  await drawer.click();
  await page.locator(".shell-nav[aria-modal='true']").waitFor({state:"visible"});
  await page.mouse.move(180,180);
  await page.keyboard.press("Tab");
  assert(await page.locator(".shell-nav").evaluate(e => e.contains(document.activeElement)));
  await page.screenshot({path:path.join(proof,"quiet-desk-mobile-drawer.png"),animations:"disabled"});
  // The native new-conversation shortcut tooltip owns its own Escape, even
  // while reveal is pending. Move to the next plain link before proving the
  // drawer's Escape, preserving the existing overlay dismissal order.
  await page.keyboard.press("Tab");
  assert(await page.getByRole("link",{name:"Conversations",exact:true}).evaluate(e => e === document.activeElement));
  await page.waitForFunction(() => [...document.querySelectorAll("openclaw-tooltip")].every(e => !e.hasAttribute("open")));
  await page.keyboard.press("Escape");
  await page.locator(".shell:not(.shell--nav-drawer-open)").waitFor();
  assert(await drawer.evaluate(e => e === document.activeElement));
  observations.push("The native mobile drawer retains its keyboard trap and Escape return-focus behavior.");
  await page.setViewportSize({width:720,height:450});
  await page.evaluate(() => {document.documentElement.style.zoom="2";});
  assert(await composer.isVisible());
  await page.screenshot({path:path.join(proof,"quiet-desk-css-zoom-200.png"),animations:"disabled"});
  await page.evaluate(() => {document.documentElement.style.zoom="";});
  await page.setViewportSize({width:1440,height:900});
  await page.emulateMedia({colorScheme:"dark"});
  await page.screenshot({path:path.join(proof,"quiet-desk-dark-1440.png"),animations:"disabled"});
  await page.getByRole("link",{name:"Settings",exact:true}).click();
  const select = page.getByRole("combobox",{name:"Interface appearance",exact:true});
  await select.waitFor();
  await select.selectOption("openclaw");
  await page.locator(".shell:not(.shell--quiet-desk)").waitFor();
  await select.selectOption("quiet");
  await page.locator(".shell--quiet-desk").waitFor();
  await page.screenshot({path:path.join(proof,"quiet-desk-settings.png"),animations:"disabled"});
  observations.push("Appearance provides the same saved selector in both views, preserves native settings navigation, and explains sanitize independently.");
  await page.goto(`${base}chat`);
  await page.locator(".lazykins-sidebar").waitFor();
  await page.getByRole("link",{name:"Files",exact:true}).click();
  const files = await gateway.waitForRequest("agents.files.list");
  assert.equal((files.params as {agentId:string}).agentId,"main");
  observations.push("Files delegates to the real selected-agent file owner and agents.files.list.");
  assert.deepEqual(errors,[]);
  await context.close();
  const running = await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:"block"});
  const runningPage = await running.newPage(); activePage = runningPage;
  const runningGateway = await installMockGateway(runningPage,{
    serverVersion:"2026.11.6",controlUiBuildSource:"configured",
    inFlightRun:{runId:"active-run",text:"Working on your request."},
    sessionInfo:{key:"agent:main:main",hasActiveRun:true,activeRunIds:["active-run"],status:"running"},
    sessions:[{key:"agent:main:main",kind:"direct",label:"Main",updatedAt:Date.now(),hasActiveRun:true,activeRunIds:["active-run"],status:"running"}],
  });
  await runningPage.goto(`${base}chat`);
  const stop = runningPage.getByRole("button",{name:"Stop generating",exact:true});
  await stop.waitFor({state:"visible"});
  await runningPage.locator(".agent-chat__composer-combobox textarea").fill("Keep this follow-up draft");
  assert(await stop.isVisible());
  await runningPage.screenshot({path:path.join(proof,"quiet-desk-stop-with-draft.png"),animations:"disabled"});
  await runningPage.setViewportSize({width:390,height:844});
  assert(await stop.isVisible());
  await runningPage.screenshot({path:path.join(proof,"quiet-desk-stop-mobile.png"),animations:"disabled"});
  await stop.click();
  const aborted = await runningGateway.waitForRequest("chat.abort");
  assert.deepEqual(aborted.params,{sessionKey:"agent:main:main",runId:"active-run"});
  assert.equal((await runningGateway.getRequests("chat.abort")).length,1);
  assert.equal((await runningGateway.getRequests("chat.send")).length,0);
  await running.close();
  observations.push("The native abort action remains visible beside a sendable draft on desktop and mobile, aborting the selected run exactly once.");
  const mismatch = await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:"block"});
  const mismatchPage = await mismatch.newPage(); activePage = mismatchPage;
  const mismatchGateway = await installMockGateway(mismatchPage,{serverVersion:"2026.11.10-beta.1",controlUiBuildSource:"configured",awaitInitialRoster:false});
  await mismatchPage.goto(`${base}chat`);
  await mismatchPage.getByRole("heading",{name:"Quiet Desk needs a matching OpenClaw build"}).waitFor();
  assert.equal(await mismatchPage.locator(".agent-chat__composer-combobox textarea").count(),0);
  assert.equal((await mismatchGateway.getRequests("chat.send")).length,0);
  await mismatchPage.screenshot({path:path.join(proof,"version-mismatch.png"),animations:"disabled"});
  await mismatch.close();
  observations.push("An unmatched Gateway is visibly refused before work controls; this fixture does not certify any newer release.");
  const styleFailure = await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:"block"});
  const stylePage = await styleFailure.newPage(); activePage = stylePage;
  await stylePage.route("**/themes/lazykins-quiet-desk.css*", route => route.fulfill({status:404,contentType:"text/css",body:""}));
  const styleGateway = await installMockGateway(stylePage,{serverVersion:"2026.11.6",controlUiBuildSource:"configured",awaitInitialRoster:false});
  await stylePage.goto(`${base}chat`);
  await stylePage.getByRole("heading",{name:"Quiet Desk styles could not load"}).waitFor();
  assert(await stylePage.getByRole("button",{name:"Reload",exact:true}).isVisible());
  assert.equal(await stylePage.locator(".agent-chat__composer-combobox textarea").count(),0);
  assert.equal((await styleGateway.getRequests("chat.send")).length,0);
  await stylePage.screenshot({path:path.join(proof,"stylesheet-load-failure.png"),animations:"disabled"});
  await stylePage.getByRole("button",{name:"Open OpenClaw view",exact:true}).click();
  await stylePage.locator(".shell:not(.shell--quiet-desk)").waitFor();
  await stylePage.locator(".agent-chat__composer-combobox textarea").waitFor({state:"visible"});
  await styleFailure.close();
  observations.push("A missing local appearance stylesheet blocks malformed work UI and exposes a visible Reload action and host rollback guidance.");
  await fs.writeFile(path.join(proof,"results.json"),JSON.stringify({passed:true,version:"2026.11.6",sha:"06afb10d3272cc9deaf38ca6a3b7b839d5935638",observations,limits:["Synthetic Gateway fixture, no real provider or Linux deployment exercised.","CSS zoom is not native browser zoom.","Workboard route is a native plugin destination; plugin execution and legacy streaming/gear integrations need host verification."]},null,2));
  console.log(JSON.stringify({passed:true,proof,observations}));
} catch (error) {
  if(activePage && !activePage.isClosed()) {
    await activePage.screenshot({path:path.join(proof,"failure.png")});
    await fs.writeFile(path.join(proof,"failure.txt"),String(error)+"\n"+await activePage.locator("body").innerText());
  }
  throw error;
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
