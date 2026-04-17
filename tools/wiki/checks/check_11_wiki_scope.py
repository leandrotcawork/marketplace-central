from __future__ import annotations

import json
import os
import re
from pathlib import Path

from tools.wiki.checks.common import (
    Finding,
    LintContext,
    as_str_list,
    load_frontmatter_safe,
    parse_frontmatter,
    resolve_wiki_pages,
    run_git,
)

CHECK_NAME = "wiki-scope"

_EXCLUDED_FROM_M = {"wiki/index.md", "wiki/log.md"}

# Pattern: [wiki-scope: page1, page2 — reason text]
_ESCAPE_RE = re.compile(
    r"\[wiki-scope:\s*([^\]—]+?)(?:\s*—\s*[^\]]+)?\]",
    re.IGNORECASE,
)


def _load_frontmatter_from_text(text: str) -> dict:
    fm = parse_frontmatter(text)
    return fm if isinstance(fm, dict) else {}


def _frontmatter_refs(page_path: Path) -> list[str]:
    fm = load_frontmatter_safe(page_path)
    return as_str_list(fm.get("related")) + as_str_list(fm.get("depends_on"))


def _expand_one_hop(pages: set[str], repo_root: Path) -> set[str]:
    expanded = set(pages)
    for page in pages:
        page_path = repo_root / page
        refs = _frontmatter_refs(page_path)
        for ref in refs:
            if ref.startswith("wiki/"):
                expanded.add(ref)
            else:
                expanded.add(f"wiki/{ref}")
    return expanded


def _pr_description(ctx: LintContext) -> str:
    """Get the PR description from the most authoritative available source."""
    # CI: read from GITHUB_EVENT_PATH
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if os.environ.get("GITHUB_ACTIONS") and event_path:
        try:
            with open(event_path, encoding="utf-8") as fh:
                event_data = json.load(fh)
            body = event_data.get("pull_request", {}).get("body") or ""
            return body
        except (OSError, json.JSONDecodeError, KeyError):
            pass

    # Fallback: commit message trailer or ctx.pr_description
    if ctx.pr_description:
        return ctx.pr_description

    result = run_git("log", "-1", "--format=%B", cwd=ctx.repo_root)
    if result.returncode == 0:
        return result.stdout

    return ""


def _parse_escape_valve(description: str) -> set[str]:
    """Extract pages listed in [wiki-scope: pages — reason] annotations."""
    escaped: set[str] = set()
    for match in _ESCAPE_RE.finditer(description):
        pages_str = match.group(1)
        for raw in pages_str.split(","):
            page = raw.strip()
            if page:
                if not page.startswith("wiki/"):
                    page = f"wiki/{page}"
                escaped.add(page)
    return escaped


def _base_frontmatter_refs(base_sha: str, page: str, repo_root: Path) -> list[str]:
    """Get frontmatter refs from the base version of a page via git show."""
    result = run_git("show", f"{base_sha}:{page}", cwd=repo_root)
    if result.returncode != 0:
        return []
    fm = _load_frontmatter_from_text(result.stdout)
    return as_str_list(fm.get("related")) + as_str_list(fm.get("depends_on"))


def _check_dep_list_shrinkage(
    page: str,
    base_sha: str,
    repo_root: Path,
    pr_description: str,
) -> Finding | None:
    """Detect if frontmatter lists shrank compared to base without justification."""
    base_refs = set(_base_frontmatter_refs(base_sha, page, repo_root))
    head_refs = set(_frontmatter_refs(repo_root / page))

    removed = base_refs - head_refs
    if not removed:
        return None

    # Check if escape valve covers this page
    escaped = _parse_escape_valve(pr_description)
    if page in escaped:
        return None

    return Finding(
        check=CHECK_NAME,
        severity="hard",
        path=page,
        line=1,
        message=(
            f"[{CHECK_NAME}] frontmatter refs shrank without justification "
            f"(removed: {sorted(removed)}) — add [wiki-scope: {page} — reason] to PR"
        ),
        fix_hint=(
            f"restore removed refs or add '[wiki-scope: {page} — <reason>]' in the PR description"
        ),
    )


def run(ctx: LintContext) -> list[Finding]:
    # Step 1: E = resolve_wiki_pages from changed source files
    e_pages = resolve_wiki_pages(ctx.changed_files, ctx.path_map)

    # Step 2: A = E ∪ 1-hop expansion of related/depends_on
    a_pages = _expand_one_hop(e_pages, ctx.repo_root)

    # Step 3: M = wiki pages actually changed in this PR (excluding index/log)
    m_pages: set[str] = {
        f
        for f in ctx.changed_files
        if f.startswith("wiki/") and f not in _EXCLUDED_FROM_M
    }

    # Determine severity based on whether we have authoritative PR description
    pr_description = _pr_description(ctx)
    in_ci = bool(os.environ.get("GITHUB_ACTIONS")) and bool(os.environ.get("GITHUB_EVENT_PATH"))
    severity = "hard" if in_ci or ctx.pr_description else "warn"

    # Parse escape valve from PR description
    escaped = _parse_escape_valve(pr_description)
    a_pages_with_escape = a_pages | escaped

    findings: list[Finding] = []

    # Step 4: Check M \ A ≠ ∅
    out_of_scope = m_pages - a_pages_with_escape
    for page in sorted(out_of_scope):
        findings.append(
            Finding(
                check=CHECK_NAME,
                severity=severity,
                path=page,
                line=1,
                message=(
                    f"[{CHECK_NAME}] wiki page changed but not reachable from changed code paths "
                    f"(not in resolved set or 1-hop expansion)"
                ),
                fix_hint=(
                    f"either update path_map.yaml to link code to this page, add it to a related "
                    f"page's frontmatter, or add '[wiki-scope: {page} — <reason>]' to the PR description"
                ),
            )
        )

    # Step 6 (sub-rule): dep-list shrinkage on M pages contributing to A
    if ctx.base_sha is not None:
        # Only check pages in M that are also in A (they contributed to scope)
        contributing = m_pages & a_pages
        for page in sorted(contributing):
            shrink_finding = _check_dep_list_shrinkage(
                page, ctx.base_sha, ctx.repo_root, pr_description
            )
            if shrink_finding is not None:
                findings.append(shrink_finding)

    return findings
