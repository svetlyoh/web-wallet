#!/usr/bin/env python3
"""Local, reversible custom-root deployment. Never edits package files or auth."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile

VERSION = "2026.11.6"
SHA = "06afb10d3272cc9deaf38ca6a3b7b839d5935638"
ROOT_KEY = "gateway.controlUi.root"

class ControlError(RuntimeError):
    pass

def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def inventory(root):
    result = {}
    for path in root.rglob("*"):
        if path.is_symlink():
            raise ControlError("UI payload contains a symlink; refusing deployment.")
        if path.is_file():
            result[path.relative_to(root).as_posix()] = digest(path)
    return result

class OpenClaw:
    def __init__(self, state_dir, profile, executable="openclaw", config_path=None):
        self.state_dir = Path(state_dir).expanduser().resolve()
        self.profile = profile
        self.command = [executable, "--profile", profile]
        self.env = dict(os.environ, OPENCLAW_STATE_DIR=str(self.state_dir),
                        OPENCLAW_PROFILE=profile,
                        OPENCLAW_CONFIG_PATH=str(Path(config_path).expanduser().resolve()
                            if config_path else self.state_dir / "openclaw.json"))
        self.identity = {"profile": profile, "state_dir": str(self.state_dir),
                         "config_path": self.env["OPENCLAW_CONFIG_PATH"]}
    def run(self, args, allow_failure=False):
        try:
            result = subprocess.run(self.command + args, env=self.env, capture_output=True,
                                    text=True, timeout=120, shell=False)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise ControlError("OpenClaw command could not finish; inspect the selected host.") from error
        if result.returncode and not allow_failure:
            # CLI output can include secret-bearing diagnostics. Keep it out of product state.
            raise ControlError("OpenClaw rejected " + " ".join(args[:2]) + "; inspect its local diagnostics.")
        return result
    def version(self):
        output = self.run(["--version"]).stdout
        found = re.search(r"(?<![\w.])(2026\.\d+\.\d+(?:-[\w.]+)?)(?![\w.])", output)
        if not found:
            raise ControlError("Could not identify the installed OpenClaw version.")
        return found.group(1)
    def root(self):
        result = self.run(["config", "get", ROOT_KEY, "--json"], True)
        try:
            value = json.loads(result.stdout)
        except ValueError as error:
            raise ControlError("Root inspection returned invalid JSON; nothing was changed.") from error
        if result.returncode:
            # Tagged CLI's explicit unset-path failure, not arbitrary failure => absent.
            if isinstance(value, dict) and "Config path is valid but unset: " + ROOT_KEY in json.dumps(value):
                return {"present": False}
            raise ControlError("Could not inspect the custom UI root; nothing was changed.")
        if not isinstance(value, str):
            raise ControlError("Custom UI root is not a string.")
        return {"present": True, "value": value}
    def set_root(self, value, expected):
        args = ["config", "set", ROOT_KEY, json.dumps(value), "--strict-json"]
        expectation = (["--expect-current-json", json.dumps(expected["value"])]
                       if expected["present"] else ["--expect-current-absent"])
        self.run(args + ["--dry-run"])
        return self.run(args + expectation).stdout
    def restore_root(self, previous, expected):
        if previous["present"]:
            return self.set_root(previous["value"], expected)
        # No native conditional unset exists. Use a conditional parent write
        # only when that exact parent has no potentially redacted credential.
        result = self.run(["config", "get", "gateway.controlUi", "--json"])
        current = json.loads(result.stdout)
        if not isinstance(current, dict) or current.get("root") != expected["value"]:
            raise ControlError("UI root changed since inspection; refusing rollback.")
        if isinstance(current.get("github"), dict) and "token" in current["github"]:
            raise ControlError("Conditional rollback cannot rewrite a credential-bearing Control UI parent. Keep this receipt; use a supervised native config unset gateway.controlUi.root with administrative edits paused.")
        restored = dict(current)
        del restored["root"]
        return self.run(["config", "set", "gateway.controlUi", json.dumps(restored),
                         "--strict-json", "--expect-current-json", json.dumps(current)]).stdout

class Controller:
    def __init__(self, cli, payload):
        self.cli = cli
        self.payload = Path(payload).resolve()
        self.home = cli.state_dir / "lazykins"
        self.db = None
    @contextlib.contextmanager
    def locked(self):
        if self.home.is_symlink():
            raise ControlError("Product state is a symlink; refusing writes.")
        self.home.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.safe_private(self.home, directory=True)
        lock = self.home / "operation.lock"
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError as error:
            raise ControlError("Another operation or interrupted operation holds the lock. Inspect before removing operation.lock.") from error
        try:
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            dbpath = self.home / "state.sqlite3"
            if dbpath.exists() or dbpath.is_symlink():
                self.safe_private(dbpath)
            self.db = sqlite3.connect(dbpath)
            self.db.execute("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)")
            os.chmod(dbpath, 0o600)
            identity = getattr(self.cli, "identity", {"profile": self.cli.profile,
                "state_dir": str(self.cli.state_dir), "config_path": str(self.cli.state_dir / "openclaw.json")})
            self.db.execute("CREATE TABLE IF NOT EXISTS target (id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL)")
            bound = self.db.execute("SELECT identity FROM target WHERE id=1").fetchone()
            if not bound and self.db.execute("SELECT 1 FROM settings WHERE id=1").fetchone():
                raise ControlError("An unbound older receipt exists. Inspect its original target before migration or manual rollback; do not adopt it automatically.")
            if bound and json.loads(bound[0]) != identity:
                raise ControlError("Product state belongs to another profile/config target. Use that target's state or a separate state directory.")
            with self.db:
                self.db.execute("INSERT OR IGNORE INTO target VALUES (1,?)", (json.dumps(identity),))
            yield self
        finally:
            if self.db:
                self.db.close()
                self.db = None
            lock.unlink(missing_ok=True)
    @staticmethod
    def safe_private(path, directory=False):
        info = path.lstat()
        valid = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink == 1
        if not valid or (hasattr(os, "getuid") and info.st_uid != os.getuid()):
            raise ControlError("Product storage has an unsafe type, hard-link alias, or owner.")
        os.chmod(path, 0o700 if directory else 0o600)
    def load(self):
        row = self.db.execute("SELECT data FROM settings WHERE id=1").fetchone()
        return json.loads(row[0]) if row else None
    def save(self, state):
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO settings VALUES (1,?)", (json.dumps(state),))
    def verified_payload(self):
        manifest_path = self.payload / "manifest.json"
        if manifest_path.is_symlink():
            raise ControlError("Payload manifest is a symlink.")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("version") != VERSION or manifest.get("sha") != SHA or manifest.get("testedVersions") != [VERSION]:
            raise ControlError("Payload provenance is outside the verified 2026.11.6 baseline.")
        files = manifest.get("files", {})
        if not files or "index.html" not in files:
            raise ControlError("Payload inventory lacks index.html.")
        for name, value in files.items():
            rel = PurePosixPath(name)
            if rel.is_absolute() or ".." in rel.parts or "\\" in name or ":" in name or not re.fullmatch("[a-f0-9]{64}", value):
                raise ControlError("Unsafe payload inventory entry.")
        root = self.payload / "control-ui"
        if root.is_symlink() or inventory(root) != files:
            raise ControlError("Payload files differ from the checksum inventory.")
        return manifest
    def compatible(self):
        version = self.cli.version()
        if version != VERSION:
            raise ControlError("OpenClaw " + version + " is unverified. Keep the skills; rebuild and validate for this version before enabling LazyKins.")
    def install(self):
        self.compatible()
        manifest = self.verified_payload()
        state = self.load()
        if state and state.get("pending"):
            raise ControlError("Interrupted root switch recorded. Run status and off before installing again.")
        buildid = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()[:20]
        builds = self.home / "builds"
        if builds.is_symlink():
            raise ControlError("Build storage is a symlink.")
        builds.mkdir(exist_ok=True)
        target = builds / (VERSION + "-" + buildid)
        if target.exists():
            if target.is_symlink() or inventory(target) != manifest["files"]:
                raise ControlError("Existing generation differs from the verified payload.")
        else:
            stage = Path(tempfile.mkdtemp(prefix=".stage-", dir=builds))
            try:
                shutil.copytree(self.payload / "control-ui", stage, dirs_exist_ok=True)
                if inventory(stage) != manifest["files"]:
                    raise ControlError("Staged files failed checksum verification.")
                os.replace(stage, target)
            finally:
                if stage.exists():
                    shutil.rmtree(stage)
        if state and state.get("owned_root") and state["owned_root"] != str(target):
            raise ControlError("Active generation differs. Disable the previous generation first.")
        state = state or {"schema": 1, "profile": self.cli.profile}
        state.update(build=str(target), manifest=manifest)
        self.save(state)
        return {"installed": True, "configured": False, "build": str(target)}
    def status(self):
        state = self.load()
        root = self.cli.root()
        version = self.cli.version()
        configured = bool(state and root == {"present": True, "value": state.get("owned_root")})
        manifest = (state or {}).get("manifest", {"version": VERSION, "sha": SHA,
            "testedVersions": [VERSION], "integration": "not installed"})
        build_integrity = None
        if state and state.get("build"):
            build = Path(state["build"])
            build_integrity = build.is_dir() and not build.is_symlink() and inventory(build) == manifest.get("files")
        compatible = (version == manifest.get("version") == VERSION and manifest.get("sha") == SHA
                      and manifest.get("testedVersions") == [VERSION] and build_integrity is not False)
        return {"installed": bool(state and state.get("build")), "configured": configured,
                "browserMode": "Inspect this browser's LazyKins view selector",
                "runtimeVersion": version, "compatible": compatible,
                "buildVersion": manifest.get("version"), "buildSha": manifest.get("sha"),
                "integration": manifest.get("integration"), "buildIntegrity": build_integrity,
                "testedVersions": manifest.get("testedVersions"), "pending": (state or {}).get("pending"),
                "liveVerified": False,
                "nextStep": "Reload and verify in the browser" if compatible else "Run off to restore the original root; revalidate a matching-source build before on"}
    def on(self):
        self.compatible()
        state = self.load()
        if not state or not state.get("build"):
            raise ControlError("Install the verified local UI payload first.")
        manifest = state.get("manifest", {})
        if manifest.get("version") != VERSION or manifest.get("sha") != SHA or manifest.get("testedVersions") != [VERSION]:
            raise ControlError("The recorded UI belongs to another OpenClaw release. Roll back its root and install the matching new build first.")
        build = Path(state["build"])
        if build.is_symlink() or inventory(build) != state["manifest"]["files"]:
            raise ControlError("Installed build checksum verification failed.")
        root = self.cli.root()
        owned = {"present": True, "value": str(build)}
        if state.get("owned_root"):
            if root != owned:
                raise ControlError("UI root was changed outside LazyKins. Preserve that change; do not re-enable automatically.")
            return {"configured": True, "liveVerified": False, "changed": False}
        # Write the recovery receipt before the external config write.
        state.update(previous=root, owned_root=str(build), pending="on")
        self.save(state)
        try:
            hint = self.cli.set_root(str(build), root)
        except Exception:
            if self.cli.root() == root:
                state.pop("owned_root", None)
                state.pop("pending", None)
                self.save(state)
            raise
        if self.cli.root() != owned:
            raise ControlError("OpenClaw did not confirm the root change; recovery metadata retained.")
        state.pop("pending", None)
        self.save(state)
        return {"configured": True, "liveVerified": False, "changed": True,
                "nextStep": "Follow the OpenClaw config reload hint, then reload and verify the browser.",
                "restartRequired": "Restart the gateway to apply." in hint}
    def off(self):
        state = self.load()
        if not state or not state.get("owned_root"):
            return {"configured": False, "changed": False}
        root = self.cli.root()
        expected = {"present": True, "value": state["owned_root"]}
        if root == state["previous"] and state.get("pending"):
            state.pop("owned_root", None)
            state.pop("pending", None)
            self.save(state)
            return {"configured": False, "changed": False, "recovered": True}
        if root != expected:
            raise ControlError("UI root is no longer owned by LazyKins; rollback will not overwrite it.")
        state["pending"] = "off"
        self.save(state)
        hint = self.cli.restore_root(state["previous"], expected)
        if self.cli.root() != state["previous"]:
            raise ControlError("Root restoration is unconfirmed; recovery metadata retained.")
        state.pop("owned_root", None)
        state.pop("pending", None)
        self.save(state)
        return {"configured": False, "changed": True, "restartRequired": "Restart the gateway to apply." in hint}
    def uninstall(self):
        result = self.off()
        # Leave previous generations/receipts as recovery artifacts; never delete
        # package/UI/plugin/agent files. Discovery removal is an operator action.
        state = self.load()
        if state:
            state.pop("build", None)
            self.save(state)
        result["installed"] = False
        result["recoveryBuildsRetained"] = True
        return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["install", "on", "off", "status", "check-update", "repair", "uninstall"])
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--config-path")
    parser.add_argument("--openclaw", default="openclaw")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", args.profile):
        parser.error("Invalid profile name")
    try:
        if sys.platform != "linux" and args.operation not in ("status", "check-update"):
            raise ControlError("Deployment controls run on the Linux OpenClaw host only.")
        cli = OpenClaw(args.state_dir, args.profile, args.openclaw, args.config_path)
        if not cli.state_dir.is_dir():
            raise ControlError("The explicit OpenClaw state directory must already exist. Inspect the running service's target first.")
        controller = Controller(cli, Path(__file__).resolve().parents[1] / "runtime" / "payload")
        with controller.locked():
            operation = "status" if args.operation == "check-update" else "install" if args.operation == "repair" else args.operation
            result = getattr(controller, operation)()
        print(json.dumps(result, indent=2))
        if args.operation == "check-update" and not result["compatible"]:
            return 2
        return 0
    except (ControlError, ValueError, OSError, sqlite3.Error, KeyError) as error:
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
