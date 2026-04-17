from __future__ import annotations

import shutil
import unittest
import uuid
from pathlib import Path

from tools.wiki.checks.check_10_stub_escape import run
from tools.wiki.checks.common import LintContext


class StubEscapeCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)
        self.fixtures_dir = Path(__file__).parent / "fixtures" / "check_10"

    def _new_repo_root(self) -> Path:
        root = self.tmp_root / f"check_10_{uuid.uuid4().hex}"
        root.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        return root

    def _write(self, root: Path, rel_path: str, content: str) -> None:
        file_path = root / rel_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    def _read_fixture(self, name: str) -> str:
        return (self.fixtures_dir / name).read_text(encoding="utf-8")

    def _path_map(self) -> dict:
        return {
            "path_to_page": {
                "apps/server_core/internal/modules/<mod>/**": ["wiki/modules/<mod>.md"],
            }
        }

    def _ctx(
        self,
        root: Path,
        changed_files: list[str],
    ) -> LintContext:
        return LintContext(
            head_sha="HEAD",
            base_sha=None,
            changed_files=changed_files,
            path_map=self._path_map(),
            wiki_pages=[],
            pr_description="",
            repo_root=root,
        )

    def test_fail_stub_resolved_by_changed_code(self) -> None:
        """Changed code resolves to a stub page → hard finding."""
        root = self._new_repo_root()
        self._write(root, "wiki/modules/pricing.md", self._read_fixture("stub_page.md"))
        self._write(
            root,
            "apps/server_core/internal/modules/pricing/application/service.go",
            "package application\n",
        )

        findings = run(
            self._ctx(
                root,
                ["apps/server_core/internal/modules/pricing/application/service.go"],
            )
        )

        self.assertGreaterEqual(len(findings), 1)
        self.assertTrue(any(f.check == "stub-escape" for f in findings))
        self.assertTrue(any(f.severity == "hard" for f in findings))
        self.assertTrue(any("wiki/modules/pricing.md" in f.path for f in findings))

    def test_pass_active_page_not_flagged(self) -> None:
        """Changed code resolves to an active (non-stub) page → no finding."""
        root = self._new_repo_root()
        self._write(root, "wiki/modules/pricing.md", self._read_fixture("active_page.md"))
        self._write(
            root,
            "apps/server_core/internal/modules/pricing/application/service.go",
            "package application\n",
        )

        findings = run(
            self._ctx(
                root,
                ["apps/server_core/internal/modules/pricing/application/service.go"],
            )
        )

        self.assertEqual(findings, [])

    def test_pass_no_resolved_pages(self) -> None:
        """Changed files don't resolve to any wiki page → no finding."""
        root = self._new_repo_root()
        self._write(root, "README.md", "# Readme\n")

        findings = run(self._ctx(root, ["README.md"]))

        self.assertEqual(findings, [])

    def test_pass_stub_page_also_changed_and_fully_populated(self) -> None:
        """Stub page is in changed_files and now fully populated → no finding."""
        root = self._new_repo_root()
        self._write(root, "wiki/modules/pricing.md", self._read_fixture("active_page.md"))
        self._write(
            root,
            "apps/server_core/internal/modules/pricing/application/service.go",
            "package application\n",
        )

        # Page is active now and also in changed_files
        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/internal/modules/pricing/application/service.go",
                    "wiki/modules/pricing.md",
                ],
            )
        )

        self.assertEqual(findings, [])

    def test_fail_stub_in_changed_files_but_still_stub(self) -> None:
        """Stub page is in changed_files but STILL has status:stub → finding."""
        root = self._new_repo_root()
        self._write(root, "wiki/modules/pricing.md", self._read_fixture("stub_page.md"))
        self._write(
            root,
            "apps/server_core/internal/modules/pricing/application/service.go",
            "package application\n",
        )

        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/internal/modules/pricing/application/service.go",
                    "wiki/modules/pricing.md",
                ],
            )
        )

        self.assertGreaterEqual(len(findings), 1)
        self.assertTrue(any(f.check == "stub-escape" for f in findings))


if __name__ == "__main__":
    unittest.main()
