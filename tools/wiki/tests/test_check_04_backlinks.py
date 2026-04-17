from __future__ import annotations

import unittest
import uuid
from pathlib import Path
import shutil

from tools.wiki.checks.check_04_backlinks import run
from tools.wiki.checks.common import LintContext


class BacklinksCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixtures_dir = Path(__file__).parent / "fixtures" / "check_04"
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)

    def _new_case_root(self) -> Path:
        root = self.tmp_root / f"check_04_{uuid.uuid4().hex}"
        root.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        return root

    def _read_fixture(self, name: str) -> str:
        return (self.fixtures_dir / name).read_text(encoding="utf-8")

    def _write(self, root: Path, rel_path: str, content: str) -> None:
        file_path = root / rel_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    def _ctx(self, root: Path, pages: list[str]) -> LintContext:
        return LintContext(
            head_sha="HEAD",
            base_sha="BASE",
            changed_files=[],
            path_map={},
            wiki_pages=pages,
            pr_description="",
            repo_root=root,
        )

    def test_pass_backlinks(self) -> None:
        root = self._new_case_root()
        page = "wiki/modules/pricing.md"
        self._write(root, page, self._read_fixture("pass.md"))
        self._write(
            root,
            "apps/server_core/internal/modules/pricing/module.go",
            "// wiki: wiki/modules/pricing.md\npackage pricing\n",
        )

        findings = run(self._ctx(root, [page]))

        self.assertEqual(findings, [])

    def test_fail_backlinks(self) -> None:
        root = self._new_case_root()
        page = "wiki/features/catalog.md"
        self._write(root, page, self._read_fixture("fail.md"))
        lines = [f"line {idx}" for idx in range(1, 23)]
        lines.append("{/* wiki: wiki/features/catalog.md */}")
        self._write(root, "packages/feature-catalog/src/index.tsx", "\n".join(lines) + "\n")

        findings = run(self._ctx(root, [page]))

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "backlinks")
        self.assertEqual(findings[0].severity, "hard")

    def test_edge_backlinks_missing_entry_file_is_hard(self) -> None:
        root = self._new_case_root()
        page = "wiki/platform/httpx.md"
        self._write(root, page, self._read_fixture("edge.md"))

        findings = run(self._ctx(root, [page]))

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "backlinks")
        self.assertEqual(findings[0].severity, "hard")


if __name__ == "__main__":
    unittest.main()
