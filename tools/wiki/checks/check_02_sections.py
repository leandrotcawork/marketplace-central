from __future__ import annotations

from pathlib import Path
import re

from tools.wiki.checks.common import Finding, LintContext, parse_frontmatter

CHECK_NAME = "sections"
NA_MARKER_RE = re.compile(r"^_N/A\s+[—-]\s+.+_$")

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


def _strip_frontmatter(text: str) -> str:
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0] != "---":
        return text
    for idx in range(1, len(lines)):
        if lines[idx] == "---":
            return "\n".join(lines[idx + 1 :])
    return text


def _collect_sections(markdown: str) -> dict[str, tuple[int, str]]:
    lines = markdown.splitlines()
    sections: dict[str, tuple[int, str]] = {}
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        if not line.startswith("## "):
            idx += 1
            continue
        heading = line[3:].strip()
        start = idx + 1
        end = start
        while end < len(lines) and not lines[end].startswith("## "):
            end += 1
        body = "\n".join(lines[start:end]).strip()
        sections[heading] = (idx + 1, body)
        idx = end
    return sections


def _is_na_marker(body: str) -> bool:
    compact = " ".join(line.strip() for line in body.splitlines() if line.strip())
    return bool(compact) and bool(NA_MARKER_RE.match(compact))


def _validate_page(page: str, page_path: Path) -> Finding | None:
    try:
        text = page_path.read_text(encoding="utf-8")
    except OSError as exc:
        return Finding(
            check=CHECK_NAME,
            severity="hard",
            path=page,
            line=1,
            message=f"[{CHECK_NAME}] unable to read page: {exc}",
            fix_hint="ensure wiki page file is readable",
        )

    try:
        frontmatter = parse_frontmatter(text)
    except ValueError:
        return None
    if not isinstance(frontmatter, dict):
        return None

    kind = frontmatter.get("kind")
    if not isinstance(kind, str):
        return None
    required = REQUIRED_SECTIONS.get(kind)
    if required is None:
        return None

    sections = _collect_sections(_strip_frontmatter(text))

    missing: list[str] = []
    blank: list[str] = []
    first_line = 1

    for heading in required:
        section = sections.get(heading)
        if section is None:
            missing.append(heading)
            continue

        line, body = section
        if first_line == 1:
            first_line = line
        if not body and not _is_na_marker(body):
            blank.append(heading)
            continue
        if body and _is_na_marker(body):
            continue
        if not body.strip():
            blank.append(heading)

    if not missing and not blank:
        return None

    chunks: list[str] = []
    if missing:
        chunks.append("missing sections: " + ", ".join(missing))
    if blank:
        chunks.append("blank bodies: " + ", ".join(blank))
    message = f"[{CHECK_NAME}] " + "; ".join(chunks)

    return Finding(
        check=CHECK_NAME,
        severity="hard",
        path=page,
        line=first_line,
        message=message,
        fix_hint="add required ## headings and fill bodies or use _N/A — <reason>_",
    )


def run(ctx: LintContext) -> list[Finding]:
    findings: list[Finding] = []
    for page in sorted(ctx.wiki_pages):
        if page in {"wiki/index.md", "wiki/log.md"}:
            continue
        if page.startswith("wiki/_attic/"):
            continue

        finding = _validate_page(page, ctx.repo_root / page)
        if finding is not None:
            findings.append(finding)
    return findings
