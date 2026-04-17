from __future__ import annotations

from pathlib import Path

from tools.wiki.checks.common import (
    Finding,
    LintContext,
)

CHECK_NAME = "index-fresh"


def run(ctx: LintContext) -> list[Finding]:
    try:
        import tools.wiki.index as index_module  # type: ignore[import]
    except ImportError:
        return [
            Finding(
                check=CHECK_NAME,
                severity="hard",   # was "warn" — import failure is infra error, not advisory
                path="wiki/index.md",
                line=1,
                message=f"[{CHECK_NAME}] index.py not yet present — install tools/wiki/index.py",
                fix_hint="install tools/wiki/index.py",
            )
        ]

    try:
        expected_content: str = index_module.generate(ctx.repo_root)
    except Exception as exc:  # noqa: BLE001
        return [
            Finding(
                check=CHECK_NAME,
                severity="warn",
                path="wiki/index.md",
                line=1,
                message=f"[{CHECK_NAME}] index.generate() raised an error: {exc}",
                fix_hint="fix tools/wiki/index.py generate() function",
            )
        ]

    index_path = ctx.repo_root / "wiki" / "index.md"
    if not index_path.exists():
        return [
            Finding(
                check=CHECK_NAME,
                severity="hard",
                path="wiki/index.md",
                line=1,
                message=f"[{CHECK_NAME}] wiki/index.md not found but index.py is installed",
                fix_hint="run 'python -m tools.wiki.index' to generate wiki/index.md",
            )
        ]

    actual_content = index_path.read_text(encoding="utf-8")
    if actual_content != expected_content:
        return [
            Finding(
                check=CHECK_NAME,
                severity="hard",
                path="wiki/index.md",
                line=1,
                message=f"[{CHECK_NAME}] wiki/index.md content differs from generated output",
                fix_hint="run 'python -m tools.wiki.index' to regenerate wiki/index.md",
            )
        ]

    return []
