import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("install_both", BASE / "install-both.py")
pair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pair)

class FakeCli:
    def __init__(self, base):
        self.state_dir = base / "state"
        self.profile = "paired-profile"
        self.workspace = base / "agent workspace"
        self.workspace.mkdir()
        self.calls = []
        self.release = "2026.11.6"
    def version(self):
        return self.release
    def run(self, args, allow_failure=False):
        self.calls.append(args)
        class Result:
            returncode = 0
            stdout = "{}"
        result = Result()
        if args[:2] == ["agents", "list"]:
            result.stdout = json.dumps([{"id": "agent-a", "workspace": str(self.workspace)}])
        elif args[:2] == ["skills", "install"]:
            source = Path(args[2])
            target = self.workspace / "skills" / args[args.index("--as") + 1]
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(source, target)
            (target / ".openclaw").mkdir()
            (target / ".openclaw/source-origin.json").write_text("{}")
        return result

class PairTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="paired proof ", dir=BASE / "tests")
        self.base = Path(self.tmp.name)
        for name in ("lazykins", "sanitize"):
            skill = self.base / "skills" / name
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text("fixture " + name)
        self.cli = FakeCli(self.base)
    def tearDown(self):
        self.tmp.cleanup()
    def test_pair_idempotent_and_preserves_user_edits(self):
        with patch.object(pair, "BASE", self.base):
            pair.register(self.cli, self.cli.workspace, "agent-a")
            pair.register(self.cli, self.cli.workspace, "agent-a")
            self.assertEqual(len([call for call in self.cli.calls if call[:2] == ["skills", "install"]]), 2)
            edited = self.cli.workspace / "skills/sanitize/SKILL.md"
            edited.write_text("user changed this")
            with self.assertRaises(pair.ctl.ControlError):
                pair.register(self.cli, self.cli.workspace, "agent-a")
            self.assertEqual(edited.read_text(), "user changed this")
    def test_unowned_conflict_checked_before_overwrite(self):
        target = self.cli.workspace / "skills/lazykins"
        target.mkdir(parents=True)
        (target / "SKILL.md").write_text("foreign")
        with patch.object(pair, "BASE", self.base), self.assertRaises(pair.ctl.ControlError):
            pair.register(self.cli, self.cli.workspace, "agent-a")
        self.assertFalse(any(call[:2] == ["skills", "install"] for call in self.cli.calls))
    def test_version_and_target_rejection(self):
        with patch.object(pair, "BASE", self.base):
            self.cli.release = "2026.9.7"
            with self.assertRaises(pair.ctl.ControlError):
                pair.register(self.cli, self.cli.workspace, "agent-a")
            self.cli.release = "2026.11.6"
            with self.assertRaises(pair.ctl.ControlError):
                pair.register(self.cli, self.cli.workspace, "wrong-agent")
        self.assertFalse(any(call[:2] == ["skills", "install"] for call in self.cli.calls))

class ConfigBoundaryTests(unittest.TestCase):
    def test_absent_root_restore_uses_parent_cas(self):
        cli = pair.ctl.OpenClaw(BASE / "tests", "fixture")
        parent = {"root": "/owned build", "allowedOrigins": ["https://fixture.example"], "enabled": True}
        calls = []
        def run(args, allow_failure=False):
            calls.append(args)
            class Result:
                stdout = json.dumps(parent)
                returncode = 0
            return Result()
        cli.run = run
        cli.restore_root({"present": False}, {"present": True, "value": "/owned build"})
        args = calls[-1]
        self.assertEqual(args[:3], ["config", "set", "gateway.controlUi"])
        self.assertEqual(json.loads(args[3]), {"allowedOrigins": ["https://fixture.example"], "enabled": True})
        self.assertEqual(json.loads(args[-1]), parent)
        self.assertIn("--expect-current-json", args)
    def test_redacted_parent_not_written(self):
        cli = pair.ctl.OpenClaw(BASE / "tests", "fixture")
        calls = []
        def run(args, allow_failure=False):
            calls.append(args)
            class Result:
                stdout = json.dumps({"root": "/owned", "github": {"token": "__OPENCLAW_REDACTED__"}})
                returncode = 0
            return Result()
        cli.run = run
        with self.assertRaises(pair.ctl.ControlError):
            cli.restore_root({"present": False}, {"present": True, "value": "/owned"})
        self.assertEqual(len(calls), 1)

if __name__ == "__main__":
    unittest.main()
