const KEY = "queue-v1";
const CAPABILITIES = { priority: true, pause: false, stopRunning: false, concurrency: 1, scope: "Command Desk-owned jobs" };
const TERMINAL = new Set(["completed", "failed", "canceled", "blocked"]);
const FAMILY = "lazykins-command-desk:";
const MAX_TASKS = 1000;
const AGING_MS = 10 * 60 * 1000;

function text(value, name, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${name} must be nonempty and at most ${max} characters.`);
  return value.trim();
}
function priority(value) {
  if (![1, 2, 3].includes(value)) throw new Error("Priority must be 1, 2, or 3.");
  return value;
}
function mutable(task, params) {
  if (!task) throw new Error("Task does not exist.");
  if (params.expectedVersion !== undefined && params.expectedVersion !== task.version) throw new Error("Task changed in another client. Refresh and retry.");
  if (!["queued", "scheduled"].includes(task.status) || task.dispatchStartedAtMs || task.jobId) throw new Error("The task was dispatched. Queue changes cannot undo effects or pause execution.");
}
function touch(task, now) { task.version += 1; task.updatedAtMs = now; }
function publicTask(task) {
  const pending = ["queued", "scheduled"].includes(task.status) && !task.dispatchStartedAtMs && !task.jobId;
  return { ...task, capabilities: { priority: pending, cancel: pending, retry: ["failed", "blocked", "canceled"].includes(task.status), pause: false, resume: false } };
}
export function selectNext(tasks, now) {
  const effective = (task) => Math.max(1, task.priority - Math.floor(Math.max(0, now - Math.max(task.createdAtMs, task.scheduleAtMs ?? task.createdAtMs)) / AGING_MS));
  return tasks.filter((task) => !TERMINAL.has(task.status) && !task.dispatchStartedAtMs && !task.jobId && (task.scheduleAtMs === null || task.scheduleAtMs <= now))
    .sort((a, b) => effective(a) - effective(b) || a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id))[0];
}

/** One async private SQLite row owns the queue; CAS rejects competing owners/clients. */
export class QueueOwner {
  constructor(store, clock = Date.now) {
    this.store = store;
    this.clock = clock;
    this.tail = Promise.resolve();
    this.reconciling = false;
    this.changed = () => {};
    this.schedulerEnabled = null;
  }
  serial(run) {
    const next = this.tail.then(run);
    this.tail = next.catch(() => {});
    return next;
  }
  drain() { return this.tail; }
  async initialize() {
    if (!this.store?.observe || !this.store?.compareAndApply) throw new Error("Command Desk SQLite storage is unavailable. Keep stock UI and inspect plugin service status.");
    await this.store.registerIfAbsent(KEY, { schemaVersion: 1, revision: 0, tasks: [] });
    await this.read();
  }
  async read() {
    const observation = await this.store.observe(KEY);
    const snapshot = observation.value;
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.tasks)) throw new Error("Unknown Command Desk queue schema. Use a compatible plugin; state was preserved.");
    return { observation, snapshot };
  }
  async write(observation, snapshot) {
    snapshot.revision += 1;
    const result = await this.store.compareAndApply(KEY, observation.comparison, { operation: "update", action: "set", value: snapshot });
    if (result.status === "conflict") throw new Error("Queue changed in another Gateway/client. Refresh before retrying.");
    this.changed(snapshot.revision);
  }
  async change(run) {
    const { observation, snapshot } = await this.read();
    const result = run(snapshot);
    if (result?.unchanged) return publicTask(result.task);
    await this.write(observation, snapshot);
    return publicTask(result);
  }
  list() {
    return this.serial(async () => {
      const { snapshot } = await this.read();
      return { schemaVersion: 1, revision: snapshot.revision, tasks: snapshot.tasks.map(publicTask), capabilities: { ...CAPABILITIES, schedulerEnabled: this.schedulerEnabled } };
    });
  }
  prepare(params, uuid) {
    const now = this.clock();
    const sessionKey = text(params.sessionKey, "sessionKey", 512);
    if (!/^agent:[a-zA-Z0-9_-]+:.+/u.test(sessionKey)) throw new Error("Select a canonical agent session before creating queued work.");
    const scheduleAtMs = params.scheduleAtMs ?? null;
    if (scheduleAtMs !== null && (!Number.isSafeInteger(scheduleAtMs) || scheduleAtMs <= now || scheduleAtMs > 8640000000000000)) throw new Error("Schedule must be an explicit future UTC timestamp.");
    const timezone = text(params.timezone ?? "America/Los_Angeles", "timezone", 128);
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new Error("Timezone must be a valid IANA timezone."); }
    return { id: uuid(), title: text(params.title, "title", 120), sessionKey, message: text(params.message, "message", 32000),
      priority: priority(params.priority ?? 2), idempotencyKey: text(params.idempotencyKey, "idempotencyKey", 128),
      sourceRunId: params.sourceRunId == null ? null : text(params.sourceRunId, "sourceRunId", 256),
      scheduleAtMs, timezone, createdAtMs: now, updatedAtMs: now, status: scheduleAtMs === null ? "queued" : "scheduled", version: 1 };
  }
  create(params, uuid) {
    return this.serial(() => this.change((snapshot) => {
      const existing = snapshot.tasks.find((task) => task.idempotencyKey === params.idempotencyKey);
      if (existing) {
        const retry = {...params, sourceRunId:params.sourceRunId ?? null, title:text(params.title,"title",120), message:text(params.message,"message",32000), priority:priority(params.priority ?? 2),scheduleAtMs:params.scheduleAtMs ?? null,timezone:params.timezone ?? "America/Los_Angeles"};
        for (const key of ["sessionKey", "message", "title", "priority", "scheduleAtMs", "timezone", "sourceRunId"]) {
          if (existing[key] !== retry[key]) throw new Error("Idempotency key belongs to different work. Refresh; use a new key for a new task.");
        }
        return { unchanged: true, task: existing };
      }
      const prepared = this.prepare(params, uuid);
      if (snapshot.tasks.length >= MAX_TASKS) throw new Error("Command Desk retained queue is full. Export/archive completed work with an administrator before adding jobs.");
      snapshot.tasks.push(prepared);
      return prepared;
    }));
  }
  priority(params) {
    const value = priority(params.priority);
    return this.serial(() => this.change((snapshot) => {
      const task = snapshot.tasks.find((entry) => entry.id === params.id);
      mutable(task, params);
      task.priority = value;
      touch(task, this.clock());
      return task;
    }));
  }
  cancel(params) {
    return this.serial(() => this.change((snapshot) => {
      const task = snapshot.tasks.find((entry) => entry.id === params.id);
      mutable(task, params);
      task.status = "canceled";
      touch(task, this.clock());
      return task;
    }));
  }
  async retry(params, uuid) {
    const { snapshot } = await this.read();
    const task = snapshot.tasks.find((entry) => entry.id === params.id);
    if (!task || !["failed", "blocked", "canceled"].includes(task.status)) throw new Error("Only failed, blocked, or canceled jobs can be retried. Retry starts new work; it does not resume.");
    return this.create({ ...task, idempotencyKey: params.idempotencyKey, scheduleAtMs: null, sourceRunId: task.runId ?? task.sourceRunId }, uuid);
  }
  async nativeEvent(event) {
    return this.serial(async () => {
      const { observation, snapshot } = await this.read();
      const task = snapshot.tasks.find((entry) => entry.jobId === event.jobId || event.job?.declarationKey === FAMILY + entry.id);
      if (!task) return;
      if (event.action === "started" && !TERMINAL.has(task.status)) task.status = "running";
      else if (event.action === "finished" && !TERMINAL.has(task.status)) {
        task.status = event.completionStatus === "succeeded" ? "completed" : event.completionStatus === "unknown" ? "blocked" : "failed";
        if (task.status !== "completed") task.error = "Native execution did not confirm success. Inspect the source conversation before retrying.";
      } else return;
      if (event.runId != null) task.runId = text(event.runId,"runId",256);
      touch(task, this.clock());
      await this.write(observation, snapshot);
    });
  }
  async reconcile(cron, isCurrent) {
    if (this.reconciling || !cron || !isCurrent()) return;
    this.reconciling = true;
    try {
      await this.serial(async () => {
        this.schedulerEnabled = cron.isEnabled ? await cron.isEnabled() : null;
        if (!isCurrent()) return;
        const jobs = await cron.list({ includeDisabled: true });
        if (!isCurrent()) return;
        let { observation, snapshot } = await this.read();
        let changed = false;
        for (const task of snapshot.tasks) {
          if (TERMINAL.has(task.status) || !task.dispatchStartedAtMs) continue;
          const native = jobs.find((job) => job.declarationKey === FAMILY + task.id || job.id === task.jobId);
          const before = JSON.stringify([task.status,task.jobId,task.error]);
          if (!native) {
            task.status = "blocked";
            task.error = "Dispatch acknowledgement is unknown and no native job was found. Automatic retry is withheld to prevent duplicate effects.";
          } else {
            task.jobId = native.id;
            if (native.state?.runningAtMs) task.status = "running";
            else if (native.state?.lastRunAtMs) {
              // The public list projection exposes run status, not semantic completion.
              // A terminal event missed during restart cannot be reconstructed as success.
              task.status = native.state.lastRunStatus === "ok" ? "blocked" : "failed";
              task.error = task.status === "blocked"
                ? "Native execution ended, but its completion acknowledgement was not observed. Inspect the source conversation before retrying."
                : "Native job failed or was skipped. Inspect the source conversation.";
            }
          }
          if (JSON.stringify([task.status,task.jobId,task.error]) !== before) {touch(task, this.clock());changed = true;}
        }
        if (changed) {
          await this.write(observation, snapshot);
          ({ observation, snapshot } = await this.read());
        }
        if (this.schedulerEnabled !== true || snapshot.tasks.some((task) => !TERMINAL.has(task.status) && task.dispatchStartedAtMs)) return;
        const task = selectNext(snapshot.tasks, this.clock());
        if (!task || !isCurrent()) return;
        task.dispatchStartedAtMs = this.clock();
        task.status = "queued";
        touch(task, this.clock());
        await this.write(observation, snapshot);
        if (!isCurrent()) return;
        // The public service getter validates this native Cron schema and guards its final commit.
        // Retain the native job after completion so restart can reconcile acknowledgement gaps.
        const result = await cron.add({ declarationKey: FAMILY + task.id, name: task.title, description: "LazyKins Command Desk-owned queue job",
          enabled: true, deleteAfterRun: false, schedule: { kind: "at", at: new Date(this.clock() + 1000).toISOString() },
          sessionTarget: `session:${task.sessionKey}`, wakeMode: "now", payload: { kind: "agentTurn", message: task.message }, delivery: { mode: "none" } });
        const job = result?.job ?? result;
        if (!job?.id) throw new Error("Native scheduler returned no job identity; reconcile before retrying.");
        ({ observation, snapshot } = await this.read());
        const accepted = snapshot.tasks.find((entry) => entry.id === task.id);
        accepted.jobId = job.id;
        touch(accepted, this.clock());
        await this.write(observation, snapshot);
      });
    } finally { this.reconciling = false; }
  }
}
