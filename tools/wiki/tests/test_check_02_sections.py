from __future__ import annotations

import shutil
import unittest
import uuid
from pathlib import Path

from tools.wiki.checks.check_02_sections import run
from tools.wiki.checks.common import LintContext


class SectionsCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixtures_dir = Path(__file__).parent / "fixtures" / "check_02"
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)

    def _new_case_root(self) -> Path:
        root = self.tmp_root / f"check_02_{uuid.uuid4().hex}"
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

    def test_run_passes_required_sections(self) -> None:
        root = self._new_case_root()
        self._write(root, "wiki/modules/pass.md", self._read_fixture("pass.md"))

        findings = run(self._ctx(root, ["wiki/modules/pass.md"]))

        self.assertEqual(findings, [])

    def test_run_reports_missing_and_blank_sections(self) -> None:
        root = self._new_case_root()
        self._write(root, "wiki/modules/fail.md", self._read_fixture("fail.md"))

        findings = run(self._ctx(root, ["wiki/modules/fail.md"]))

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "sections")
        self.assertTrue(findings[0].message.startswith("[sections]"))
        self.assertIn("missing sections", findings[0].message)
        self.assertIn("blank bodies", findings[0].message)

    def test_na_marker_passes(self) -> None:
        root = self._new_case_root()
        self._write(root, "wiki/flows/edge.md", self._read_fixture("edge.md"))

        findings = run(self._ctx(root, ["wiki/flows/edge.md"]))

        self.assertEqual(findings, [])


if __name__ == "__main__":
    unittest.main()
