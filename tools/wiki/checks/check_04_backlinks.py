from __future__ import annotations

from pathlib import Path
import re

from tools.wiki.checks.common import Finding, LintContext

CHECK_NAME = "backlinks"


def _module_candidates(module: str) -> list[str]:
    return [
        f"apps/server_core/internal/modules/{module}/module.go",
    ]


def _feature_candidates(feature: str) -> list[str]:
    normalized = feature[8:] if feature.startswith("feature-") else feature
    package = f"feature-{normalized}"
    return [
        f"packages/{package}/src/index.ts",
        f"packages/{package}/src/index.tsx",
    ]


def _platform_candidates(package: str) -> list[str]:
    return [
        f"apps/server_core/internal/platform/{package}/{package}.go",
    ]


def _resolve_target(page: str) -> tuple[str, list[str]] | None:
    module_match = re.match(r"^wiki/modules/([^/]+)\.md$", page)
    if module_match:
        name = module_match.group(1)
        return "module", _module_candidates(name)

    feature_match = re.match(r"^wiki/features/([^/]+)\.md$", page)
    if feature_match:
        name = feature_match.group(1)
        return "feature", _feature_candidates(name)

    platform_match = re.match(r"^wiki/platform/([^/]+)\.md$", page)
    if platform_match:
        name = platform_match.group(1)
        return "platform", _platform_candidates(name)

    return None


def _has_backlink(entry_file: Path, page: str) -> bool:
    try:
        first_lines = entry_file.read_text(encoding="utf-8").splitlines()[:20]
    except OSError:
        return False

    line_patterns = (
        re.compile(rf"^\s*//\s*wiki:\s*{re.escape(page)}\s*$"),
        re.compile(rf"^\s*\{{/\*\s*wiki:\s*{re.escape(page)}\s*\*/\}}\s*$"),
    )
    for line in first_lines:
        if any(pattern.match(line) for pattern in line_patterns):
            return True
    return False


def run(ctx: LintContext) -> list[Finding]:
    findings: list[Finding] = []

    for page in sorted(ctx.wiki_pages):
        resolved = _resolve_target(page)
        if resolved is None:
            continue

        kind, candidates = resolved
        entry: Path | None = None
        for candidate in candidates:
            full = ctx.repo_root / candidate
            if full.exists():
                entry = full
                break

        if entry is None:
            findings.append(
                Finding(
                    check=CHECK_NAME,
                    severity="hard",
                    path=page,
                    line=1,
                    message=f"[{CHECK_NAME}] no conventional {kind} entry file found for backlink verification",
                    fix_hint="create the conventional entry file and add a backlink comment in its first 20 lines",
                )
            )
            continue

        if _has_backlink(entry, page):
            continue

        findings.append(
            Finding(
                check=CHECK_NAME,
                severity="hard",
                path=page,
                line=1,
                message=f"[{CHECK_NAME}] missing backlink in {entry.relative_to(ctx.repo_root).as_posix()} (first 20 lines)",
                fix_hint=f"add // wiki: {page} or {{/* wiki: {page} */}} near file top",
            )
        )

    return findings
