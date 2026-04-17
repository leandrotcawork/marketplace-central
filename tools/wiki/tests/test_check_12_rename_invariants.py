from __future__ import annotations

import shutil
import subprocess
import unittest
import uuid
from pathlib import Path

from tools.wiki.checks.check_12_rename_invariants import run
from tools.wiki.checks.common import LintContext


class RenameInvariantsCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)

    def _new_repo_root(self) -> Path:
        root = self.tmp_root / f"check_12_{uuid.uuid4().hex}"
        root.mkdir(parents=True, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        return root

    def _git(self, root: Path, *args: str) -> subprocess.CompletedProcess:
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

    def _init_repo(self, root: Path) -> None:
        self._git(root, "git", "init")
        self._git(root, "git", "config", "user.email", "wiki-tests@example.com")
        self._git(root, "git", "config", "user.name", "Wiki Tests")

    def _commit_all(self, root: Path, message: str) -> None:
        self._git(root, "git", "add", "-A")
        self._git(root, "git", "commit", "-m", message)

    def _sha(self, root: Path) -> str:
        return self._git(root, "git", "rev-parse", "HEAD").stdout.strip()

    def _move(self, root: Path, old: str, new: str) -> None:
        old_path = root / old
        new_path = root / new
        new_path.parent.mkdir(parents=True, exist_ok=True)
        old_path.rename(new_path)

    def _ctx(
        self,
        root: Path,
        changed_files: list[str],
        base_sha: str | None,
    ) -> LintContext:
        return LintContext(
            head_sha="HEAD",
            base_sha=base_sha,
            changed_files=changed_files,
            path_map={},
            wiki_pages=[],
            pr_description="",
            repo_root=root,
        )

    def test_no_base_sha_returns_empty(self) -> None:
        """No base_sha → return [] (no diff to check)."""
        root = self._new_repo_root()
        self._init_repo(root)
        self._write(root, "apps/server_core/internal/modules/pricing/service.go", "pkg\n")
        self._commit_all(root, "initial")

        findings = run(self._ctx(root, [], base_sha=None))

        self.assertEqual(findings, [])

    def test_fail_rename_under_apps_without_path_map_update(self) -> None:
        """Rename under apps/ without path_map.yaml in changed_files → finding."""
        root = self._new_repo_root()
        self._init_repo(root)

        src_content = "package application\nfunc Calculate() {}\n"
        self._write(root, "apps/server_core/internal/modules/pricing/service.go", src_content)
        self._write(root, "tools/wiki/path_map.yaml", "path_to_page: {}\n")
        self._commit_all(root, "initial")
        base = self._sha(root)

        # Rename the file
        self._move(
            root,
            "apps/server_core/internal/modules/pricing/service.go",
            "apps/server_core/internal/modules/pricing/calculator.go",
        )
        self._commit_all(root, "rename service to calculator")

        # changed_files does NOT include path_map.yaml
        findings = run(
            self._ctx(
                root,
                ["apps/server_core/internal/modules/pricing/calculator.go"],
                base_sha=base,
            )
        )

        self.assertGreaterEqual(len(findings), 1)
        self.assertTrue(any(f.check == "rename-invariants" for f in findings))
        self.assertTrue(any("path_map.yaml" in f.path for f in findings))

    def test_pass_rename_with_path_map_updated(self) -> None:
        """Rename under apps/ WITH path_map.yaml in changed_files → no finding."""
        root = self._new_repo_root()
        self._init_repo(root)

        src_content = "package application\nfunc Calculate() {}\n"
        self._write(root, "apps/server_core/internal/modules/pricing/service.go", src_content)
        self._write(root, "tools/wiki/path_map.yaml", "path_to_page: {}\n")
        self._commit_all(root, "initial")
        base = self._sha(root)

        self._move(
            root,
            "apps/server_core/internal/modules/pricing/service.go",
            "apps/server_core/internal/modules/pricing/calculator.go",
        )
        self._write(root, "tools/wiki/path_map.yaml", "path_to_page:\n  apps/**/*.go: []\n")
        self._commit_all(root, "rename with path_map update")

        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/internal/modules/pricing/calculator.go",
                    "tools/wiki/path_map.yaml",
                ],
                base_sha=base,
            )
        )

        rename_findings = [f for f in findings if f.check == "rename-invariants"]
        self.assertEqual(rename_findings, [])

    def test_pass_rename_outside_tracked_paths_no_finding(self) -> None:
        """Rename outside tracked paths → no finding."""
        root = self._new_repo_root()
        self._init_repo(root)

        self._write(root, "docs/README.md", "# Docs\n")
        self._commit_all(root, "initial")
        base = self._sha(root)

        self._move(root, "docs/README.md", "docs/GUIDE.md")
        self._commit_all(root, "rename readme to guide")

        findings = run(
            self._ctx(root, ["docs/GUIDE.md"], base_sha=base)
        )

        self.assertEqual(findings, [])

    def test_fail_migration_rename_without_meta_update(self) -> None:
        """Migration SQL rename without _meta update → additional finding."""
        root = self._new_repo_root()
        self._init_repo(root)

        self._write(root, "apps/server_core/migrations/0001_create_tables.sql", "-- sql\n")
        self._write(root, "tools/wiki/path_map.yaml", "path_to_page: {}\n")
        self._commit_all(root, "initial")
        base = self._sha(root)

        self._move(
            root,
            "apps/server_core/migrations/0001_create_tables.sql",
            "apps/server_core/migrations/0001_init_schema.sql",
        )
        # Update path_map but NOT migration meta
        self._write(root, "tools/wiki/path_map.yaml", "path_to_page:\n  apps/**/*.sql: []\n")
        self._commit_all(root, "rename migration, no meta update")

        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/migrations/0001_init_schema.sql",
                    "tools/wiki/path_map.yaml",
                ],
                base_sha=base,
            )
        )

        meta_findings = [f for f in findings if "migration-module.json" in f.path]
        self.assertGreaterEqual(len(meta_findings), 1)

    def test_pass_migration_rename_with_meta_update(self) -> None:
        """Migration rename WITH _meta update → no additional finding."""
        root = self._new_repo_root()
        self._init_repo(root)

        self._write(root, "apps/server_core/migrations/0001_create_tables.sql", "-- sql\n")
        self._write(root, "tools/wiki/path_map.yaml", "path_to_page: {}\n")
        self._write(root, "wiki/_meta/migration-module.json", "{}\n")
        self._commit_all(root, "initial")
        base = self._sha(root)

        self._move(
            root,
            "apps/server_core/migrations/0001_create_tables.sql",
            "apps/server_core/migrations/0001_init_schema.sql",
        )
        self._write(root, "tools/wiki/path_map.yaml", "path_to_page:\n  apps/**/*.sql: []\n")
        self._write(root, "wiki/_meta/migration-module.json", '{"0001": "pricing"}\n')
        self._commit_all(root, "rename migration with meta update")

        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/migrations/0001_init_schema.sql",
                    "tools/wiki/path_map.yaml",
                    "wiki/_meta/migration-module.json",
                ],
                base_sha=base,
            )
        )

        meta_findings = [f for f in findings if "migration-module.json" in f.path]
        self.assertEqual(meta_findings, [])


if __name__ == "__main__":
    unittest.main()
