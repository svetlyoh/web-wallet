"""Portable control-boundary proof; temporary workspaces stay in this package."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import threading
import unittest
from unittest import mock

PACKAGE = Path(__file__).resolve().parents[1]
SCRIPT = PACKAGE / "skills" / "sanitize" / "scripts" / "sanitizectl.py"
SPEC = importlib.util.spec_from_file_location("sanitizectl", SCRIPT)
ctl = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ctl)


class SanitizeControlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sanitize proof ", dir=PACKAGE / "tests")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.workspace = self.root / "agent workspace with spaces"
        self.state = self.root / "profile state with spaces"
        self.workspace.mkdir()
        self.state.mkdir()
        self.controller = ctl.Controller(self.workspace, self.state, "work-profile", "researcher")
        self.soul = self.workspace / "SOUL.md"

    def run_control(self, operation, mode=None, version=ctl.BASELINE, **kwargs):
        return self.controller.run(operation, complexity=mode, version=version, **kwargs)

    def test_on_twice_and_off_preserve_original_byte_fidelity(self):
        cases = [b"", b"# Identity", b"# Identity\n", b"# Identity\r\n",
                 b"\xef\xbb\xbf# Identity\r\nKeep Zo\xc3\xab.\nLast line"]
        for original in cases:
            with self.subTest(original=original):
                self.soul.write_bytes(original)
                first = self.run_control("on")
                installed = self.soul.read_bytes()
                second = self.run_control("on")
                self.assertTrue(first["changed"])
                self.assertFalse(second["changed"])
                self.assertEqual(installed.count(ctl.BEGIN), 1)
                self.run_control("off")
                self.assertEqual(self.soul.read_bytes(), original)

    def test_new_soul_removed_only_if_no_user_content_was_added(self):
        self.run_control("on")
        self.run_control("off")
        self.assertFalse(self.soul.exists())
        self.run_control("on")
        self.soul.write_bytes(self.soul.read_bytes() + b"\nUser additions.\n")
        self.run_control("off")
        self.assertEqual(self.soul.read_bytes(), b"\nUser additions.\n")

    def test_unrelated_edits_before_and_after_block_survive_disable(self):
        self.soul.write_bytes(b"# Identity\r\nOriginal.\r\n")
        self.run_control("on")
        self.soul.write_bytes(self.soul.read_bytes().replace(b"Original.", b"Updated by user.") + b"\r\nUser footer.\r\n")
        self.run_control("complexity", "detailed")
        self.run_control("off")
        self.assertEqual(self.soul.read_bytes(), b"# Identity\r\nUpdated by user.\r\n\r\nUser footer.\r\n")

    def test_all_complexities_and_offline_saved_preference(self):
        self.run_control("complexity", "balanced")
        self.assertFalse(self.soul.exists())
        self.assertFalse(self.run_control("status")["policy_saved"])
        self.run_control("on")
        self.assertIn(b"Complexity: balanced.", self.soul.read_bytes())
        for mode in ctl.MODES:
            self.run_control("complexity", mode)
            self.assertIn(("Complexity: " + mode + ".").encode(), self.soul.read_bytes())
            self.assertEqual(self.soul.read_bytes().count(ctl.BEGIN), 1)
        self.run_control("off")
        self.run_control("on")
        self.assertIn(b"Complexity: detailed.", self.soul.read_bytes())

    def test_edited_owned_block_conflict_preserves_user_change(self):
        self.run_control("on")
        edited = self.soul.read_bytes().replace(b"Speak in English", b"My own voice instruction")
        self.soul.write_bytes(edited)
        status = self.run_control("status")
        self.assertIsNotNone(status["conflict"])
        self.assertFalse(status["policy_saved"])
        for operation in ("on", "off", "complexity"):
            with self.assertRaises(ctl.ControlError):
                self.run_control(operation, "detailed" if operation == "complexity" else None)
            self.assertEqual(self.soul.read_bytes(), edited)

    def test_missing_duplicate_malformed_or_untracked_markers_refuse(self):
        for data in (ctl.policy_block("simple"), b"<!-- sanitize:begin v1 -->\nEdited",
                     b"<!-- sanitize:end -->"):
            with self.subTest(data=data):
                self.soul.write_bytes(data)
                with self.assertRaises(ctl.ControlError):
                    self.run_control("on")
                self.assertEqual(self.soul.read_bytes(), data)
        self.soul.unlink()
        self.run_control("on")
        data = self.soul.read_bytes()
        for tampered in (data + data, data.replace(ctl.END, b"<!-- removed -->"), b"# Entirely replaced"):
            self.soul.write_bytes(tampered)
            with self.assertRaises(ctl.ControlError):
                self.run_control("off")
            self.assertEqual(self.soul.read_bytes(), tampered)

    def test_future_version_retains_policy_and_allows_owned_rollback(self):
        self.run_control("on")
        before = self.soul.read_bytes()
        status = self.run_control("status", version="2026.9.7")
        self.assertFalse(status["compatible"])
        self.assertTrue(status["policy_saved"])
        self.assertFalse(status["runtime_verified"])
        for operation in ("on", "complexity"):
            with self.assertRaises(ctl.ControlError):
                self.run_control(operation, "balanced", version="2027.1.1")
            self.assertEqual(self.soul.read_bytes(), before)
        self.run_control("off", version="2026.9.7")
        self.assertFalse(self.soul.exists())

    def test_offline_rollback_requires_exact_recorded_owner(self):
        with self.assertRaises(ctl.ControlError):
            self.run_control("off", version=None, offline=True)
        self.run_control("on")
        wrong = ctl.Controller(self.workspace, self.state, "other-profile", "researcher")
        with self.assertRaises(ctl.ControlError):
            wrong.run("off", version=None, offline=True)
        self.run_control("off", version=None, offline=True)
        self.assertFalse(self.soul.exists())

    def test_private_revision_backup_precedes_replace(self):
        original = b"# Private identity\n"
        self.soul.write_bytes(original)
        native_publish = ctl.publish_soul
        def verify_backup_then_publish(*args):
            with closing(sqlite3.connect(self.controller.db_path)) as db:
                backup = db.execute("SELECT before_bytes,phase FROM revisions ORDER BY id DESC LIMIT 1").fetchone()
            self.assertEqual(backup, (original, "prepared"))
            native_publish(*args)
        with mock.patch.object(ctl, "publish_soul", side_effect=verify_backup_then_publish):
            self.run_control("on")

    def test_crash_after_file_publication_recovers_committed_policy(self):
        self.soul.write_bytes(b"# Identity\n")
        with mock.patch.object(self.controller, "save_state", side_effect=RuntimeError("simulated crash")):
            with self.assertRaises(RuntimeError):
                self.run_control("on")
        self.assertIn(ctl.BEGIN, self.soul.read_bytes())
        self.assertTrue(self.run_control("status")["pending_recovery"])
        self.run_control("off")
        self.assertEqual(self.soul.read_bytes(), b"# Identity\n")
        self.assertFalse(self.run_control("status")["pending_recovery"])

    def test_crash_before_publication_leaves_original_and_aborts_plan(self):
        self.soul.write_bytes(b"# Identity\n")
        with mock.patch.object(ctl, "publish_soul", side_effect=RuntimeError("simulated crash")):
            with self.assertRaises(RuntimeError):
                self.run_control("on")
        self.assertEqual(self.soul.read_bytes(), b"# Identity\n")
        self.run_control("off")
        with closing(sqlite3.connect(self.controller.db_path)) as db:
            phase = db.execute("SELECT phase FROM revisions ORDER BY id LIMIT 1").fetchone()[0]
        self.assertEqual(phase, "aborted")

    def test_later_edits_during_interrupted_operation_never_get_replaced(self):
        with mock.patch.object(self.controller, "save_state", side_effect=RuntimeError("simulated crash")):
            with self.assertRaises(RuntimeError):
                self.run_control("on")
        edited = self.soul.read_bytes() + b"User's subsequent text.\n"
        self.soul.write_bytes(edited)
        with self.assertRaises(ctl.ControlError):
            self.run_control("off")
        self.assertEqual(self.soul.read_bytes(), edited)

    def test_interrupted_first_install_cannot_be_adopted_by_other_agent(self):
        with mock.patch.object(self.controller, "save_state", side_effect=RuntimeError("simulated crash")):
            with self.assertRaises(RuntimeError):
                self.run_control("on")
        different = ctl.Controller(self.workspace, self.state, "work-profile", "other-agent")
        with self.assertRaises(ctl.ControlError):
            different.run("off", version=ctl.BASELINE)
        self.assertIn(ctl.BEGIN, self.soul.read_bytes())

    def test_external_editor_change_before_atomic_replace_is_preserved(self):
        original = b"# Identity\n"
        self.soul.write_bytes(original)
        self.soul.write_bytes(b"User changed this.\n")
        with self.assertRaises(ctl.ControlError):
            ctl.publish_soul(self.soul, b"Replacement", True, 0o600, original, True)
        self.assertEqual(self.soul.read_bytes(), b"User changed this.\n")
        self.assertFalse(list(self.workspace.glob(".sanitize-*.tmp")))

    def test_concurrent_controller_cannot_duplicate_policy(self):
        entered = threading.Event()
        release = threading.Event()
        native_publish = ctl.publish_soul
        def hold_publish(*args):
            entered.set()
            self.assertTrue(release.wait(10))
            native_publish(*args)
        with ThreadPoolExecutor(max_workers=1) as pool:
            with mock.patch.object(ctl, "publish_soul", side_effect=hold_publish):
                future = pool.submit(self.run_control, "on")
                self.assertTrue(entered.wait(10))
                try:
                    second = ctl.Controller(self.workspace, self.state, "work-profile", "researcher")
                    with self.assertRaises(ctl.ControlError):
                        second.run("on", version=ctl.BASELINE)
                finally:
                    release.set()
                self.assertTrue(future.result()["policy_saved"])
        self.assertFalse(self.run_control("on")["changed"])
        self.assertEqual(self.soul.read_bytes().count(ctl.BEGIN), 1)

    def test_file_permissions_preserved_and_links_refused(self):
        self.soul.write_bytes(b"Identity\n")
        if os.name != "nt":
            self.soul.chmod(0o640)
        mode = self.soul.stat().st_mode
        self.run_control("on")
        self.assertEqual(self.soul.stat().st_mode, mode)
        self.run_control("off")
        alias = self.workspace / "hard-linked-soul"
        try:
            os.link(self.soul, alias)
        except OSError:
            self.skipTest("Filesystem lacks hard-link support")
        with self.assertRaises(ctl.ControlError):
            self.run_control("on")

    def test_cli_checks_exact_target_without_shell_or_inherited_configuration(self):
        args = type("Args", (), {"profile": "work-profile", "agent": "researcher", "config": None,
                                 "openclaw_bin": "/trusted path/openclaw", "command": "on"})()
        answers = [subprocess.CompletedProcess([], 0, "OpenClaw " + ctl.BASELINE + " (" + ctl.BASELINE_SHA[:7] + ")\n", ""),
                   subprocess.CompletedProcess([], 0, json.dumps([{"id": "researcher", "workspace": str(self.workspace)}]), "")]
        with mock.patch.dict(os.environ, {"OPENCLAW_PROFILE": "default", "OPENCLAW_STATE_DIR": "bad inherited state",
                                          "OPENCLAW_CONFIG_PATH": "secret inherited configuration"}):
            with mock.patch.object(ctl.subprocess, "run", side_effect=answers) as run:
                self.assertEqual(ctl.inspect_target(args, self.controller), ctl.BASELINE)
        self.assertEqual(run.call_args_list[0].args[0], ["/trusted path/openclaw", "--profile", "work-profile", "--version"])
        self.assertEqual(run.call_args_list[1].args[0][-3:], ["agents", "list", "--json"])
        for call in run.call_args_list:
            self.assertFalse(call.kwargs["shell"])
            env = call.kwargs["env"]
            self.assertEqual(env["OPENCLAW_STATE_DIR"], str(self.state))
            self.assertEqual(env["OPENCLAW_PROFILE"], "work-profile")
            self.assertEqual(env["OPENCLAW_CONFIG_PATH"], str(self.state / "openclaw.json"))

    def test_supported_release_transitions_keep_policy_ownership_and_provenance(self):
        self.soul.write_bytes(b"# Existing identity\r\n")
        self.run_control("on", version="2026.9.6")
        old_bytes = self.soul.read_bytes()
        old = self.run_control("status", version="2026.9.6")
        self.assertTrue(old["compatible"])
        self.assertEqual(old["policy_release_sha"], ctl.SUPPORTED_RELEASES["2026.9.6"])
        self.run_control("on", version=ctl.BASELINE)
        self.assertEqual(self.soul.read_bytes(), old_bytes)
        latest = self.run_control("status", version=ctl.BASELINE)
        self.assertEqual(latest["policy_written_for"], ctl.BASELINE)
        self.assertEqual(latest["baseline_sha"], ctl.BASELINE_SHA)
        self.assertEqual(set(latest["tested_baselines"]), {"2026.9.6", "2026.11.6"})
        self.run_control("complexity", "balanced", version="2026.9.6")
        self.soul.write_bytes(self.soul.read_bytes() + b"User's later paragraph.\r\n")
        off = self.run_control("off", version=None, offline=True)
        self.assertEqual(off["policy_written_for"], "2026.9.6")
        self.assertEqual(self.soul.read_bytes(), b"# Existing identity\r\nUser's later paragraph.\r\n")

    def test_cli_accepts_both_stable_tags_and_refuses_wrong_reported_commit(self):
        args = type("Args", (), {"profile": "work-profile", "agent": "researcher", "config": None,
                                 "openclaw_bin": "openclaw", "command": "on"})()
        for version, sha in ctl.SUPPORTED_RELEASES.items():
            with mock.patch.object(ctl.subprocess, "run", side_effect=[
                subprocess.CompletedProcess([], 0, "OpenClaw " + version + " (" + sha[:7] + ")", ""),
                subprocess.CompletedProcess([], 0, json.dumps([{"id": "researcher", "workspace": str(self.workspace)}]), "")]):
                self.assertEqual(ctl.inspect_target(args, self.controller), version)
                status = self.controller.run("status", version=version)
                self.assertTrue(status["compatible"])
                self.assertTrue(status["host_commit_verified"])
            with mock.patch.object(ctl.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "OpenClaw " + version + " (0000000)", "")):
                with self.assertRaises(ctl.ControlError):
                    ctl.inspect_target(args, self.controller)
        args.command = "status"
        with mock.patch.object(ctl.subprocess, "run", side_effect=[
            subprocess.CompletedProcess([], 0, "OpenClaw " + ctl.BASELINE + " (0000000)", ""),
            subprocess.CompletedProcess([], 0, json.dumps([{"id": "researcher", "workspace": str(self.workspace)}]), "")]):
            version = ctl.inspect_target(args, self.controller)
        self.assertFalse(self.controller.run("status", version=version)["compatible"])

    def test_database_hardlink_alias_refused_before_unrelated_database_changes(self):
        unrelated = self.root / "unrelated.sqlite3"
        with closing(sqlite3.connect(unrelated)) as db:
            db.execute("CREATE TABLE unrelated(value TEXT)")
            db.commit()
        original = unrelated.read_bytes()
        self.controller.product_dir.mkdir()
        try:
            os.link(unrelated, self.controller.db_path)
        except OSError:
            self.skipTest("Filesystem lacks hard-link support")
        with self.assertRaises(ctl.ControlError):
            self.run_control("on")
        self.assertEqual(unrelated.read_bytes(), original)
        self.assertFalse(self.soul.exists())

    @unittest.skipIf(os.name == "nt", "Windows ACLs are not POSIX modes")
    def test_existing_product_state_permissions_are_private(self):
        self.run_control("on")
        self.controller.product_dir.chmod(0o755)
        self.controller.db_path.chmod(0o644)
        self.run_control("status")
        self.assertEqual(self.controller.product_dir.stat().st_mode & 0o777, 0o700)
        self.assertEqual(self.controller.db_path.stat().st_mode & 0o777, 0o600)

    def test_cli_rejects_wrong_or_shared_workspace_and_unstable_version(self):
        args = type("Args", (), {"profile": "work-profile", "agent": "researcher", "config": None,
                                 "openclaw_bin": "openclaw", "command": "on"})()
        inventories = [[{"id": "researcher", "workspace": str(self.state)}],
                       [{"id": "researcher", "workspace": str(self.workspace)},
                        {"id": "another", "workspace": str(self.workspace)}]]
        for inventory in inventories:
            with mock.patch.object(ctl.subprocess, "run", side_effect=[
                subprocess.CompletedProcess([], 0, "2026.9.6", ""),
                subprocess.CompletedProcess([], 0, json.dumps(inventory), "")]):
                with self.assertRaises(ctl.ControlError):
                    ctl.inspect_target(args, self.controller)
        with mock.patch.object(ctl.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "2026.9.6-dev", "")):
            with self.assertRaises(ctl.ControlError):
                ctl.inspect_target(args, self.controller)

    def test_cli_failure_does_not_expose_private_output(self):
        args = type("Args", (), {"profile": "work-profile", "agent": "researcher", "config": None,
                                 "openclaw_bin": "openclaw", "command": "on"})()
        with mock.patch.object(ctl.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "openclaw", output="secret", stderr="token-secret")):
            with self.assertRaises(ctl.ControlError) as caught:
                ctl.inspect_target(args, self.controller)
        self.assertNotIn("token-secret", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
