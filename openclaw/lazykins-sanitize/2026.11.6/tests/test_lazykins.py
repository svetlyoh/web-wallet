import importlib.util
import json
from pathlib import Path
import tempfile
import os
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "skills/lazykins/scripts/lazykinsctl.py"
spec = importlib.util.spec_from_file_location("lazykinsctl", SCRIPT)
ctl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ctl)

class FakeClaw:
    def __init__(self, state):
        self.state_dir = state
        self.profile = "quiet-test"
        self.current = {"present": False}
        self.config = {"auth": {"token": "fixture-private"}, "other": 7}
        self.running = ctl.VERSION
        self.fail = False
        self.writes = 0
    def version(self):
        return self.running
    def root(self):
        return dict(self.current)
    def set_root(self, value, expected):
        if self.fail or expected != self.current:
            raise ctl.ControlError("simulated native write rejection")
        self.current = {"present": True, "value": value}
        self.writes += 1
        return "Change will apply without restarting the gateway."
    def restore_root(self, previous, expected):
        if expected != self.current:
            raise ctl.ControlError("ownership changed")
        self.current = dict(previous)
        self.writes += 1
        return "Restart the gateway to apply."

class DeploymentTests(unittest.TestCase):
    def setUp(self):
        base = Path(__file__).resolve().parent
        self.tmp = tempfile.TemporaryDirectory(prefix="isolated lazykins ", dir=base)
        self.root = Path(self.tmp.name)
        self.payload = self.root / "payload"
        (self.payload / "control-ui/assets").mkdir(parents=True)
        (self.payload / "control-ui/index.html").write_text('<script src="assets/app.js"></script>')
        (self.payload / "control-ui/assets/app.js").write_text("fixture")
        self.manifest = {"version": ctl.VERSION, "sha": ctl.SHA, "testedVersions": [ctl.VERSION],
                         "integration": "fixture", "files": ctl.inventory(self.payload / "control-ui")}
        (self.payload / "manifest.json").write_text(json.dumps(self.manifest))
        self.cli = FakeClaw(self.root / "state space")
        self.controller = ctl.Controller(self.cli, self.payload)
        self.ctx = self.controller.locked()
        self.ctx.__enter__()
    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        self.tmp.cleanup()
    def test_repeat_enable_disable_preserves_unrelated(self):
        self.controller.install()
        self.controller.install()
        self.controller.on()
        self.controller.on()
        self.cli.config["other"] = 42
        self.assertEqual(self.cli.writes, 1)
        self.assertTrue(self.controller.status()["configured"])
        self.controller.off()
        self.controller.off()
        self.assertEqual(self.cli.current, {"present": False})
        self.assertEqual(self.cli.config, {"auth": {"token": "fixture-private"}, "other": 42})
    def test_original_custom_root_restored(self):
        self.cli.current = {"present": True, "value": "/custom root/streaming"}
        self.controller.install()
        self.controller.on()
        self.controller.off()
        self.assertEqual(self.cli.current["value"], "/custom root/streaming")
    def test_foreign_root_not_overwritten(self):
        self.controller.install()
        self.controller.on()
        self.cli.current = {"present": True, "value": "/user/new-root"}
        with self.assertRaises(ctl.ControlError):
            self.controller.off()
        with self.assertRaises(ctl.ControlError):
            self.controller.on()
        self.assertEqual(self.cli.current["value"], "/user/new-root")
    def test_tamper_refused_before_activation(self):
        self.controller.install()
        build = Path(self.controller.load()["build"])
        (build / "assets/app.js").write_text("tampered")
        with self.assertRaises(ctl.ControlError):
            self.controller.on()
        self.assertEqual(self.cli.writes, 0)
    def test_future_upgrade_refuses_enable_allows_rollback(self):
        self.controller.install()
        self.controller.on()
        self.cli.running = "2026.11.10"
        self.assertFalse(self.controller.status()["compatible"])
        with self.assertRaises(ctl.ControlError):
            self.controller.on()
        self.controller.off()
        self.assertFalse(self.cli.current["present"])
    def test_rejected_config_write_retains_original(self):
        self.controller.install()
        self.cli.fail = True
        with self.assertRaises(ctl.ControlError):
            self.controller.on()
        self.assertNotIn("owned_root", self.controller.load())
        self.assertFalse(self.cli.current["present"])
    def test_interrupted_switch_recovered(self):
        self.controller.install()
        state = self.controller.load()
        state.update(previous={"present": False}, owned_root=state["build"], pending="on")
        self.controller.save(state)
        self.assertTrue(self.controller.off()["recovered"])
        self.controller.on()
        state = self.controller.load()
        state["pending"] = "off"
        self.controller.save(state)
        self.cli.current = {"present": False}
        self.assertTrue(self.controller.off()["recovered"])
    def test_payload_traversal_and_unknown_files_refused(self):
        self.manifest["files"]["../escape"] = "a" * 64
        (self.payload / "manifest.json").write_text(json.dumps(self.manifest))
        with self.assertRaises(ctl.ControlError):
            self.controller.install()
    def test_parallel_operation_refused(self):
        with self.assertRaises(ctl.ControlError):
            with ctl.Controller(self.cli, self.payload).locked():
                pass
    def test_profile_config_identity_rejected(self):
        self.controller.install()
        self.controller.on()
        self.ctx.__exit__(None, None, None)
        self.cli.profile = "another-profile"
        self.ctx = self.controller.locked()
        with self.assertRaises(ctl.ControlError):
            self.ctx.__enter__()
        # Restore fixture context only; no writes through another target.
        self.cli.profile = "quiet-test"
        self.ctx = self.controller.locked()
        self.ctx.__enter__()
        self.assertEqual(self.cli.writes, 1)
    def test_hardlinked_database_rejected(self):
        self.ctx.__exit__(None, None, None)
        alias = self.root / "unrelated.sqlite3"
        os.link(self.controller.home / "state.sqlite3", alias)
        original = alias.read_bytes()
        self.ctx = self.controller.locked()
        with self.assertRaises(ctl.ControlError):
            self.ctx.__enter__()
        self.assertEqual(alias.read_bytes(), original)
        alias.unlink()
        self.ctx = self.controller.locked()
        self.ctx.__enter__()
    def test_unbound_old_receipt_not_adopted(self):
        self.controller.install()
        self.controller.on()
        with self.controller.db:
            self.controller.db.execute("DELETE FROM target")
        self.ctx.__exit__(None, None, None)
        self.ctx = self.controller.locked()
        with self.assertRaises(ctl.ControlError):
            self.ctx.__enter__()
        self.assertEqual(self.cli.writes, 1)
        # Reattach test's original fixture identity for cleanup only.
        import sqlite3
        with sqlite3.connect(self.controller.home / "state.sqlite3") as db:
            db.execute("INSERT INTO target VALUES (1,?)", (json.dumps({"profile": self.cli.profile,
                "state_dir": str(self.cli.state_dir), "config_path": str(self.cli.state_dir / "openclaw.json")}),))
        db.close()
        self.ctx = self.controller.locked()
        self.ctx.__enter__()

if __name__ == "__main__":
    unittest.main()
