from __future__ import annotations

import re
from pathlib import Path

from tools.wiki.checks.common import (
    Finding,
    LintContext,
    parse_frontmatter,
    resolve_wiki_pages,
    run_git,
)

CHECK_NAME = "stub-escape"

STUB_BODY_RE = re.compile(r"_N/A\s*—\s*stub.*_", re.IGNORECASE)

REQUIRED_SECTIONS: dict[str, list[str]] = {
    "module": [
        "Purpose",
        "Scope — In",
        "Scope — Out",
        "Key entities",
        "Ports",
        "Adapters",
        "Transport",
        "Data model",
        "Flows referenced",
        "Gotchas",
        "Related wiki",
        "Sources",
    ],
    "feature": [
        "Purpose",
        "UI surface",
        "State & data deps",
        "Components",
        "Key UX states",
        "Gotchas",
        "Related wiki",
        "Sources",
    ],
    "flow": [
        "Actors",
        "Trigger",
        "Step-by-step sequence",
        "Failure modes",
        "Idempotency / retry",
        "Observability",
        "Related wiki",
        "Sources",
    ],
    "marketplace": [
        "Provider summary",
        "Auth flow",
        "Supported capabilities",
        "API endpoints used",
        "Fee schedule source",
        "Quirks",
        "Open issues",
        "Raw references",
        "Related wiki",
    ],
    "platform": [
        "Purpose",
        "Public API",
        "Consumers",
        "Gotchas",
        "Related wiki",
        "Sources",
    ],
    "contract": [
        "Surface",
        "Generation / hand-written status",
        "Change policy",
        "Consumers",
        "Related wiki",
        "Sources",
    ],
}


def _load_page(page_path: Path) -> tuple[dict, str]:
    """Return (frontmatter, full_text). frontmatter may be empty dict on failure."""
    try:
        text = page_path.read_text(encoding="utf-8")
    except OSError:
        return {}, ""
    fm = parse_frontmatter(text)
    return (fm if isinstance(fm, dict) else {}), text


def _extract_sections(text: str) -> dict[str, str]:
    """Return map of heading_text → body_text for all ## headings."""
    sections: dict[str, str] = {}
    current_heading: str | None = None
    body_lines: list[str] = []

    for line in text.splitlines():
        if line.startswith("## "):
            if current_heading is not None:
                sections[current_heading] = "\n".join(body_lines).strip()
            current_heading = line[3:].strip()
            body_lines = []
        else:
            body_lines.append(line)

    if current_heading is not None:
        sections[current_heading] = "\n".join(body_lines).strip()

    return sections


def _is_fully_populated(fm: dict, text: str) -> bool:
    """Return True if page has status: active and all required sections are populated."""
    if fm.get("status") != "active":
        return False

    kind = fm.get("kind")
    required = REQUIRED_SECTIONS.get(str(kind), []) if kind else []
    sections = _extract_sections(text)

    for section_name in required:
        body = sections.get(section_name)
        if body is None:
            return False
        if STUB_BODY_RE.search(body):
            return False
        # Section must have substantive content — not just whitespace/single token
        stripped = body.strip()
        if len(stripped) < 20 or len(stripped.split()) < 4:
            return False

    return True


def run(ctx: LintContext) -> list[Finding]:
    # Resolve wiki pages touched by the changed source files
    resolved_pages = resolve_wiki_pages(ctx.changed_files, ctx.path_map)

    findings: list[Finding] = []

    for page in sorted(resolved_pages):
        page_path = ctx.repo_root / page
        fm, text = _load_page(page_path)

        status = fm.get("status")
        if status != "stub":
            # Check stub->active transitions: verify fully populated if page was a stub at base.
            if status == "active" and ctx.base_sha and page in ctx.changed_files:
                base_result = run_git("show", f"{ctx.base_sha}:{page}", cwd=ctx.repo_root)
                if base_result.returncode == 0:
                    base_fm = parse_frontmatter(base_result.stdout)
                    if isinstance(base_fm, dict) and base_fm.get("status") == "stub":
                        if not _is_fully_populated(fm, text):
                            findings.append(Finding(
                                check=CHECK_NAME,
                                severity="hard",
                                path=page,
                                line=1,
                                message=f"[{CHECK_NAME}] page transitioned stub to active but sections not substantively populated",
                                fix_hint="fill all required sections with real content (>20 chars, no _N/A stub_ markers)",
                            ))
            continue

        # The page is currently a stub and was resolved via changed_files.
        if page in ctx.changed_files and _is_fully_populated(fm, text):
            continue

        findings.append(
            Finding(
                check=CHECK_NAME,
                severity="hard",
                path=page,
                line=1,
                message=(
                    f"[{CHECK_NAME}] page has status:stub but is referenced by changed code "
                    f"— populate all required sections and set status:active"
                ),
                fix_hint=(
                    f"update {page}: set status to 'active' and fill in all required sections "
                    f"(no '_N/A — stub' placeholders)"
                ),
            )
        )

    return findings
