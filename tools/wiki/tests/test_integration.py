"""Integration tests for the assembled wiki-lint suite (Task 17b convergence)."""
from __future__ import annotations

import inspect
import shutil
import subprocess
import sys
import time
import unittest
from pathlib import Path

WORKTREE = Path(__file__).resolve().parents[3]


class RegistryOrderTests(unittest.TestCase):
    """Test 1: CHECKS list contains all 12 modules in deterministic order."""

    def test_registry_order(self) -> None:
        import tools.wiki.lint as lint_module

        names = [m.__name__.split(".")[-1] for m in lint_module.CHECKS]
        expected = [
            "check_01_frontmatter",
            "check_02_sections",
            "check_03_citations",
            "check_04_backlinks",
            "check_05_contract_drift",
            "check_06_staleness",
            "check_07_log_entry",
            "check_08_index_fresh",
            "check_09_orphans",
            "check_10_stub_escape",
            "check_11_wiki_scope",
            "check_12_rename_invariants",
        ]
        self.assertEqual(names, expected)


class RunSignatureTests(unittest.TestCase):
    """Test 2: Each check module's run() accepts exactly one LintContext param."""

    def test_all_checks_have_run_signature(self) -> None:
        import types

        import tools.wiki.lint as lint_module
        from tools.wiki.checks.common import LintContext

        for mod in lint_module.CHECKS:
            self.assertIsInstance(mod, types.ModuleType, f"{mod} is not a module")
            run_fn = getattr(mod, "run", None)
            self.assertIsNotNone(run_fn, f"{mod.__name__} missing run()")
            sig = inspect.signature(run_fn)
            params = list(sig.parameters.values())
            self.assertEqual(
                len(params),
                1,
                f"{mod.__name__}.run should take exactly 1 param, got {len(params)}",
            )
            annotation = params[0].annotation
            # Under `from __future__ import annotations`, annotations are stored
            # as strings (PEP 563). Accept both the resolved class and the string form.
            if annotation is inspect.Parameter.empty:
                self.fail(f"{mod.__name__}.run param has no annotation")
            resolved = annotation if annotation is not inspect.Parameter.empty else None
            if isinstance(resolved, str):
                self.assertIn(
                    resolved,
                    ("LintContext", "tools.wiki.checks.common.LintContext"),
                    f"{mod.__name__}.run param annotation string should be 'LintContext', got {resolved!r}",
                )
            else:
                self.assertIs(
                    resolved,
                    LintContext,
                    f"{mod.__name__}.run param annotation should be LintContext, got {resolved!r}",
                )


class CanonicalCheckNamesTests(unittest.TestCase):
    """Test 3: CHECK_NAME constants match the canonical set exactly."""

    CANONICAL = {
        "frontmatter",
        "sections",
        "citations",
        "backlinks",
        "contract-drift",
        "staleness",
        "log-entry",
        "index-fresh",
        "orphans",
        "stub-escape",
        "wiki-scope",
        "rename-invariants",
    }

    def test_canonical_check_names(self) -> None:
        import tools.wiki.lint as lint_module

        for mod in lint_module.CHECKS:
            name = getattr(mod, "CHECK_NAME", None)
            self.assertIsNotNone(
                name,
                f"{mod.__name__} missing CHECK_NAME constant",
            )
            self.assertIn(
                name,
                self.CANONICAL,
                f"{mod.__name__} has non-canonical CHECK_NAME: {name!r}",
            )

    def test_all_canonical_names_covered(self) -> None:
        """Every canonical name is claimed by exactly one check."""
        import tools.wiki.lint as lint_module

        claimed = {mod.CHECK_NAME for mod in lint_module.CHECKS if hasattr(mod, "CHECK_NAME")}
        self.assertEqual(
            claimed,
            self.CANONICAL,
            f"Unclaimed canonical names: {self.CANONICAL - claimed}; "
            f"Extra names: {claimed - self.CANONICAL}",
        )


class RuntimeBudgetTests(unittest.TestCase):
    """Test 4: Full lint run completes within 5 seconds (infrastructure budget)."""

    def test_runtime_under_5s(self) -> None:
        start = time.monotonic()
        result = subprocess.run(
            [sys.executable, "-m", "tools.wiki.lint", "--json", "--base", "HEAD"],
            capture_output=True,
            text=True,
            cwd=str(WORKTREE),
        )
        elapsed = time.monotonic() - start
        self.assertLess(
            elapsed,
            5.0,
            f"wiki-lint took {elapsed:.2f}s (>5s budget)",
        )
        # Exit 3 means infra crash — anything else (0, 1, 2) is valid lint output.
        self.assertNotEqual(
            result.returncode,
            3,
            f"wiki-lint crashed (exit 3):\nstdout={result.stdout}\nstderr={result.stderr}",
        )


class ExitCodeAdapterTests(unittest.TestCase):
    """Test 5: Exit-code mapping for the pre-commit hook adapter."""

    @staticmethod
    def _bash_can_run_shebang_script() -> bool:
        """Return True only if bash can execute a shebang script without WSL relay.

        On Windows with Git Bash + WSL installed, running a shebang script may
        trigger a WSL relay that fails with 'execvpe(/bin/bash) failed'.  We
        detect this by running a probe script and checking for that marker in
        stderr.
        """
        import stat as _stat
        import tempfile

        bash = shutil.which("bash")
        if not bash:
            return False
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".sh", delete=False, encoding="utf-8"
            ) as fh:
                fh.write("#!/usr/bin/env bash\nset -uo pipefail\nexit 0\n")
                tmp_path = fh.name
            Path(tmp_path).chmod(Path(tmp_path).stat().st_mode | _stat.S_IEXEC)
            r = subprocess.run([bash, tmp_path], capture_output=True, timeout=5)
            if b"WSL" in r.stderr and b"execvpe" in r.stderr:
                return False
            return r.returncode == 0
        except Exception:  # noqa: BLE001
            return False
        finally:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except Exception:  # noqa: BLE001
                pass

    def test_exit_code_adapters_pre_commit(self) -> None:
        if not self._bash_can_run_shebang_script():
            self.skipTest(
                "bash shebang-script execution not available on this platform "
                "(WSL relay, missing bash, or other OS-level restriction)"
            )
        import stat
        import tempfile

        bash_bin = shutil.which("bash")
        assert bash_bin is not None  # guaranteed by _bash_can_run_shebang_script

        hooks_dir = WORKTREE / "tools" / "wiki" / "hooks"
        pre_commit_path = hooks_dir / "pre-commit"
        if not pre_commit_path.exists():
            self.skipTest("pre-commit hook not present — skipping adapter test")

        pre_commit_text = pre_commit_path.read_text(encoding="utf-8")

        # (lint_exit, expected_pre_commit_exit)
        # exit 0 → clean → allow commit
        # exit 1 → HARD findings → advisory at pre-commit (warn only, allow commit → 0)
        # exit 2 → WARN → advisory, allow commit (pre-commit = 0)
        # exit 3 → infra error → block commit (pre-commit = 3)
        # Note: pre-commit is warn-only. Hard blocking happens at pre-push.
        cases = [
            (0, 0),
            (1, 0),
            (2, 0),
            (3, 3),
        ]

        for lint_exit, expected in cases:
            with tempfile.TemporaryDirectory() as tmp:
                tmp_path = Path(tmp)
                stub = tmp_path / "stub_lint.py"
                stub.write_text(f"import sys; sys.exit({lint_exit})\n", encoding="utf-8")

                # Use forward-slash path so bash can resolve it on all platforms.
                stub_posix = stub.as_posix()
                patched = pre_commit_text.replace(
                    "python -m tools.wiki.lint --json",
                    f"python {stub_posix} --json",
                ).replace(
                    "python -m tools.wiki.lint",
                    f"python {stub_posix}",
                )
                hook_file = tmp_path / "pre-commit"
                hook_file.write_text(patched, encoding="utf-8")
                hook_file.chmod(hook_file.stat().st_mode | stat.S_IEXEC)

                r = subprocess.run(
                    [bash_bin, str(hook_file)],
                    capture_output=True,
                    cwd=str(WORKTREE),
                )
                self.assertEqual(
                    r.returncode,
                    expected,
                    f"pre-commit with lint exit {lint_exit}: "
                    f"expected {expected}, got {r.returncode}\n"
                    f"stdout={r.stdout.decode()}\nstderr={r.stderr.decode()}",
                )


if __name__ == "__main__":
    unittest.main()
