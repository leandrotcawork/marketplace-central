from __future__ import annotations

import shutil
import unittest
import uuid
from pathlib import Path

from tools.wiki.checks.check_05_contract_drift import run
from tools.wiki.checks.common import LintContext


OPENAPI_FIXTURE = """openapi: 3.1.0
info:
  title: test
  version: 1.0.0
paths:
  /api/pricing/simulations:
    x-mpc-module: pricing
    get:
      responses:
        "200":
          description: ok
    post:
      responses:
        "200":
          description: ok
"""


class ContractDriftCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixtures_dir = Path(__file__).parent / "fixtures" / "check_05"
        self.tmp_root = Path(__file__).resolve().parents[3] / ".tmp_test_workspace"
        self.tmp_root.mkdir(parents=True, exist_ok=True)

    def _new_case_root(self) -> Path:
        root = self.tmp_root / f"check_05_{uuid.uuid4().hex}"
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

    def test_pass_contract_drift(self) -> None:
        root = self._new_case_root()
        page = "wiki/modules/pricing.md"
        self._write(root, page, self._read_fixture("pass.md"))
        self._write(root, "contracts/api/marketplace-central.openapi.yaml", OPENAPI_FIXTURE)

        findings = run(self._ctx(root, [page]))

        self.assertEqual(findings, [])

    def test_fail_contract_drift(self) -> None:
        root = self._new_case_root()
        page = "wiki/modules/pricing.md"
        self._write(root, page, self._read_fixture("fail.md"))
        self._write(root, "contracts/api/marketplace-central.openapi.yaml", OPENAPI_FIXTURE)

        findings = run(self._ctx(root, [page]))

        self.assertGreaterEqual(len(findings), 1)
        self.assertTrue(any(f.check == "contract-drift" for f in findings))

    def test_edge_contract_drift_no_module_pages(self) -> None:
        root = self._new_case_root()
        self._write(root, "wiki/features/feature-a.md", self._read_fixture("edge.md"))
        self._write(root, "contracts/api/marketplace-central.openapi.yaml", OPENAPI_FIXTURE)

        findings = run(self._ctx(root, ["wiki/features/feature-a.md"]))

        self.assertEqual(findings, [])


if __name__ == "__main__":
    unittest.main()
