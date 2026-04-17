from __future__ import annotations

import re
from pathlib import Path

from tools.wiki.checks.common import (
    Finding,
    LintContext,
    run_git,
)

CHECK_NAME = "log-entry"
LOG_ENTRY_RE = re.compile(r"^## \[\d{4}-\d{2}-\d{2}\] .+ — .+$")

_EXCLUDED = {"wiki/log.md", "wiki/index.md"}


def _has_wiki_change(changed_files: list[str]) -> bool:
    for f in changed_files:
        if f.startswith("wiki/") and f not in _EXCLUDED:
            return True
    return False


def _added_lines_from_diff(diff_output: str) -> list[str]:
    added: list[str] = []
    for line in diff_output.splitlines():
        if line.startswith("+") and not line.startswith("+++"):
            added.append(line[1:])
    return added


def run(ctx: LintContext) -> list[Finding]:
    if not _has_wiki_change(ctx.changed_files):
        return []

    log_path = ctx.repo_root / "wiki" / "log.md"

    if ctx.base_sha is None:
        # No diff available — just check that the file has at least one matching line
        if not log_path.exists():
            return [
                Finding(
                    check=CHECK_NAME,
                    severity="hard",
                    path="wiki/log.md",
                    line=1,
                    message=f"[{CHECK_NAME}] wiki/log.md not found; add a dated log entry",
                    fix_hint="create wiki/log.md with at least one '## [YYYY-MM-DD] title — description' entry",
                )
            ]
        content = log_path.read_text(encoding="utf-8")
        for line in content.splitlines():
            if LOG_ENTRY_RE.match(line.rstrip()):
                return []
        return [
            Finding(
                check=CHECK_NAME,
                severity="hard",
                path="wiki/log.md",
                line=1,
                message=f"[{CHECK_NAME}] wiki/log.md has no valid log entry matching '## [YYYY-MM-DD] title — description'",
                fix_hint="add a dated entry to wiki/log.md: ## [YYYY-MM-DD] title — description",
            )
        ]

    result = run_git(
        "diff",
        f"{ctx.base_sha}..HEAD",
        "--",
        "wiki/log.md",
        cwd=ctx.repo_root,
    )
    diff_output = result.stdout

    added_lines = _added_lines_from_diff(diff_output)
    for line in added_lines:
        if LOG_ENTRY_RE.match(line.rstrip()):
            return []

    return [
        Finding(
            check=CHECK_NAME,
            severity="hard",
            path="wiki/log.md",
            line=1,
            message=f"[{CHECK_NAME}] no new log entry added to wiki/log.md for this wiki change",
            fix_hint="add a line '## [YYYY-MM-DD] title — description' to wiki/log.md in this PR",
        )
    ]
