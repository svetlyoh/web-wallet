#!/usr/bin/env python3
"""Guided, per-agent Command Deck setup on an onboarded Ubuntu OpenClaw host."""
import argparse
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


crew = load("command_deck_registration", BASE / "skills/lazykins/scripts/crew-register.py")
paired = load("command_deck_skills", BASE / "install-both.py")
ctl = crew.ctl
LABS = "gateway.controlUi.experimental.templates"


def approve(action):
    print("\nTo approve, type exactly: " + action)
    return input("> ").strip() == action


def json_call(cli, args):
    try:
        return json.loads(cli.run(args).stdout)
    except ValueError as error:
        raise ctl.ControlError("Native command returned invalid JSON. Inspect the selected host.") from error


def service_target(status, identity, require_running=False):
    """Only the native CLI's selected, installed target service may be managed."""
    service, config = status.get("service", {}), status.get("config", {})
    if service.get("loaded") is not True or service.get("targetRole") != "target" or config.get("mismatch"):
        raise ctl.ControlError("No unambiguous native managed Gateway target. Use the manual host guide; no service was stopped.")
    for key in ("cli", "daemon"):
        item = config.get(key, {})
        if item.get("exists") is not True or item.get("valid") is not True or not item.get("path") or Path(item["path"]).resolve() != Path(identity["config_path"]).resolve():
            raise ctl.ControlError("Gateway service/config target differs from the selected installation.")
    environment = service.get("command", {}).get("environment", {}) or {}
    for key, expected in (("OPENCLAW_STATE_DIR", identity["state_dir"]), ("OPENCLAW_PROFILE", identity["profile"]), ("OPENCLAW_CONFIG_PATH", identity["config_path"])):
        if key in environment and environment[key] != expected:
            raise ctl.ControlError("Gateway service identity differs at " + key + ". Nothing was stopped.")
    running = service.get("runtime", {}).get("status") == "running"
    if running or require_running:
        version = status.get("rpc", {}).get("server", {}).get("version") or status.get("rpc", {}).get("version") or status.get("gateway", {}).get("version")
        if not running or status.get("rpc", {}).get("ok") is not True or version != ctl.VERSION:
            raise ctl.ControlError("The selected Gateway is not reachable at the supported version. Inspect native gateway status.")
    return running


def start_gateway(cli):
    # A native start may report a short readiness timeout after successfully
    # starting the service. Reconcile the same target instead of restarting it.
    result = cli.run(["gateway", "start"], True)
    last_error = "Gateway readiness is not confirmed."
    for attempt in range(15):
        try:
            status = json_call(cli, ["gateway", "status", "--json", "--deep"])
            service_target(status, cli.identity, True)
            return
        except RuntimeError as error:
            last_error = str(error)
        if attempt < 14:
            time.sleep(2)
    raise ctl.ControlError("Gateway start/readiness failed after rechecking the selected service. " + last_error + " Run native gateway status --deep for diagnostics.")


@contextlib.contextmanager
def maintenance(cli, originally_running, approved):
    if not approved:
        raise ctl.ControlError("Maintenance was not approved; nothing changed.")
    # Mark intent before stopping: even an uncertain stop must restore the original service.
    primary_error = None
    try:
        if originally_running:
            # Native 2026.11.6 requires this acknowledgment when stdout is
            # captured. The exact service maintenance was approved above.
            cli.run(["gateway", "stop", "--force"])
        status = json_call(cli, ["gateway", "status", "--json", "--deep"])
        service_target(status, cli.identity)
        if status.get("service", {}).get("runtime", {}).get("status") != "stopped":
            raise ctl.ControlError("Gateway is not confirmed stopped. Local Template Add was not attempted.")
        yield
    except BaseException as error:
        primary_error = error
        raise
    finally:
        if originally_running:
            try:
                start_gateway(cli)
            except RuntimeError as recovery_error:
                if primary_error is not None:
                    raise ctl.ControlError("Original setup failure: " + str(primary_error) + "; recovery also failed: " + str(recovery_error)) from primary_error
                raise


def delegation_plan(snapshot, verified):
    """Same native allowlist merge as the existing browser crew owner; CAS on apply."""
    config = snapshot.get("sourceConfig", snapshot.get("config"))
    if snapshot.get("valid") is not True or not snapshot.get("hash") or not isinstance(config, dict):
        raise ctl.ControlError("Cannot review current native config safely.")
    helm = verified["helm"]["actualAgentId"]
    agents = config.get("agents", {})
    entry = agents.get("entries", {}).get(helm)
    if not isinstance(entry, dict):
        raise ctl.ControlError("Verified Helm has no native config entry.")
    policy = entry.get("subagents", {})
    defaults = agents.get("defaults", {}).get("subagents", {})
    if not isinstance(policy, dict) or not isinstance(defaults, dict):
        raise ctl.ControlError("Native subagent policy needs manual review.")
    existing = policy.get("allowAgents")
    if existing is None:
        existing = defaults.get("allowAgents", [])
    if not isinstance(existing, list) or any(not isinstance(item, str) for item in existing):
        raise ctl.ControlError("Native target policy cannot be merged safely.")
    selected = [verified[role]["actualAgentId"] for role in ("jace", "cruz")]
    if "*" in existing or all(item in existing for item in selected):
        return None
    merged = list(dict.fromkeys(existing + selected))
    return {"baseHash": snapshot["hash"], "raw": json.dumps({"agents": {"entries": {helm: {"subagents": {"allowAgents": merged}}}}}, indent=2), "response": "summary"}


def enable_templates(cli):
    response = cli.run(["config", "get", LABS, "--json"], True)
    try:
        current = json.loads(response.stdout)
    except ValueError as error:
        raise ctl.ControlError("Cannot read native Templates Labs setting.") from error
    absent = bool(response.returncode and isinstance(current, dict) and "Config path is valid but unset: " + LABS in json.dumps(current))
    if response.returncode and not absent:
        raise ctl.ControlError("Cannot inspect Templates Labs setting.")
    if not absent and current is True:
        return
    if not absent and current is not False:
        raise ctl.ControlError("Templates Labs setting is not a boolean.")
    args = ["config", "set", LABS, "true", "--strict-json"]
    cli.run(args + ["--dry-run"])
    print("Native Templates Labs: " + ("unset" if absent else "false") + " -> true. This enables reviewed Template installation.")
    if not approve("ENABLE TEMPLATES"):
        raise ctl.ControlError("Templates permission declined. No crew was added.")
    cli.run(args + (["--expect-current-absent"] if absent else ["--expect-current-json", "false"]))


def review_main_binding_change(cli, change):
    bindings = json_call(cli, ["config", "get", "bindings", "--json"])
    if not isinstance(bindings, list):
        return False
    main = [row for row in bindings if isinstance(row, dict) and row.get("agentId") == "main"]
    if len(main) != change["fields"]["bindings"]["after"]:
        return False
    print("Main's routing binding count increased during native Add. Main is still the same default agent; review its CURRENT bindings before continuing:")
    print(json.dumps(main, indent=2))
    print("The Add already occurred. Approval retains these observed Main bindings; declining preserves receipts and stops setup. No model, workspace or default change can be accepted through this review.")
    return approve("KEEP REVIEWED MAIN ROUTING")


def check_model(cli, agent=None):
    args = ["models", "status", "--json", "--check"]
    if agent:
        args += ["--agent", agent]
    result = cli.run(args, True)
    if result.returncode == 2:
        print((agent or "Default model") + ": authorization is usable but expiring; continuing with the native warning.")
    elif result.returncode != 0:
        raise ctl.ControlError((agent or "Default model") + " readiness failed. Run native models status --check" + (" --agent " + agent if agent else "") + " for diagnostics. No model defaults or credentials were changed.")


def setup(cli):
    if cli.version() != ctl.VERSION:
        raise ctl.ControlError("This ZIP supports OpenClaw 2026.11.6 only. Install/onboard that release before setup.")
    if not Path(cli.identity["config_path"]).is_file():
        raise ctl.ControlError("OpenClaw is not onboarded at this target. Run native openclaw onboard first.")
    registration = crew.Registration(cli)
    baseline = registration.baseline()
    main = [row for row in baseline["inventory"] if row["id"] == "main"]
    if len(main) != 1 or not Path(main[0].get("workspace", "")).is_absolute():
        raise ctl.ControlError("Expected onboarded main workspace is missing. Finish native onboarding first.")
    check_model(cli)
    status = json_call(cli, ["gateway", "status", "--json", "--deep"])
    running = service_target(status, cli.identity)
    print(json.dumps({"target": cli.identity, "gatewayService": status["service"].get("label"), "running": running,
                      "mainWorkspace": main[0]["workspace"], "crew": baseline["crew"]}, indent=2))
    print("Plan: pause this managed Gateway; review/add each missing crew agent; install both skills; enable the verified UI; restore the service. Main/default/model/channel settings stay intact. Sanitize stays off. Receipts remain private on this host.")
    if not approve("SET UP COMMAND DECK"):
        raise ctl.ControlError("Setup declined; nothing changed.")
    workspace = Path(main[0]["workspace"]).resolve(strict=True)
    # The existing deployment owner validates private target storage and binds its identity.
    with ctl.Controller(cli, BASE / "skills/lazykins/runtime/payload").locked() as owner:
        owner.verified_payload()
        root = cli.root()
        owned = owner.load()
        if root["present"] and (not owned or root["value"] != owned.get("owned_root")):
            raise ctl.ControlError("An unrelated custom Control UI root exists. Preserve it and review the manual guide before setup.")
        receipts = Path(tempfile.mkdtemp(prefix="setup-r7.1-", dir=owner.home))
    print("Private setup receipts: " + str(receipts))
    crew.private_write(receipts / "baseline.json", baseline)
    with maintenance(cli, running, True):
        enable_templates(cli)
        for role in crew.IDS:
            review = registration.review(role)
            crew.private_write(receipts / (role + "-review.json"), review)
            classification = review.get("classification")
            if classification:
                if classification["state"] != "verified":
                    raise ctl.ControlError(role + ": " + classification.get("reason", "Needs manual review"))
                print(role + ": reusing verified native agent " + classification["actualAgentId"])
                continue
            print("\nReview " + role + ": authored files, destination workspace, native inspection, dry-run and warnings:")
            print(json.dumps(review, indent=2))
            if not approve("ADD " + role):
                raise ctl.ControlError(role + " not approved. Existing verified agents are retained; rerun to continue.")
            registration.apply(role, review, role, receipts / (role + "-outcome.json"), review_binding_change=lambda change: review_main_binding_change(cli, change))
        verified = registration.baseline()
        if any(verified["crew"][role]["state"] != "verified" for role in crew.IDS):
            raise ctl.ControlError("Crew changed during registration. UI was not enabled.")
        for role in crew.IDS:
            actual = verified["crew"][role]["actualAgentId"]
            check_model(cli, actual)
        with ctl.Controller(cli, BASE / "skills/lazykins/runtime/payload").locked() as owner:
            owner.off()
        paired.register(cli, workspace, "main")
        with ctl.Controller(cli, BASE / "skills/lazykins/runtime/payload").locked() as owner:
            owner.install()
            owner.on()
        crew.private_write(receipts / "crew-verified.json", verified)
    if not running:
        print("Gateway was originally stopped. Setup preserves that state.")
        if not approve("START GATEWAY"):
            crew.private_write(receipts / "complete.json", {"version": ctl.VERSION, "crew": verified["crew"], "uiConfigured": True, "gatewayStarted": False, "providerChatsVerified": False, "liveDelegationVerified": False})
            print("Setup saved. Start the selected native Gateway when ready, then open Command Deck. Delegation review remains available in Crew setup & permissions.")
            return
        start_gateway(cli)
    service_target(json_call(cli, ["gateway", "status", "--json", "--deep"]), cli.identity, True)
    # Separate permission review, using the existing native configuration authority.
    try:
        snapshot = json_call(cli, ["gateway", "call", "config.get", "--json", "--params", "{}"])
        plan = delegation_plan(snapshot, verified["crew"])
    except RuntimeError:
        snapshot, plan = None, None
        print("Direct crew setup is ready. Delegation review is unavailable to this CLI session; use Crew setup & permissions with the authorized owner. No target grant was applied.")
    if plan:
        print("\nOptional Helm delegation target addition (preserves existing effective targets):\n" + plan["raw"])
        print("This permits Jace/Cruz as targets; it does not start a task or override effective tool/model policy.")
        if approve("ALLOW HELM CREW TARGETS"):
            current = registration.baseline()
            if current["crew"] != verified["crew"]:
                raise ctl.ControlError("Crew changed. Review delegation again in the UI.")
            crew.private_write(receipts / "delegation-reviewed.json", plan)
            # No automatic retry if acknowledgment is lost. Gateway CAS checks baseHash.
            try:
                result = json_call(cli, ["gateway", "call", "config.patch", "--json", "--params", json.dumps(plan)])
                if result.get("ok") is not True:
                    raise ctl.ControlError("Permission write was not acknowledged.")
                crew.private_write(receipts / "delegation-acknowledged.json", {"ok": True, "runtimeDelegationVerified": False})
            except RuntimeError as error:
                crew.private_write(receipts / "delegation-unconfirmed.json", {"state": "unconfirmed-inspect-before-retry", "error": str(error), "automaticRetry": False})
                print("UI and direct crew setup are complete. The optional delegation write is UNCONFIRMED. Use Crew setup & permissions to read current policy before any new approval; no automatic retry was made.")
    elif snapshot is not None:
        print("Existing effective delegation targets already include the crew; no permission change needed.")
    crew.private_write(receipts / "complete.json", {"version": ctl.VERSION, "crew": verified["crew"], "uiConfigured": True, "providerChatsVerified": False, "liveDelegationVerified": False})
    print("\nSetup complete. Open your usual OpenClaw dashboard, reload it, then click Enter Command Deck. It opens verified Helm; Jace and Cruz have independent native chats. Main remains the ordinary OpenClaw default.\nPrivate receipts: " + str(receipts))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--config-path")
    parser.add_argument("--openclaw", default="openclaw")
    args = parser.parse_args()
    try:
        if sys.version_info < (3, 11) or sys.platform != "linux" or os.geteuid() == 0:
            raise ctl.ControlError("Run with Python 3.11+ on Ubuntu as the OpenClaw service user, without sudo.")
        if not sys.stdin.isatty() or not re.fullmatch(r"[A-Za-z0-9_-]+", args.profile):
            raise ctl.ControlError("Use an interactive terminal and a valid explicit profile. There is no blanket --yes approval.")
        setup(ctl.OpenClaw(args.state_dir, args.profile, args.openclaw, args.config_path))
        return 0
    except (RuntimeError, OSError, ValueError, EOFError, KeyboardInterrupt) as error:
        print("Setup stopped: " + (str(error) or "cancelled") + ". Keep the private receipts. Existing agents are never deleted automatically; inspect before retrying.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
