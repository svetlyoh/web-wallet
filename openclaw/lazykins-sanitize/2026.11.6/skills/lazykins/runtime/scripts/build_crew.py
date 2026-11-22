#!/usr/bin/env python3
"""Validate/build the preserved crew with exact pinned native Template project APIs."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[1]
SHA = "06afb10d3272cc9deaf38ca6a3b7b839d5935638"


def verify_sources():
    root = RUNTIME / "crew"
    contract = json.loads((root / "source-inventory.json").read_text(encoding="utf-8"))
    actual = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Crew source may not contain symlinks")
        if path.is_file() and path.name != "source-inventory.json":
            actual[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != contract["files"]:
        raise ValueError("Crew source differs from the reviewed source inventory")
    return root


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Exact OpenClaw 2026.11.6 source with pinned dependencies installed")
    parser.add_argument("--public", type=Path, help="New public/command-deck/crew destination")
    parser.add_argument("--check-sources", action="store_true", help="Verify source inventory without running native validation")
    args = parser.parse_args()
    crew = verify_sources()
    if args.check_sources:
        print(json.dumps({"sourceInventoryVerified": True, "nativeValidationRun": False}))
        return
    if not args.source or not args.public:
        parser.error("--source and --public are required for native build")
    source = args.source.resolve(strict=True)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
    if head != SHA or json.loads((source / "package.json").read_text(encoding="utf-8"))["version"] != "2026.11.6":
        raise ValueError("Crew must be validated against the exact reviewed OpenClaw source")
    output = args.public.resolve()
    if output.exists():
        raise ValueError("Public crew destination must be new; preserve prior generations")
    subprocess.run([shutil.which("node") or "node", "--import", str(source / "scripts/tsx.mjs"),
                    str(RUNTIME / "scripts/native_crew_build.mts"), str(source), str(crew), str(output)],
                   cwd=source, check=True)
    incremental = RUNTIME.parents[2] / "docs" / "COMMAND-DECK-R7.1-CREW-REGISTRATION.md"
    guide = output / "INSTALL-AND-COMPATIBILITY.md"
    guide.write_bytes(incremental.read_bytes() + b"\n\n---\n\n# Native R7 compatibility reference\n\n" + guide.read_bytes())


if __name__ == "__main__":
    main()
