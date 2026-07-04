#!/usr/bin/env python3
"""Sync Lingry screenshot links into SKILL.md using commit-pinned GitHub URLs."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT_DIR = ROOT / "docs" / "lingry" / "screenshots"
MANIFEST_PATH = SCREENSHOT_DIR / "manifest.json"
SKILL_PATH = ROOT / "openclaw" / "skills" / "lingry" / "SKILL.md"
BEGIN = "<!-- BEGIN LINGRY SCREENSHOT WALKTHROUGH -->"
END = "<!-- END LINGRY SCREENSHOT WALKTHROUGH -->"
FULL_SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")
REJECTED_REFS = {"main", "master", "head", "refs/heads/main", "refs/heads/master"}


def reject_bad_ref(ref: str) -> str:
    ref = (ref or "").strip()
    if not ref:
        raise SystemExit("ERROR: --ref is required and cannot be empty.")
    if ref.lower() in REJECTED_REFS:
        raise SystemExit("ERROR: Use a full commit SHA, not main, master, or HEAD.")
    if not FULL_SHA_RE.fullmatch(ref):
        raise SystemExit("ERROR: --ref must be a full 40-character Git commit SHA.")
    return ref.lower()


def run_git(args: list[str]) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def github_repo_from_remote(remote_url: str) -> str | None:
    remote_url = remote_url.strip()
    patterns = [
        r"^https://github\.com/([^/\s]+/[^/\s]+?)(?:\.git)?$",
        r"^git@github\.com:([^/\s]+/[^/\s]+?)(?:\.git)?$",
    ]
    for pattern in patterns:
        match = re.match(pattern, remote_url)
        if match:
            return match.group(1)
    return None


def detect_repo(explicit_repo: str | None) -> str:
    if explicit_repo:
        repo = explicit_repo.strip()
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
            raise SystemExit("ERROR: --repo must look like owner/repository.")
        return repo

    for remote_name in ("svetlyoh", "origin"):
        repo = github_repo_from_remote(run_git(["remote", "get-url", remote_name]))
        if repo:
            return repo
    raise SystemExit("ERROR: Could not detect a GitHub remote. Pass --repo owner/repository.")


def load_manifest() -> dict:
    with MANIFEST_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict) or not isinstance(data.get("screenshots"), list):
        raise SystemExit(f"ERROR: Invalid manifest shape in {MANIFEST_PATH}")
    return data


def approved_entries(limit: int) -> list[dict]:
    entries = [
        entry for entry in load_manifest()["screenshots"]
        if entry.get("status", "approved") == "approved"
    ]
    entries.sort(key=lambda item: (int(item.get("order", 9999)), item.get("title", "")))
    return entries[:limit]


def raw_url(repo: str, ref: str, image: str) -> str:
    if re.search(r"(^|/)\.\.(/|$)", image) or image.startswith("/"):
        raise SystemExit(f"ERROR: Manifest image path is not a local screenshot filename: {image}")
    return f"https://raw.githubusercontent.com/{repo}/{ref}/docs/lingry/screenshots/{image}"


def render_block(entries: list[dict], repo: str, ref: str) -> str:
    lines = [
        "## Visual walkthrough",
        "",
        BEGIN,
        "",
    ]
    if not entries:
        lines.extend(
            [
                "No ClawHub screenshots have been synced yet. Add screenshots with `scripts/add_lingry_screenshot.py`, commit them to GitHub, then run `scripts/sync_lingry_screenshot_links.py --ref <commit-sha>`.",
                "",
                "Text-only agents can still use the workflow sections below to understand Lingry setup, word creation, Stream, Leaderboard, wallet authorization, and safety boundaries.",
                "",
                END,
                "",
            ]
        )
        return "\n".join(lines)

    for entry in entries:
        title = entry["title"]
        alt = entry["altText"]
        url = raw_url(repo, ref, entry["image"])
        lines.extend(
            [
                f"### {title}",
                "",
                f"![{alt}]({url})",
                "",
                f"**What this shows:** {entry['purpose']}",
                "",
                f"**What the user does:** {entry['userAction']}",
                "",
                f"**Expected result:** {entry['expectedResult']}",
                "",
                f"**Agent guidance:** {entry['agentGuidance']}",
                "",
            ]
        )
    lines.extend([END, ""])
    return "\n".join(lines)


def replace_visual_walkthrough(skill: str, block: str) -> str:
    marker_re = re.compile(
        r"## Visual walkthrough\s*\n\s*" + re.escape(BEGIN) + r"[\s\S]*?" + re.escape(END) + r"\s*",
        re.MULTILINE,
    )
    if marker_re.search(skill):
        return marker_re.sub(block + "\n", skill, count=1)

    heading = "\n## Canonical API URL\n"
    if heading in skill:
        return skill.replace(heading, "\n" + block + heading, 1)
    return skill.rstrip() + "\n\n" + block


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", required=True, help="Full 40-character commit SHA containing the screenshot files.")
    parser.add_argument("--repo", help="GitHub repository in owner/repository form. Defaults to the svetlyoh remote, then origin.")
    parser.add_argument("--limit", type=int, default=6, help="Maximum approved screenshots to include in SKILL.md.")
    args = parser.parse_args()

    if args.limit < 1 or args.limit > 6:
        raise SystemExit("ERROR: --limit must be between 1 and 6.")

    ref = reject_bad_ref(args.ref)
    repo = detect_repo(args.repo)
    entries = approved_entries(args.limit)
    skill = SKILL_PATH.read_text(encoding="utf-8")
    block = render_block(entries, repo, ref)
    updated = replace_visual_walkthrough(skill, block)
    SKILL_PATH.write_text(updated, encoding="utf-8", newline="\n")

    print(f"PASS: Synced {len(entries)} screenshot link(s) into {SKILL_PATH.relative_to(ROOT).as_posix()}.")
    print(f"PASS: Raw GitHub URLs are pinned to {ref}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
