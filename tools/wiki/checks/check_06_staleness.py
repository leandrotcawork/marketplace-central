from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re

from tools.wiki.checks.common import (
    Finding,
    LintContext,
    glob_match,
    parse_frontmatter,
    run_git,
)

CHECK_NAME = "staleness"
EXEMPT_RE = re.compile(r"\[wiki-exempt:\s*[^\]]+\]")
PLACEHOLDER_RE = re.compile(r"<([A-Za-z_][A-Za-z0-9_]*)>")


def _parse_date_utc_midnight(value: str) -> int | None:
    try:
        parsed = datetime.strptime(value.strip(), "%Y-%m-%d")
    except ValueError:
        return None
    return int(parsed.replace(tzinfo=timezone.utc).timestamp())


def _load_frontmatter(page_path: Path) -> dict | None:
    try:
        text = page_path.read_text(encoding="utf-8")
    except OSError:
        return None
    parsed = parse_frontmatter(text)
    if isinstance(parsed, dict):
        return parsed
    return None


def _capture_from_page_template(template: str, page: str) -> dict[str, str] | None:
    regex_parts: list[str] = []
    last = 0
    for matched in PLACEHOLDER_RE.finditer(template):
        regex_parts.append(re.escape(template[last : matched.start()]))
        regex_parts.append(f"(?P<{matched.group(1)}>[^/]+)")
        last = matched.end()
    regex_parts.append(re.escape(template[last:]))
    pattern = "^" + "".join(regex_parts) + "$"
    captured = re.match(pattern, page)
    if captured is None:
        return None
    return {key: value for key, value in captured.groupdict().items() if value is not None}


def _apply_captures(value: str, captures: dict[str, str]) -> str:
    resolved = value
    for key, data in captures.items():
        resolved = resolved.replace(f"<{key}>", data)
    return resolved


def _scope_patterns(page: str, path_map: dict) -> list[str]:
    patterns: list[str] = []
    path_to_page = path_map.get("path_to_page")
    if not isinstance(path_to_page, dict):
        return patterns

    for source_pattern, targets in path_to_page.items():
        if not isinstance(source_pattern, str):
            continue
        if not isinstance(targets, list):
            continue
        for target in targets:
            if not isinstance(target, str):
                continue
            captures = _capture_from_page_template(target, page)
            if captures is None:
                continue
            patterns.append(_apply_captures(source_pattern, captures))
            break
    return patterns


def _repo_files(repo_root: Path) -> list[str]:
    files: list[str] = []
    for path in repo_root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(repo_root).as_posix()
        if rel.startswith(".git/"):
            continue
        files.append(rel)
    return files


def _scope_files(repo_root: Path, page: str, path_map: dict, files_cache: list[str]) -> list[str]:
    patterns = _scope_patterns(page, path_map)
    scoped: set[str] = set()
    for pattern in patterns:
        if pattern == "**/*":
            continue
        for rel_path in files_cache:
            if glob_match(pattern, rel_path):
                scoped.add(rel_path)
    return sorted(scoped)


def _latest_commit_for_path(repo_root: Path, rel_path: str) -> str | None:
    result = run_git("log", "-1", "--format=%H", "--", rel_path, cwd=repo_root)
    if result.returncode != 0:
        return None
    commit = result.stdout.strip()
    return commit if commit else None


def _commit_distance(repo_root: Path, wiki_commit: str, scope: list[str]) -> int:
    if not scope:
        return 0
    result = run_git("rev-list", f"{wiki_commit}..HEAD", "--", *scope, cwd=repo_root)
    if result.returncode != 0:
        return 0
    return len([line for line in result.stdout.splitlines() if line.strip()])


def _latest_ts_for_paths(repo_root: Path, paths: list[str]) -> int | None:
    latest: int | None = None
    for rel_path in paths:
        result = run_git("log", "-1", "--format=%ct", "--", rel_path, cwd=repo_root)
        if result.returncode != 0:
            continue
        value = result.stdout.strip()
        if not value:
            continue
        ts = int(value)
        latest = ts if latest is None else max(latest, ts)
    return latest


def run(ctx: LintContext) -> list[Finding]:
    findings: list[Finding] = []
    exempt_commit_distance = bool(EXEMPT_RE.search(ctx.pr_description))
    files_cache = _repo_files(ctx.repo_root)

    for page in sorted(ctx.wiki_pages):
        page_path = ctx.repo_root / page
        if not page_path.exists():
            continue

        frontmatter = _load_frontmatter(page_path)
        if not isinstance(frontmatter, dict):
            continue
        last_verified = frontmatter.get("last_verified")
        if not isinstance(last_verified, str):
            continue

        scope = _scope_files(ctx.repo_root, page, ctx.path_map, files_cache)
        wiki_commit = _latest_commit_for_path(ctx.repo_root, page)
        if wiki_commit is None:
            continue

        if not exempt_commit_distance:
            distance = _commit_distance(ctx.repo_root, wiki_commit, scope)
            if distance > 2:
                findings.append(
                    Finding(
                        check=CHECK_NAME,
                        severity="hard",
                        path=page,
                        line=1,
                        message=(
                            f"[{CHECK_NAME}] scope commit distance is {distance} (>2) since wiki update"
                        ),
                        fix_hint="refresh the wiki page or add [wiki-exempt: reason] to skip commit-distance rule",
                    )
                )

        verified_ts = _parse_date_utc_midnight(last_verified)
        if verified_ts is None:
            findings.append(
                Finding(
                    check=CHECK_NAME,
                    severity="hard",
                    path=page,
                    line=1,
                    message=f"[{CHECK_NAME}] invalid last_verified date format: {last_verified}",
                    fix_hint="use YYYY-MM-DD for last_verified",
                )
            )
            continue

        latest_scope_ts = _latest_ts_for_paths(ctx.repo_root, scope + [page])
        if latest_scope_ts is None:
            continue
        if latest_scope_ts - verified_ts > (30 * 86400):
            findings.append(
                Finding(
                    check=CHECK_NAME,
                    severity="hard",
                    path=page,
                    line=1,
                    message="[staleness] last_verified is over 30 days behind latest scoped changes",
                    fix_hint="update wiki content and bump last_verified to current date",
                )
            )

    return findings
