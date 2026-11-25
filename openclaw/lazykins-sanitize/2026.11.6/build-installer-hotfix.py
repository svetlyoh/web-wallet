"""Repackage the verified R7.1 UI with the R7.3 installer-only corrections."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

BASE = Path(__file__).resolve().parent
source, output = map(Path, sys.argv[1:3])
if hashlib.sha256(source.read_bytes()).hexdigest() != "a5e9227181a8d655fa33bb81fdebff9cf50e1379e254fbe6521229d286b19dbb":
    raise RuntimeError("Expected immutable, published R7.1 base ZIP")
with zipfile.ZipFile(source) as archive:
    if archive.testzip() is not None:
        raise RuntimeError("Base ZIP CRC failed")
    entries = {name: archive.read(name) for name in archive.namelist()}
if len(entries) != len(archive.namelist()):
    raise RuntimeError("Duplicate archive paths")
for line in entries["SHA256SUMS"].decode().splitlines():
    digest, name = line.split("  ", 1)
    if hashlib.sha256(entries[name]).hexdigest() != digest:
        raise RuntimeError("Base file checksum failed: " + name)
proof = json.loads(entries["skills/lazykins/runtime/evidence/final/results.json"])
if proof.get("passed") is not True or proof.get("packageRevision") != "helm-r7.1":
    raise RuntimeError("Verified R7.1 production evidence required")
replacements = ["setup-command-deck.py", "install.sh", "tests/test_first_run.py", "tests/test_crew_registration.py", "skills/lazykins/scripts/crew-register.py", "build-installer-hotfix.py", "docs/INSTALLER-R7.3-FRESH-INSTALL.md"]
for name in replacements:
    entries[name] = (BASE / name).read_bytes().replace(b"\r\n", b"\n")
entries["README.md"] = ("# R7.3 guided fresh installation\n\nRun `bash install.sh` after verifying/extracting the R7.3 combined ZIP. See [the fresh-install guide](docs/INSTALLER-R7.3-FRESH-INSTALL.md). Requires onboarded OpenClaw 2026.11.6, a working model and native managed Gateway, Python 3.11+, and the normal non-root service user. No manual source patch is needed. The original R7.1 documentation below is historical; its installer limitations are superseded.\n\n").encode() + entries["README.md"]
compatibility = json.loads(entries["compatibility.json"])
compatibility["installerRevision"] = "r7.3"
entries["compatibility.json"] = (json.dumps(compatibility, indent=2) + "\n").encode()
entries.pop("SHA256SUMS")
entries["SHA256SUMS"] = "".join(hashlib.sha256(body).hexdigest() + "  " + name + "\n" for name, body in sorted(entries.items())).encode()
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for name, body in sorted(entries.items()):
        archive.writestr(name, body)
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise RuntimeError("Output ZIP CRC failed")
    for name, body in entries.items():
        if archive.read(name) != body:
            raise RuntimeError("Output file mismatch: " + name)
checksum = hashlib.sha256(output.read_bytes()).hexdigest()
Path(str(output) + ".sha256").write_bytes((checksum + "  " + output.name + "\n").encode())
print(json.dumps({"zip": output.name, "sha256": checksum, "bytes": output.stat().st_size, "uiAndCrewUnchanged": True, "baseUiProofRun": 45055852841}))
