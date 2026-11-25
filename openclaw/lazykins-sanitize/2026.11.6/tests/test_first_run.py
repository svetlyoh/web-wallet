import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import contextlib
import tempfile
from types import SimpleNamespace
import json

spec = importlib.util.spec_from_file_location("first_run", Path(__file__).resolve().parents[1] / "setup-command-deck.py")
wizard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wizard)


class FirstRunTests(unittest.TestCase):
    def identity(self):
        return {"config_path": str(Path("config.json").resolve()), "profile": "default", "state_dir": str(Path("state").resolve())}

    def status(self):
        path = self.identity()["config_path"]
        return {"service": {"loaded": True, "targetRole": "target", "runtime": {"status": "stopped"}, "command": {"environment": {}}},
                "config": {"cli": {"exists": True, "valid": True, "path": path}, "daemon": {"exists": True, "valid": True, "path": path}}}

    def test_expiring_usable_model_warns_for_default_and_crew(self):
        calls=[]
        class CLI:
            def run(self, args, allow_failure=False):
                calls.append(args)
                return SimpleNamespace(returncode=2)
        with patch("builtins.print") as warning:
            wizard.check_model(CLI())
            wizard.check_model(CLI(), "helm")
            self.assertEqual(warning.call_count, 2)
        self.assertIn("helm", calls[-1])

    def test_unavailable_model_still_blocks(self):
        class CLI:
            def run(self, args, allow_failure=False):
                return SimpleNamespace(returncode=1)
        with self.assertRaisesRegex(RuntimeError, "readiness failed"):
            wizard.check_model(CLI(), "cruz")

    def test_wrong_service_or_config_refused(self):
        for mutate in (lambda s: s["service"].update(targetRole="diagnostic-only"), lambda s: s["config"].update(mismatch=True),
                       lambda s: s["service"]["command"]["environment"].update(OPENCLAW_PROFILE="other")):
            status = self.status()
            mutate(status)
            with self.assertRaises(RuntimeError):
                wizard.service_target(status, self.identity())

    def test_started_version_must_be_supported(self):
        status = self.status()
        status["service"]["runtime"]["status"] = "running"
        status["rpc"] = {"ok": True, "server": {"version": "2026.11.7"}}
        with self.assertRaises(RuntimeError):
            wizard.service_target(status, self.identity(), True)

    def test_failure_restores_originally_running_service(self):
        calls, status = [], self.status()
        class CLI:
            identity = self.identity()
            def run(self, args, allow_failure=False):
                import json
                from types import SimpleNamespace
                calls.append(args)
                if args[:2] == ["gateway", "start"]:
                    status["service"]["runtime"]["status"] = "running"
                    status["rpc"] = {"ok": True, "server": {"version": wizard.ctl.VERSION}}
                return SimpleNamespace(stdout=json.dumps(status))
        with self.assertRaisesRegex(RuntimeError, "registration failed"):
            with wizard.maintenance(CLI(), True, True):
                raise RuntimeError("registration failed")
        self.assertEqual(calls[0], ["gateway", "stop", "--force"])
        self.assertIn(["gateway", "start"], calls)
        self.assertEqual(calls[-1], ["gateway", "status", "--json", "--deep"])

    def test_native_start_timeout_then_healthy_is_not_restarted(self):
        status = self.status()
        calls = []
        class CLI:
            identity = self.identity()
            def run(self, args, allow_failure=False):
                calls.append(args)
                if args[:2] == ["gateway", "start"]:
                    return SimpleNamespace(returncode=1, stdout="native health timeout")
                status["service"]["runtime"]["status"] = "running"
                status["rpc"] = {"ok": True, "server": {"version": wizard.ctl.VERSION}}
                return SimpleNamespace(returncode=0, stdout=json.dumps(status))
        wizard.start_gateway(CLI())
        self.assertEqual(sum(args[:2] == ["gateway", "start"] for args in calls), 1)

    def test_recovery_error_preserves_original_failure(self):
        class CLI:
            def run(self, args, allow_failure=False):
                raise RuntimeError("native stop refused")
        with patch.object(wizard, "start_gateway", side_effect=RuntimeError("native recovery failed")):
            with self.assertRaisesRegex(RuntimeError, "Original setup failure: native stop refused; recovery also failed: native recovery failed"):
                with wizard.maintenance(CLI(), True, True):
                    self.fail("must not enter")

    def test_no_permission_means_no_service_command(self):
        class CLI:
            def run(self, args):
                raise AssertionError("must not call native service")
        with self.assertRaises(RuntimeError):
            with wizard.maintenance(CLI(), True, False):
                self.fail("must not enter")

    def snapshot(self, override=None):
        entry = {} if override is None else {"subagents": {"allowAgents": override}}
        return {"hash": "opaque-cas", "valid": True, "sourceConfig": {"agents": {"entries": {"captain": entry}, "defaults": {"subagents": {"allowAgents": ["old-target"]}}}}}

    def test_delegation_preserves_inherited_targets_and_cas(self):
        import json
        crew = {"helm": {"actualAgentId": "captain"}, "jace": {"actualAgentId": "closer"}, "cruz": {"actualAgentId": "scout"}}
        plan = wizard.delegation_plan(self.snapshot(), crew)
        self.assertEqual(plan["baseHash"], "opaque-cas")
        self.assertEqual(json.loads(plan["raw"])["agents"]["entries"]["captain"]["subagents"]["allowAgents"], ["old-target", "closer", "scout"])
        plan = wizard.delegation_plan(self.snapshot([]), crew)
        self.assertNotIn("old-target", plan["raw"])
        self.assertIsNone(wizard.delegation_plan(self.snapshot(["*"]), crew))

    def interrupted_setup(self, model_failure=False, optional_failure=False):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "config.json").write_text("{}", encoding="utf-8")
            existing, added, calls = set(), [], []
            identity = {"config_path": str(root / "config.json"), "state_dir": str(root), "profile": "default"}
            status = self.status()
            for item in status["config"].values():
                item["path"] = identity["config_path"]
            status["service"]["runtime"]["status"] = "running"
            status["rpc"] = {"ok": True, "server": {"version": wizard.ctl.VERSION}}

            class CLI:
                def __init__(self):
                    self.identity = identity
                def version(self):
                    return wizard.ctl.VERSION
                def root(self):
                    return {"present": False}
                def run(self, args, allow_failure=False):
                    calls.append(args)
                    if args[:2] == ["gateway", "stop"]:
                        status["service"]["runtime"]["status"] = "stopped"
                    if args[:2] == ["gateway", "start"]:
                        status["service"]["runtime"]["status"] = "running"
                    if args[:3] == ["gateway", "call", "config.get"]:
                        return SimpleNamespace(returncode=0, stdout=json.dumps({"hash":"test-cas","valid":True,"sourceConfig":{"agents":{"entries":{"helm":{}}}}}))
                    if args[:3] == ["gateway", "call", "config.patch"]:
                        raise RuntimeError("permission acknowledgment unavailable")
                    failed = model_failure and "--agent" in args and "cruz" in args
                    return SimpleNamespace(returncode=int(failed), stdout=json.dumps(status))

            class Registration:
                def __init__(self, cli):
                    pass
                def baseline(self):
                    return {"inventory": [{"id": "main", "workspace": str(root)}],
                            "crew": {role: ({"state": "verified", "actualAgentId": role, "workspace": str(root / role)} if role in existing else {"state": "missing"}) for role in wizard.crew.IDS}}
                def review(self, role):
                    return {"agent": role, "nativeDryRun": {"agent": {"workspace": str(root / role)}}}
                def apply(self, role, reviewed, approval, outcome, **kwargs):
                    existing.add(role)
                    added.append(role)

            class Controller:
                def __init__(self, *args):
                    self.home = root
                @contextlib.contextmanager
                def locked(self):
                    yield self
                def verified_payload(self):
                    return {}
                def load(self):
                    return None
                def install(self):
                    pass
                def on(self):
                    pass
                def off(self):
                    if optional_failure:
                        return
                    raise AssertionError("UI must not change before every crew agent is approved and model-ready")

            allowed = {"SET UP COMMAND DECK", "ADD helm"}
            if model_failure or optional_failure:
                allowed.update({"ADD jace", "ADD cruz", "ALLOW HELM CREW TARGETS"})
            with patch.object(wizard.ctl, "Controller", Controller), patch.object(wizard.crew, "Registration", Registration), \
                    patch.object(wizard, "enable_templates"), patch.object(wizard, "approve", side_effect=lambda action: action in allowed), \
                    patch.object(wizard.paired, "register") as install, patch("builtins.print"):
                if optional_failure:
                    wizard.setup(CLI())
                    install.assert_called_once()
                    complete=list(root.glob("setup-*/complete.json"))
                    self.assertEqual(len(complete),1)
                    self.assertTrue(json.loads(complete[0].read_text())["uiConfigured"])
                    self.assertEqual(len(list(root.glob("setup-*/delegation-unconfirmed.json"))),1)
                    self.assertEqual(sum(args[:3]==["gateway","call","config.patch"] for args in calls),1)
                else:
                    with self.assertRaises(RuntimeError):
                        wizard.setup(CLI())
                    install.assert_not_called()
            self.assertIn(["gateway", "start"], calls)
            if not optional_failure:
                self.assertEqual(calls[-1], ["gateway", "status", "--json", "--deep"])
            self.assertEqual(added, ["helm", "jace", "cruz"] if model_failure or optional_failure else ["helm"])

    def test_optional_delegation_failure_still_completes_ui_without_retry(self):
        self.interrupted_setup(optional_failure=True)

    def test_declining_second_agent_preserves_first_and_restores_service(self):
        self.interrupted_setup()

    def test_crew_model_failure_prevents_ui_activation_and_restores_service(self):
        self.interrupted_setup(model_failure=True)


if __name__ == "__main__":
    unittest.main()
