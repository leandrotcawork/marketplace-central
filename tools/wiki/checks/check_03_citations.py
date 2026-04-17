from __future__ import annotations

from pathlib import Path
import re

from tools.wiki.checks.common import Finding, LintContext, parse_frontmatter, run_git

CHECK_NAME = "citations"
CITATION_CAPTURE_RE = re.compile(
    r"((apps|packages|contracts|raw|tools)/[^\s:@)]+):(\d+)(?:-(\d+))?@([0-9a-f]{7,40})"
)
NA_MARKER_RE = re.compile(r"^_N/A\s+[—-]\s+.+_$")


def _strip_frontmatter(text: str) -> str:
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0] != "---":
        return text
    for idx in range(1, len(lines)):
        if lines[idx] == "---":
            return "\n".join(lines[idx + 1 :])
    return text


def _collect_sections(markdown: str) -> list[tuple[str, int, str]]:
    lines = markdown.splitlines()
    sections: list[tuple[str, int, str]] = []
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
        sections.append((heading, idx + 1, body))
        idx = end
    return sections


def _is_na_marker(body: str) -> bool:
    compact = " ".join(line.strip() for line in body.splitlines() if line.strip())
    return bool(compact) and bool(NA_MARKER_RE.match(compact))


def _findings_for_page(
    page: str,
    page_path: Path,
    ctx: LintContext,
    exists_cache: dict[tuple[str, str], bool],
    line_count_cache: dict[tuple[str, str], int | None],
    reachable_cache: dict[str, bool],
) -> list[Finding]:
    try:
        text = page_path.read_text(encoding="utf-8")
    except OSError as exc:
        return [
            Finding(
                check=CHECK_NAME,
                severity="hard",
                path=page,
                line=1,
                message=f"[{CHECK_NAME}] unable to read page: {exc}",
                fix_hint="ensure wiki page file is readable",
            )
        ]

    try:
        frontmatter = parse_frontmatter(text)
    except ValueError:
        return []
    if not isinstance(frontmatter, dict):
        return []

    findings: list[Finding] = []
    for heading, line_no, body in _collect_sections(_strip_frontmatter(text)):
        if not body or _is_na_marker(body):
            continue

        matches = list(CITATION_CAPTURE_RE.finditer(body))
        if not matches:
            findings.append(
                Finding(
                    check=CHECK_NAME,
                    severity="hard",
                    path=page,
                    line=line_no,
                    message=f"[{CHECK_NAME}] section '{heading}' is missing canonical citation",
                    fix_hint="add citation like apps/...:start-end@sha",
                )
            )
            continue

        for match in matches:
            file_path = match.group(1)
            start = int(match.group(3))
            end = int(match.group(4) or match.group(3))
            sha = match.group(5)
            key = (sha, file_path)

            exists = exists_cache.get(key)
            if exists is None:
                exists = (
                    run_git("cat-file", "-e", f"{sha}:{file_path}", cwd=ctx.repo_root).returncode == 0
                )
                exists_cache[key] = exists
            if not exists:
                findings.append(
                    Finding(
                        check=CHECK_NAME,
                        severity="hard",
                        path=page,
                        line=line_no,
                        message=f"[{CHECK_NAME}] citation points to missing path at sha: {match.group(0)}",
                        fix_hint="update citation to an existing file path and sha",
                    )
                )
                continue

            line_count = line_count_cache.get(key)
            if line_count is None and key not in line_count_cache:
                show = run_git("show", f"{sha}:{file_path}", cwd=ctx.repo_root)
                if show.returncode != 0:
                    line_count_cache[key] = None
                else:
                    line_count_cache[key] = len(show.stdout.splitlines())
                line_count = line_count_cache[key]
            else:
                line_count = line_count_cache.get(key)

            if line_count is None:
                findings.append(
                    Finding(
                        check=CHECK_NAME,
                        severity="hard",
                        path=page,
                        line=line_no,
                        message=f"[{CHECK_NAME}] unable to read citation target: {match.group(0)}",
                        fix_hint="ensure citation target can be read at the cited sha",
                    )
                )
                continue

            if not (1 <= start <= end <= line_count):
                findings.append(
                    Finding(
                        check=CHECK_NAME,
                        severity="hard",
                        path=page,
                        line=line_no,
                        message=f"[{CHECK_NAME}] citation line range out of bounds: {match.group(0)}",
                        fix_hint=f"use line range within 1-{line_count}",
                    )
                )

            reachable = reachable_cache.get(sha)
            if reachable is None:
                reachable = (
                    run_git("merge-base", "--is-ancestor", sha, "HEAD", cwd=ctx.repo_root).returncode == 0
                )
                reachable_cache[sha] = reachable
            if not reachable:
                findings.append(
                    Finding(
                        check=CHECK_NAME,
                        severity="hard",
                        path=page,
                        line=line_no,
                        message=f"[{CHECK_NAME}] citation sha is not reachable from HEAD: {match.group(0)}",
                        fix_hint="rewrite citation to a reachable commit",
                    )
                )

    return findings


def run(ctx: LintContext) -> list[Finding]:
    findings: list[Finding] = []
    exists_cache: dict[tuple[str, str], bool] = {}
    line_count_cache: dict[tuple[str, str], int | None] = {}
    reachable_cache: dict[str, bool] = {}

    for page in sorted(ctx.wiki_pages):
        if page in {"wiki/index.md", "wiki/log.md"}:
            continue
        if page.startswith("wiki/_attic/"):
            continue
        findings.extend(
            _findings_for_page(
                page,
                ctx.repo_root / page,
                ctx,
                exists_cache,
                line_count_cache,
                reachable_cache,
            )
        )

    return findings
