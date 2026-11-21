"""Preservation checks for the authored crew and version-specific manifest adaptation."""
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1] / "skills/lazykins/runtime/crew"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class CrewAssetsTests(unittest.TestCase):
    def test_supplied_manifests_and_original_sources_remain_exact(self):
        for bundle in (ROOT / "originals").iterdir():
            manifest = json.loads((bundle / "FILE_MANIFEST.json").read_text(encoding="utf-8"))
            for entry in manifest["files"]:
                path = bundle / entry["path"]
                self.assertEqual(path.stat().st_size, entry["bytes"], str(path))
                self.assertEqual(digest(path), entry["sha256"], str(path))

    def test_compatibility_changes_never_rewrite_personality_or_artwork(self):
        for source in (ROOT / "sources").iterdir():
            originals = list((ROOT / "originals").glob("*/" + source.name))
            self.assertEqual(len(originals), 1)
            original = originals[0]
            for path in original.rglob("*"):
                if path.is_file() and path.name != "CLAW.md":
                    self.assertEqual(path.read_bytes(), (source / path.relative_to(original)).read_bytes(), str(path))
            manifest = json.loads((source / "CLAW.md").read_text(encoding="utf-8").split("---", 2)[1])
            self.assertEqual(set(manifest), {"schemaVersion", "agent", "workspace", "packages", "mcpServers", "cronJobs"})
            self.assertNotIn("emoji", manifest["agent"])
            self.assertNotIn("theme", manifest["agent"])
            self.assertEqual(manifest["agent"]["identity"]["avatar"], "avatars/" + manifest["agent"]["id"] + ".png")
            self.assertEqual(manifest["packages"], [])
            self.assertEqual(manifest["mcpServers"], {})
            self.assertEqual(manifest["cronJobs"], [])
            self.assertEqual((source / "CLAW.md").read_text(encoding="utf-8").split("---", 2)[2].strip(), "")

    def test_catalog_only_attests_actual_preserved_files(self):
        catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
        self.assertEqual([agent["id"] for agent in catalog["agents"]], ["helm", "jace", "cruz"])
        for agent in catalog["agents"]:
            workspace = ROOT / "sources" / (agent["id"] + "-template") / "workspace"
            for name, expected in agent["bootstrapHashes"].items():
                self.assertEqual(digest(workspace / name), expected)
            self.assertEqual(digest(workspace / "avatars" / (agent["id"] + ".png")), agent["avatarSha256"])

    def test_complete_source_inventory_is_unchanged(self):
        contract = json.loads((ROOT / "source-inventory.json").read_text(encoding="utf-8"))
        actual = {p.relative_to(ROOT).as_posix(): digest(p) for p in ROOT.rglob("*") if p.is_file() and p.name != "source-inventory.json"}
        self.assertEqual(actual, contract["files"])


if __name__ == "__main__":
    unittest.main()
