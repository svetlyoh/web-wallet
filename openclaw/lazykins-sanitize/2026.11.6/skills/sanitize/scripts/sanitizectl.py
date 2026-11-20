#!/usr/bin/env python3
"""Manage one agent's persistent voice; stdlib-only, no Gateway or reply rewriting."""
from __future__ import annotations

import argparse
from contextlib import closing, contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import subprocess
import sys
import tempfile
from typing import Iterator

BASELINE = "2026.11.6"
BASELINE_SHA = "06afb10d3272cc9deaf38ca6a3b7b839d5935638"
SUPPORTED_RELEASES = {
    "2026.9.6": "eb377ac59e6c9fd6c7705028034812becf00271b",
    BASELINE: BASELINE_SHA,
}
BEGIN = b"<!-- sanitize:begin v1 -->"
END = b"<!-- sanitize:end -->"
MODES = ("simple", "balanced", "detailed")
POLICY = """## Persistent English voice
This policy governs only your own explanations, status prose, and error summaries.
Speak in English, including when the request uses another language. Preserve exact
quotations, names, source text, filenames, URLs, code, commands, JSON, mathematical
notation, attachment metadata, and user artifacts wherever fidelity requires it.
Do not translate or rewrite artifacts to enforce prose style. Normal Unicode is welcome.

Lead with the useful answer, result, or observed state. Use calm, competent wording,
familiar words, active sentences, and short paragraphs. Explain necessary terms once.
Use lists for real steps or parallel choices and tables for useful comparisons.
Avoid opening fillers, hype, excessive exclamation marks, decorative emoji, repetitive
summaries, constant encouragement, and repeated offers to do already authorized work.
Complete authorized work. Describe meaningful progress, delays, failures, and decisions
briefly; do not narrate every tool call.

Preserve facts, uncertainty, limitations, sources, citations, units, amounts, dates,
time zones, and important distinctions. Keep approval and permission boundaries clear.
Never claim a file was saved, a message sent, a schedule created, a repair begun, or a
retry underway without runtime evidence. An unsent draft is ready to review, not sent.
An unknown-result timeout stays unknown; do not replay a non-idempotent action.
On failure, say what failed, what is known, and the next supported step. Classify an
authentication error or retry only when the observed evidence supports that claim.

Do not mutate tool arguments, executable code, stored facts, raw transcripts, control
envelopes, or approval requirements. Keep protected content exact. Use existing safe
Markdown/HTML handling; do not add broad replacements, an unsafe renderer, or another
model pass. Requested technical depth and complete deliverables always take priority
over default brevity. Never truncate code, instructions, or reports to meet a length goal.
"""
DEPTH = {
    "simple": "Use everyday English, direct answer first, and only necessary context. Usually use one short paragraph or a few steps. Roughly grade 7–9 readability is a soft guide, never a promised score.",
    "balanced": "Use the same plain English, with a useful explanation and relevant alternatives.",
    "detailed": "Use the same calm English, with thorough reasoning, technical specifics, and examples when useful.",
}


class ControlError(RuntimeError):
    """An actionable refusal that does not expose CLI/configuration secrets."""


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def policy_block(mode: str, newline: bytes = b"\n") -> bytes:
    text = POLICY + "\nComplexity: " + mode + ". " + DEPTH[mode] + "\n"
    return BEGIN + newline + text.encode("utf-8").replace(b"\n", newline) + END + newline


def read_soul(path: Path) -> tuple[bytes, bool, int]:
    if path.is_symlink():
        raise ControlError("SOUL.md is a symlink. Resolve the workspace ownership before changing it.")
    try:
        info = path.stat()
    except FileNotFoundError:
        return b"", False, 0o600
    if not stat.S_ISREG(info.st_mode) or info.st_nlink > 1:
        raise ControlError("SOUL.md must be a regular file with no hard-link aliases.")
    if hasattr(os, "getuid") and info.st_uid != os.getuid():
        raise ControlError("Run sanitize as the owner of SOUL.md to preserve file ownership.")
    data = path.read_bytes()
    try:
        data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ControlError("SOUL.md must be UTF-8; its bytes have been left unchanged.") from exc
    return data, True, stat.S_IMODE(info.st_mode)


@contextmanager
def workspace_lock(workspace: Path) -> Iterator[None]:
    """A stable lock inode serializes even controllers using different state roots."""
    path = workspace / ".sanitize-control.lock"
    if path.is_symlink():
        raise ControlError("The sanitize workspace lock is a symlink; inspect it before continuing.")
    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, 0o600)
    locked = False
    try:
        if os.fstat(fd).st_nlink != 1:
            raise ControlError("The sanitize workspace lock has aliases; inspect it before continuing.")
        if os.name == "nt":
            import msvcrt
            if os.fstat(fd).st_size == 0:
                os.write(fd, b"0")
            os.lseek(fd, 0, os.SEEK_SET)
            try:
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                raise ControlError("Another sanitize operation is running. Retry after it finishes.") from exc
        else:
            import fcntl
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise ControlError("Another sanitize operation is running. Retry after it finishes.") from exc
        locked = True
        yield
    finally:
        if locked:
            if os.name == "nt":
                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def sync_directory(path: Path) -> None:
    if os.name != "nt":
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def publish_soul(path: Path, data: bytes, exists: bool, mode: int,
                 expected: bytes, expected_exists: bool) -> None:
    """Recheck before replacing; editors do not share this advisory lock."""
    descriptor, name = tempfile.mkstemp(prefix=".sanitize-", suffix=".tmp", dir=path.parent)
    temp = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp, mode)
        current, current_exists, _ = read_soul(path)
        if current != expected or current_exists != expected_exists:
            raise ControlError("SOUL.md changed during the operation. Nothing was overwritten; inspect and retry.")
        if exists:
            os.replace(temp, path)
        else:
            path.unlink(missing_ok=True)
        sync_directory(path.parent)
    finally:
        temp.unlink(missing_ok=True)


class Controller:
    def __init__(self, workspace: Path, state_dir: Path, profile: str, agent: str):
        self.workspace = workspace.resolve(strict=True)
        self.state_dir = state_dir.resolve(strict=True)
        if not self.workspace.is_dir() or not self.state_dir.is_dir():
            raise ControlError("The explicit workspace and state directory must already exist.")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", profile) or not re.fullmatch(r"[A-Za-z0-9_-]+", agent):
            raise ControlError("Profile and agent must contain only letters, numbers, underscores, or hyphens.")
        self.profile, self.agent = profile, agent
        self.reported_commit: str | None = None
        self.soul = self.workspace / "SOUL.md"
        self.product_dir = self.state_dir / "sanitize"
        self.db_path = self.product_dir / "controller.sqlite3"
        self.key = os.path.normcase(str(self.workspace))

    def connect(self) -> sqlite3.Connection:
        if self.product_dir.is_symlink() or self.db_path.is_symlink():
            raise ControlError("Sanitize state must not use symlinks; inspect the product state directory.")
        self.product_dir.mkdir(mode=0o700, exist_ok=True)
        product_info = self.product_dir.stat()
        if not stat.S_ISDIR(product_info.st_mode):
            raise ControlError("Sanitize state must be a product-owned directory.")
        if hasattr(os, "getuid") and product_info.st_uid != os.getuid():
            raise ControlError("Run sanitize as the owner of its private state directory.")
        os.chmod(self.product_dir, 0o700)
        fresh = not self.db_path.exists()
        if not fresh:
            db_info = self.db_path.stat()
            if not stat.S_ISREG(db_info.st_mode) or db_info.st_nlink != 1:
                raise ControlError("The sanitize database must be a regular file with no hard-link aliases.")
            if hasattr(os, "getuid") and db_info.st_uid != os.getuid():
                raise ControlError("Run sanitize as the owner of its private database.")
            os.chmod(self.db_path, 0o600)
        db = sqlite3.connect(self.db_path, timeout=15)
        if fresh:
            os.chmod(self.db_path, 0o600)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA synchronous=FULL")
        schema_version = db.execute("PRAGMA user_version").fetchone()[0]
        if schema_version not in (0, 1):
            db.close()
            raise ControlError("Unknown sanitize state schema; use its matching controller.")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS targets (
                workspace TEXT PRIMARY KEY, profile TEXT NOT NULL, agent TEXT NOT NULL,
                state TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS revisions (
                id INTEGER PRIMARY KEY, workspace TEXT NOT NULL, operation TEXT NOT NULL,
                created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                before_bytes BLOB NOT NULL, before_exists INTEGER NOT NULL,
                after_bytes BLOB NOT NULL, after_exists INTEGER NOT NULL,
                file_mode INTEGER NOT NULL, next_state TEXT NOT NULL,
                phase TEXT NOT NULL CHECK (phase IN ('prepared','applied','aborted'))
            );
            PRAGMA user_version=1;
        """)
        return db

    def target_state(self, db: sqlite3.Connection) -> dict | None:
        row = db.execute("SELECT * FROM targets WHERE workspace=?", (self.key,)).fetchone()
        if row is None:
            return None
        if row["profile"] != self.profile or row["agent"] != self.agent:
            raise ControlError("This workspace has sanitize metadata owned by a different profile or agent. Inspect that target before changing it.")
        return json.loads(row["state"])

    def save_state(self, db: sqlite3.Connection, state: dict) -> None:
        db.execute("INSERT INTO targets(workspace,profile,agent,state) VALUES(?,?,?,?) "
                   "ON CONFLICT(workspace) DO UPDATE SET state=excluded.state",
                   (self.key, self.profile, self.agent, json.dumps(state, sort_keys=True)))

    def recover(self, db: sqlite3.Connection, mutate: bool) -> bool:
        rows = db.execute("SELECT * FROM revisions WHERE workspace=? AND phase='prepared' ORDER BY id", (self.key,)).fetchall()
        if not rows:
            return False
        if not mutate:
            return True
        for row in rows:
            next_state = json.loads(row["next_state"])
            if next_state.get("profile") != self.profile or next_state.get("agent") != self.agent:
                raise ControlError("The interrupted operation belongs to a different profile or agent. Recover using its recorded target.")
            current, exists, _ = read_soul(self.soul)
            before = (bytes(row["before_bytes"]), bool(row["before_exists"]))
            after = (bytes(row["after_bytes"]), bool(row["after_exists"]))
            if (current, exists) == after:
                self.save_state(db, next_state)
                phase = "applied"
            elif (current, exists) == before:
                phase = "aborted"
            else:
                raise ControlError("An interrupted sanitize operation and later SOUL.md edits conflict. The SQLite revision preserves both planned versions; resolve the conflict before changing anything.")
            db.execute("UPDATE revisions SET phase=? WHERE id=?", (phase, row["id"]))
            db.commit()
        return False

    @staticmethod
    def owned_range(data: bytes, state: dict | None) -> tuple[int, int] | None:
        if b"<!-- sanitize:" not in data:
            if state and state["enabled"]:
                raise ControlError("The owned sanitize block is missing or its markers changed. Inspect SOUL.md; nothing was overwritten.")
            return None
        expected = bytes.fromhex(state["block"]) if state and state["enabled"] else None
        if expected is None or data.count(b"<!-- sanitize:") != 2 or data.count(BEGIN) != 1 or data.count(END) != 1:
            raise ControlError("Untracked, duplicated, or malformed sanitize markers conflict. Inspect SOUL.md; nothing was overwritten.")
        start = data.find(BEGIN)
        if data[start:start + len(expected)] != expected:
            raise ControlError("The user-edited sanitize block differs from the recorded policy. Inspect the owned block and its reference; nothing was overwritten.")
        return start, start + len(expected)

    def run(self, operation: str, *, complexity: str | None = None,
            version: str | None, offline: bool = False) -> dict:
        if operation not in ("on", "off", "status", "complexity"):
            raise ControlError("Unsupported operation.")
        if operation == "complexity" and complexity not in MODES:
            raise ControlError("Choose simple, balanced, or detailed.")
        expected_commit = SUPPORTED_RELEASES.get(version)
        compatible = bool(expected_commit and (self.reported_commit is None
                                               or expected_commit.startswith(self.reported_commit)))
        if operation in ("on", "complexity") and not compatible:
            raise ControlError("Sanitize mutations require a source-validated stable release: " + ", ".join(SUPPORTED_RELEASES) + ". Retained skills and voice policy need revalidation after other updates; status and owned-block removal remain available.")
        if offline and operation not in ("off", "status"):
            raise ControlError("Offline mode supports only status or rollback with off.")
        with workspace_lock(self.workspace):
            with closing(self.connect()) as db:
                self.target_state(db)  # Check ownership before recovering any pending write.
                pending = self.recover(db, operation != "status")
                state = self.target_state(db)
                if offline and state is None:
                    raise ControlError("Offline control requires recorded ownership for this exact workspace, profile, and agent.")
                before, before_exists, file_mode = read_soul(self.soul)
                try:
                    owned = self.owned_range(before, state)
                except ControlError as exc:
                    if operation != "status":
                        raise
                    return self.describe(state, compatible, version, pending, str(exc))
                if operation == "status":
                    return self.describe(state, compatible, version, pending)
                current = state or {"enabled": False, "complexity": "simple", "block": "", "separator": "", "created_soul": False}
                next_state = dict(current)
                # Keep the writing release's provenance, including on an offline rollback.
                writing_release = version if compatible else current.get("baseline", BASELINE)
                next_state["baseline"] = writing_release
                next_state["baseline_sha"] = SUPPORTED_RELEASES.get(writing_release, current.get("baseline_sha"))
                next_state.update(profile=self.profile, agent=self.agent)
                after, after_exists = before, before_exists
                mode = complexity if operation == "complexity" else current["complexity"]
                if operation == "off":
                    if owned:
                        start, end = owned
                        sep = bytes.fromhex(current["separator"])
                        if sep and before[max(0, start-len(sep)):start] == sep:
                            start -= len(sep)
                        after = before[:start] + before[end:]
                        after_exists = not (current["created_soul"] and not after)
                    next_state.update(enabled=False, block="", separator="", created_soul=False)
                elif operation == "on" or current["enabled"]:
                    newline = b"\r\n" if before.count(b"\r\n") > before.count(b"\n") - before.count(b"\r\n") else b"\n"
                    block = policy_block(mode, newline)
                    if owned:
                        start, end = owned
                        after = before[:start] + block + before[end:]
                    else:
                        sep = (newline if before.endswith(b"\n") else newline * 2) if before else b""
                        after = before + sep + block
                        next_state.update(separator=sep.hex(), created_soul=not before_exists)
                    after_exists = True
                    next_state.update(enabled=True, complexity=mode, block=block.hex())
                else:
                    next_state["complexity"] = mode
                changed = (after, after_exists) != (before, before_exists) or next_state != current or state is None
                if changed:
                    cursor = db.execute("INSERT INTO revisions(workspace,operation,before_bytes,before_exists,after_bytes,after_exists,file_mode,next_state,phase) VALUES(?,?,?,?,?,?,?,?, 'prepared')",
                                        (self.key, operation, before, before_exists, after, after_exists, file_mode, json.dumps(next_state, sort_keys=True)))
                    revision = cursor.lastrowid
                    db.commit()  # Durable private backup and redo plan precede the file mutation.
                    try:
                        if (after, after_exists) != (before, before_exists):
                            publish_soul(self.soul, after, after_exists, file_mode, before, before_exists)
                        self.save_state(db, next_state)
                        db.execute("UPDATE revisions SET phase='applied' WHERE id=?", (revision,))
                        db.commit()
                    except Exception:
                        db.rollback()
                        # Retain prepared recovery evidence. Never restore a stale whole-file backup
                        # over edits made by an external editor after publication.
                        raise
                result = self.describe(next_state, compatible, version, False)
                result["changed"] = changed
                return result

    def describe(self, state: dict | None, compatible: bool, version: str | None,
                 pending: bool, conflict: str | None = None) -> dict:
        return {"agent": self.agent, "profile": self.profile, "workspace": str(self.workspace),
                "mechanism": "SOUL.md owned block", "policy_saved": bool(state and state["enabled"] and not conflict and not pending),
                "complexity": state["complexity"] if state else "simple", "compatible": compatible,
                "host_version": version, "tested_baseline": version if compatible else BASELINE,
                "host_commit": self.reported_commit,
                "host_commit_verified": bool(compatible and self.reported_commit),
                "baseline_sha": SUPPORTED_RELEASES.get(version), "tested_baselines": SUPPORTED_RELEASES,
                "policy_written_for": state.get("baseline") if state else None,
                "policy_release_sha": state.get("baseline_sha") if state else None,
                "runtime_verified": False, "pending_recovery": pending, "conflict": conflict,
                "scope": "Selected agent workspace, including its normal replies on other channels.",
                "next_step": "Verify an ordinary reply on the active harness. Existing history is retained; lightweight/internal turns and some child harnesses omit SOUL.md."}


def inspect_target(args: argparse.Namespace, controller: Controller) -> str:
    env = os.environ.copy()
    # Set profile too: the native profile resolver otherwise treats an inherited service
    # profile's default state directory as a candidate for automatic replacement.
    env.update(OPENCLAW_PROFILE=args.profile, OPENCLAW_STATE_DIR=str(controller.state_dir),
               OPENCLAW_CONFIG_PATH=str(Path(args.config).resolve(strict=True) if args.config else controller.state_dir / "openclaw.json"))
    prefix = [args.openclaw_bin, "--profile", args.profile]
    def invoke(arguments: list[str]) -> str:
        try:
            completed = subprocess.run(prefix + arguments, env=env, check=True,
                                       capture_output=True, text=True, timeout=90, shell=False)
        except (OSError, subprocess.SubprocessError) as exc:
            raise ControlError("OpenClaw inspection failed. Check the executable and selected profile/state directory. Raw CLI output is withheld because it can contain private configuration.") from exc
        return completed.stdout.strip()
    output = invoke(["--version"])
    match = re.fullmatch(r"(?:OpenClaw\s+)?(\d{4}\.\d+\.\d+)(?:\s+\([^\n]*\))?", output)
    if not match:
        raise ControlError("The installed OpenClaw version could not be identified exactly; nothing was changed.")
    version = match.group(1)
    commit_match = re.search(r"\(([0-9a-fA-F]{7,40})\)$", output)
    controller.reported_commit = commit_match.group(1).lower() if commit_match else None
    expected_commit = SUPPORTED_RELEASES.get(version)
    if (args.command in ("on", "complexity") and expected_commit and commit_match
            and not expected_commit.startswith(commit_match.group(1).lower())):
        raise ControlError("The CLI reports a different commit from this supported release tag. Revalidate that installation before changing the policy.")
    try:
        agents = json.loads(invoke(["agents", "list", "--json"]))
    except json.JSONDecodeError as exc:
        raise ControlError("OpenClaw agent inventory was not valid JSON; nothing was changed.") from exc
    if not isinstance(agents, list):
        raise ControlError("Unsupported agent inventory shape; revalidate the installed release.")
    matches = [record for record in agents if isinstance(record, dict) and record.get("id") == args.agent]
    if len(matches) != 1 or not isinstance(matches[0].get("workspace"), str):
        raise ControlError("The selected agent was not uniquely identified in this profile.")
    actual = Path(matches[0]["workspace"]).expanduser().resolve(strict=True)
    if actual != controller.workspace:
        raise ControlError("The supplied workspace does not match the selected agent in this profile. Nothing was changed.")
    shared = [record for record in agents if isinstance(record, dict) and record.get("id") != args.agent
              and isinstance(record.get("workspace"), str)
              and Path(record["workspace"]).expanduser().resolve() == controller.workspace]
    if shared and args.command in ("on", "complexity"):
        raise ControlError("Other agents share this workspace. Choose an isolated workspace before enabling an agent-scoped policy.")
    return version


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--agent", required=True)
    parser.add_argument("--config", type=Path, help="Explicit custom OpenClaw config path, if separate from state directory")
    parser.add_argument("--openclaw-bin", default="openclaw", help="Executable path; not a shell command")
    parser.add_argument("--offline", action="store_true", help="Recorded-target status/off when the CLI is unavailable")
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("on", "off", "status"):
        commands.add_parser(command)
    depth = commands.add_parser("complexity")
    depth.add_argument("value", choices=MODES)
    args = parser.parse_args(argv)
    try:
        controller = Controller(args.workspace, args.state_dir, args.profile, args.agent)
        version = None if args.offline else inspect_target(args, controller)
        result = controller.run(args.command, complexity=getattr(args, "value", None), version=version, offline=args.offline)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 3 if result["conflict"] or result["pending_recovery"] else 0
    except (ControlError, OSError, sqlite3.Error, ValueError) as exc:
        print(json.dumps({"error": str(exc), "changed": None,
                          "next_step": "Inspect status for the same target; a prepared revision can recover an interrupted write."}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
