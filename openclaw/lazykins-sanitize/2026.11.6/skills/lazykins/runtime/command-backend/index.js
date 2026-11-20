import { randomUUID } from "node:crypto";
import { QueueOwner } from "./queue.js";
import { QueueStore } from "./store.js";

export default {
  id: "lazykins-command-desk",
  name: "LazyKins Command Desk",
  register(api) {
    let store;
    const owner = new QueueOwner(null);
    let service;
    let scheduled;
    let stopping = true;
    const notify = (revision) => service?.gatewayEvents?.emit("changed", { revision }, { scope: "operator.admin" });
    owner.changed = notify;
    const tick = async () => {
      const current = service;
      if (stopping || !current) return;
      try {
        await owner.reconcile(current.getCron(), () => !stopping && service === current);
        if (!stopping && service === current) current.serviceHealth?.clearFailure();
      } catch {
        // getCron can throw synchronously when the host retires a retained capability.
        if (!stopping && service === current) current.serviceHealth?.reportFailure(new Error("Command Desk queue reconciliation failed; inspect plugin logs and native scheduler."));
      }
    };
    if (api.pluginConfig && ["voiceAgents", "profile", "skillRoot"].some((key) => key in api.pluginConfig)) {
      api.logger?.warn("Legacy Command Desk voice configuration is ignored. Manage voice with the separate Sanitize skill.");
    }
    api.registerService({
      id: "lazykins-command-desk-queue",
      async start(ctx) {
        if (api.runtime.version !== "2026.11.6") throw new Error("LazyKins Command Desk requires its validated OpenClaw 2026.11.6 plugin build. State retained; use an available compatible view after upgrades.");
        if (typeof ctx.getCron !== "function" || ctx.scheduler?.version !== 1) throw new Error("Command Desk needs the Gateway-owned Cron and service scheduler capabilities.");
        service = ctx;
        stopping = false;
        store = new QueueStore(ctx.stateDir, (phase) => ctx.startupTrace?.detail?.("queue-worker", [["phase", phase]]));
        owner.store = store;
        const measure = (name, run) => ctx.startupTrace ? ctx.startupTrace.measure(name, run) : run();
        try {
          await measure("sqlite-initialize", () => owner.initialize());
          await measure("initial-native-reconcile", tick);
          scheduled = ctx.scheduler.schedule({ id: "commanddesk-reconcile", delayMs: 2000, everyMs: 2000, run: tick });
        } catch (error) {
          stopping = true;
          store.revoke();
          await owner.drain();
          await store.close();
          service = undefined;
          throw error;
        }
      },
      async stop() {
        stopping = true;
        store?.revoke();
        scheduled?.cancel();
        // Drain accepted SQLite writes and native submissions before service replacement.
        await owner.drain();
        await store?.close();
        service = undefined;
      },
    });
    api.on("cron_changed", async (event) => {
      if (!stopping) await owner.nativeEvent(event);
    });
    for (const [name, invoke] of Object.entries({
      list: () => owner.list(),
      create: (params) => owner.create(params, randomUUID),
      priority: (params) => owner.priority(params),
      cancel: (params) => owner.cancel(params),
      retry: (params) => owner.retry(params, randomUUID),
    })) {
      api.registerGatewayMethod(`commanddesk.tasks.${name}`, async ({ params, respond }) => {
        try {
          if (stopping) throw new Error("Command Desk queue service is unavailable.");
          const result = await invoke(params);
          respond(true, result);
          // List/create acknowledgements own the state. Background dispatch never blocks RPC.
          if (name !== "list") void tick();
        } catch (error) {
          respond(false, undefined, { code: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Command Desk operation failed." });
        }
      }, { scope: "operator.admin" });
    }
  },
};
