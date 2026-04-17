from __future__ import annotations

import shutil
import subprocess
import unittest
import uuid
from pathlib import Path

from tools.wiki.checks.check_03_citations import run
from tools.wiki.checks.common import LintContext


class CitationsCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixtures_dir = Path(__file__).parent / "fixtures" / "check_03"
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)

    def _new_repo_root(self) -> Path:
        root = self.tmp_root / f"check_03_{uuid.uuid4().hex}"
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

    def _read_fixture(self, name: str) -> str:
        return (self.fixtures_dir / name).read_text(encoding="utf-8")

    def _write(self, root: Path, rel_path: str, content: str) -> None:
        full = root / rel_path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(content, encoding="utf-8")

    def _init_repo_with_source(self, root: Path) -> str:
        self._run(root, "git", "init")
        self._run(root, "git", "config", "user.email", "wiki-tests@example.com")
        self._run(root, "git", "config", "user.name", "Wiki Tests")
        source_path = "apps/server_core/internal/platform/httpx/router.go"
        source = "\n".join(
            [
                "package httpx",
                "",
                "func NewRouter() string {",
                '    return "ok"',
                "}",
                "",
            ]
        )
        self._write(root, source_path, source)
        self._run(root, "git", "add", ".")
        self._run(root, "git", "commit", "-m", "seed")
        return self._run(root, "git", "rev-parse", "HEAD").stdout.strip()

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

    def test_run_passes_valid_citations(self) -> None:
        root = self._new_repo_root()
        sha = self._init_repo_with_source(root)
        self._write(
            root,
            "wiki/platform/httpx.md",
            self._read_fixture("pass.md").format(sha=sha),
        )

        findings = run(self._ctx(root, ["wiki/platform/httpx.md"]))

        self.assertEqual(findings, [])

    def test_run_reports_missing_and_invalid_citations(self) -> None:
        root = self._new_repo_root()
        sha = self._init_repo_with_source(root)
        self._write(
            root,
            "wiki/platform/httpx.md",
            self._read_fixture("fail.md").format(sha=sha),
        )

        findings = run(self._ctx(root, ["wiki/platform/httpx.md"]))

        self.assertGreaterEqual(len(findings), 2)
        self.assertTrue(all(finding.check == "citations" for finding in findings))
        self.assertTrue(any("missing canonical citation" in f.message for f in findings))
        self.assertTrue(any("out of bounds" in f.message for f in findings))

    def test_run_skips_na_sections(self) -> None:
        root = self._new_repo_root()
        sha = self._init_repo_with_source(root)
        self._write(
            root,
            "wiki/platform/httpx.md",
            self._read_fixture("edge.md").format(sha=sha),
        )

        findings = run(self._ctx(root, ["wiki/platform/httpx.md"]))

        self.assertEqual(findings, [])


if __name__ == "__main__":
    unittest.main()
