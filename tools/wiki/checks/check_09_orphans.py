from __future__ import annotations

from pathlib import Path

from tools.wiki.checks.common import (
    Finding,
    LintContext,
    parse_frontmatter,
)

CHECK_NAME = "orphans"

_EXCLUDED = {"wiki/index.md", "wiki/log.md", "wiki/CONTEXT_MAP.md"}


def _load_frontmatter(page_path: Path) -> dict:
    try:
        text = page_path.read_text(encoding="utf-8")
    except OSError:
        return {}
    parsed = parse_frontmatter(text)
    return parsed if isinstance(parsed, dict) else {}


def _as_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item]
    return []


def run(ctx: LintContext) -> list[Finding]:
    all_pages = ctx.wiki_pages

    # Build frontmatter cache
    fm_cache: dict[str, dict] = {}
    for page in all_pages:
        fm_cache[page] = _load_frontmatter(ctx.repo_root / page)

    # Build inbound reference map: page → set of pages that reference it
    inbound: dict[str, set[str]] = {page: set() for page in all_pages}

    for page, fm in fm_cache.items():
        refs = _as_list(fm.get("related")) + _as_list(fm.get("depends_on"))
        for ref in refs:
            # Refs may be bare names or full paths
            # Try exact match first, then prefix-based resolution
            if ref in inbound:
                inbound[ref].add(page)
            else:
                # Try resolving relative to wiki/ prefix
                candidate = ref if ref.startswith("wiki/") else f"wiki/{ref}"
                if candidate in inbound:
                    inbound[candidate].add(page)

    findings: list[Finding] = []

    for page in sorted(all_pages):
        if page in _EXCLUDED:
            continue

        fm = fm_cache.get(page, {})
        status = fm.get("status")
        if status == "stub":
            continue

        if not inbound[page]:
            findings.append(
                Finding(
                    check=CHECK_NAME,
                    severity="warn",
                    path=page,
                    line=1,
                    message=f"[{CHECK_NAME}] page has no inbound references from other wiki pages",
                    fix_hint=(
                        f"add '{page}' to 'related' or 'depends_on' in at least one other wiki page"
                    ),
                )
            )

    return findings
