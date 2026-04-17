import ast
import unittest
from pathlib import Path

from tools.wiki.checks.common import (
    glob_match,
    glob_resolve,
    parse_frontmatter,
    parse_yaml,
    resolve_wiki_pages,
    run_git,
)


class ParseFrontmatterTests(unittest.TestCase):
    def test_parse_frontmatter_happy_path(self) -> None:
        text = "---\ntitle: SCHEMA\nowners:\n  - platform\n---\n# Body\n"
        frontmatter = parse_frontmatter(text)

        self.assertEqual(frontmatter, {"title": "SCHEMA", "owners": ["platform"]})

    def test_parse_frontmatter_missing_returns_none(self) -> None:
        self.assertIsNone(parse_frontmatter("# No frontmatter"))

    def test_parse_frontmatter_unclosed_returns_none(self) -> None:
        text = "---\ntitle: missing end\n# Body"
        self.assertIsNone(parse_frontmatter(text))

    def test_parse_frontmatter_extra_separator_after_block(self) -> None:
        text = "---\ntitle: ok\n---\n---\n# Body\n"
        self.assertEqual(parse_frontmatter(text), {"title": "ok"})


class ParseYamlTests(unittest.TestCase):
    def test_parse_yaml_mapping(self) -> None:
        data = parse_yaml("name: wiki\nenabled: true\n")
        self.assertEqual(data, {"name": "wiki", "enabled": "true"})

    def test_parse_yaml_list(self) -> None:
        data = parse_yaml("- a\n- b\n- c\n")
        self.assertEqual(data, ["a", "b", "c"])

    def test_parse_yaml_nested_with_comments(self) -> None:
        text = """
# top-level comment
root:
  child: value # inline comment
  items:
    - one
    - two
"""
        data = parse_yaml(text)
        self.assertEqual(
            data,
            {"root": {"child": "value", "items": ["one", "two"]}},
        )

    def test_parse_yaml_empty(self) -> None:
        self.assertIsNone(parse_yaml("\n# only comments\n"))


class GlobTests(unittest.TestCase):
    def test_glob_match_exact(self) -> None:
        self.assertTrue(glob_match("wiki/SCHEMA.md", "wiki/SCHEMA.md"))

    def test_glob_match_recursive(self) -> None:
        self.assertTrue(
            glob_match(
                "apps/server_core/internal/modules/<mod>/**",
                "apps/server_core/internal/modules/pricing/domain/simulation.go",
            )
        )

    def test_glob_match_placeholder_segment(self) -> None:
        self.assertTrue(
            glob_match(
                "packages/feature-<name>/**",
                "packages/feature-marketplaces/src/page.tsx",
            )
        )

    def test_glob_match_non_match(self) -> None:
        self.assertFalse(glob_match("apps/**", "packages/feature-a/src/index.ts"))

    def test_glob_match_starstar_star_fallthrough(self) -> None:
        self.assertTrue(glob_match("**/*", "README.md"))

    def test_glob_resolve_captures_placeholders(self) -> None:
        captures = glob_resolve(
            "apps/server_core/internal/modules/<mod>/**",
            "apps/server_core/internal/modules/pricing/domain/simulation.go",
        )
        self.assertEqual(captures, {"mod": "pricing"})

        captures = glob_resolve(
            "packages/feature-<name>/**",
            "packages/feature-marketplaces/src/page.tsx",
        )
        self.assertEqual(captures, {"name": "marketplaces"})

        self.assertIsNone(glob_resolve("packages/feature-<name>/**", "README.md"))


class ResolveWikiPagesTests(unittest.TestCase):
    @staticmethod
    def _load_coverage_fixture(path: Path) -> dict[str, list[str]]:
        rows: dict[str, list[str]] = {}
        pending_key: str | None = None
        pending_value_parts: list[str] = []

        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue

            if pending_key is not None:
                pending_value_parts.append(line)
                joined = " ".join(pending_value_parts)
                if "]" in joined:
                    rows[pending_key] = ast.literal_eval(joined)
                    pending_key = None
                    pending_value_parts = []
                continue

            if ":" not in line:
                continue
            key_text, value_text = line.split(":", 1)
            key = ast.literal_eval(key_text.strip())
            value_text = value_text.strip()
            if value_text.startswith("[") and value_text.endswith("]"):
                rows[key] = ast.literal_eval(value_text)
            elif value_text.startswith("["):
                pending_key = key
                pending_value_parts = [value_text]

        if pending_key is not None:
            raise ValueError(f"unterminated fixture list for {pending_key}")

        return rows

    def test_resolve_wiki_pages_coverage_fixture(self) -> None:
        repo_root = Path(__file__).resolve().parents[3]
        fixture_path = repo_root / "tools" / "wiki" / "tests" / "fixtures" / "path_map_coverage.yaml"
        if not fixture_path.exists():
            self.skipTest("path_map_coverage.yaml fixture missing")

        path_map = parse_yaml((repo_root / "tools" / "wiki" / "path_map.yaml").read_text(encoding="utf-8"))
        self.assertIsInstance(path_map, dict)

        coverage_data = self._load_coverage_fixture(fixture_path)

        for representative_path, expected_pages in coverage_data.items():
            resolved = resolve_wiki_pages([representative_path], path_map)
            self.assertEqual(
                resolved,
                set(expected_pages),
                msg=f"representative_path={representative_path}",
            )


class RunGitTests(unittest.TestCase):
    def test_run_git_version(self) -> None:
        result = run_git("--version")
        self.assertEqual(result.returncode, 0)
        self.assertIn("git version", result.stdout.lower())


if __name__ == "__main__":
    unittest.main()
