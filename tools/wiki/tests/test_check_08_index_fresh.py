from __future__ import annotations

import shutil
import sys
import types
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from tools.wiki.checks.check_08_index_fresh import run
from tools.wiki.checks.common import LintContext


class IndexFreshCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)

    def _new_repo_root(self) -> Path:
        root = self.tmp_root / f"check_08_{uuid.uuid4().hex}"
        root.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        return root

    def _write(self, root: Path, rel_path: str, content: str) -> None:
        file_path = root / rel_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    def _ctx(self, root: Path) -> LintContext:
        return LintContext(
            head_sha="HEAD",
            base_sha=None,
            changed_files=[],
            path_map={},
            wiki_pages=[],
            pr_description="",
            repo_root=root,
        )

    def _make_index_module(self, generated_content: str) -> types.ModuleType:
        """Create a fake tools.wiki.index module that returns fixed content."""
        module = types.ModuleType("tools.wiki.index")
        module.generate = lambda repo_root: generated_content  # type: ignore[attr-defined]
        return module

    def test_skip_when_no_index_py(self) -> None:
        """Import failure → warn finding about missing index.py."""
        root = self._new_repo_root()

        # Ensure tools.wiki.index is NOT importable by removing it if present
        with patch.dict(sys.modules, {"tools.wiki.index": None}):
            findings = run(self._ctx(root))

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "index-fresh")
        self.assertEqual(findings[0].severity, "warn")
        self.assertIn("not yet present", findings[0].message)

    def test_pass_index_matches_generated(self) -> None:
        """Generated content matches wiki/index.md → no findings."""
        root = self._new_repo_root()
        expected = "# Wiki Index\n\nThis is the index.\n"
        self._write(root, "wiki/index.md", expected)

        fake_module = self._make_index_module(expected)
        with patch.dict(sys.modules, {"tools.wiki.index": fake_module}):
            findings = run(self._ctx(root))

        self.assertEqual(findings, [])

    def test_fail_index_mismatch(self) -> None:
        """Generated content differs from wiki/index.md → hard finding."""
        root = self._new_repo_root()
        expected = "# Wiki Index\n\nGenerated content.\n"
        actual = "# Wiki Index\n\nStale content.\n"
        self._write(root, "wiki/index.md", actual)

        fake_module = self._make_index_module(expected)
        with patch.dict(sys.modules, {"tools.wiki.index": fake_module}):
            findings = run(self._ctx(root))

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "index-fresh")
        self.assertEqual(findings[0].severity, "hard")
        self.assertIn("differs", findings[0].message)

    def test_fail_index_file_missing_but_module_present(self) -> None:
        """index.py present but wiki/index.md doesn't exist → hard finding."""
        root = self._new_repo_root()
        expected = "# Wiki Index\n\nGenerated content.\n"

        fake_module = self._make_index_module(expected)
        with patch.dict(sys.modules, {"tools.wiki.index": fake_module}):
            findings = run(self._ctx(root))

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "index-fresh")
        self.assertEqual(findings[0].severity, "hard")
        self.assertIn("not found", findings[0].message)


if __name__ == "__main__":
    unittest.main()
