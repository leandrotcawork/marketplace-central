from __future__ import annotations

import unittest
import shutil
import uuid
from pathlib import Path

from tools.wiki.checks.check_01_frontmatter import run
from tools.wiki.checks.common import LintContext


class FrontmatterCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixtures_dir = Path(__file__).parent / "fixtures" / "check_01"
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)

    def _new_case_root(self) -> Path:
        root = self.tmp_root / f"check_01_{uuid.uuid4().hex}"
        root.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        return root

    def _read_fixture(self, name: str) -> str:
        return (self.fixtures_dir / name).read_text(encoding="utf-8")

    def _write(self, root: Path, rel_path: str, content: str) -> None:
        full = root / rel_path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(content, encoding="utf-8")

    def _ctx(self, root: Path, pages: list[str]) -> LintContext:
        return LintContext(
            head_sha="HEADSHA",
            base_sha="BASESHA",
            changed_files=[],
            path_map={},
            wiki_pages=pages,
            pr_description="",
            repo_root=root,
        )

    def test_run_passes_valid_frontmatter(self) -> None:
        root = self._new_case_root()
        self._write(root, "wiki/modules/pass.md", self._read_fixture("pass.md"))

        findings = run(self._ctx(root, ["wiki/modules/pass.md"]))

        self.assertEqual(findings, [])

    def test_run_reports_frontmatter_failures(self) -> None:
        root = self._new_case_root()
        self._write(root, "wiki/modules/fail.md", self._read_fixture("fail.md"))

        findings = run(self._ctx(root, ["wiki/modules/fail.md"]))

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "frontmatter")
        self.assertTrue(findings[0].message.startswith("[frontmatter]"))
        self.assertIn("missing key", findings[0].message)

    def test_run_skips_attic_and_special_files(self) -> None:
        root = self._new_case_root()
        self._write(root, "wiki/features/edge.md", self._read_fixture("edge.md"))
        self._write(root, "wiki/_attic/old.md", self._read_fixture("fail.md"))
        self._write(root, "wiki/index.md", self._read_fixture("fail.md"))
        self._write(root, "wiki/log.md", self._read_fixture("fail.md"))

        findings = run(
            self._ctx(
                root,
                [
                    "wiki/features/edge.md",
                    "wiki/_attic/old.md",
                    "wiki/index.md",
                    "wiki/log.md",
                ],
            )
        )

        self.assertEqual(findings, [])


if __name__ == "__main__":
    unittest.main()
