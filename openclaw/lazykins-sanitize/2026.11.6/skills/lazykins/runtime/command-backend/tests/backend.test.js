import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import plugin from "../index.js";
import { QueueOwner, selectNext } from "../queue.js";
import { QueueStore } from "../store.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const base = { sessionKey: "agent:main:synthetic", title: "Synthetic local draft", message: "Prepare a draft without sending it.", timezone: "America/Los_Angeles" };
const key = "queue-v1";
const set = (value) => ({ operation: "update", action: "set", value });

async function fixture(t) {
  const stateDir = await fs.mkdtemp(path.join(root, "isolated-backend-"));
  const stores = [];
  t.after(async () => { for (const store of stores) await store.close(); await fs.rm(stateDir, { recursive: true }); });
  const open = () => { const store = new QueueStore(stateDir); stores.push(store); return store; };
  let now = 1_000_000;
  let next = 0;
  const uuid = () => `task-${++next}`;
  const owner = new QueueOwner(open(), () => now);
  await owner.initialize();
  return { stateDir, open, owner, uuid, now: () => now, advance: (ms) => { now += ms; } };
}

function cronFixture() {
  const jobs = [];
  return { jobs, adds: 0, async isEnabled() { return true; }, async list() { return structuredClone(jobs); },
    async add(input) { this.adds++; const job = { ...input, id: `native-${this.adds}`, state: {} }; jobs.push(job); return job; } };
}

test("private SQLite persists priority, FIFO aging, scheduled work and idempotency across owners", async (t) => {
  const f = await fixture(t);
  const low = await f.owner.create({ ...base, idempotencyKey: "low", priority: 3 }, f.uuid);
  const high = await f.owner.create({ ...base, idempotencyKey: "high", priority: 1 }, f.uuid);
  const due = f.now() + 3_600_000;
  await f.owner.create({ ...base, idempotencyKey: "later", scheduleAtMs: due }, f.uuid);
  assert.equal(selectNext((await f.owner.list()).tasks, f.now()).id, high.id);
  f.advance(21 * 60_000);
  assert.equal(selectNext((await f.owner.list()).tasks, f.now()).id, low.id);
  const replacement = new QueueOwner(f.open(), f.now);
  await replacement.initialize();
  assert.equal((await replacement.list()).tasks.length, 3);
  assert.equal((await replacement.create({ ...base, idempotencyKey: "high", priority: 1 }, f.uuid)).id, high.id);
  await assert.rejects(replacement.create({ ...base, message: "Different intent", idempotencyKey: "high", priority: 1 }, f.uuid), /different work/);
});

test("optimistic queue edits and cancellation cannot change dispatched work", async (t) => {
  const f = await fixture(t);
  const task = await f.owner.create({ ...base, idempotencyKey: "task" }, f.uuid);
  await f.owner.priority({ id: task.id, priority: 1, expectedVersion: task.version });
  await assert.rejects(f.owner.priority({ id: task.id, priority: 3, expectedVersion: task.version }), /another client/);
  const cron = cronFixture();
  await f.owner.reconcile(cron, () => true);
  assert.equal(cron.adds, 1);
  assert.equal(cron.jobs[0].sessionTarget, "session:" + base.sessionKey);
  assert.deepEqual(cron.jobs[0].payload, { kind: "agentTurn", message: base.message });
  assert.equal(cron.jobs[0].deleteAfterRun, false);
  assert.deepEqual(cron.jobs[0].delivery, { mode: "none" });
  await assert.rejects(f.owner.cancel({ id: task.id }), /dispatched/);
  await assert.rejects(f.owner.priority({ id: task.id, priority: 3 }), /dispatched/);
});

test("unknown native acknowledgement is retained without automatic duplicate submission", async (t) => {
  const f = await fixture(t);
  await f.owner.create({ ...base, idempotencyKey: "task" }, f.uuid);
  const cron = cronFixture();
  cron.add = async function () { this.adds++; throw new Error("Acknowledgement lost"); };
  await assert.rejects(f.owner.reconcile(cron, () => true), /Acknowledgement lost/);
  const restored = new QueueOwner(f.open(), f.now);
  await restored.initialize();
  await restored.reconcile(cron, () => true);
  assert.equal(cron.adds, 1);
  const [task] = (await restored.list()).tasks;
  assert.equal(task.status, "blocked");
  assert.match(task.error, /Automatic retry is withheld/);
});

test("native running/terminal events are authoritative and duplicate events cannot rewrite terminal state", async (t) => {
  const f = await fixture(t);
  await f.owner.create({ ...base, idempotencyKey: "task" }, f.uuid);
  const cron = cronFixture();
  await f.owner.reconcile(cron, () => true);
  await f.owner.nativeEvent({ action: "started", jobId: "native-1", runId: "run-1" });
  assert.equal((await f.owner.list()).tasks[0].status, "running");
  await f.owner.nativeEvent({ action: "finished", jobId: "native-1", completionStatus: "succeeded", runId: "run-1" });
  await f.owner.nativeEvent({ action: "finished", jobId: "native-1", completionStatus: "failed", runId: "late-run" });
  const [task] = (await f.owner.list()).tasks;
  assert.equal(task.status, "completed");
  assert.equal(task.runId, "run-1");
});

test("restart reconciliation never promotes native run-status ok into semantic success", async (t) => {
  const f = await fixture(t);
  await f.owner.create({ ...base, idempotencyKey: "task" }, f.uuid);
  const cron = cronFixture();
  await f.owner.reconcile(cron, () => true);
  cron.jobs[0].state = { lastRunAtMs: f.now(), lastRunStatus: "ok" };
  const restored = new QueueOwner(f.open(), f.now);
  await restored.initialize();
  await restored.reconcile(cron, () => true);
  assert.equal((await restored.list()).tasks[0].status, "blocked");
  assert.match((await restored.list()).tasks[0].error, /completion acknowledgement was not observed/);
  assert.equal(cron.adds, 1);
});

test("independent workers enforce SQLite CAS and revoked storage cannot accept more work", async (t) => {
  const f = await fixture(t);
  const second = f.open();
  const first = await f.owner.store.observe(key);
  const other = await second.observe(key);
  assert.equal((await f.owner.store.compareAndApply(key, first.comparison, set(first.value))).status, "applied");
  assert.equal((await second.compareAndApply(key, other.comparison, set(other.value))).status, "conflict");
  second.revoke();
  await assert.rejects(second.observe(key), /unavailable/);
  await assert.rejects(second.compareAndApply(key, other.comparison, set(other.value)), /unavailable/);
});

test("hard-link database aliases are rejected without mutating the aliased file", async (t) => {
  const f = await fixture(t);
  const extra = await fs.mkdtemp(path.join(root, "isolated-alias-"));
  t.after(() => fs.rm(extra, { recursive: true }));
  await fs.mkdir(path.join(extra, "lazykins-command-desk"));
  const original = path.join(f.stateDir, "lazykins-command-desk", "tasks.sqlite3");
  const before = await fs.readFile(original);
  await fs.link(original, path.join(extra, "lazykins-command-desk", "tasks.sqlite3"));
  const aliased = new QueueStore(extra);
  t.after(() => aliased.close());
  await assert.rejects(aliased.observe(key), /worker failed|exited/);
  assert.deepEqual(await fs.readFile(original), before);
});

function registered() {
  const methods = new Map();
  const hooks = new Map();
  const warnings = [];
  let service;
  const api = { runtime: { version: "2026.11.6" }, pluginConfig: { voiceAgents: ["legacy"], profile: "old", skillRoot: "/obsolete" }, logger: { warn: (message) => warnings.push(message) },
    registerService: (value) => { service = value; }, on: (name, fn) => hooks.set(name, fn),
    registerGatewayMethod: (name, fn, options) => methods.set(name, { fn, options }) };
  plugin.register(api);
  return { api, methods, hooks, warnings, get service() { return service; } };
}

test("plugin registration exposes exactly five admin task methods and no voice owner", async (t) => {
  const f = await fixture(t);
  const registeredPlugin = registered();
  assert.deepEqual([...registeredPlugin.methods.keys()].sort(), ["cancel", "create", "list", "priority", "retry"].map((name) => "commanddesk.tasks." + name));
  for (const method of registeredPlugin.methods.values()) assert.equal(method.options.scope, "operator.admin");
  assert.deepEqual([...registeredPlugin.hooks.keys()], ["cron_changed"]);
  assert.equal(registeredPlugin.warnings.length, 1);
  let callback;
  let canceled = false;
  const events = [];
  const cron = cronFixture();
  const context = { stateDir: f.stateDir, getCron: () => cron,
    scheduler: { version: 1, schedule(options) { callback = options.run; assert.equal(options.everyMs, 2000); return { cancel() { canceled = true; } }; } },
    gatewayEvents: { emit: (...args) => events.push(args) } };
  await registeredPlugin.service.start(context);
  try {
    let acknowledgement;
    await registeredPlugin.methods.get("commanddesk.tasks.create").fn({ params: { ...base, idempotencyKey: "registered-task" }, respond: (...args) => { acknowledgement = args; } });
    assert.equal(acknowledgement[0], true);
    assert.equal(acknowledgement[1].status, "queued");
    assert.deepEqual(events[0], ["changed", { revision: 1 }, { scope: "operator.admin" }]);
    context.getCron = () => { throw new Error("retired native capability"); };
    await assert.doesNotReject(callback());
  } finally { await registeredPlugin.service.stop(); }
  assert.equal(canceled, true);
  let stopped;
  await registeredPlugin.methods.get("commanddesk.tasks.list").fn({ params: {}, respond: (...args) => { stopped = args; } });
  assert.equal(stopped[0], false);
  assert.match(stopped[2].message, /unavailable/);
});

test("wrong host release fails before creating backend state", async (t) => {
  const dir = await fs.mkdtemp(path.join(root, "isolated-unsupported-"));
  t.after(() => fs.rm(dir, { recursive: true }));
  const registration = registered();
  registration.api.runtime.version = "2026.11.7-beta.1";
  await assert.rejects(registration.service.start({ stateDir: dir }), /2026.11.6/);
  assert.deepEqual(await fs.readdir(dir), []);
});

test("service retirement during cron inspection withholds native dispatch", async (t) => {
  const f = await fixture(t);
  await f.owner.create({ ...base, idempotencyKey: "task" }, f.uuid);
  const cron = cronFixture();
  let current = true;
  cron.list = async () => { current = false; return []; };
  await f.owner.reconcile(cron, () => current);
  assert.equal(cron.adds, 0);
  assert.equal((await f.owner.list()).tasks[0].status, "queued");
});
