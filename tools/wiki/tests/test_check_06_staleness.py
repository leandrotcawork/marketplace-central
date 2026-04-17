from __future__ import annotations

import shutil
import subprocess
import unittest
import uuid
from pathlib import Path

from tools.wiki.checks.check_06_staleness import run
from tools.wiki.checks.common import LintContext


class StalenessCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixtures_dir = Path(__file__).parent / "fixtures" / "check_06"
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)

    def _new_repo_root(self) -> Path:
        root = self.tmp_root / f"check_06_{uuid.uuid4().hex}"
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

    def _read_fixture(self, name: str) -> str:
        return (self.fixtures_dir / name).read_text(encoding="utf-8")

    def _commit_all(self, root: Path, message: str) -> None:
        self._run(root, "git", "add", ".")
        self._run(root, "git", "commit", "-m", message)

    def _init_repo(self, root: Path) -> None:
        self._run(root, "git", "init")
        self._run(root, "git", "config", "user.email", "wiki-tests@example.com")
        self._run(root, "git", "config", "user.name", "Wiki Tests")

    def _path_map(self) -> dict:
        return {
            "path_to_page": {
                "apps/server_core/internal/modules/<mod>/**": ["wiki/modules/<mod>.md"],
                "**/*": [],
            }
        }

    def _ctx(self, root: Path, page: str, pr_description: str = "") -> LintContext:
        return LintContext(
            head_sha="HEAD",
            base_sha="BASE",
            changed_files=[],
            path_map=self._path_map(),
            wiki_pages=[page],
            pr_description=pr_description,
            repo_root=root,
        )

    def _seed_scope_file(self, root: Path, body: str) -> None:
        self._write(root, "apps/server_core/internal/modules/pricing/application/service.go", body)

    def test_pass_staleness(self) -> None:
        root = self._new_repo_root()
        page = "wiki/modules/pricing.md"
        self._init_repo(root)
        self._write(root, page, self._read_fixture("pass.md"))
        self._seed_scope_file(root, "package application\n")
        self._commit_all(root, "seed")

        findings = run(self._ctx(root, page))

        self.assertEqual(findings, [])

    def test_fail_staleness(self) -> None:
        root = self._new_repo_root()
        page = "wiki/modules/pricing.md"
        self._init_repo(root)
        self._write(root, page, self._read_fixture("fail.md"))
        self._seed_scope_file(root, "package application\n")
        self._commit_all(root, "seed")

        for idx in range(1, 4):
            self._seed_scope_file(root, f"package application\n// c{idx}\n")
            self._commit_all(root, f"scope-{idx}")

        findings = run(self._ctx(root, page))

        self.assertGreaterEqual(len(findings), 1)
        self.assertTrue(any(f.check == "staleness" for f in findings))
        self.assertTrue(any("commit distance" in f.message for f in findings))

    def test_edge_staleness_wiki_exempt_skips_commit_distance(self) -> None:
        root = self._new_repo_root()
        page = "wiki/modules/pricing.md"
        self._init_repo(root)
        self._write(root, page, self._read_fixture("edge.md"))
        self._seed_scope_file(root, "package application\n")
        self._commit_all(root, "seed")

        for idx in range(1, 4):
            self._seed_scope_file(root, f"package application\n// exempt-{idx}\n")
            self._commit_all(root, f"scope-{idx}")

        findings = run(self._ctx(root, page, "[wiki-exempt: rollout window]"))

        self.assertEqual(findings, [])


if __name__ == "__main__":
    unittest.main()
