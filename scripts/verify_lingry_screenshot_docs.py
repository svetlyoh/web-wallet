#!/usr/bin/env python3
"""Validate Lingry screenshot docs and ClawHub-safe image references."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT_DIR = ROOT / "docs" / "lingry" / "screenshots"
MANIFEST_PATH = SCREENSHOT_DIR / "manifest.json"
README_PATH = SCREENSHOT_DIR / "README.md"
SKILL_DIR = ROOT / "openclaw" / "skills" / "lingry"
SKILL_PATH = SKILL_DIR / "SKILL.md"
BINARY_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".mov", ".mp4"}
FULL_SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")
IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
RAW_GITHUB_RE = re.compile(
    r"^https://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([0-9a-fA-F]{40})/docs/lingry/screenshots/([^)\s]+)$"
)


def error(message: str, errors: list[str]) -> None:
    errors.append(f"ERROR: {message}")


def load_manifest(errors: list[str]) -> dict:
    if not MANIFEST_PATH.exists():
        error(f"Missing screenshot manifest: {MANIFEST_PATH.relative_to(ROOT).as_posix()}", errors)
        return {"screenshots": []}
    try:
        with MANIFEST_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception as exc:  # noqa: BLE001
        error(f"Could not parse manifest.json: {exc}", errors)
        return {"screenshots": []}
    if not isinstance(data, dict) or not isinstance(data.get("screenshots"), list):
        error("manifest.json must contain a top-level screenshots array.", errors)
        return {"screenshots": []}
    return data


def has_privacy_confirmation(text: str) -> bool:
    lowered = text.lower()
    required_terms = ["confirmed", "private key", "seed phrase", "session token", "api key"]
    return all(term in lowered for term in required_terms)


def verify_skill_binary_free(errors: list[str]) -> None:
    if not SKILL_DIR.exists():
        error("Missing openclaw/skills/lingry directory.", errors)
        return
    for path in SKILL_DIR.rglob("*"):
        if path.is_file() and path.suffix.lower() in BINARY_EXTENSIONS:
            error(f"Binary asset found inside published skill folder: {path.relative_to(ROOT).as_posix()}", errors)


def verify_manifest_entries(data: dict, errors: list[str]) -> set[str]:
    listed_images: set[str] = set()
    seen_ids: set[str] = set()
    for index, entry in enumerate(data.get("screenshots", []), start=1):
        prefix = f"manifest entry {index}"
        image = entry.get("image")
        doc = entry.get("documentation")
        alt = str(entry.get("altText", "")).strip()
        entry_id = str(entry.get("id", "")).strip()
        if not entry_id:
            error(f"{prefix} has no id.", errors)
        elif entry_id in seen_ids:
            error(f"{prefix} duplicates id {entry_id}.", errors)
        seen_ids.add(entry_id)
        if not image:
            error(f"{prefix} has no image filename.", errors)
        else:
            listed_images.add(Path(image).name)
            image_path = SCREENSHOT_DIR / image
            if not image_path.exists():
                error(f"{prefix} image file is missing: {image}", errors)
            if Path(image).suffix.lower() not in BINARY_EXTENSIONS:
                error(f"{prefix} image does not use an accepted screenshot extension: {image}", errors)
        if not doc:
            error(f"{prefix} has no paired Markdown documentation.", errors)
            continue
        doc_path = SCREENSHOT_DIR / doc
        if not doc_path.exists():
            error(f"{prefix} documentation file is missing: {doc}", errors)
            continue
        doc_text = doc_path.read_text(encoding="utf-8")
        if not alt:
            error(f"{prefix} has no alt text in manifest.json.", errors)
        if "## Alt text" not in doc_text or not re.search(r"## Alt text\s+\S", doc_text, re.MULTILINE):
            error(f"{doc} has no Alt text section content.", errors)
        if "## Privacy review" not in doc_text or not has_privacy_confirmation(doc_text):
            error(f"{doc} has no complete privacy-review confirmation.", errors)
        if "## Agent guidance" not in doc_text or not re.search(r"## Agent guidance\s+\S", doc_text, re.MULTILINE):
            error(f"{doc} has no Agent guidance section content.", errors)
    return listed_images


def verify_skill_markdown_images(listed_images: set[str], errors: list[str]) -> None:
    if not SKILL_PATH.exists():
        error("Missing openclaw/skills/lingry/SKILL.md.", errors)
        return
    skill_text = SKILL_PATH.read_text(encoding="utf-8")
    lowered = skill_text.lower()
    if "data:image" in lowered or "base64," in lowered:
        error("SKILL.md contains a data:image or base64 image reference.", errors)

    for match in IMAGE_RE.finditer(skill_text):
        alt_text = match.group(1).strip()
        url = match.group(2).strip().strip("<>")
        if not alt_text:
            error("SKILL.md contains a screenshot image without alt text.", errors)
        if url.startswith("data:") or "base64," in url.lower():
            error("SKILL.md contains a data URL or base64 image.", errors)
            continue
        if not url.startswith("https://"):
            error(f"SKILL.md contains a relative or non-HTTPS screenshot image URL: {url}", errors)
            continue
        raw_match = RAW_GITHUB_RE.fullmatch(url)
        if not raw_match:
            if "githubusercontent.com" not in url:
                error(f"SKILL.md references a non-GitHub image source: {url}", errors)
            else:
                error(f"Raw GitHub image URL is missing a full commit SHA or expected screenshot path: {url}", errors)
            continue
        ref = raw_match.group(3)
        image_name = Path(raw_match.group(4)).name
        if ref.lower() in {"main", "master", "head"} or not FULL_SHA_RE.fullmatch(ref):
            error(f"SKILL.md screenshot URL is not commit-pinned: {url}", errors)
        if image_name not in listed_images:
            error(f"SKILL.md references a screenshot that is not listed in manifest.json: {image_name}", errors)

        start_line = skill_text[:match.start()].count("\n")
        lines = skill_text.splitlines()
        context = "\n".join(lines[start_line:start_line + 12])
        for label in ("**What this shows:**", "**What the user does:**", "**Agent guidance:**"):
            if label not in context:
                error(f"SKILL.md screenshot {image_name} is missing nearby text label {label}", errors)


def main() -> int:
    errors: list[str] = []
    data = load_manifest(errors)
    verify_skill_binary_free(errors)
    listed_images = verify_manifest_entries(data, errors)
    verify_skill_markdown_images(listed_images, errors)
    if not README_PATH.exists():
        error("Missing docs/lingry/screenshots/README.md.", errors)

    if errors:
        for message in errors:
            print(message, file=sys.stderr)
        return 1

    count = len(data.get("screenshots", []))
    print(f"PASS: {count} screenshots documented.")
    print("PASS: No binary assets found in openclaw/skills/lingry.")
    print("PASS: All SKILL.md screenshot links are commit-pinned.")
    print("PASS: All screenshots include alt text and agent guidance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
