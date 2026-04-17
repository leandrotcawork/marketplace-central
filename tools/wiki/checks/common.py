from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatchcase
import json
from pathlib import Path
import re
import subprocess
from typing import Literal


@dataclass
class Finding:
    check: str
    severity: Literal["hard", "warn"]
    path: str
    line: int
    message: str
    fix_hint: str


@dataclass
class LintContext:
    head_sha: str
    base_sha: str | None
    changed_files: list[str]
    path_map: dict
    wiki_pages: list[str]
    pr_description: str
    repo_root: Path


def _strip_comments(line: str) -> str:
    in_single = False
    in_double = False
    escaped = False
    for idx, char in enumerate(line):
        if escaped:
            escaped = False
            continue
        if char == "\\" and in_double:
            escaped = True
            continue
        if char == "'" and not in_double:
            in_single = not in_single
            continue
        if char == '"' and not in_single:
            in_double = not in_double
            continue
        if char == "#" and not in_single and not in_double:
            return line[:idx]
    return line


def _unquote(value: str) -> str:
    stripped = value.strip()
    if len(stripped) >= 2 and stripped[0] == stripped[-1] and stripped[0] in {'"', "'"}:
        body = stripped[1:-1]
        if stripped[0] == '"':
            return body.replace(r"\"", '"').replace(r"\\", "\\")
        return body
    return stripped


def _parse_scalar(value: str) -> str | None:
    stripped = value.strip()
    if stripped in {"", "null", "~"}:
        return None
    return _unquote(stripped)


def _split_key_value(content: str) -> tuple[str, str]:
    in_single = False
    in_double = False
    escaped = False
    for idx, char in enumerate(content):
        if escaped:
            escaped = False
            continue
        if char == "\\" and in_double:
            escaped = True
            continue
        if char == "'" and not in_double:
            in_single = not in_single
            continue
        if char == '"' and not in_single:
            in_double = not in_double
            continue
        if char == ":" and not in_single and not in_double:
            key = content[:idx].strip()
            value = content[idx + 1 :]
            if not key:
                raise ValueError("YAML parse error: empty mapping key")
            return _unquote(key), value
    raise ValueError("YAML parse error: expected ':' in mapping")


def parse_yaml(text: str) -> dict | list | str | None:
    lines: list[tuple[int, str]] = []
    for raw_line in text.splitlines():
        uncommented = _strip_comments(raw_line).rstrip()
        if not uncommented.strip():
            continue
        if "\t" in raw_line:
            raise ValueError("YAML parse error: tabs are not supported")
        indent = len(uncommented) - len(uncommented.lstrip(" "))
        content = uncommented[indent:]
        lines.append((indent, content))

    if not lines:
        return None

    def parse_block(index: int, indent: int) -> tuple[dict | list | str | None, int]:
        if index >= len(lines):
            return None, index

        current_indent, current_content = lines[index]
        if current_indent < indent:
            return None, index
        if current_indent > indent:
            raise ValueError("YAML parse error: unexpected indentation")

        if current_content.startswith("- "):
            result: list = []
            while index < len(lines):
                item_indent, item_content = lines[index]
                if item_indent < indent:
                    break
                if item_indent > indent:
                    raise ValueError("YAML parse error: invalid list indentation")
                if not item_content.startswith("- "):
                    raise ValueError("YAML parse error: mixed list and mapping at same indentation")

                payload = item_content[2:].strip()
                index += 1
                if payload:
                    if ":" in payload and not payload.startswith('"') and not payload.startswith("'"):
                        try:
                            key, value_part = _split_key_value(payload)
                        except ValueError:
                            result.append(_parse_scalar(payload))
                            continue

                        if value_part.strip() == "":
                            if index < len(lines) and lines[index][0] > indent:
                                nested_value, index = parse_block(index, lines[index][0])
                            else:
                                nested_value = None
                            result.append({key: nested_value})
                        else:
                            result.append({key: _parse_scalar(value_part)})
                    else:
                        result.append(_parse_scalar(payload))
                else:
                    if index < len(lines) and lines[index][0] > indent:
                        nested_value, index = parse_block(index, lines[index][0])
                    else:
                        nested_value = None
                    result.append(nested_value)
            return result, index

        result_dict: dict[str, object] = {}
        while index < len(lines):
            item_indent, item_content = lines[index]
            if item_indent < indent:
                break
            if item_indent > indent:
                raise ValueError("YAML parse error: invalid mapping indentation")
            if item_content.startswith("- "):
                raise ValueError("YAML parse error: mixed mapping and list at same indentation")

            key, value_part = _split_key_value(item_content)
            index += 1
            if value_part.strip() == "":
                if index < len(lines) and lines[index][0] > indent:
                    nested_value, index = parse_block(index, lines[index][0])
                else:
                    nested_value = None
                result_dict[key] = nested_value
            else:
                result_dict[key] = _parse_scalar(value_part)
        return result_dict, index

    parsed, next_index = parse_block(0, lines[0][0])
    if next_index != len(lines):
        raise ValueError("YAML parse error: trailing content")
    return parsed


def parse_frontmatter(text: str) -> dict | None:
    normalized = text.replace("\r\n", "\n")
    lines = normalized.split("\n")
    if not lines or lines[0] != "---":
        return None

    end_index = None
    for idx in range(1, len(lines)):
        if lines[idx] == "---":
            end_index = idx
            break

    if end_index is None:
        return None

    yaml_text = "\n".join(lines[1:end_index])
    parsed = parse_yaml(yaml_text)
    if parsed is None:
        return {}
    if not isinstance(parsed, dict):
        raise ValueError("frontmatter must parse to a mapping")
    return parsed


def load_path_map(path: str | Path) -> dict:
    file_path = Path(path)
    parsed = parse_yaml(file_path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("path_map.yaml must contain a top-level mapping")

    path_to_page = parsed.get("path_to_page")
    if not isinstance(path_to_page, dict):
        raise ValueError("path_map.yaml missing 'path_to_page' mapping")

    return {"path_to_page": path_to_page}


def _match_segment(pattern_segment: str, path_segment: str) -> dict[str, str] | None:
    captures: dict[str, str] = {}
    regex_parts: list[str] = []
    idx = 0
    while idx < len(pattern_segment):
        char = pattern_segment[idx]
        if char == "<":
            end = pattern_segment.find(">", idx + 1)
            if end == -1:
                regex_parts.append(re.escape(char))
                idx += 1
                continue
            name = pattern_segment[idx + 1 : end]
            if not name or not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name):
                regex_parts.append(re.escape(pattern_segment[idx : end + 1]))
                idx = end + 1
                continue
            regex_parts.append(f"(?P<{name}>[^/]+)")
            idx = end + 1
            continue
        if char == "*":
            regex_parts.append(".*")
            idx += 1
            continue
        if char == "?":
            regex_parts.append(".")
            idx += 1
            continue
        regex_parts.append(re.escape(char))
        idx += 1

    matcher = re.compile("^" + "".join(regex_parts) + "$")
    matched = matcher.match(path_segment)
    if not matched:
        return None

    for key, value in matched.groupdict().items():
        if value is not None:
            captures[key] = value
    return captures


def glob_resolve(glob: str, path: str) -> dict[str, str] | None:
    pattern_segments = [segment for segment in glob.split("/") if segment != ""]
    path_segments = [segment for segment in path.split("/") if segment != ""]

    def walk(pattern_idx: int, path_idx: int, captures: dict[str, str]) -> dict[str, str] | None:
        if pattern_idx == len(pattern_segments):
            return captures.copy() if path_idx == len(path_segments) else None

        token = pattern_segments[pattern_idx]
        if token == "**":
            for next_path_idx in range(path_idx, len(path_segments) + 1):
                matched = walk(pattern_idx + 1, next_path_idx, captures.copy())
                if matched is not None:
                    return matched
            return None

        if path_idx >= len(path_segments):
            return None

        segment_capture = _match_segment(token, path_segments[path_idx])
        if segment_capture is None:
            return None

        merged = captures.copy()
        for key, value in segment_capture.items():
            existing = merged.get(key)
            if existing is not None and existing != value:
                return None
            merged[key] = value

        return walk(pattern_idx + 1, path_idx + 1, merged)

    return walk(0, 0, {})


def glob_match(glob: str, path: str) -> bool:
    if glob == "**/*":
        return True
    if "<" not in glob or ">" not in glob:
        if fnmatchcase(path, glob):
            return True
    return glob_resolve(glob, path) is not None


def run_git(*args: str, cwd: Path | None = None, check: bool = False) -> subprocess.CompletedProcess:
    safe_dir = str((cwd or Path.cwd()).resolve())
    return subprocess.run(
        ["git", "-c", f"safe.directory={safe_dir}", *args],
        cwd=cwd,
        check=check,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def _apply_captures(value: str, captures: dict[str, str]) -> str:
    resolved = value
    for key, capture in captures.items():
        resolved = resolved.replace(f"<{key}>", capture)
    return resolved


def _resolve_via_file(
    resolve_file: Path,
    changed_path: str,
    captures: dict[str, str],
) -> set[str]:
    if not resolve_file.exists():
        return set()

    try:
        content = json.loads(resolve_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()

    if not isinstance(content, dict):
        return set()

    keys_to_try = [changed_path, Path(changed_path).name]
    if "NNNN" in captures:
        keys_to_try.insert(0, captures["NNNN"])

    for lookup_key in keys_to_try:
        mapped = content.get(lookup_key)
        if mapped is None:
            continue
        if isinstance(mapped, str):
            return {_apply_captures(mapped, captures)}
        if isinstance(mapped, list):
            return {
                _apply_captures(item, captures)
                for item in mapped
                if isinstance(item, str)
            }
    return set()


def resolve_wiki_pages(changed_paths: list[str], path_map: dict) -> set[str]:
    path_to_page = path_map.get("path_to_page", {})
    if not isinstance(path_to_page, dict):
        raise ValueError("path_map.path_to_page must be a mapping")

    resolved_pages: set[str] = set()
    for changed_path in changed_paths:
        for glob_pattern, target_pages in path_to_page.items():
            if not isinstance(glob_pattern, str):
                continue
            captures = glob_resolve(glob_pattern, changed_path)
            if captures is None:
                continue

            if isinstance(target_pages, list):
                for page in target_pages:
                    if not isinstance(page, str):
                        continue
                    if page.startswith("__resolve_via__:"):
                        resolve_target = page.split(":", 1)[1].strip()
                        resolve_file = Path(resolve_target)
                        resolved_pages.update(_resolve_via_file(resolve_file, changed_path, captures))
                        continue
                    resolved_pages.add(_apply_captures(page, captures))
            elif isinstance(target_pages, dict):
                resolve_target = target_pages.get("__resolve_via__")
                if isinstance(resolve_target, str):
                    resolve_file = Path(resolve_target)
                    resolved_pages.update(_resolve_via_file(resolve_file, changed_path, captures))
            break

    return resolved_pages


def find_wiki_pages(repo_root: Path) -> list[str]:
    wiki_root = repo_root / "wiki"
    pages: list[str] = []
    if not wiki_root.exists():
        return pages

    for page in wiki_root.rglob("*.md"):
        # index.md and log.md are auto-generated/append-only; SCHEMA.md is governance meta
        # (not a content page — no kind/frontmatter). Excluded from per-page checks.
        # Check 07 (log-entry) catches SCHEMA.md changes via changed_files, not wiki_pages.
        if page.name.lower() in {"index.md", "log.md", "schema.md"}:
            continue
        pages.append(page.relative_to(repo_root).as_posix())

    return sorted(pages)


# ---------------------------------------------------------------------------
# Shared markdown helpers (used by multiple checks)
# ---------------------------------------------------------------------------

def strip_frontmatter(text: str) -> str:
    """Return the markdown body after stripping the YAML frontmatter block."""
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0] != "---":
        return text
    for idx in range(1, len(lines)):
        if lines[idx] == "---":
            return "\n".join(lines[idx + 1:])
    return text


_NA_MARKER_RE = re.compile(r"^_N/A\s+[—-]\s+.+_$")


def is_na_marker(body: str) -> bool:
    """Return True if body is a single-line N/A marker like '_N/A — reason_'."""
    compact = " ".join(line.strip() for line in body.splitlines() if line.strip())
    return bool(compact) and bool(_NA_MARKER_RE.match(compact))


def load_frontmatter_safe(page_path: Path) -> dict:
    """Read and parse frontmatter from a file; return empty dict on any failure."""
    try:
        text = page_path.read_text(encoding="utf-8")
    except OSError:
        return {}
    parsed = parse_frontmatter(text)
    return parsed if isinstance(parsed, dict) else {}


def as_str_list(value: object) -> list[str]:
    """Coerce a YAML list value to list[str], ignoring falsy entries."""
    if isinstance(value, list):
        return [str(item) for item in value if item]
    return []
