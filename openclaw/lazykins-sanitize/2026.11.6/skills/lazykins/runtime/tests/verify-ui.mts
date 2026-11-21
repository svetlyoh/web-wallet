import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { chromium, type Page } from "playwright";
import { createControlUiE2eArtifactDir } from "./src/test-helpers/control-ui-e2e-artifacts.ts";
import { defaultControlUiFeatureMethods } from "./src/test-helpers/control-ui-e2e-defaults.ts";
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
    for (const folder of ["assets/", "fonts/", "themes/", "command-deck/"]) {
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
const watchdog = setTimeout(async () => {
  console.error("Mode and crew verification exceeded 210 seconds");
  if (activePage && !activePage.isClosed()) {
    await fs.writeFile(path.join(proof,"timeout.txt"),activePage.url()+"\n"+await activePage.locator("body").innerText({timeout:5000}).catch(String)).catch(()=>{});
    await activePage.screenshot({path:path.join(proof,"timeout.png"),timeout:5000}).catch(()=>{});
  }
  process.exit(1);
},210_000);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", serviceWorkers: "block" });
  const page = await context.newPage(); activePage = page;
  page.setDefaultTimeout(20_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const gateway = await installMockGateway(page, {
    serverVersion: "2026.11.6", controlUiBuildSource: "configured",
    presenceUsers: [{self:true,id:"profile-a",name:"Alex"}],
    featureMethods:[...defaultControlUiFeatureMethods,"agents.list","agents.files.get"],
    historyMessages: [{role:"assistant",content:[{type:"text",text:"Your workspace is ready. A [source](https://example.com) and selectable code.\n\n```json\n{\"saved\":true}\n```"}],timestamp:Date.now()}],
  });
  await page.goto(`${base}chat`);
  const composer = page.locator(".agent-chat__composer-combobox textarea");
  await composer.waitFor({state:"visible"});
  await page.locator(".shell:not(.shell--quiet-desk):not(.shell--command-deck)").waitFor();
  await page.getByRole("button",{name:"Enter Quiet Desk",exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Apps",exact:true}).count(),0);
  const quietIcon=page.getByRole("button",{name:"Enter Quiet Desk",exact:true}).locator("svg");
  const commandIcon=page.getByRole("button",{name:"Enter Command Deck",exact:true}).locator("svg");
  assert.equal(await quietIcon.count(),1);
  assert.equal(await commandIcon.count(),1);
  assert.equal(await commandIcon.getAttribute("data-lazykins-icon"),"command-prompt");
  assert.equal(await commandIcon.locator("path").getAttribute("d"),"m7 9 3 3-3 3M13 15h4");
  assert.notEqual(await quietIcon.innerHTML(),await commandIcon.innerHTML());
  await page.screenshot({path:path.join(proof,"openclaw-fresh-1440.png"),animations:"disabled"});
  await composer.fill("Preserve this unsent draft.");
  await composer.evaluate(e => { (window as Window & {lazykinsComposer?: Element}).lazykinsComposer = e; });
  const sockets = await gateway.getSocketCount();
  let introSeen=false;
  for (const [button,selector] of [
    ["Enter Quiet Desk",".shell--quiet-desk"],
    ["Enter Command Deck",".shell--command-deck"],
    ["Exit Command Deck",".shell:not(.shell--quiet-desk):not(.shell--command-deck)"],
    ["Enter Command Deck",".shell--command-deck"],
    ["Enter Quiet Desk",".shell--quiet-desk"],
    ["Exit Quiet Desk",".shell:not(.shell--quiet-desk):not(.shell--command-deck)"],
  ]) {
    await page.getByRole("button",{name:button,exact:true}).click();
    await page.locator(selector).waitFor();
    if(selector === ".shell--command-deck") await page.locator(".command-deck-queue:visible").getByText("Priority queue unavailable.",{exact:false}).waitFor();
    if(selector === ".shell--command-deck" && !introSeen) {
      await page.getByRole("heading",{name:"Meet Helm",exact:true}).waitFor();
      await page.getByText("Not installed - proposed template",{exact:true}).first().waitFor();
      await page.screenshot({path:path.join(proof,"command-deck-crew-proposed-1440.png"),animations:"disabled"});
      for(const method of ["agents.create","templates.add.plan","templates.add.apply","config.patch"]) assert.equal((await gateway.getRequests(method)).length,0);
      await page.getByRole("button",{name:"Not now",exact:true}).click();
      await page.getByRole("heading",{name:"Meet Helm",exact:true}).waitFor({state:"hidden"});
      introSeen=true;
    }
    assert.equal(await composer.inputValue(),"Preserve this unsent draft.");
    assert(await composer.evaluate(e => (window as Window & {lazykinsComposer?:Element}).lazykinsComposer === e));
    assert.equal(await gateway.getSocketCount(),sockets);
    for(const method of ["chat.send","sessions.create","commanddesk.tasks.create","commanddesk.voice.control"]) assert.equal((await gateway.getRequests(method)).length,0,method);
  }
  assert.equal((await gateway.getRequests("commanddesk.tasks.list")).length,0);
  observations.push("Fresh profiles start in native OpenClaw. All three modes switch through lower-left entries and top-right exits without replacing the composer, losing its draft, creating sessions, sending, changing sanitize, or opening another socket.");
  await page.getByRole("button",{name:"Enter Quiet Desk",exact:true}).click();
  await page.locator(".shell--quiet-desk .lazykins-sidebar").waitFor();
  await page.getByText("Your workspace is ready.",{exact:false}).waitFor();
  await page.waitForFunction(() => Math.round(document.querySelector(".shell-nav")!.getBoundingClientRect().width) === 208);
  assert.equal(Math.round(await page.locator(".shell-nav").evaluate(e => e.getBoundingClientRect().width)),208);
  assert.equal(await page.getByRole("button",{name:"Exit Quiet Desk",exact:true}).textContent(),"Exit Quiet Desk");
  assert.equal(await page.locator(".lazykins-sidebar .lazykins-note").textContent(),"Tasks: Workboard when enabled. Files: this agent's workspace.");
  assert.equal(await page.locator(".chat-text a").first().evaluate(e => getComputedStyle(e).color),"rgb(36, 69, 50)");
  await page.screenshot({path:path.join(proof,"quiet-desk-light-1440.png"),animations:"disabled"});
  assert(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("lazykins.quiet-desk.v1:") && k.endsWith(":profile-a") && localStorage.getItem(k) === "quiet")));
  const otherPage = await context.newPage();
  await installMockGateway(otherPage,{serverVersion:"2026.11.6",controlUiBuildSource:"configured",presenceUsers:[{self:true,id:"profile-b",name:"Blair"}]});
  await otherPage.goto(`${base}chat`);
  await otherPage.locator(".shell:not(.shell--quiet-desk):not(.shell--command-deck)").waitFor();
  await otherPage.getByRole("button",{name:"Enter Command Deck",exact:true}).waitFor();
  await otherPage.close();
  await page.getByRole("button",{name:"Exit Quiet Desk",exact:true}).click();
  await page.reload();
  await page.locator(".shell:not(.shell--quiet-desk):not(.shell--command-deck)").waitFor();
  await page.getByRole("button",{name:"Enter Quiet Desk",exact:true}).click();
  await page.locator(".shell--quiet-desk").waitFor();
  observations.push("The shared v1 profile preference persists across refresh and isolates another authenticated profile; pre-existing quiet/openclaw values retain their meaning.");
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
    assert(await page.getByRole("button",{name:"Exit Quiet Desk",exact:true}).isVisible());
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
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`${base}chat`);
  await page.getByRole("link",{name:"Conversations",exact:true}).click();
  const back = page.getByRole("link",{name:"Back to chat",exact:true});
  await back.waitFor({state:"visible"});
  assert((await back.boundingBox())!.height >= 44);
  await page.screenshot({path:path.join(proof,"quiet-desk-conversations-back-desktop.png"),animations:"disabled"});
  await back.click();
  await composer.waitFor({state:"visible"});
  for(const width of [390,360]) {
    await page.setViewportSize({width,height:844});
    await page.goto(`${base}sessions`);
    await back.waitFor({state:"visible"});
    assert((await back.boundingBox())!.height >= 44);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1));
    await page.screenshot({path:path.join(proof,`quiet-desk-conversations-back-${width}.png`),animations:"disabled"});
    await back.click();
    await composer.waitFor({state:"visible"});
  }
  observations.push("Quiet Desk and Command Deck have distinct icons (moon and command prompt) with no Apps button above them. Conversations exposes a 44px Back to chat link on desktop and 390/360px phones, using native chat routing without browser history.");
  assert.deepEqual(errors,[]);
  await context.close();
  const command = await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block"});
  const commandPage = await command.newPage(); activePage=commandPage;
  const queueMethods=["list","create","priority","cancel","retry"].map(name=>`commanddesk.tasks.${name}`);
  const taskCaps={priority:true,cancel:true,retry:false,pause:false,resume:false};
  let taskA={id:"job-a",title:"Inspect draft",sessionKey:"agent:main:main",message:"Inspect the synthetic draft",priority:2,version:1,status:"queued",createdAtMs:Date.now(),updatedAtMs:Date.now(),scheduleAtMs:null,timezone:"UTC",capabilities:taskCaps};
  const queueResult=(revision:number,tasks:unknown[])=>({schemaVersion:1,revision,tasks,capabilities:{concurrency:1,scope:"Command Deck-owned jobs",priority:true,pause:false,stopRunning:false,schedulerEnabled:true}});
  const commandGateway=await installMockGateway(commandPage,{
    serverVersion:"2026.11.6",controlUiBuildSource:"configured",
    featureMethods:[...defaultControlUiFeatureMethods,...queueMethods],
    sessions:[{key:"agent:main:main",label:"Main",kind:"direct",updatedAt:Date.now()},{key:"agent:main:other",label:"Research",kind:"direct",updatedAt:Date.now()-1000}],
    historyMessages:[{role:"assistant",content:[{type:"text",text:"Command Deck synthetic workspace."}]}],
    methodResponses:{"commanddesk.tasks.list":queueResult(1,[taskA]),"commanddesk.tasks.priority":taskA},
  });
  await commandPage.goto(`${base}chat`);
  await commandPage.getByRole("button",{name:"Enter Command Deck",exact:true}).waitFor();
  assert.equal((await commandGateway.getRequests("commanddesk.tasks.list")).length,0);
  const commandSockets=await commandGateway.getSocketCount();
  const queueSurface=commandPage.locator(".command-deck-queue:visible");
  await commandPage.getByRole("button",{name:"Enter Command Deck",exact:true}).click();
  await commandPage.locator(".shell--command-deck").waitFor();
  await commandGateway.waitForRequest("commanddesk.tasks.list");
  await commandPage.locator(".command-deck-task:visible").getByText("Inspect draft",{exact:true}).waitFor();
  assert.equal(Math.round(await commandPage.locator(".shell-nav").evaluate(e=>e.getBoundingClientRect().width)),256);
  assert.equal(Math.round(await commandPage.locator(".command-deck-rail").evaluate(e=>e.getBoundingClientRect().width)),56);
  assert.equal(Math.round(await commandPage.locator(".command-deck-queue:visible").evaluate(e=>e.getBoundingClientRect().width)),280);
  assert.equal((await commandGateway.getRequests("chat.send")).length,0);
  assert.equal((await commandGateway.getRequests("sessions.create")).length,0);
  assert.equal((await commandGateway.getRequests("commanddesk.tasks.create")).length,0);
  await commandPage.screenshot({path:path.join(proof,"command-deck-1440.png"),animations:"disabled"});
  taskA={...taskA,priority:1,version:2};
  await commandGateway.setMethodResponse("commanddesk.tasks.list",queueResult(2,[taskA]));
  await commandGateway.setMethodResponse("commanddesk.tasks.priority",taskA);
  await commandPage.getByRole("combobox",{name:"Priority for Inspect draft",exact:true}).selectOption("1");
  const reprioritized=await commandGateway.waitForRequest("commanddesk.tasks.priority");
  assert.deepEqual(reprioritized.params,{id:"job-a",expectedVersion:1,priority:1});
  await queueSurface.getByText("Queue or schedule work",{exact:true}).click();
  await commandPage.getByRole("textbox",{name:"Task title",exact:true}).fill("Scheduled preview");
  await commandPage.getByRole("textbox",{name:"Task instruction",exact:true}).fill("Prepare a synthetic local preview.");
  await commandPage.getByRole("combobox",{name:"Schedule preset",exact:true}).selectOption("custom");
  await commandPage.getByRole("textbox",{name:"Schedule timezone",exact:true}).fill("UTC");
  await queueSurface.getByLabel("Custom schedule time",{exact:true}).fill("2030-06-01T09:00");
  assert((await queueSurface.locator(".command-deck-schedule-preview").textContent())?.includes("2030"));
  const taskB={...taskA,id:"job-b",title:"Scheduled preview",priority:2,version:1,status:"scheduled",scheduleAtMs:Date.parse("2030-06-01T09:00:00Z")};
  await commandGateway.setMethodResponse("commanddesk.tasks.create",taskB);
  await commandGateway.setMethodResponse("commanddesk.tasks.list",queueResult(3,[taskA,taskB]));
  await commandPage.getByRole("button",{name:"Queue at displayed time",exact:true}).dblclick();
  const created=await commandGateway.waitForRequest("commanddesk.tasks.create");
  const createdParams=created.params as {sessionKey:string;scheduleAtMs:number;timezone:string;idempotencyKey:string};
  assert.equal(createdParams.sessionKey,"agent:main:main");
  assert.equal(createdParams.scheduleAtMs,Date.parse("2030-06-01T09:00:00Z"));
  assert.equal(createdParams.timezone,"UTC");
  assert.match(createdParams.idempotencyKey,/^[0-9a-f-]{36}$/);
  await commandPage.locator(".command-deck-task:visible").getByText("Scheduled preview",{exact:true}).waitFor();
  assert.equal((await commandGateway.getRequests("commanddesk.tasks.create")).length,1);
  const canceled={...taskB,status:"canceled",version:2,capabilities:{...taskCaps,priority:false,cancel:false,retry:true}};
  await commandGateway.setMethodResponse("commanddesk.tasks.cancel",canceled);
  await commandGateway.setMethodResponse("commanddesk.tasks.list",queueResult(4,[taskA,canceled]));
  await commandPage.getByRole("button",{name:"Cancel Scheduled preview",exact:true}).click();
  assert.deepEqual((await commandGateway.waitForRequest("commanddesk.tasks.cancel")).params,{id:"job-b",expectedVersion:1});
  await queueSurface.getByText("CANCELED",{exact:true}).waitFor();
  observations.push("Advertised admin queue methods render a real snapshot, change priority with CAS, schedule the displayed UTC time once despite a double-click, and cancel the exact pending job. Browser fixtures do not execute a model; separate native backend proof owns durable Cron behavior.");
  await commandPage.getByRole("button",{name:"Split with another conversation",exact:true}).click();
  const panes=commandPage.locator(".agent-chat__composer-combobox textarea");
  await commandPage.waitForFunction(()=>document.querySelectorAll(".agent-chat__composer-combobox textarea").length===2);
  await panes.nth(0).fill("Independent left draft");
  await panes.nth(1).fill("Independent right draft");
  await commandPage.evaluate(()=>{(window as Window & {modePanes?:Element[]}).modePanes=[...document.querySelectorAll(".agent-chat__composer-combobox textarea")];});
  await commandPage.screenshot({path:path.join(proof,"command-deck-split-1440.png"),animations:"disabled"});
  for(const button of ["Exit Command Deck","Enter Quiet Desk","Exit Quiet Desk","Enter Command Deck"]){
    console.log("Split mode transition:",button);
    await commandPage.getByRole("button",{name:button,exact:true}).click();
    console.log("Clicked transition:",button);
    const remembered=await commandPage.evaluate(()=>((window as Window & {modePanes?:Element[]}).modePanes || []).map(element=>({connected:element.isConnected,value:(element as HTMLTextAreaElement).value})));
    assert.deepEqual(remembered,[{connected:true,value:"Independent left draft"},{connected:true,value:"Independent right draft"}]);
  }
  assert.equal(await commandGateway.getSocketCount(),commandSockets);
  assert.equal((await commandGateway.getRequests("sessions.create")).length,0);
  assert.equal((await commandGateway.getRequests("chat.send")).length,0);
  observations.push("Explicit Split reuses two native chat panes. Their retained DOM nodes and independent drafts survive all three modes; ordinary selection restoration can change the active pane. No new sessions, sends, or sockets.");
  for(const width of [1280,1024,768,390,360]){
    console.log("Resize Command Deck:",width);
    await commandPage.setViewportSize({width,height:width<560?844:768});
    console.log("Resized Command Deck:",width);
    assert(await commandPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert(await commandPage.getByRole("button",{name:"Exit Command Deck",exact:true}).isVisible());
    await commandPage.screenshot({path:path.join(proof,`command-deck-${width}.png`),animations:"disabled"});
  }
  await commandPage.setViewportSize({width:390,height:844});
  console.log("Open mobile queue");
  await commandPage.getByRole("button",{name:"Task queue",exact:true}).click();
  console.log("Clicked mobile queue");
  await commandPage.getByRole("dialog",{name:"Command Deck task queue",exact:true}).waitFor({state:"visible"});
  await commandPage.screenshot({path:path.join(proof,"command-deck-mobile-queue.png"),animations:"disabled"});
  await commandPage.getByRole("button",{name:"Close task queue",exact:true}).click();
  await commandPage.getByRole("dialog",{name:"Command Deck task queue",exact:true}).waitFor({state:"hidden"});
  await command.close();
  const restricted=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block"});
  const restrictedPage=await restricted.newPage();activePage=restrictedPage;
  const restrictedGateway=await installMockGateway(restrictedPage,{serverVersion:"2026.11.6",controlUiBuildSource:"configured",featureMethods:[...defaultControlUiFeatureMethods,...queueMethods],operatorScopes:["operator.read"]});
  await restrictedPage.goto(`${base}chat`);
  await restrictedPage.getByRole("button",{name:"Enter Command Deck",exact:true}).click();
  await restrictedPage.locator(".command-deck-queue:visible").getByText("Priority queue unavailable.",{exact:false}).waitFor();
  assert.equal((await restrictedGateway.getRequests("commanddesk.tasks.list")).length,0);
  assert.equal((await restrictedGateway.getRequests("commanddesk.tasks.create")).length,0);
  await restricted.close();
  observations.push("Advertised queue methods without admin authority remain unavailable and cause no queue RPC. Missing capabilities also cause no queue read or fabricated empty ledger.");
  const running = await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:"block"});
  const runningPage = await running.newPage(); activePage = runningPage;
  const runningGateway = await installMockGateway(runningPage,{
    serverVersion:"2026.11.6",controlUiBuildSource:"configured",
    inFlightRun:{runId:"active-run",text:"Working on your request."},
    sessionInfo:{key:"agent:main:main",hasActiveRun:true,activeRunIds:["active-run"],status:"running"},
    sessions:[{key:"agent:main:main",kind:"direct",label:"Main",updatedAt:Date.now(),hasActiveRun:true,activeRunIds:["active-run"],status:"running"}],
  });
  await runningPage.goto(`${base}chat`);
  await runningPage.getByRole("button",{name:"Enter Quiet Desk",exact:true}).click();
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
  const crewCatalog=JSON.parse(await fs.readFile(path.join(root,"command-deck/crew/catalog.json"),"utf8"));
  const crewContext=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block"});
  const crewPage=await crewContext.newPage();activePage=crewPage;crewPage.setDefaultTimeout(20_000);
  const crewAgentRows=[{id:"main",name:"Main"},...crewCatalog.agents.map((entry:{id:string;name:string})=>({id:entry.id,name:entry.name,identity:{name:entry.name}})),{id:"other",name:"Other agent"}];
  const crewSessions=crewAgentRows.map(agent=>({key:`agent:${agent.id}:main`,kind:"direct",label:agent.name,updatedAt:Date.now()}));
  const childKey="agent:jace:subagent:crew-proof";
  let childRunning=true;
  const child=()=>({key:childKey,sessionId:"crew-proof-child",kind:"direct",label:"Inspect synthetic draft",spawnedBy:"agent:helm:main",updatedAt:Date.now(),status:childRunning ? "running" : "completed",hasActiveRun:childRunning,activeRunIds:childRunning ? ["crew-proof-run"] : []});
  const crewGateway=await installMockGateway(crewPage,{
    serverVersion:"2026.11.6",controlUiBuildSource:"configured",presenceUsers:[{self:true,id:"crew-profile",name:"Crew operator"}],
    sessions:[...crewSessions,child()],
    featureMethods:[...defaultControlUiFeatureMethods,"agents.list","agents.files.get","sessions.describe"],
    sessionTranscripts:Object.fromEntries(crewSessions.map(row=>[row.key,{messages:[{role:"assistant",content:[{type:"text",text:`Synthetic transcript for ${row.label}`}]}]}])),
    methodResponses:{"agents.list":{agents:crewAgentRows,defaultId:"main",mainKey:"main",scope:"per-sender"}},
  },{requestHandlers:{
    "agents.files.get":async(params:unknown)=>{
      const query=params as {agentId:string;name:string};
      const metadata=crewCatalog.agents.find((entry:{id:string})=>entry.id===query.agentId);
      if(!metadata) return {agentId:query.agentId,workspace:`/synthetic/${query.agentId}`,file:{name:query.name,path:query.name,missing:true}};
      return {agentId:query.agentId,workspace:`/synthetic/${query.agentId}`,file:{name:query.name,path:query.name,missing:false,hash:metadata.bootstrapHashes[query.name],content:"Synthetic content; the mocked Gateway owns this hash fixture."}};
    },
    "sessions.describe":async()=>({session:crewSessions.find(row=>row.key==="agent:helm:main"),nativeSubagents:{coverage:"live",children:[],truncated:false}}),

  }});
  await crewPage.goto(`${base}chat`);
  const crewComposerFor=(id:string)=>crewPage.locator(`.agent-chat__composer-combobox textarea[aria-describedby*="agent%3A${id}%3Amain"]:visible`);
  const crewComposer=crewComposerFor("main");
  await crewComposer.waitFor({state:"visible"});
  await crewComposer.fill("Ordinary main draft remains private");
  const ordinarySelection=()=>crewPage.evaluate(()=>Object.keys(localStorage).sort().flatMap(key=>{try {const value=JSON.parse(localStorage.getItem(key) || "null");return value?.sessionsByGateway ? [[key,value.sessionsByGateway]] : [];}catch{return [];}}));
  const ordinaryBefore=await ordinarySelection();
  await crewPage.getByRole("button",{name:"Enter Command Deck",exact:true}).click();
  await crewPage.locator(".command-deck-contact").getByText("Helm",{exact:false}).waitFor();
  await crewPage.getByRole("heading",{name:"Meet Helm",exact:true}).waitFor();
  await crewPage.screenshot({path:path.join(proof,"command-deck-crew-installed-1440.png"),animations:"disabled"});
  await crewPage.getByRole("button",{name:"Not now",exact:true}).click();
  await crewPage.locator(".command-helm-delegation").waitFor();
  await crewPage.locator(".command-helm-delegation summary").click();
  await crewPage.locator(".command-helm-child").getByText("Jace",{exact:true}).waitFor();
  assert((await crewGateway.getRequests("sessions.list",{spawnedBy:"agent:helm:main"})).some(request=>!(request.params as {agentId?:string}).agentId));
  await crewPage.screenshot({path:path.join(proof,"command-deck-helm-delegation-running.png"),animations:"disabled"});
  childRunning=false;
  await crewGateway.setMethodResponse("sessions.list",{sessions:[...crewSessions,child()]});
  await crewGateway.emitGatewayEvent("sessions.changed",{sessionKey:childKey,session:child()});
  await crewPage.locator(".command-helm-child").getByText("completed",{exact:true}).waitFor();
  await crewPage.locator(".command-crew-roster").getByRole("button",{name:"Chat with Jace",exact:true}).click();
  await crewPage.locator(".command-deck-contact").getByText("Jace",{exact:false}).waitFor();
  await crewComposerFor("jace").fill("Synthetic direct message to Jace");
  await crewPage.getByRole("button",{name:"Send message",exact:true}).click();
  assert.equal(((await crewGateway.waitForRequest("chat.send")).params as {sessionKey:string}).sessionKey,"agent:jace:main");
  await crewPage.locator(".command-crew-roster").getByRole("button",{name:"Chat with Cruz",exact:true}).click();
  await crewPage.locator(".command-deck-contact").getByText("Cruz",{exact:false}).waitFor();
  await crewComposerFor("cruz").fill("Synthetic direct message to Cruz");
  await crewPage.getByRole("button",{name:"Send message",exact:true}).click();
  await crewGateway.waitForRequest("chat.send",{match:{sessionKey:"agent:cruz:main"}});
  const directSends=await crewGateway.getRequests("chat.send");
  assert.deepEqual(directSends.map(request=>(request.params as {sessionKey:string}).sessionKey),["agent:jace:main","agent:cruz:main"]);
  await crewPage.locator(".command-crew-roster").getByRole("button",{name:"Chat with Jace",exact:true}).click();
  await crewPage.getByRole("button",{name:"Exit Command Deck",exact:true}).click();
  await crewPage.locator(".shell:not(.shell--command-deck)").waitFor();
  await crewComposer.waitFor({state:"visible"});
  assert.equal(await crewComposer.inputValue(),"Ordinary main draft remains private");
  assert.deepEqual(await ordinarySelection(),ordinaryBefore);
  await crewPage.getByRole("button",{name:"Enter Command Deck",exact:true}).click();
  await crewPage.locator(".command-deck-contact").getByText("Jace",{exact:false}).waitFor();
  await crewPage.screenshot({path:path.join(proof,"command-deck-crew-jace-restored.png"),animations:"disabled"});
  await crewPage.reload();
  await crewPage.locator(".command-deck-contact").getByText("Jace",{exact:false}).waitFor();
  await crewPage.getByRole("button",{name:"Exit Command Deck",exact:true}).click();
  await crewPage.locator(".shell:not(.shell--command-deck)").waitFor();
  assert.deepEqual(await ordinarySelection(),ordinaryBefore);
  for(const method of ["agents.create","templates.add.plan","templates.add.apply","config.patch"]) assert.equal((await crewGateway.getRequests(method)).length,0);
  await crewContext.close();
  observations.push("Crew Gateway fixture: authored bootstrap hash admission, Helm-first actual Home navigation, Jace/Cruz direct chat.send session keys without Helm forwarding, original main draft and remembered selection restoration, Jace reentry, real child-session running-to-completed projection, and no automatic creation/config writes. Authored persona output and live provider delegation remain untested.");
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
  await stylePage.getByRole("button",{name:"Enter Quiet Desk",exact:true}).click();
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
  await fs.writeFile(path.join(proof,"results.json"),JSON.stringify({passed:true,verifiedModes:["openclaw","quiet","command"],packageRevision:"helm-r7",version:"2026.11.6",sha:"06afb10d3272cc9deaf38ca6a3b7b839d5935638",observations,limits:["Synthetic Gateway fixture, no real provider or Linux deployment exercised.","CSS zoom is not native browser zoom.","Workboard route is a native plugin destination; plugin execution and legacy streaming/gear integrations need host verification."]},null,2));
  console.log(JSON.stringify({passed:true,proof,observations}));
} catch (error) {
  console.error("Mode verification failed:",error);
  if(activePage && !activePage.isClosed()) {
    await activePage.screenshot({path:path.join(proof,"failure.png"),timeout:5000}).catch(()=>{});
    await fs.writeFile(path.join(proof,"failure.txt"),String(error)+"\n"+await activePage.locator("body").innerText({timeout:5000}).catch(String));
  }
  throw error;
} finally {
  clearTimeout(watchdog);
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
