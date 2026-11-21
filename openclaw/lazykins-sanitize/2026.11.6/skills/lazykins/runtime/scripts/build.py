#!/usr/bin/env python3
"""Build one verified UI generation from an isolated, exact upstream checkout."""
import argparse
import hashlib
import gzip
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

VERSION = "2026.11.6"
SHA = "06afb10d3272cc9deaf38ca6a3b7b839d5935638"
RUNTIME = Path(__file__).resolve().parents[1]


def run(args, cwd, capture=False):
    result = subprocess.run(args, cwd=cwd, check=True, capture_output=capture,
                            text=capture)
    return result.stdout.strip() if capture else None


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(root):
    result = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Generated payload contains a symlink")
        if path.is_file():
            result[path.relative_to(root).as_posix()] = digest(path)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path,
                        help="Clean isolated OpenClaw checkout; never production package files")
    parser.add_argument("--output", type=Path, help="New generation directory; must not already exist")
    parser.add_argument("--check", action="store_true", help="Validate source and patch without editing")
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    if run(["git", "rev-parse", "HEAD"], source, True) != SHA:
        raise ValueError(f"Source must be exact OpenClaw {VERSION} SHA {SHA}; obtain a new matching overlay for other releases")
    if run(["git", "status", "--porcelain"], source, True):
        raise ValueError("Source checkout must be clean. Preserve edits and use a separate worktree")
    package = json.loads((source / "package.json").read_text(encoding="utf-8"))
    if package.get("version") != VERSION or not package.get("packageManager", "").startswith("pnpm@12.15.0"):
        raise ValueError("Source package version or pinned pnpm toolchain differs")
    contract = json.loads((RUNTIME / "patches" / "integration-contract.json").read_text(encoding="utf-8"))
    for name, expected in contract["originalFiles"].items():
        path = source / name
        actual = hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest() if path.exists() else None
        if actual != expected:
            raise ValueError(f"Source integration input differs: {name}")
    patch = RUNTIME / "patches" / "integration-2026.11.6.patch"
    run(["git", "apply", "--check", str(patch)], source)
    if args.check:
        print(json.dumps({"compatible": True, "version": VERSION, "sha": SHA,
                          "patchSha256": digest(patch), "changesApplied": False}))
        return
    if not args.output:
        raise ValueError("Choose --output for a new generation")
    output = args.output.resolve()
    if output.exists() or output == source or source in output.parents:
        raise ValueError("Output must be a new directory outside the source worktree")
    node = run(["node", "--version"], source, True)
    node_match = re.fullmatch(r"v24\.(\d+)\.(\d+)", node)
    if not node_match or int(node_match.group(1)) < 16:
        raise ValueError("This generation was verified with Node 24.18. Use supported Node 24.16 or newer in the 24.x line")
    run(["git", "apply", "--whitespace=error", str(patch)], source)
    for name, expected in contract["patchedFiles"].items():
        if hashlib.sha256((source / name).read_bytes().replace(b"\r\n", b"\n")).hexdigest() != expected:
            raise ValueError(f"Exact patch output differs: {name}")
    shutil.copytree(RUNTIME / "ui", source / "ui" / "src" / "lazykins")
    # Keep the upstream compiled-CSS ceilings intact. This independently bounded
    # optional appearance asset uses the existing public themes/fonts contract.
    skin_css = {name: (RUNTIME / "ui" / (name + ".css")).read_bytes() for name in ("quiet-desk", "command-deck")}
    skin_budgets = {name: {"rawBytes": len(data), "gzipBytes": len(gzip.compress(data, compresslevel=9, mtime=0))} for name, data in skin_css.items()}
    if any(size["rawBytes"] > 16 * 1024 or size["gzipBytes"] > 4 * 1024 for size in skin_budgets.values()):
        raise ValueError("One skin exceeds its independent 16 KiB raw / 4 KiB gzip CSS budget")
    css = b"\n".join(skin_css.values())
    font = RUNTIME / "assets" / "fonts" / "InterVariable.woff2"
    font_name = "lazykins-inter-" + digest(font)[:12] + ".woff2"
    overlay_budget = {"cssRawBytes": len(css), "cssGzipBytes": len(gzip.compress(css, compresslevel=9, mtime=0)),
                      "fontBytes": font.stat().st_size, "stylesheetRequests": 1, "skins": skin_budgets,
                      "limits": {"cssRawBytes": 32 * 1024, "cssGzipBytes": 8 * 1024, "fontBytes": 400 * 1024, "stylesheetRequests": 1}}
    if any(overlay_budget[key] > limit for key, limit in overlay_budget["limits"].items()):
        raise ValueError("Quiet Desk public appearance asset exceeds its explicit size budget")
    if ("../fonts/" + font_name).encode() not in css:
        raise ValueError("Quiet Desk font URL does not match the bundled content-addressed font")
    (source / "ui" / "public" / "themes" / "lazykins-quiet-desk.css").write_bytes(css)
    shutil.copy2(font, source / "ui" / "public" / "fonts" / font_name)
    print(json.dumps({"overlayAssetBudget": overlay_budget}), flush=True)
    shutil.copy2(RUNTIME / "tests" / "verify-ui.mts", source / "ui" / "lazykins-verify.mts")
    run([shutil.which("pnpm") or "pnpm", "ui:build"], source)
    run([shutil.which("pnpm") or "pnpm", "ui:check-performance"], source)
    proof = source / ".artifacts" / "lazykins-verification"
    run(["node", "--import", str(source / "scripts" / "tsx.mjs"), "lazykins-verify.mts", str(proof)], source / "ui")
    successful = list(proof.glob("*/results.json"))
    if len(successful) != 1:
        raise ValueError("Expected one successful UI verification attempt")
    proof = successful[0].parent
    evidence = json.loads((proof / "results.json").read_text(encoding="utf-8"))
    if evidence.get("passed") is not True or evidence.get("version") != VERSION or evidence.get("sha") != SHA or evidence.get("verifiedModes") != ["openclaw", "quiet", "command"] or evidence.get("packageRevision") != "modes-r4":
        raise ValueError("UI integration verification did not confirm the exact generation")
    final_proof = RUNTIME / "evidence" / "final"
    if final_proof.exists():
        raise ValueError("Final evidence already exists; preserve it and use a fresh generation package")
    shutil.copytree(proof, final_proof)
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{output.name}.candidate-", dir=output.parent))
    try:
        shutil.copytree(source / "dist" / "control-ui", stage / "control-ui",
                        ignore=shutil.ignore_patterns("*.map", "*.map.*", ".build-inputs.json"))
        notices = stage / "control-ui" / "lazykins-notices"
        notices.mkdir()
        shutil.copy2(source / "LICENSE", notices / "OpenClaw-LICENSE.txt")
        shutil.copy2(source / "THIRD_PARTY_NOTICES.md", notices / "OpenClaw-THIRD-PARTY.md")
        shutil.copy2(RUNTIME / "assets" / "fonts" / "Inter-OFL.txt", notices / "Inter-OFL.txt")
        manifest = {"schemaVersion": 1, "version": VERSION, "sha": SHA,
                    "integration": "exact-pinned-Solid2-LazyKins-modes-overlay",
                    "modes": ["openclaw", "quiet", "command"], "packageRevision": "modes-r4", "headerRevision": "r3",
                    "testedVersions": [VERSION], "node": node,
                    "packageManager": package["packageManager"], "sourcemap": "generated upstream; omitted from payload",
                    "lockfileSha256": digest(source / "pnpm-lock.yaml"),
                    "patchSha256": digest(patch), "overlayFiles": inventory(RUNTIME / "ui"),
                    "overlayAssetBudget": overlay_budget,
                    "files": inventory(stage / "control-ui")}
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        stage.replace(output)
        print(json.dumps({"built": True, "output": str(output), "proof": str(proof), "version": VERSION, "sha": SHA}))
    finally:
        if stage.exists():
            # Only this invocation's generated, unlinked candidate is removed.
            if stage.parent != output.parent or not stage.name.startswith(f".{output.name}.candidate-") or stage.is_symlink():
                raise ValueError("Unsafe candidate cleanup target")
            shutil.rmtree(stage)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"Build stopped: {error}", file=sys.stderr)
        raise SystemExit(1)
