from __future__ import annotations

import argparse
from dataclasses import asdict
import json
import os
from pathlib import Path
import sys
import types
from typing import Callable, Union

from tools.wiki.checks.common import (
    Finding,
    LintContext,
    find_wiki_pages,
    load_path_map,
    run_git,
)
from tools.wiki.checks import (
    check_01_frontmatter,
    check_02_sections,
    check_03_citations,
    check_04_backlinks,
    check_05_contract_drift,
    check_06_staleness,
    check_07_log_entry,
    check_08_index_fresh,
    check_09_orphans,
    check_10_stub_escape,
    check_11_wiki_scope,
    check_12_rename_invariants,
)

CHECK_MODULES: list[str] = []
# CHECKS holds module objects in deterministic order 1→12.
# Each module must expose run(ctx: LintContext) -> list[Finding].
CHECKS: list[types.ModuleType] = [
    check_01_frontmatter,
    check_02_sections,
    check_03_citations,
    check_04_backlinks,
    check_05_contract_drift,
    check_06_staleness,
    check_07_log_entry,
    check_08_index_fresh,
    check_09_orphans,
    check_10_stub_escape,
    check_11_wiki_scope,
    check_12_rename_invariants,
]


def _infer_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_base_sha(repo_root: Path, cli_base: str | None) -> str:
    if cli_base:
        return cli_base

    # Try GITHUB_BASE_REF first (authoritative in CI)
    base_ref = os.environ.get("GITHUB_BASE_REF")
    if base_ref:
        result = run_git("merge-base", "HEAD", f"origin/{base_ref}", cwd=repo_root)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()

    # Try common remote branch names
    for remote_branch in ("origin/master", "origin/main"):
        result = run_git("merge-base", "HEAD", remote_branch, cwd=repo_root)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()

    # HEAD~1 is only valid if there is a parent commit
    result = run_git("rev-parse", "--verify", "HEAD~1", cwd=repo_root)
    if result.returncode == 0 and result.stdout.strip():
        return result.stdout.strip()

    # Single-commit repo: compare against empty tree
    return "4b825dc642cb6eb9a060e54bf8d69288fbee4904"


def _read_pr_description(args_file: str | None, repo_root: Path) -> str:
    if args_file:
        return Path(args_file).read_text(encoding="utf-8")

    github_event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not github_event_path:
        return ""

    event_path = Path(github_event_path)
    if not event_path.is_absolute():
        event_path = repo_root / event_path

    if not event_path.exists():
        return ""

    payload = json.loads(event_path.read_text(encoding="utf-8"))
    pull_request = payload.get("pull_request") if isinstance(payload, dict) else None
    if not isinstance(pull_request, dict):
        return ""
    body = pull_request.get("body")
    return body if isinstance(body, str) else ""


def _calculate_exit_code(findings: list[Finding]) -> int:
    severities = {finding.severity for finding in findings}
    if "hard" in severities:
        return 1
    if "warn" in severities:
        return 2
    return 0


def _emit_human(findings: list[Finding]) -> None:
    for finding in findings:
        print(
            f"[{finding.severity}] {finding.check} {finding.path}:{finding.line} "
            f"{finding.message} ({finding.fix_hint})"
        )


def _emit_json(findings: list[Finding], exit_code: int) -> None:
    payload = {"findings": [asdict(finding) for finding in findings], "exit": exit_code}
    print(json.dumps(payload, ensure_ascii=True))


def _load_checks() -> list[Callable[[LintContext], list[Finding]]]:
    import importlib

    loaded: list[Callable[[LintContext], list[Finding]]] = []
    for module_name in CHECK_MODULES:
        try:
            module = importlib.import_module(module_name)
        except Exception as exc:  # pragma: no cover - handled as infra path
            raise RuntimeError(f"missing check module {module_name}: {exc}") from exc

        check_fn = getattr(module, "run", None)
        if check_fn is None:
            raise RuntimeError(f"check module {module_name} missing run(context) function")
        if not callable(check_fn):
            raise RuntimeError(f"check module {module_name} run is not callable")
        loaded.append(check_fn)
    return loaded


def _build_context(args: argparse.Namespace, repo_root: Path) -> LintContext:
    head_sha = run_git("rev-parse", "HEAD", cwd=repo_root, check=True).stdout.strip()
    base_sha = _resolve_base_sha(repo_root, args.base)
    diff = run_git("diff", "--name-only", f"{base_sha}..HEAD", cwd=repo_root, check=True)
    changed_files = [line.strip() for line in diff.stdout.splitlines() if line.strip()]
    path_map = load_path_map(repo_root / "tools" / "wiki" / "path_map.yaml")
    wiki_pages = find_wiki_pages(repo_root)
    pr_description = _read_pr_description(args.pr_description_file, repo_root)

    return LintContext(
        head_sha=head_sha,
        base_sha=base_sha,
        changed_files=changed_files,
        path_map=path_map,
        wiki_pages=wiki_pages,
        pr_description=pr_description,
        repo_root=repo_root,
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m tools.wiki.lint")
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--base")
    parser.add_argument("--pr-description-file")
    parser.add_argument("--fix", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    repo_root = _infer_repo_root()

    try:
        checks = _load_checks() if CHECK_MODULES else CHECKS
        context = _build_context(args, repo_root)

        findings: list[Finding] = []
        for check in checks:
            # Support both module objects (check.run) and plain callables.
            check_fn: Callable[[LintContext], list[Finding]]
            check_name: str
            if isinstance(check, types.ModuleType):
                check_fn = check.run  # type: ignore[attr-defined]
                check_name = check.__name__
            else:
                check_fn = check  # type: ignore[assignment]
                check_name = getattr(check, "__name__", repr(check))
            try:
                results = check_fn(context)
            except Exception as exc:
                print(f"[infra] check {check_name} crashed: {exc}", file=sys.stderr)
                findings.append(Finding(
                    check="infra",
                    severity="hard",
                    path="",
                    line=0,
                    message=f"[infra] check crashed: {exc}",
                    fix_hint="fix tools/wiki/checks/",
                ))
                continue

            if results:
                findings.extend(results)

        exit_code = _calculate_exit_code(findings)
        if args.as_json:
            _emit_json(findings, exit_code)
        else:
            _emit_human(findings)
        return exit_code
    except Exception as exc:
        print(f"[infra] {exc}", file=sys.stderr)
        if args.as_json:
            _emit_json([], 3)
        return 3


if __name__ == "__main__":
    sys.exit(main())
