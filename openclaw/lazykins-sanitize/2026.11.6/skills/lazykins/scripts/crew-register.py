#!/usr/bin/env python3
"""Reviewed native crew registration. Never stops services or adds agents on UI entry."""
import argparse
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import sys

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("lazykinsctl", BASE / "lazykinsctl.py")
ctl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ctl)
CREW = BASE.parent / "runtime" / "crew"
IDS = ("helm", "jace", "cruz")
SAFE_FIELDS = ("id", "name", "identityName", "workspace", "agentDir", "bindings", "isDefault", "createdVia", "creatorAgentId", "createdAt")


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def private_write(path, value):
    path = Path(path)
    if path.is_symlink():
        raise ctl.ControlError("Receipt is a symlink; choose a new private path.")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


class Registration:
    def __init__(self, cli, crew=CREW):
        self.cli, self.crew = cli, Path(crew)
        self.catalog = json.loads((self.crew / "catalog.json").read_text(encoding="utf-8"))["agents"]

    def call(self, args):
        result = self.cli.run(args)
        try:
            return json.loads(result.stdout)
        except ValueError as error:
            raise ctl.ControlError("Native command did not return JSON. Inspect its local diagnostics.") from error

    def roster(self):
        value = self.call(["agents", "list", "--json"])
        rows = value if isinstance(value, list) else value.get("agents")
        if not isinstance(rows, list) or any(not isinstance(row, dict) or not isinstance(row.get("id"), str) for row in rows):
            raise ctl.ControlError("Native roster is incomplete or invalid; refusing registration.")
        return rows

    def sources(self, agent):
        source = self.crew / "sources" / (agent + "-template")
        inventory = json.loads((self.crew / "source-inventory.json").read_text(encoding="utf-8"))["files"]
        expected = {key: digest for key, digest in inventory.items() if key.startswith("sources/" + agent + "-template/")}
        actual = {"sources/" + agent + "-template/" + key: value for key, value in ctl.inventory(source).items()}
        if source.is_symlink() or not expected or actual != expected:
            raise ctl.ControlError("Bundled canonical Template files changed. Preserve edits and review; do not Add.")
        return source, fingerprint(actual)

    def proof(self, row, metadata):
        workspace = Path(row.get("workspace", ""))
        if not workspace.is_absolute():
            return None
        expected = dict(metadata["bootstrapHashes"])
        expected["avatars/" + metadata["id"] + ".png"] = metadata["avatarSha256"]
        for name, digest in expected.items():
            target = workspace / name
            if target.is_symlink() or not target.is_file() or ctl.digest(target) != digest:
                return None
        return {"actualAgentId": row["id"], "workspace": str(workspace), "bootstrapAndAvatarHashes": expected}

    def classify(self, agent, rows):
        metadata = next(item for item in self.catalog if item["id"] == agent)
        canonical = [row for row in rows if row["id"] == agent]
        candidates = canonical or [row for row in rows if row.get("name") == metadata["name"] or row.get("identityName") == metadata["name"]]
        verified = [proof for row in candidates if (proof := self.proof(row, metadata))]
        if len(verified) == 1 and (not canonical or verified[0]["actualAgentId"] == agent):
            return {"state": "verified", **verified[0]}
        if candidates:
            return {"state": "manual-review", "reason": "Occupied, modified, partial or ambiguous agent. No overwrite or suffix is permitted."}
        return {"state": "missing"}

    def baseline(self):
        rows = self.roster()
        return {"target": self.cli.identity, "version": ctl.VERSION, "inventory": [{key: row[key] for key in SAFE_FIELDS if key in row} for row in rows], "registryFingerprint": fingerprint(rows), "crew": {agent: self.classify(agent, rows) for agent in IDS}, "hostAccessed": True, "servicesChanged": False}

    def plan(self, agent, rows):
        state = self.classify(agent, rows)
        if state["state"] != "missing":
            return {"agent": agent, "classification": state, "changed": False}
        source, source_hash = self.sources(agent)
        validation = self.call(["templates", "validate", str(source), "--json"])
        inspection = self.call(["templates", "inspect", str(source), "--json"])
        plan = self.call(["templates", "add", str(source), "--agent-id", agent, "--dry-run", "--json"])
        if plan.get("blockers") or not plan.get("planIntegrity") or plan.get("agent", {}).get("finalId") != agent:
            raise ctl.ControlError("Native plan is blocked or proposes a different ID. Review locally; do not apply.")
        if plan.get("capabilityChanges") or any(plan.get("summary", {}).get(key, 0) for key in ("packageActions", "mcpServerActions", "cronJobActions", "capabilityEscalations", "blockedActions")):
            raise ctl.ControlError("Unexpected dependencies, jobs or permission changes; this crew helper will not accept them.")
        return {"agent": agent, "target": self.cli.identity, "registryFingerprint": fingerprint(rows), "sourceFingerprint": source_hash, "validation": validation, "inspection": inspection, "nativeDryRun": plan}

    def review(self, agent):
        return self.plan(agent, self.roster())

    def apply(self, agent, reviewed, approval, outcome_path):
        if approval != agent or reviewed.get("agent") != agent or reviewed.get("target") != self.cli.identity:
            raise ctl.ControlError("Approval/receipt does not match this agent, profile, state directory and config.")
        outcome_path = Path(outcome_path)
        if outcome_path.exists() or outcome_path.is_symlink():
            raise ctl.ControlError("An outcome already exists. Inspect it and the current roster before retrying.")
        before = self.roster()
        current = self.plan(agent, before)
        if current.get("classification"):
            return current  # Already verified or conflict: never repeat Add.
        for key in ("registryFingerprint", "sourceFingerprint"):
            if reviewed.get(key) != current.get(key):
                raise ctl.ControlError("Registry or Template source changed. Review a fresh plan.")
        if reviewed.get("nativeDryRun", {}).get("planIntegrity") != current["nativeDryRun"]["planIntegrity"]:
            raise ctl.ControlError("Native plan changed. Review a fresh dry-run before approval.")
        # Record intent before effect. An uncertain or interrupted Add is not replayable.
        private_write(outcome_path, {"state": "pending-inspect-before-retry", "agent": agent, "target": self.cli.identity, "reviewedPlanIntegrity": current["nativeDryRun"]["planIntegrity"]})
        source, _ = self.sources(agent)
        result = self.call(["templates", "add", str(source), "--agent-id", agent, "--json"])
        after = self.roster()
        existing = {row["id"]: row for row in before}
        if any({row["id"]: row for row in after}.get(key) != row for key, row in existing.items()):
            raise ctl.ControlError("An existing agent changed. Preserve the outcome and inspect; no automatic rollback or retry.")
        proof = self.classify(agent, after)
        if result.get("agent", {}).get("finalId") != agent or proof["state"] != "verified" or proof["workspace"] != current["nativeDryRun"]["agent"]["workspace"]:
            raise ctl.ControlError("Add outcome is uncertain or differs from review. Inspect actual IDs/workspaces; do not retry.")
        # Keep the pre-effect receipt immutable. Write a separate completion receipt.
        completed = {"state": "verified", "agent": agent, "target": self.cli.identity, "creationResult": result, "verification": proof, "existingAgentsUnchanged": True}
        private_write(str(outcome_path) + ".completed.json", completed)
        return completed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["baseline", "review", "apply"])
    parser.add_argument("agent", nargs="?", choices=IDS)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--config-path")
    parser.add_argument("--openclaw", default="openclaw")
    parser.add_argument("--receipt", required=True, help="New private output path for baseline/review; existing reviewed receipt for apply")
    parser.add_argument("--approve-agent", choices=IDS)
    args = parser.parse_args()
    try:
        if sys.platform != "linux":
            raise ctl.ControlError("Run on the selected Linux Gateway host, as its service owner, without sudo.")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", args.profile):
            raise ctl.ControlError("Invalid profile name.")
        cli = ctl.OpenClaw(args.state_dir, args.profile, args.openclaw, args.config_path)
        if not Path(cli.identity["config_path"]).is_file():
            raise ctl.ControlError("Selected config does not exist. Verify the original service target first.")
        if cli.version() != ctl.VERSION:
            raise ctl.ControlError("This incremental helper supports OpenClaw 2026.11.6 only.")
        registration = Registration(cli)
        if args.operation == "baseline":
            result = registration.baseline()
            private_write(args.receipt, result)
        elif not args.agent:
            raise ctl.ControlError("Choose one agent per review/application.")
        elif args.operation == "review":
            result = registration.review(args.agent)
            private_write(args.receipt, result)
        else:
            receipt = Path(args.receipt)
            if receipt.is_symlink():
                raise ctl.ControlError("Review receipt is a symlink.")
            result = registration.apply(args.agent, json.loads(receipt.read_text(encoding="utf-8")), args.approve_agent, str(receipt) + ".outcome.json")
        print(json.dumps(result, indent=2))
        return 0
    except (ctl.ControlError, OSError, ValueError) as error:
        print(json.dumps({"ok": False, "error": str(error), "servicesChangedByHelper": False}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
