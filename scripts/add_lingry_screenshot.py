#!/usr/bin/env python3
"""Interactively add one Lingry screenshot and its documentation."""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT_DIR = ROOT / "docs" / "lingry" / "screenshots"
MANIFEST_PATH = SCREENSHOT_DIR / "manifest.json"
README_PATH = SCREENSHOT_DIR / "README.md"
SKILL_DIR = ROOT / "openclaw" / "skills" / "lingry"
ACCEPTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VAGUE_SLUGS = {"screenshot", "screen-shot", "image", "image1", "final", "final-final"}
SECRET_REVIEW_TEXT = (
    "Confirmed: This image contains no wallet private key, seed phrase, "
    "recovery phrase, wallet passphrase, session token, API key, email address, "
    "phone number, personal name, browser autofill detail, sensitive account "
    "balance, sensitive transaction record, or terminal history containing "
    "credentials."
)


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        return {"screenshots": []}
    with MANIFEST_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict) or not isinstance(data.get("screenshots"), list):
        raise SystemExit(f"ERROR: Invalid manifest shape in {MANIFEST_PATH}")
    return data


def save_manifest(data: dict) -> None:
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    with MANIFEST_PATH.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def prompt(label: str) -> str:
    value = input(label).strip()
    if not value:
        raise SystemExit("ERROR: A required answer was left blank.")
    return value


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    if not slug or slug in VAGUE_SLUGS or len(slug) < 3:
        raise SystemExit("ERROR: Please use a more descriptive screenshot title.")
    return slug[:70].strip("-")


def parse_order(value: str) -> int:
    try:
        order = int(value)
    except ValueError as exc:
        raise SystemExit("ERROR: Desired order must be a positive integer.") from exc
    if order < 1:
        raise SystemExit("ERROR: Desired order must be a positive integer.")
    return order


def next_available_path(order: int, slug: str, extension: str) -> tuple[Path, Path]:
    base = f"{order:02d}-{slug}"
    image_path = SCREENSHOT_DIR / f"{base}{extension.lower()}"
    doc_path = SCREENSHOT_DIR / f"{base}.md"
    suffix = 2
    while image_path.exists() or doc_path.exists():
        base = f"{order:02d}-{slug}-{suffix}"
        image_path = SCREENSHOT_DIR / f"{base}{extension.lower()}"
        doc_path = SCREENSHOT_DIR / f"{base}.md"
        suffix += 1
    return image_path, doc_path


def markdown_escape(value: str) -> str:
    return value.replace("\r\n", "\n").strip()


def create_doc(
    doc_path: Path,
    *,
    title: str,
    image_name: str,
    purpose: str,
    user_action: str,
    expected_result: str,
    agent_guidance: str,
    alt_text: str,
) -> None:
    content = f"""# {title}

## Screenshot file

`{image_name}`

## Purpose

{purpose}

## What the user sees

{purpose}

## User action

{user_action}

## Expected result

{expected_result}

## Agent guidance

{agent_guidance}

## Alt text

{alt_text}

## Privacy review

{SECRET_REVIEW_TEXT}
"""
    doc_path.write_text(content, encoding="utf-8", newline="\n")


def update_orders(entries: list[dict], desired_order: int) -> None:
    for entry in entries:
        if int(entry.get("order", 0)) >= desired_order:
            entry["order"] = int(entry.get("order", 0)) + 1


def add_manifest_entry(data: dict, entry: dict) -> None:
    entries = data.setdefault("screenshots", [])
    update_orders(entries, int(entry["order"]))
    entries.append(entry)
    entries.sort(key=lambda item: (int(item.get("order", 9999)), item.get("title", "")))


def render_readme(data: dict) -> str:
    entries = sorted(data.get("screenshots", []), key=lambda item: (int(item.get("order", 9999)), item.get("title", "")))
    lines = [
        "# Lingry Screenshot Guide",
        "",
        "This guide is the GitHub-hosted visual documentation source for Lingry screenshots. It is safe to include relative image links here because this file is viewed in the repository, not inside the published ClawHub skill bundle.",
        "",
        "Use the intake script to add one screenshot at a time:",
        "",
        "```bash",
        "python3 scripts/add_lingry_screenshot.py",
        "```",
        "",
        "## Table of contents",
        "",
        "- [Screenshot intake rules](#screenshot-intake-rules)",
        "- [Planned walkthrough sections](#planned-walkthrough-sections)",
        "- [Screenshot index](#screenshot-index)",
    ]
    for entry in entries:
        anchor = re.sub(r"[^a-z0-9 -]", "", entry["title"].lower()).replace(" ", "-")
        anchor = re.sub(r"-{2,}", "-", anchor).strip("-")
        lines.append(f"- [{entry['order']}. {entry['title']}](#{entry['order']}-{anchor})")
    lines.extend(
        [
            "",
            "## Screenshot intake rules",
            "",
            "Only add screenshots that have been reviewed for secrets and personal information. Do not add private keys, seed phrases, recovery phrases, wallet passphrases, session tokens, API keys, email addresses, phone numbers, personal names, browser autofill details, sensitive balances, sensitive transaction records, or terminal history containing credentials.",
            "",
            "The published ClawHub skill package must stay text-only. Screenshots belong in this `docs/lingry/screenshots/` directory and are referenced from `openclaw/skills/lingry/SKILL.md` only after they are committed to GitHub and synced with commit-pinned raw GitHub URLs.",
            "",
            "## Planned walkthrough sections",
            "",
            "1. Lingry homepage",
            "2. Sign up or login",
            "3. Creating a word",
            "4. Coining or submitting a word",
            "5. Viewing the Stream",
            "6. Viewing the Leaderboard",
            "7. Connecting or using a wallet",
            "8. Using the Lingry OpenClaw skill",
            "",
            "## Screenshot index",
            "",
        ]
    )
    if not entries:
        lines.append("No screenshots have been added yet.")
        return "\n".join(lines) + "\n"

    for entry in entries:
        lines.extend(
            [
                f"## {entry['order']}. {entry['title']}",
                "",
                f"![{entry['altText']}](./{entry['image']})",
                "",
                f"**What the screenshot shows:** {entry.get('whatUserSees') or entry['purpose']}",
                "",
                f"**Why this step matters:** {entry.get('whyStepMatters') or entry['purpose']}",
                "",
                f"**Exact user action:** {entry['userAction']}",
                "",
                f"**Expected result:** {entry['expectedResult']}",
                "",
                f"**Relevant Lingry or OpenClaw command:** {entry.get('command') or 'Not applicable.'}",
                "",
                f"**Agent guidance:** {entry['agentGuidance']}",
                "",
                f"Paired documentation: [`{entry['documentation']}`](./{entry['documentation']})",
                "",
            ]
        )
    return "\n".join(lines)


def ensure_not_inside_skill(path: Path) -> None:
    try:
        path.resolve().relative_to(SKILL_DIR.resolve())
    except ValueError:
        return
    raise SystemExit("ERROR: The screenshot source is inside openclaw/skills/lingry. Use a file outside the published skill folder.")


def main() -> int:
    print("Add one Lingry screenshot.")
    source = Path(prompt("1. Local path to the screenshot file: ").strip('"'))
    if not source.exists() or not source.is_file():
        raise SystemExit(f"ERROR: Screenshot file does not exist: {source}")
    ensure_not_inside_skill(source)
    if source.suffix.lower() not in ACCEPTED_EXTENSIONS:
        accepted = ", ".join(sorted(ACCEPTED_EXTENSIONS))
        raise SystemExit(f"ERROR: Unsupported screenshot format. Use one of: {accepted}")
    if source.stat().st_size <= 0:
        raise SystemExit("ERROR: Screenshot file is empty.")

    title = prompt("2. Short screenshot title: ")
    purpose = prompt("3. What the screenshot is meant to teach: ")
    user_action = prompt("4. Exact user action shown: ")
    expected_result = prompt("5. Expected result after the action: ")
    agent_guidance = prompt("6. Agent guidance for this screen: ")
    alt_text = prompt("7. Accessible alt text: ")
    order = parse_order(prompt("8. Desired order in the walkthrough: "))
    privacy = prompt("9. Confirm no secrets or personal information are visible (type YES): ")
    if privacy.lower() not in {"yes", "y", "confirmed", "confirm"}:
        raise SystemExit("ERROR: Screenshot was not accepted because privacy confirmation was not provided.")

    slug = slugify(title)
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    image_path, doc_path = next_available_path(order, slug, source.suffix)

    shutil.copy2(source, image_path)
    create_doc(
        doc_path,
        title=markdown_escape(title),
        image_name=image_path.name,
        purpose=markdown_escape(purpose),
        user_action=markdown_escape(user_action),
        expected_result=markdown_escape(expected_result),
        agent_guidance=markdown_escape(agent_guidance),
        alt_text=markdown_escape(alt_text),
    )

    data = load_manifest()
    add_manifest_entry(
        data,
        {
            "order": order,
            "id": slug,
            "title": markdown_escape(title),
            "image": image_path.name,
            "documentation": doc_path.name,
            "altText": markdown_escape(alt_text),
            "purpose": markdown_escape(purpose),
            "userAction": markdown_escape(user_action),
            "expectedResult": markdown_escape(expected_result),
            "agentGuidance": markdown_escape(agent_guidance),
            "command": "Not applicable.",
            "status": "approved",
        },
    )
    save_manifest(data)
    README_PATH.write_text(render_readme(data), encoding="utf-8", newline="\n")

    print("\nAdded Lingry screenshot documentation:")
    print(f"- Image: {image_path.relative_to(ROOT).as_posix()}")
    print(f"- Documentation: {doc_path.relative_to(ROOT).as_posix()}")
    print(f"- Manifest: {MANIFEST_PATH.relative_to(ROOT).as_posix()}")
    print(f"- GitHub guide: {README_PATH.relative_to(ROOT).as_posix()}")
    print("\nNext Git commands:")
    print(f"git add {image_path.relative_to(ROOT).as_posix()} {doc_path.relative_to(ROOT).as_posix()} {MANIFEST_PATH.relative_to(ROOT).as_posix()} {README_PATH.relative_to(ROOT).as_posix()}")
    print('git commit -m "Add Lingry screenshot documentation"')
    print("git push")
    print("\nAfter the screenshot commit is pushed, sync ClawHub links with:")
    print("python3 scripts/sync_lingry_screenshot_links.py --ref <commit-sha>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
