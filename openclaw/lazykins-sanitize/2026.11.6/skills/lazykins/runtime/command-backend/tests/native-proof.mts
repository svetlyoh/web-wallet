/** Exact-tag native loader/service/Cron boundary proof. No Gateway, real model, or external send. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const source = path.resolve(process.argv[2] ?? "");
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "2026.11.6";
const sha = "06afb10d3272cc9deaf38ca6a3b7b839d5935638";
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim(), sha);
assert.equal(JSON.parse(await fs.readFile(path.join(source, "package.json"), "utf8")).version, version);

// Install isolation before importing any native module: some owners capture STATE_DIR at import.
const isolated = await fs.mkdtemp(path.join(path.dirname(fileURLToPath(import.meta.url)), "isolated-native-"));
const initialState = path.join(isolated, "state");
const workspace = path.join(isolated, "workspace");
await fs.mkdir(initialState, { recursive: true });
await fs.mkdir(workspace, { recursive: true });
const configPath = path.join(initialState, "openclaw.json");
const id = "lazykins-command-desk";
const config = { agents: { defaults: { workspace }, entries: { main: { workspace } } },
  plugins: { allow: [id], load: { paths: [backend] }, entries: { [id]: { enabled: true,
    config: { voiceAgents: ["legacy-fixture"], profile: "previous-profile", skillRoot: "/deprecated-fixture" } } } } };
await fs.writeFile(configPath, JSON.stringify(config));
const savedEnv = { ...process.env };
Object.assign(process.env, { OPENCLAW_STATE_DIR: initialState, OPENCLAW_CONFIG_PATH: configPath,
  OPENCLAW_PROFILE: "backend-proof", HOME: path.join(isolated, "home"), USERPROFILE: path.join(isolated, "home") });
await fs.mkdir(process.env.HOME!, { recursive: true });
for (const key of ["OPENCLAW_AGENT_DIR", "OPENCLAW_GATEWAY_TOKEN", "OPENCLAW_GATEWAY_PASSWORD", "OPENCLAW_SERVICE_KIND", "OPENCLAW_SYSTEMD_UNIT", "OPENCLAW_LAUNCHD_LABEL"]) delete process.env[key];

const load = (name: string) => import(pathToFileURL(path.join(source, name)).href);
const observations: string[] = [];
try {
  const { withOpenClawTestState } = await load("src/test-utils/openclaw-test-state.ts");
  await withOpenClawTestState({ label: "command-backend-11-native", scenario: "minimal" }, async (state: any) => {
    const { loadPluginManifest } = await load("src/plugins/manifest.ts");
    const { loadOpenClawPlugins } = await load("src/plugins/loader.ts");
    const { disposePluginRegistryInstances } = await load("src/plugins/runtime.ts");
    const { startPluginServices } = await load("src/plugins/services.ts");
    const { createHookRunner } = await load("src/plugins/hooks.ts");
    const { CronService } = await load("src/cron/service.ts");
    const { createGatewaySchedulerClock, createTestGatewayScheduler } = await load("src/test-utils/gateway-scheduler-clock.ts");
    const { QueueStore } = await import(pathToFileURL(path.join(backend, "store.js")).href);
    const manifest = loadPluginManifest(backend);
    assert.equal(manifest.ok, true);
    assert.equal(manifest.manifest.id, id);
    const logger = { info() {}, warn() {}, error() {}, debug() {} };
    const registry = await loadOpenClawPlugins({ config, env: state.env, cache: false,
      activate: true, onlyPluginIds: [id], logger });
    let services: any;
    let native: any;
    const stores: any[] = [];
    const clock = createGatewaySchedulerClock(Date.now());
    const scheduler = createTestGatewayScheduler(clock.clock);
    try {
      const record = registry.plugins.find((entry: any) => entry.id === id);
      assert.equal(record?.status, "loaded", JSON.stringify(registry.diagnostics));
      const methods = registry.gatewayMethodDescriptors.filter((entry: any) => entry.owner?.pluginId === id);
      assert.equal(methods.length, 5);
      assert(methods.every((entry: any) => entry.scope === "operator.admin"));
      assert.deepEqual(methods.map((entry: any) => entry.name).sort(), ["cancel", "create", "list", "priority", "retry"].map((name) => `commanddesk.tasks.${name}`));
      assert(!registry.gatewayHandlers["commanddesk.voice.control"]);
      assert(registry.services.some((entry: any) => entry.pluginId === id));
      observations.push("Native manifest/config validator and production plugin loader admit the local backend with legacy config fields; exactly five admin-scoped task RPCs and no voice RPC register.");

      const hookRunner = createHookRunner(registry, { logger });
      let hookTail = Promise.resolve();
      let executions = 0;
      const dependencies = { scheduler, storePath: state.statePath("cron", "jobs.json"),
        cronEnabled: true, nowMs: () => clock.clock.now(), log: logger, defaultAgentId: "main",
        enqueueSystemEvent() {}, requestHeartbeat() {},
        runIsolatedAgentJob: async ({ job, onExecutionStarted }: any) => {
          executions++;
          const runId = `synthetic-run-${executions}`;
          const sessionKey = job.sessionTarget.slice(8);
          onExecutionStarted?.({ runId, sessionKey });
          return { status: "ok", completionStatus: "succeeded", summary: "Synthetic local execution", runId, sessionKey };
        },
        onEvent: (event: any) => { hookTail = hookTail.then(() => hookRunner.runCronChanged(event, {})); },
      };
      native = new CronService(dependencies);
      const broadcasts: any[] = [];
      let accepted: (() => void) | undefined;
      const acceptedPromise = new Promise<void>((resolve) => { accepted = resolve; });
      services = await startPluginServices({ registry, config, scheduler, workspaceDir: workspace,
        getCronService: () => native, throwOnStartError: true, onHandle: (handle: any) => { services = handle; },
        broadcastPluginEvent: (event: string, payload: any, scope: string) => {
          broadcasts.push({ event, payload, scope });
          if (payload.revision >= 3) accepted?.();
        } });
      const rpc = async (name: string, params: any = {}) => {
        let reply: any[] | undefined;
        await registry.gatewayHandlers[`commanddesk.tasks.${name}`]({
          req: { type: "req", id: "synthetic-handler-proof", method: `commanddesk.tasks.${name}`, params },
          params, context: {}, respond: (...args: any[]) => { reply = args; },
        });
        assert(reply, "Native registered handler must acknowledge the request");
        assert.equal(reply[0], true, JSON.stringify(reply[2]));
        return reply[1];
      };
      const queued = await rpc("create", { sessionKey: "agent:main:backend-native-fixture", title: "Synthetic local draft",
        message: "Create a local draft only. Do not send anything.", priority: 1, timezone: "America/Los_Angeles", idempotencyKey: "native-exactly-once" });
      assert.equal(queued.status, "queued");
      // Join a real published write receipt rather than a timer/polling sleep.
      let receiptTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([acceptedPromise, new Promise<never>((_, reject) => {
          receiptTimer = setTimeout(() => reject(new Error("Native queue dispatch produced no acknowledgement receipt within 45 seconds; inspect native service health/schema before retrying.")), 45_000);
        })]);
      } finally { clearTimeout(receiptTimer); }
      const jobs = await native.list({ includeDisabled: true });
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].schedule.kind, "at");
      assert.equal(jobs[0].payload.kind, "agentTurn");
      assert.equal(jobs[0].sessionTarget, "session:agent:main:backend-native-fixture");
      assert.equal(jobs[0].deleteAfterRun, false);
      assert(broadcasts.some((entry) => entry.event === `plugin.${id}.changed` && entry.scope === "operator.admin"));
      assert.equal((await rpc("list")).capabilities.schedulerEnabled, true);
      observations.push("Native service lifecycle supplies ctx.scheduler v1 and guarded ctx.getCron; production registered create/list handlers persist queue intent and publish native namespaced admin receipts; the native Cron store accepts the at/agentTurn/session payload.");

      const result = await native.run(jobs[0].id, "force");
      assert.equal(result.ran, true);
      await hookTail;
      const complete = (await rpc("list")).tasks.find((task: any) => task.id === queued.id);
      assert.equal(complete.status, "completed");
      assert.equal(executions, 1);
      await hookRunner.runCronChanged({ jobId: jobs[0].id, action: "finished", completionStatus: "failed", runId: "late-duplicate" }, {});
      assert.equal((await rpc("list")).tasks.find((task: any) => task.id === queued.id).status, "completed");
      observations.push("A real native Cron run invokes only the injected synthetic agent runner; actual cron_changed hook routing records success once and refuses a late conflicting terminal event.");

      await services.stop();
      services = undefined;
      const retainedStore = new QueueStore(initialState);
      stores.push(retainedStore);
      const snapshot = await retainedStore.observe("queue-v1");
      assert(snapshot.value.tasks.some((task: any) => task.id === queued.id));
      retainedStore.revoke();
      await assert.rejects(retainedStore.observe("queue-v1"), /unavailable/);
      observations.push("Native service stop joins the Gateway-owned scheduler and closes the private worker; queue data survives restart and retired worker admission remains unavailable.");
    } finally {
      await services?.stop();
      native?.stop();
      for (const store of stores) await store.close();
      await scheduler.stop();
      await disposePluginRegistryInstances(registry, undefined, { cleanupPersistentState: false });
    }
  });
  console.log(JSON.stringify({ passed: true, version, sha, liveGateway: false, modelRunner: "synthetic",
    socketAuthenticationTested: false, observations }, null, 2));
} finally {
  for (const name of Object.keys(process.env)) if (!(name in savedEnv)) delete process.env[name];
  Object.assign(process.env, savedEnv);
  await fs.rm(isolated, { recursive: true, force: true });
}
