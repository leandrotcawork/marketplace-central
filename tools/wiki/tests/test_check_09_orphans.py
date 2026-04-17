from __future__ import annotations

import shutil
import unittest
import uuid
from pathlib import Path

from tools.wiki.checks.check_09_orphans import run
from tools.wiki.checks.common import LintContext


class OrphansCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)
        self.fixtures_dir = Path(__file__).parent / "fixtures" / "check_09"

    def _new_repo_root(self) -> Path:
        root = self.tmp_root / f"check_09_{uuid.uuid4().hex}"
        root.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        return root

    def _write(self, root: Path, rel_path: str, content: str) -> None:
        file_path = root / rel_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    def _read_fixture(self, name: str) -> str:
        return (self.fixtures_dir / name).read_text(encoding="utf-8")

    def _ctx(self, root: Path, wiki_pages: list[str]) -> LintContext:
        return LintContext(
            head_sha="HEAD",
            base_sha=None,
            changed_files=[],
            path_map={},
            wiki_pages=wiki_pages,
            pr_description="",
            repo_root=root,
        )

    def test_pass_mutual_references_no_orphan(self) -> None:
        """Two pages referencing each other → no findings."""
        root = self._new_repo_root()
        self._write(root, "wiki/page_a.md", self._read_fixture("page_a.md"))
        self._write(root, "wiki/page_b.md", self._read_fixture("page_b.md"))

        findings = run(self._ctx(root, ["wiki/page_a.md", "wiki/page_b.md"]))

        self.assertEqual(findings, [])

    def test_fail_isolated_page_is_orphan(self) -> None:
        """A page with no inbound references → warn finding."""
        root = self._new_repo_root()
        self._write(root, "wiki/isolated.md", self._read_fixture("isolated.md"))

        findings = run(self._ctx(root, ["wiki/isolated.md"]))

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "orphans")
        self.assertEqual(findings[0].severity, "warn")
        self.assertEqual(findings[0].path, "wiki/isolated.md")

    def test_stub_page_not_flagged(self) -> None:
        """A stub page with no inbound references → no finding (stubs exempt)."""
        root = self._new_repo_root()
        self._write(root, "wiki/stub_page.md", self._read_fixture("stub_page.md"))

        findings = run(self._ctx(root, ["wiki/stub_page.md"]))

        self.assertEqual(findings, [])

    def test_excluded_pages_not_flagged(self) -> None:
        """wiki/index.md, wiki/log.md, wiki/CONTEXT_MAP.md → never flagged."""
        root = self._new_repo_root()
        for name in ["index.md", "log.md", "CONTEXT_MAP.md"]:
            self._write(
                root,
                f"wiki/{name}",
                f"---\ntitle: {name}\nstatus: active\n---\n\n# {name}\n",
            )

        findings = run(
            self._ctx(
                root, ["wiki/index.md", "wiki/log.md", "wiki/CONTEXT_MAP.md"]
            )
        )

        self.assertEqual(findings, [])

    def test_mixed_orphan_and_referenced(self) -> None:
        """One orphan + two pages referencing each other → only one warning."""
        root = self._new_repo_root()
        self._write(root, "wiki/page_a.md", self._read_fixture("page_a.md"))
        self._write(root, "wiki/page_b.md", self._read_fixture("page_b.md"))
        self._write(root, "wiki/isolated.md", self._read_fixture("isolated.md"))

        findings = run(
            self._ctx(root, ["wiki/page_a.md", "wiki/page_b.md", "wiki/isolated.md"])
        )

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].path, "wiki/isolated.md")

    def test_page_referenced_by_depends_on(self) -> None:
        """A page referenced via depends_on → not an orphan."""
        root = self._new_repo_root()
        self._write(
            root,
            "wiki/page_a.md",
            "---\ntitle: Page A\nstatus: active\nrelated: []\ndepends_on:\n  - wiki/page_b.md\n---\n\n# A\n",
        )
        self._write(
            root,
            "wiki/page_b.md",
            "---\ntitle: Page B\nstatus: active\nrelated: []\ndepends_on: []\n---\n\n# B\n",
        )

        findings = run(self._ctx(root, ["wiki/page_a.md", "wiki/page_b.md"]))

        # page_a has no inbound → orphan; page_b is referenced by page_a → not orphan
        orphan_paths = [f.path for f in findings]
        self.assertIn("wiki/page_a.md", orphan_paths)
        self.assertNotIn("wiki/page_b.md", orphan_paths)


if __name__ == "__main__":
    unittest.main()
