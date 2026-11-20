#!/usr/bin/env python3
"""Create paired and separate local-transfer ZIPs from a verified payload."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import zipfile

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("lazykinsctl", BASE / "skills/lazykins/scripts/lazykinsctl.py")
ctl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ctl)

def selected_files():
    selected = [BASE / name for name in ("install-both.py", "build-transfer.py", "compatibility.json")]
    for root in (BASE / "skills", BASE / "docs"):
        for path in sorted(root.rglob("*")):
            if path.is_symlink():
                raise RuntimeError("Transfer package cannot contain symlinks")
            failed_iteration = ("evidence" in path.parts and any(part.startswith("attempt-") for part in path.parts)) or "vendor-review" in path.parts
            if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc" and not failed_iteration:
                selected.append(path)
    selected.extend(sorted((BASE / "tests").glob("test_*.py")))
    return selected

def main():
    manifest = ctl.Controller(SimpleNamespace(state_dir=BASE), BASE / "skills/lazykins/runtime/payload").verified_payload()
    proof = json.loads((BASE / "skills/lazykins/runtime/evidence/final/results.json").read_text(encoding="utf-8"))
    if proof.get("passed") is not True or proof.get("version") != ctl.VERSION or proof.get("sha") != ctl.SHA:
        raise RuntimeError("Production browser verification for this exact source is required before packaging")
    compatibility = json.loads((BASE / "compatibility.json").read_text(encoding="utf-8"))
    compatibility.update(status="production build and browser fixtures passed", browserFixtureVerified=True,
                         integration=manifest["integration"])
    (BASE / "compatibility.json").write_text(json.dumps(compatibility, indent=2) + "\n", encoding="utf-8")
    files = selected_files()
    sums = BASE / "SHA256SUMS"
    sums.write_text("".join(ctl.digest(path) + "  " + path.relative_to(BASE).as_posix() + "\n" for path in files), encoding="utf-8")
    files.append(sums)
    archives = []
    paired = BASE.parent / "LazyKins-Sanitize-2026.11.6.zip"
    with zipfile.ZipFile(paired, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in files:
            archive.write(path, path.relative_to(BASE).as_posix())
    archives.append(paired)
    for name, display in (("lazykins", "LazyKins"), ("sanitize", "Sanitize")):
        output = BASE.parent / (display + "-2026.11.6.zip")
        root = BASE / "skills" / name
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in files:
                if path.is_relative_to(root):
                    archive.write(path, name + "/" + path.relative_to(root).as_posix())
        archives.append(output)
    for output in archives:
        with zipfile.ZipFile(output) as archive:
            if archive.testzip() is not None:
                raise RuntimeError("ZIP integrity check failed")
        print(output.name + ": " + str(output.stat().st_size) + " bytes")
    (BASE.parent / "archives.sha256").write_text("".join(ctl.digest(path) + "  " + path.name + "\n" for path in archives), encoding="utf-8")

if __name__ == "__main__":
    main()
