from __future__ import annotations

import re
from pathlib import Path

from tools.wiki.checks.common import (
    Finding,
    LintContext,
    run_git,
)

CHECK_NAME = "rename-invariants"

_TRACKED_PREFIXES = ("apps/", "packages/", "contracts/", "raw/")
_MIGRATION_RE = re.compile(r"^apps/server_core/migrations/[^/]+\.sql$")
_MIGRATION_META = "wiki/_meta/migration-module.json"
_PATH_MAP = "tools/wiki/path_map.yaml"

# Parse rename status lines: R<similarity>\t<old>\t<new>
_RENAME_RE = re.compile(r"^R\d+\t(.+)\t(.+)$")


def _parse_renames(diff_output: str) -> list[tuple[str, str]]:
    """Return list of (old_path, new_path) for renamed files."""
    renames: list[tuple[str, str]] = []
    for line in diff_output.splitlines():
        line = line.rstrip("\r")
        m = _RENAME_RE.match(line)
        if m:
            renames.append((m.group(1), m.group(2)))
    return renames


def _is_tracked(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _TRACKED_PREFIXES)


def _is_case_only_rename(old: str, new: str) -> bool:
    return old.lower() == new.lower() and old != new


def run(ctx: LintContext) -> list[Finding]:
    if ctx.base_sha is None:
        return []

    result = run_git(
        "diff",
        "--find-renames",
        "-M50%",
        f"{ctx.base_sha}..HEAD",
        "--name-status",
        cwd=ctx.repo_root,
    )
    if result.returncode != 0:
        return []

    renames = _parse_renames(result.stdout)
    if not renames:
        return []

    changed_set = set(ctx.changed_files)
    findings: list[Finding] = []

    for old_path, new_path in renames:
        case_only = _is_case_only_rename(old_path, new_path)
        affects_tracked = _is_tracked(old_path) or _is_tracked(new_path)

        if not affects_tracked and not case_only:
            continue

        # Rule 3a: path_map.yaml must be in changed_files
        if _PATH_MAP not in changed_set:
            findings.append(
                Finding(
                    check=CHECK_NAME,
                    severity="hard",
                    path=_PATH_MAP,
                    line=1,
                    message=(
                        f"[{CHECK_NAME}] file renamed ({old_path} → {new_path}) "
                        f"but {_PATH_MAP} not updated"
                    ),
                    fix_hint=(
                        f"update {_PATH_MAP} to reflect the rename of "
                        f"'{old_path}' → '{new_path}'"
                    ),
                )
            )

        # Rule 3b: migration rename requires _meta update
        if _MIGRATION_RE.match(old_path) or _MIGRATION_RE.match(new_path):
            if _MIGRATION_META not in changed_set:
                findings.append(
                    Finding(
                        check=CHECK_NAME,
                        severity="hard",
                        path=_MIGRATION_META,
                        line=1,
                        message=(
                            f"[{CHECK_NAME}] migration file renamed "
                            f"({old_path} → {new_path}) but {_MIGRATION_META} not updated"
                        ),
                        fix_hint=(
                            f"update {_MIGRATION_META} to reflect the migration rename"
                        ),
                    )
                )

    return findings
