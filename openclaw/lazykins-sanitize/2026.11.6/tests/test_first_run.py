import importlib.util
from pathlib import Path
import unittest

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
            def run(self, args):
                import json
                from types import SimpleNamespace
                calls.append(args)
                return SimpleNamespace(stdout=json.dumps(status))
        with self.assertRaisesRegex(RuntimeError, "registration failed"):
            with wizard.maintenance(CLI(), True, True):
                raise RuntimeError("registration failed")
        self.assertEqual(calls[0], ["gateway", "stop"])
        self.assertEqual(calls[-1], ["gateway", "start"])

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


if __name__ == "__main__":
    unittest.main()
