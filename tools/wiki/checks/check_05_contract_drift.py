from __future__ import annotations

from pathlib import Path
import re

from tools.wiki.checks.common import Finding, LintContext, parse_yaml

CHECK_NAME = "contract-drift"
METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
MODULE_PAGE_RE = re.compile(r"^wiki/modules/([^/]+)\.md$")
TRANSPORT_ITEM_RE = re.compile(r"^\s*[-*]\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(/\S+)\s*$")


def _strip_frontmatter(text: str) -> str:
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0] != "---":
        return text
    for idx in range(1, len(lines)):
        if lines[idx] == "---":
            return "\n".join(lines[idx + 1 :])
    return text


def _section_body(markdown: str, heading: str) -> str:
    lines = markdown.splitlines()
    wanted = f"## {heading}"
    start = -1
    for idx, line in enumerate(lines):
        if line.strip() == wanted:
            start = idx + 1
            break
    if start < 0:
        return ""
    end = start
    while end < len(lines) and not lines[end].startswith("## "):
        end += 1
    return "\n".join(lines[start:end]).strip()


def _transport_pairs(page_path: Path) -> set[tuple[str, str]]:
    text = page_path.read_text(encoding="utf-8")
    body = _section_body(_strip_frontmatter(text), "Transport")
    pairs: set[tuple[str, str]] = set()
    if not body:
        return pairs
    for line in body.splitlines():
        matched = TRANSPORT_ITEM_RE.match(line)
        if matched is None:
            continue
        pairs.add((matched.group(1), matched.group(2)))
    return pairs


def _iter_path_methods(path_item: object) -> set[str]:
    methods: set[str] = set()
    if not isinstance(path_item, dict):
        return methods
    for key, value in path_item.items():
        if not isinstance(key, str):
            continue
        name = key.upper()
        if name in METHODS and isinstance(value, dict):
            methods.add(name)
    return methods


def _contract_pairs(contract_file: Path, module_name: str) -> set[tuple[str, str]]:
    if not contract_file.exists():
        return set()
    parsed = parse_yaml(contract_file.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        return set()
    paths = parsed.get("paths")
    if not isinstance(paths, dict):
        return set()

    pairs: set[tuple[str, str]] = set()
    for api_path, path_item in paths.items():
        if not isinstance(api_path, str):
            continue
        path_methods = _iter_path_methods(path_item)
        if not path_methods:
            continue

        include_all_path_methods = False
        if isinstance(path_item, dict):
            if path_item.get("x-mpc-module") == module_name:
                include_all_path_methods = True
            elif api_path == f"/api/{module_name}" or api_path.startswith(f"/api/{module_name}/"):
                include_all_path_methods = True

        if include_all_path_methods:
            for method in path_methods:
                pairs.add((method, api_path))
            continue

        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if not isinstance(method, str) or method.upper() not in METHODS:
                continue
            if not isinstance(operation, dict):
                continue
            if operation.get("x-mpc-module") == module_name:
                pairs.add((method.upper(), api_path))

    return pairs


def run(ctx: LintContext) -> list[Finding]:
    findings: list[Finding] = []
    contract_file = ctx.repo_root / "contracts/api/marketplace-central.openapi.yaml"

    for page in sorted(ctx.wiki_pages):
        matched = MODULE_PAGE_RE.match(page)
        if matched is None:
            continue
        module_name = matched.group(1)
        page_path = ctx.repo_root / page
        if not page_path.exists():
            continue

        try:
            wiki_pairs = _transport_pairs(page_path)
        except OSError as exc:
            findings.append(
                Finding(
                    check=CHECK_NAME,
                    severity="hard",
                    path=page,
                    line=1,
                    message=f"[{CHECK_NAME}] unable to read module page transport section: {exc}",
                    fix_hint="ensure module wiki page is readable",
                )
            )
            continue

        contract_pairs = _contract_pairs(contract_file, module_name)
        drift = sorted(wiki_pairs.symmetric_difference(contract_pairs))
        if not drift:
            continue

        details = ", ".join(f"{method} {path}" for method, path in drift)
        findings.append(
            Finding(
                check=CHECK_NAME,
                severity="hard",
                path=page,
                line=1,
                message=f"[{CHECK_NAME}] transport/OpenAPI drift for module '{module_name}': {details}",
                fix_hint="align wiki ## Transport bullets with OpenAPI operations for this module",
            )
        )

    return findings
