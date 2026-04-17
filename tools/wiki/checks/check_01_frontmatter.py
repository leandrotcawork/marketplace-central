from __future__ import annotations

from pathlib import Path

from tools.wiki.checks.common import Finding, LintContext, parse_frontmatter

CHECK_NAME = "frontmatter"
REQUIRED_KEYS = (
    "kind",
    "title",
    "status",
    "owners",
    "since",
    "last_verified",
    "depends_on",
    "related",
    "sources",
)
VALID_KIND = {"module", "feature", "flow", "marketplace", "platform", "contract"}
VALID_STATUS = {"active", "foundation", "planned", "deprecated", "transitional", "stub"}
AGENT_TOKENS = ("claude", "gpt", "codex", "agent")


def _is_agent_owner(owner: str) -> bool:
    lowered = owner.strip().lower()
    return any(token in lowered for token in AGENT_TOKENS)


def _page_errors(page_path: Path) -> list[str]:
    try:
        text = page_path.read_text(encoding="utf-8")
    except OSError as exc:
        return [f"unable to read page: {exc}"]

    try:
        frontmatter = parse_frontmatter(text)
    except ValueError as exc:
        return [f"invalid YAML frontmatter: {exc}"]

    if frontmatter is None:
        return ["missing YAML frontmatter block"]

    errors: list[str] = []
    for key in REQUIRED_KEYS:
        if key not in frontmatter:
            errors.append(f"missing key '{key}'")

    kind = frontmatter.get("kind")
    if kind is not None and kind not in VALID_KIND:
        errors.append(f"invalid kind '{kind}'")

    status = frontmatter.get("status")
    if status is not None and status not in VALID_STATUS:
        errors.append(f"invalid status '{status}'")

    owners = frontmatter.get("owners")
    if owners is None:
        return errors
    if not isinstance(owners, list) or not owners:
        errors.append("owners must be a non-empty list")
        return errors

    owner_values: list[str] = []
    for owner in owners:
        if not isinstance(owner, str) or not owner.strip():
            errors.append("owners must contain only non-empty strings")
            return errors
        owner_values.append(owner.strip())

    has_agent = any(_is_agent_owner(owner) for owner in owner_values)
    has_human = any(not _is_agent_owner(owner) for owner in owner_values)
    if not has_agent or not has_human:
        errors.append("owners must include at least one agent and one human")

    return errors


def run(ctx: LintContext) -> list[Finding]:
    findings: list[Finding] = []

    for page in sorted(ctx.wiki_pages):
        if page in {"wiki/index.md", "wiki/log.md"}:
            continue
        if page.startswith("wiki/_attic/"):
            continue

        page_errors = _page_errors(ctx.repo_root / page)
        if not page_errors:
            continue

        findings.append(
            Finding(
                check=CHECK_NAME,
                severity="hard",
                path=page,
                line=1,
                message=f"[{CHECK_NAME}] " + "; ".join(page_errors),
                fix_hint="add complete frontmatter keys with valid kind/status and owner mix",
            )
        )

    return findings
