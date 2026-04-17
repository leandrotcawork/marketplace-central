from __future__ import annotations

import shutil
import subprocess
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from tools.wiki.checks.check_11_wiki_scope import run
from tools.wiki.checks.common import LintContext


class WikiScopeCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)
        self.fixtures_dir = Path(__file__).parent / "fixtures" / "check_11"

    def _new_repo_root(self) -> Path:
        root = self.tmp_root / f"check_11_{uuid.uuid4().hex}"
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

    def _read_fixture(self, name: str) -> str:
        return (self.fixtures_dir / name).read_text(encoding="utf-8")

    def _init_repo(self, root: Path) -> None:
        self._git(root, "git", "init")
        self._git(root, "git", "config", "user.email", "wiki-tests@example.com")
        self._git(root, "git", "config", "user.name", "Wiki Tests")

    def _commit_all(self, root: Path, message: str) -> None:
        self._git(root, "git", "add", ".")
        self._git(root, "git", "commit", "-m", message)

    def _sha(self, root: Path) -> str:
        return self._git(root, "git", "rev-parse", "HEAD").stdout.strip()

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
        base_sha: str | None = None,
        pr_description: str = "",
    ) -> LintContext:
        return LintContext(
            head_sha="HEAD",
            base_sha=base_sha,
            changed_files=changed_files,
            path_map=self._path_map(),
            wiki_pages=[],
            pr_description=pr_description,
            repo_root=root,
        )

    def test_pass_wiki_page_in_scope(self) -> None:
        """Wiki page changed is resolved from changed code → no finding."""
        root = self._new_repo_root()
        self._write(root, "wiki/modules/pricing.md", self._read_fixture("scoped_page.md"))
        self._write(
            root, "apps/server_core/internal/modules/pricing/service.go", "package application\n"
        )

        # Both the code and its wiki page are changed
        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/internal/modules/pricing/service.go",
                    "wiki/modules/pricing.md",
                ],
                pr_description="some pr description",
            )
        )

        self.assertEqual(findings, [])

    def test_fail_wiki_page_out_of_scope(self) -> None:
        """Wiki page changed has no connection to changed code → finding."""
        root = self._new_repo_root()
        self._write(root, "wiki/modules/unrelated.md", self._read_fixture("unscoped_page.md"))
        self._write(
            root, "apps/server_core/internal/modules/pricing/service.go", "package application\n"
        )

        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/internal/modules/pricing/service.go",
                    "wiki/modules/unrelated.md",
                ],
                pr_description="some pr description",
            )
        )

        self.assertGreaterEqual(len(findings), 1)
        self.assertTrue(any(f.check == "wiki-scope" for f in findings))
        self.assertTrue(any("wiki/modules/unrelated.md" in f.path for f in findings))

    def test_pass_escape_valve_suppresses_finding(self) -> None:
        """[wiki-scope: page — reason] in PR description suppresses the finding."""
        root = self._new_repo_root()
        self._write(root, "wiki/modules/unrelated.md", self._read_fixture("unscoped_page.md"))
        self._write(
            root, "apps/server_core/internal/modules/pricing/service.go", "package application\n"
        )

        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/internal/modules/pricing/service.go",
                    "wiki/modules/unrelated.md",
                ],
                pr_description="[wiki-scope: wiki/modules/unrelated.md — cross-module update]",
            )
        )

        self.assertEqual(findings, [])

    def test_no_github_actions_degrades_to_warn(self) -> None:
        """Without GITHUB_ACTIONS env var → severity is warn not hard."""
        root = self._new_repo_root()
        self._write(root, "wiki/modules/unrelated.md", self._read_fixture("unscoped_page.md"))
        self._write(
            root, "apps/server_core/internal/modules/pricing/service.go", "package application\n"
        )

        with patch.dict("os.environ", {}, clear=False):
            # Make sure GITHUB_ACTIONS is absent
            env = dict(__import__("os").environ)
            env.pop("GITHUB_ACTIONS", None)
            env.pop("GITHUB_EVENT_PATH", None)
            with patch.dict("os.environ", env, clear=True):
                findings = run(
                    self._ctx(
                        root,
                        [
                            "apps/server_core/internal/modules/pricing/service.go",
                            "wiki/modules/unrelated.md",
                        ],
                        pr_description="",
                    )
                )

        scope_findings = [f for f in findings if f.check == "wiki-scope" and "wiki/modules/unrelated.md" in f.path]
        self.assertGreaterEqual(len(scope_findings), 1)
        self.assertTrue(all(f.severity == "warn" for f in scope_findings))

    def test_dep_list_shrinkage_without_justification(self) -> None:
        """Frontmatter refs shrank without escape valve → extra finding."""
        root = self._new_repo_root()
        self._init_repo(root)

        # Base: pricing.md references connector.md
        full_pricing = self._read_fixture("scoped_page.md")
        self._write(root, "wiki/modules/pricing.md", full_pricing)
        self._write(root, "apps/server_core/internal/modules/pricing/service.go", "pkg\n")
        self._commit_all(root, "initial")
        base = self._sha(root)

        # Head: pricing.md no longer references connector.md
        trimmed = "---\ntitle: Pricing\nkind: module\nstatus: active\nlast_verified: '2025-01-01'\nrelated: []\ndepends_on: []\n---\n\n# Pricing\n"
        self._write(root, "wiki/modules/pricing.md", trimmed)
        self._commit_all(root, "trimmed refs")

        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/internal/modules/pricing/service.go",
                    "wiki/modules/pricing.md",
                ],
                base_sha=base,
                pr_description="",
            )
        )

        shrink_findings = [f for f in findings if "shrank" in f.message]
        self.assertGreaterEqual(len(shrink_findings), 1)

    def test_dep_list_shrinkage_with_escape_no_extra_finding(self) -> None:
        """Dep list shrank but escape valve present → no shrinkage finding."""
        root = self._new_repo_root()
        self._init_repo(root)

        full_pricing = self._read_fixture("scoped_page.md")
        self._write(root, "wiki/modules/pricing.md", full_pricing)
        self._write(root, "apps/server_core/internal/modules/pricing/service.go", "pkg\n")
        self._commit_all(root, "initial")
        base = self._sha(root)

        trimmed = "---\ntitle: Pricing\nkind: module\nstatus: active\nlast_verified: '2025-01-01'\nrelated: []\ndepends_on: []\n---\n\n# Pricing\n"
        self._write(root, "wiki/modules/pricing.md", trimmed)
        self._commit_all(root, "trimmed refs")

        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/internal/modules/pricing/service.go",
                    "wiki/modules/pricing.md",
                ],
                base_sha=base,
                pr_description="[wiki-scope: wiki/modules/pricing.md — intentional scope reduction]",
            )
        )

        shrink_findings = [f for f in findings if "shrank" in f.message]
        self.assertEqual(shrink_findings, [])

    def test_one_hop_expansion_includes_related_pages(self) -> None:
        """A page reachable via 1-hop related ref → not flagged as out of scope."""
        root = self._new_repo_root()
        # pricing.md is resolved from code; connector.md is in pricing.md's related
        self._write(root, "wiki/modules/pricing.md", self._read_fixture("scoped_page.md"))
        self._write(
            root, "apps/server_core/internal/modules/pricing/service.go", "package application\n"
        )
        # connector.md is in 1-hop via pricing.md's related
        connector_content = "---\ntitle: Connector\nkind: module\nstatus: active\nlast_verified: '2025-01-01'\nrelated: []\ndepends_on: []\n---\n\n# Connector\n"
        self._write(root, "wiki/modules/connector.md", connector_content)

        findings = run(
            self._ctx(
                root,
                [
                    "apps/server_core/internal/modules/pricing/service.go",
                    "wiki/modules/connector.md",
                ],
                pr_description="some description",
            )
        )

        scope_findings = [f for f in findings if "wiki/modules/connector.md" in f.path]
        self.assertEqual(scope_findings, [])


if __name__ == "__main__":
    unittest.main()
