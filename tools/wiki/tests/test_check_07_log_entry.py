from __future__ import annotations

import shutil
import subprocess
import unittest
import uuid
from pathlib import Path

from tools.wiki.checks.check_07_log_entry import run
from tools.wiki.checks.common import LintContext


class LogEntryCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)

    def _new_repo_root(self) -> Path:
        root = self.tmp_root / f"check_07_{uuid.uuid4().hex}"
        root.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        return root

    def _run(self, root: Path, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            list(args),
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

    def _write(self, root: Path, rel_path: str, content: str) -> None:
        file_path = root / rel_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    def _commit_all(self, root: Path, message: str) -> None:
        self._run(root, "git", "add", ".")
        self._run(root, "git", "commit", "-m", message)

    def _init_repo(self, root: Path) -> None:
        self._run(root, "git", "init")
        self._run(root, "git", "config", "user.email", "wiki-tests@example.com")
        self._run(root, "git", "config", "user.name", "Wiki Tests")

    def _base_sha(self, root: Path) -> str:
        result = self._run(root, "git", "rev-parse", "HEAD")
        return result.stdout.strip()

    def _ctx(
        self,
        root: Path,
        changed_files: list[str],
        base_sha: str | None = None,
        pr_description: str = "",
    ) -> LintContext:
        return LintContext(
            head_sha="HEAD",
            base_sha=base_sha,
            changed_files=changed_files,
            path_map={},
            wiki_pages=[],
            pr_description=pr_description,
            repo_root=root,
        )

    def test_pass_wiki_change_with_log_entry_added(self) -> None:
        """Changed wiki page + valid log entry added in diff → no findings."""
        root = self._new_repo_root()
        self._init_repo(root)

        self._write(root, "wiki/log.md", "# Log\n\n")
        self._write(root, "wiki/modules/pricing.md", "# Pricing\n\nOriginal content.\n")
        self._commit_all(root, "initial")
        base = self._base_sha(root)

        # Add a log entry and update the wiki page
        self._write(
            root,
            "wiki/log.md",
            "# Log\n\n## [2025-01-15] Pricing module — updated margin section\n\nDetails here.\n",
        )
        self._write(root, "wiki/modules/pricing.md", "# Pricing\n\nUpdated content.\n")
        self._commit_all(root, "update pricing wiki")

        findings = run(
            self._ctx(root, ["wiki/modules/pricing.md", "wiki/log.md"], base_sha=base)
        )

        self.assertEqual(findings, [])

    def test_fail_wiki_change_without_log_entry(self) -> None:
        """Changed wiki page but no valid log entry added → hard finding."""
        root = self._new_repo_root()
        self._init_repo(root)

        self._write(root, "wiki/log.md", "# Log\n\nNo entries yet.\n")
        self._write(root, "wiki/modules/pricing.md", "# Pricing\n\nOriginal content.\n")
        self._commit_all(root, "initial")
        base = self._base_sha(root)

        # Update wiki page but don't add a proper log entry
        self._write(root, "wiki/modules/pricing.md", "# Pricing\n\nUpdated content.\n")
        self._commit_all(root, "update pricing wiki, forgot log")

        findings = run(
            self._ctx(root, ["wiki/modules/pricing.md"], base_sha=base)
        )

        self.assertGreaterEqual(len(findings), 1)
        self.assertTrue(any(f.check == "log-entry" for f in findings))
        self.assertTrue(any(f.severity == "hard" for f in findings))

    def test_edge_only_log_md_changed_no_finding(self) -> None:
        """Only wiki/log.md changed → no finding (excluded from trigger)."""
        root = self._new_repo_root()
        self._init_repo(root)

        self._write(root, "wiki/log.md", "# Log\n\n")
        self._commit_all(root, "initial")
        base = self._base_sha(root)

        self._write(root, "wiki/log.md", "# Log\n\n## [2025-01-15] Admin — log only\n\n")
        self._commit_all(root, "update log only")

        findings = run(
            self._ctx(root, ["wiki/log.md"], base_sha=base)
        )

        self.assertEqual(findings, [])

    def test_edge_no_wiki_changes_no_finding(self) -> None:
        """No wiki/* files changed → no finding."""
        root = self._new_repo_root()
        self._init_repo(root)
        self._write(root, "apps/server_core/service.go", "package main\n")
        self._commit_all(root, "initial")
        base = self._base_sha(root)

        self._write(root, "apps/server_core/service.go", "package main\n// updated\n")
        self._commit_all(root, "update go file")

        findings = run(
            self._ctx(root, ["apps/server_core/service.go"], base_sha=base)
        )

        self.assertEqual(findings, [])

    def test_no_base_sha_log_missing_entry(self) -> None:
        """No base_sha + log.md has no matching line → hard finding."""
        root = self._new_repo_root()
        self._init_repo(root)
        self._write(root, "wiki/log.md", "# Log\n\nNo valid entries.\n")
        self._write(root, "wiki/modules/pricing.md", "# Pricing\n\n")
        self._commit_all(root, "initial")

        findings = run(
            self._ctx(root, ["wiki/modules/pricing.md"], base_sha=None)
        )

        self.assertGreaterEqual(len(findings), 1)
        self.assertTrue(any(f.check == "log-entry" for f in findings))

    def test_no_base_sha_log_has_entry(self) -> None:
        """No base_sha + log.md has a matching line → no finding."""
        root = self._new_repo_root()
        self._init_repo(root)
        self._write(
            root,
            "wiki/log.md",
            "# Log\n\n## [2025-01-15] Pricing — updated content\n\nDetails.\n",
        )
        self._write(root, "wiki/modules/pricing.md", "# Pricing\n\n")
        self._commit_all(root, "initial")

        findings = run(
            self._ctx(root, ["wiki/modules/pricing.md"], base_sha=None)
        )

        self.assertEqual(findings, [])

    def test_edge_only_index_md_changed_no_finding(self) -> None:
        """Only wiki/index.md changed → excluded from trigger, no finding."""
        root = self._new_repo_root()
        self._init_repo(root)
        self._write(root, "wiki/index.md", "# Index\n\n")
        self._commit_all(root, "initial")
        base = self._base_sha(root)

        self._write(root, "wiki/index.md", "# Index\n\nUpdated.\n")
        self._commit_all(root, "update index")

        findings = run(
            self._ctx(root, ["wiki/index.md"], base_sha=base)
        )

        self.assertEqual(findings, [])


if __name__ == "__main__":
    unittest.main()
