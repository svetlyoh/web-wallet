#!/usr/bin/env python3
"""Register the two local OpenClaw skills together without enabling either."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import sys

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("lazykinsctl", BASE / "skills/lazykins/scripts/lazykinsctl.py")
ctl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ctl)

def skill_files(directory):
    found = ctl.inventory(directory)
    return {key: value for key, value in found.items()
            if key != ".openclaw/source-origin.json" and "__pycache__" not in Path(key).parts}

def register(cli, workspace, agent, inspect_only=False):
    if cli.version() != ctl.VERSION:
        raise ctl.ControlError("Only OpenClaw 2026.11.6 is validated for this installer.")
    roster = json.loads(cli.run(["agents", "list", "--json"]).stdout)
    rows = roster if isinstance(roster, list) else roster.get("agents", [])
    matches = [row for row in rows if row.get("id") == agent]
    if len(matches) != 1 or Path(matches[0].get("workspace", "")).expanduser().resolve() != workspace:
        raise ctl.ControlError("Agent/workspace does not match the selected profile's configured roster.")
    skills = workspace / "skills"
    if skills.is_symlink():
        raise ctl.ControlError("Workspace skill root is a symlink; inspect discovery policy before installing.")
    results = []
    with ctl.Controller(cli, BASE / "skills/lazykins/runtime/payload").locked() as owner:
        owner.db.execute("CREATE TABLE IF NOT EXISTS registrations (target TEXT PRIMARY KEY, inventory TEXT NOT NULL)")
        plans = []
        for name in ("lazykins", "sanitize"):
            source = BASE / "skills" / name
            target = skills / name
            if target.is_symlink() or source.is_symlink():
                raise ctl.ControlError("Skill source or destination is a symlink: " + name)
            expected = skill_files(source)
            existing = skill_files(target) if target.exists() else None
            previous = owner.db.execute("SELECT inventory FROM registrations WHERE target=?", (str(target),)).fetchone()
            if existing is not None and existing != expected:
                if not previous or existing != json.loads(previous[0]):
                    raise ctl.ControlError("Existing skill contains unowned or edited files: " + name + ". Preserve it and review differences first.")
            plans.append((name, source, target, expected, existing))
        for name, source, target, expected, existing in plans:
            current = skill_files(target) if target.exists() else None
            if current != existing:
                raise ctl.ControlError("Skill destination changed during preflight: " + name)
            if not inspect_only and existing != expected:
                args = ["skills", "install", str(source), "--as", name, "--agent", agent]
                if existing is not None:
                    args.append("--force")
                # Native install scan and policy remain in force; no bypass flags.
                cli.run(args)
                if skill_files(target) != expected:
                    raise ctl.ControlError("Native installation did not produce the expected files: " + name)
            if not inspect_only:
                with owner.db:
                    owner.db.execute("INSERT OR REPLACE INTO registrations VALUES (?,?)", (str(target), json.dumps(expected)))
            info = cli.run(["skills", "info", name, "--agent", agent, "--json"], True)
            results.append({"skill": name, "filesMatch": (skill_files(target) == expected) if target.exists() else False,
                            "discoveryCommandSucceeded": info.returncode == 0,
                            "enabled": "not changed", "invocationVerified": False})
    return {"profile": cli.profile, "agent": agent, "skills": results,
            "nextStep": "Inspect native skills info/readiness, then enable each skill independently."}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("operation", choices=["install", "status"])
    p.add_argument("--state-dir", required=True)
    p.add_argument("--profile", required=True)
    p.add_argument("--agent", required=True)
    p.add_argument("--workspace", required=True)
    p.add_argument("--config-path")
    p.add_argument("--openclaw", default="openclaw")
    args = p.parse_args()
    try:
        if sys.platform != "linux":
            raise ctl.ControlError("Run paired registration on the Linux OpenClaw host.")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", args.profile):
            raise ctl.ControlError("Invalid profile name.")
        cli = ctl.OpenClaw(args.state_dir, args.profile, args.openclaw, args.config_path)
        workspace = Path(args.workspace).expanduser().resolve(strict=True)
        print(json.dumps(register(cli, workspace, args.agent, args.operation == "status"), indent=2))
        return 0
    except (ctl.ControlError, OSError, ValueError, sqlite3.Error) as error:
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
