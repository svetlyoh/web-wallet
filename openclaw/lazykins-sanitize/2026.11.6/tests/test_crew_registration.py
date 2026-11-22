import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("crew_registration",ROOT/"skills/lazykins/scripts/crew-register.py")
crew=importlib.util.module_from_spec(spec);spec.loader.exec_module(crew)

class Cli:
    def __init__(self,root):
        self.root=Path(root);self.identity={"profile":"default","state_dir":str(self.root),"config_path":str(self.root/"openclaw.json")}
        self.rows=[{"id":"main","name":"main","workspace":str(self.root/"main"),"isDefault":True,"bindings":2},{"id":"whatnot-expert","name":"Whatnot Expert","workspace":str(self.root/"whatnot"),"isDefault":False,"bindings":0}]
        self.plan_hash="native-plan-v1";self.adds=0;self.uncertain=False
    def run(self,args):
        if "--help" in args:return SimpleNamespace(stdout="--agent-id --dry-run --json")
        if args[:2]==["agents","list"]:result=self.rows
        elif args[1] in ("validate","inspect"):result={"valid":True}
        else:
            agent=args[args.index("--agent-id")+1];workspace=self.root/("workspace-"+agent)
            if "--dry-run" in args:result={"planIntegrity":self.plan_hash,"agent":{"finalId":agent,"workspace":str(workspace)},"summary":{},"blockers":[],"capabilityChanges":[]}
            else:
                self.adds+=1
                shutil.copytree(crew.CREW/"sources"/(agent+"-template")/"workspace",workspace)
                self.rows.append({"id":agent,"name":agent.title(),"workspace":str(workspace),"isDefault":False,"bindings":0})
                if self.uncertain:raise crew.ctl.ControlError("Lost response")
                result={"status":"added","agent":{"finalId":agent,"workspace":str(workspace)}}
        return SimpleNamespace(stdout=json.dumps(result))

class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.cli=Cli(self.temp.name);self.owner=crew.Registration(self.cli);self.out=Path(self.temp.name)/"outcome.json"
    def test_baseline_is_sanitized_and_does_not_install(self):
        self.cli.rows[0]["model"]="provider/model@private-profile"
        baseline=self.owner.baseline()
        self.assertNotIn("model",baseline["inventory"][0]);self.assertEqual(baseline["crew"]["helm"]["state"],"missing");self.assertEqual(self.cli.adds,0)
    def test_individual_approval_creates_verified_agent_and_keeps_existing(self):
        before=json.loads(json.dumps(self.cli.rows));review=self.owner.review("helm")
        result=self.owner.apply("helm",review,"helm",self.out)
        self.assertEqual(result["state"],"verified");self.assertEqual(self.cli.rows[:2],before)
        self.assertTrue(Path(str(self.out)+".completed.json").is_file())
        again=self.owner.review("helm");self.assertEqual(again["classification"]["state"],"verified");self.assertEqual(self.cli.adds,1)
    def test_profile_mismatch_and_missing_approval_cannot_add(self):
        review=self.owner.review("helm")
        with self.assertRaises(crew.ctl.ControlError):self.owner.apply("helm",review,None,self.out)
        review["target"]={"profile":"wrong"}
        with self.assertRaises(crew.ctl.ControlError):self.owner.apply("helm",review,"helm",self.out)
        self.assertEqual(self.cli.adds,0)
    def test_changed_roster_or_native_plan_requires_new_review(self):
        review=self.owner.review("helm");self.cli.plan_hash="changed"
        with self.assertRaises(crew.ctl.ControlError):self.owner.apply("helm",review,"helm",self.out)
        self.cli.plan_hash="native-plan-v1";self.cli.rows[0]["bindings"]=3
        with self.assertRaises(crew.ctl.ControlError):self.owner.apply("helm",review,"helm",self.out)
        self.assertEqual(self.cli.adds,0)
    def test_occupied_id_requires_review_and_never_adds_suffix(self):
        self.cli.rows.append({"id":"helm","name":"Unrelated Helm","workspace":str(Path(self.temp.name)/"existing")})
        result=self.owner.review("helm");self.assertEqual(result["classification"]["state"],"manual-review");self.assertEqual(self.cli.adds,0)
    def test_verified_renamed_crew_is_reused(self):
        workspace=Path(self.temp.name)/"renamed-jace"
        shutil.copytree(crew.CREW/"sources/jace-template/workspace",workspace)
        self.cli.rows.append({"id":"closer","name":"Jace","workspace":str(workspace)})
        result=self.owner.review("jace");self.assertEqual(result["classification"]["actualAgentId"],"closer");self.assertEqual(self.cli.adds,0)
    def test_main_is_never_adopted_as_renamed_crew(self):
        workspace=Path(self.temp.name)/"main-authored-helm"
        shutil.copytree(crew.CREW/"sources/helm-template/workspace",workspace)
        self.cli.rows[0].update(name="Helm",identityName="Helm",workspace=str(workspace))
        self.assertEqual(self.owner.classify("helm",self.cli.rows)["state"],"missing")
        self.assertEqual(self.cli.adds,0)
    def test_shared_workspace_is_not_verified_as_independent_crew(self):
        workspace=Path(self.temp.name)/"shared"
        shutil.copytree(crew.CREW/"sources/helm-template/workspace",workspace)
        self.cli.rows[0]["workspace"]=str(workspace)
        self.cli.rows.append({"id":"helm","name":"Helm","workspace":str(workspace)})
        self.assertEqual(self.owner.review("helm")["classification"]["state"],"manual-review")
        self.assertEqual(self.cli.adds,0)
    def test_uncertain_add_retains_receipt_and_cannot_replay(self):
        review=self.owner.review("helm");self.cli.uncertain=True
        with self.assertRaises(crew.ctl.ControlError):self.owner.apply("helm",review,"helm",self.out)
        self.assertTrue(self.out.is_file())
        with self.assertRaises(crew.ctl.ControlError):self.owner.apply("helm",review,"helm",self.out)
        self.assertEqual(self.cli.adds,1)

if __name__=="__main__":unittest.main()
