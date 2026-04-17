# LLM Wiki — M1 Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land M1 of the LLM wiki — directory scaffolding, governance docs, full lint tool (all 12 checks), git hooks, Claude hooks, GitHub Actions (warn-only), CODEOWNERS, and the `/wiki-ingest` skill, in one PR.

**Architecture:** Python-stdlib-only lint in `tools/wiki/lint.py` runs all 12 checks under 5s. Bidirectional anchor comments in code + frontmatter in wiki pages + `path_map.yaml` form the tri-link. Five hook layers (L1 pre-commit WARN, L2 pre-push HARD, L3 Claude PostToolUse, L4 GitHub Actions WARN→HARD at M3, L5 deferred). CODEOWNERS gate on `wiki/**` catches semantic errors past mechanical lint.

**Tech Stack:** Python 3.10+ stdlib (no deps), GNU Make, Git, GitHub Actions, Claude Code hooks.

**Spec:** `docs/superpowers/specs/2026-04-17-llm-wiki-design.md`

## Orchestration

| Batch | Tasks | Model | Parallel? |
|---|---|---|---|
| A | 1–4 | Claude | Sequential (foundation) |
| B | 5 | Codex gpt-5.3-codex (medium) | — |
| C | 6–17 | Codex gpt-5.3-codex (medium) | **YES — 12-way parallel** |
| C′ | 17b | Claude | Convergence — sequential after C |
| D | 18 | Codex gpt-5.3-codex (medium) | — |
| E | 19–24 | Claude | 20‖21, 23‖24 parallel pairs |
| F | 25 | Claude | — |

Rationale: Codex handles mechanical Python + fixtures at higher density; Claude handles governance prose, config, and cross-system glue where conversation context dominates. Batch C is fully independent once Batch B lands (each check has its own module + fixtures).

---

## File Structure

```
marketplace-central/
├── raw/
│   ├── marketplaces/
│   │   ├── vtex/.gitkeep
│   │   ├── mercado_livre/.gitkeep
│   │   ├── shopee/.gitkeep
│   │   ├── magalu/.gitkeep
│   │   ├── amazon/.gitkeep
│   │   ├── leroy_merlin/.gitkeep
│   │   └── madeira_madeira/.gitkeep
│   ├── rfcs/.gitkeep
│   └── assets/.gitkeep
├── wiki/
│   ├── index.md                           # header only at M1
│   ├── log.md                             # header only at M1
│   ├── SCHEMA.md                          # full governance manual
│   ├── CONTEXT_MAP.md                     # placeholder stub — M2 populates
│   ├── modules/.gitkeep
│   ├── features/.gitkeep
│   ├── flows/.gitkeep
│   ├── marketplaces/.gitkeep
│   ├── platform/.gitkeep
│   ├── contracts/.gitkeep
│   └── _meta/
│       └── migration-module.json          # empty `{}` — populated in M2
├── tools/
│   └── wiki/
│       ├── __init__.py
│       ├── lint.py                        # entry point — dispatches checks
│       ├── index.py                       # regenerate index.md
│       ├── path_map.yaml                  # path→page mapping (auth source)
│       ├── checks/
│       │   ├── __init__.py
│       │   ├── common.py                  # shared helpers (frontmatter parse, git, paths)
│       │   ├── check_01_frontmatter.py
│       │   ├── check_02_sections.py
│       │   ├── check_03_citations.py
│       │   ├── check_04_backlinks.py
│       │   ├── check_05_contract_drift.py
│       │   ├── check_06_staleness.py
│       │   ├── check_07_log_entry.py
│       │   ├── check_08_index_fresh.py
│       │   ├── check_09_orphans.py
│       │   ├── check_10_stub_escape.py
│       │   ├── check_11_wiki_scope.py
│       │   └── check_12_rename_invariants.py
│       ├── hooks/
│       │   ├── pre-commit
│       │   └── pre-push
│       └── tests/
│           ├── __init__.py
│           ├── fixtures/                  # per-check pass/fail/edge markdown
│           ├── test_common.py
│           ├── test_check_01_frontmatter.py
│           ├── ... (test per check)
│           └── test_index.py
├── .claude/
│   ├── hooks.json                         # PostToolUse → suggest /wiki-ingest
│   └── skills/
│       └── wiki-ingest/
│           └── SKILL.md
├── .github/
│   ├── CODEOWNERS                         # wiki/** → @leandrotcawork
│   └── workflows/
│       └── wiki-lint.yml                  # warn-only at M1
├── brain/decisions/
│   └── 004-llm-wiki-adopted.md            # ADR
└── Makefile                               # add wiki-lint, wiki-index, setup-hooks, wiki-audit targets
```

Each `tools/wiki/checks/check_NN_*.py` exports one function `run(ctx) -> list[Finding]`. `Finding = dataclass(check: str, severity: "hard"|"warn", path: str, line: int, message: str, fix_hint: str)`. `ctx` is a shared `LintContext` built once per lint run (PR diff, HEAD SHA, path_map, wiki page index, git helpers).

---

## REQUIRED FIRST STEP: Initialize Task Tracking

Run `TaskList` to check for existing tasks. Create native tasks per Task below.

---

## Task 1: Directory scaffold + ADR-004 *(Claude)*

**Goal:** Empty wiki + raw + tools directory trees plus ADR recording the decision.

**Files:**
- Create: `raw/marketplaces/{vtex,mercado_livre,shopee,magalu,amazon,leroy_merlin,madeira_madeira}/.gitkeep`
- Create: `raw/rfcs/.gitkeep`, `raw/assets/.gitkeep`
- Create: `wiki/modules/.gitkeep`, `wiki/features/.gitkeep`, `wiki/flows/.gitkeep`, `wiki/marketplaces/.gitkeep`, `wiki/platform/.gitkeep`, `wiki/contracts/.gitkeep`
- Create: `wiki/_meta/migration-module.json` (content: `{}\n`)
- Create: `tools/wiki/__init__.py`, `tools/wiki/checks/__init__.py`, `tools/wiki/tests/__init__.py`, `tools/wiki/tests/fixtures/.gitkeep`
- Create: `brain/decisions/004-llm-wiki-adopted.md`

**Acceptance Criteria:**
- [ ] Every directory in File Structure section exists as an empty (`.gitkeep`) or placeholder dir.
- [ ] `brain/decisions/004-llm-wiki-adopted.md` contains: Context (module overlap pain, session reorient cost), Decision (adopt Karpathy-style 3-layer wiki per spec), Consequences (same-PR ingest tax, codeowner bottleneck, lint runtime budget), Status: accepted, Date: 2026-04-17, Spec link.
- [ ] `wiki/_meta/migration-module.json` parses as valid JSON.

**Verify:**
```bash
python -c "import json; json.load(open('wiki/_meta/migration-module.json'))"
test -f brain/decisions/004-llm-wiki-adopted.md
find wiki raw tools/wiki -type d | sort
```
Expected: JSON loads clean; ADR file exists; all dirs from File Structure listed.

**Steps:**

- [ ] **Step 1:** Create all directories and `.gitkeep` files.

```bash
mkdir -p raw/marketplaces/{vtex,mercado_livre,shopee,magalu,amazon,leroy_merlin,madeira_madeira} raw/rfcs raw/assets
mkdir -p wiki/{modules,features,flows,marketplaces,platform,contracts,_meta}
mkdir -p tools/wiki/{checks,hooks,tests/fixtures}
for d in raw/marketplaces/*/ raw/rfcs raw/assets wiki/modules wiki/features wiki/flows wiki/marketplaces wiki/platform wiki/contracts tools/wiki/tests/fixtures; do touch "$d/.gitkeep"; done
printf '{}\n' > wiki/_meta/migration-module.json
touch tools/wiki/__init__.py tools/wiki/checks/__init__.py tools/wiki/tests/__init__.py
```

- [ ] **Step 2:** Write ADR-004.

```markdown
# ADR-004: Adopt Karpathy-style LLM wiki

Status: accepted
Date: 2026-04-17
Spec: docs/superpowers/specs/2026-04-17-llm-wiki-design.md

## Context
Module boundaries between `marketplaces`, `integrations`, `connectors` blur over time. Every session re-reads the same code to reorient. Docs drift because there is no same-PR ingestion discipline and no mechanical enforcement.

## Decision
Adopt a three-layer wiki (`raw/` immutable sources, `wiki/` LLM synthesis with frontmatter + canonical `path:line-range@sha` citations, governance via `AGENTS.md` + `wiki/SCHEMA.md`). Same-PR ingest enforced by 12 lint checks across 5 hook layers. CODEOWNERS gate on `wiki/**`.

## Consequences
- Every PR that touches mapped code must update the wiki in the same PR (ingest tax).
- Codeowner review becomes the semantic backstop — bottleneck risk.
- Lint budget <5s; escape valves `[wiki-exempt]` and `[wiki-scope]` must stay rare.
- M2 first deliverable (`CONTEXT_MAP.md`) forces resolution of the `marketplaces × integrations × connectors` overlap.
```

- [ ] **Step 3:** Commit.

```bash
rtk git add raw wiki tools/wiki brain/decisions/004-llm-wiki-adopted.md
rtk git commit -m "feat(wiki): scaffold directory tree + ADR-004"
```

---

## Task 2: `wiki/SCHEMA.md` governance manual *(Claude)*

**Goal:** Self-contained operating manual loaded only when editing wiki content.

**Files:**
- Create: `wiki/SCHEMA.md`

**Acceptance Criteria:**
- [ ] File covers: purpose, 3-layer layout, 6 page kinds, shared frontmatter contract, per-kind section list, citation rules (`path:line-range@sha`), ingest/query/lint ops, all 12 lint checks with pass/fail rules, escape valves `[wiki-exempt]` and `[wiki-scope]`, ownership + rotation, deprecation flow, stub state.
- [ ] No forward references to future spec docs — self-contained.
- [ ] Mirrors the design spec without contradicting it.

**Verify:**
```bash
grep -c "^## " wiki/SCHEMA.md
```
Expected: at least 12 top-level sections.

**Steps:**

- [ ] **Step 1:** Author `wiki/SCHEMA.md` with these sections in order: `## Purpose`, `## Layers`, `## Page kinds`, `## Frontmatter contract`, `## Required sections per kind`, `## Citation rules`, `## Operations`, `## Lint checks` (list all 12 with exit severity), `## Escape valves`, `## Ownership and rotation`, `## Deprecation flow`, `## Stub lifecycle`.

- [ ] **Step 2:** Cross-reference the design spec at top: `Spec: docs/superpowers/specs/2026-04-17-llm-wiki-design.md — this file is the operating manual; the spec is the rationale.`

- [ ] **Step 3:** Verify section count.

```bash
grep -c "^## " wiki/SCHEMA.md
```
Expected: `>= 12`.

- [ ] **Step 4:** Commit.

```bash
rtk git add wiki/SCHEMA.md
rtk git commit -m "docs(wiki): add SCHEMA.md governance manual"
```

---

## Task 3: `wiki/index.md` + `wiki/log.md` + `CONTEXT_MAP.md` headers *(Claude)*

**Goal:** Minimum content for lint to pass on these special files.

**Files:**
- Create: `wiki/index.md`
- Create: `wiki/log.md`
- Create: `wiki/CONTEXT_MAP.md`

**Acceptance Criteria:**
- [ ] `index.md` has header + `<!-- GENERATED by tools/wiki/index.py — do not edit by hand -->` marker + empty kind sections (`## Modules`, `## Features`, `## Flows`, `## Marketplaces`, `## Platform`, `## Contracts`) each containing `_No pages yet._`.
- [ ] `log.md` has `# Wiki ingest log` plus the first entry `## [2026-04-17] bootstrap — M1 scaffolding landed`.
- [ ] `CONTEXT_MAP.md` is a stub page with frontmatter (`kind: flow`, `status: stub`, other required fields) plus `## Purpose` body and other sections marked `_N/A — stub; M2 populates_`.

**Verify:**
```bash
test -s wiki/index.md && test -s wiki/log.md && test -s wiki/CONTEXT_MAP.md
grep -q "GENERATED" wiki/index.md
```

**Steps:**

- [ ] **Step 1:** Write `wiki/index.md` with generator marker + kind section stubs.

- [ ] **Step 2:** Write `wiki/log.md` with bootstrap entry:

```markdown
# Wiki ingest log

Append-only. One entry per page change per PR.

## [2026-04-17] bootstrap — M1 scaffolding landed
- Created `wiki/` + `raw/` trees, SCHEMA, lint tool, hooks, CODEOWNERS, workflow.
- M2 populates `CONTEXT_MAP.md` + three module pages.
```

- [ ] **Step 3:** Write `wiki/CONTEXT_MAP.md` as stub with full frontmatter (kind: flow, title: "Context Map — module bounded contexts", status: stub, owners: [claude, leandro], since: 2026-04-17, last_verified: 2026-04-17, depends_on: [], related: [], sources: []) and body sections all `_N/A — stub; M2 populates_`.

- [ ] **Step 4:** Commit.

```bash
rtk git add wiki/index.md wiki/log.md wiki/CONTEXT_MAP.md
rtk git commit -m "docs(wiki): seed index, log, CONTEXT_MAP stub"
```

---

## Task 4: `path_map.yaml` authoritative mapping *(Claude)*

**Goal:** Single source of truth mapping code paths to wiki pages.

**Files:**
- Create: `tools/wiki/path_map.yaml`

**Acceptance Criteria:**
- [ ] YAML parses via `python -c "import tomllib" ` equivalent (actually we ship minimal YAML parser in `checks/common.py` — see Task 5; at this stage the file is readable by a later-written parser).
- [ ] Maps cover all seven globs from spec § Path map.
- [ ] Per-file glob resolves at least one wiki page; fall-through rule `"**/*": []` suppresses implicit scope violations for unmapped files.

**Verify:**
```bash
python -c "
import re, sys
txt = open('tools/wiki/path_map.yaml').read()
assert 'apps/server_core/internal/modules/' in txt
assert 'packages/feature-' in txt
assert 'raw/marketplaces/' in txt
assert 'contracts/api/marketplace-central.openapi.yaml' in txt
print('ok')
"
```
Expected: `ok`.

**Steps:**

- [ ] **Step 1:** Author `tools/wiki/path_map.yaml`. All globs are root-relative to repository root (no leading `./`, no absolute paths). Placeholders in angle brackets bind named capture groups. Precedence: rules evaluated **top-down**; the first rule that matches a given path wins for that path's resolution — but `scope` semantics union across all matching rules (so a file mapped to one page via precedence may still require updates to any page whose glob also matches — see `common.resolve_wiki_pages` in Task 5). The fall-through `**/*` at the bottom ensures unmapped paths produce zero expected pages (no false scope violations).

```yaml
# Authoritative path→wiki-page mapping. Changes require an ADR.
# Glob syntax: POSIX fnmatch extended with `**` recursion.
# Placeholders <mod>, <pkg>, <name>, <p>, <NNNN> bind named capture groups
# resolved at match time. All paths root-relative to repo root.
# Precedence: top-down first-match for canonical page; scope uses union of all matches.
path_to_page:
  # Special-case flows first (most specific → least specific).
  "apps/server_core/internal/modules/integrations/application/oauth*.go":
    - "wiki/flows/oauth.md"
    - "wiki/modules/integrations.md"

  # Go modules — one page per module dir.
  "apps/server_core/internal/modules/<mod>/**":
    - "wiki/modules/<mod>.md"

  # Go platform packages.
  "apps/server_core/internal/platform/<pkg>/**":
    - "wiki/platform/<pkg>.md"

  # Frontend feature packages.
  "packages/feature-<name>/**":
    - "wiki/features/feature-<name>.md"

  # SDK runtime (single shared page).
  "packages/sdk-runtime/**":
    - "wiki/contracts/sdk-runtime.md"

  # OpenAPI contract.
  "contracts/api/marketplace-central.openapi.yaml":
    - "wiki/contracts/openapi.md"

  # SQL migrations resolved via _meta/migration-module.json.
  "apps/server_core/migrations/<NNNN>_*.sql":
    - "__resolve_via__: wiki/_meta/migration-module.json"

  # Raw vendor content per marketplace.
  "raw/marketplaces/<p>/**":
    - "wiki/marketplaces/<p>.md"

  # Fall-through — unmapped paths produce zero expected pages.
  "**/*": []
```

- [ ] **Step 2:** Add a coverage fixture. Create `tools/wiki/tests/fixtures/path_map_coverage.yaml` (populated in Task 5 test file) listing representative paths with expected page set:

```yaml
# representative_path: [expected pages in resolution order]
"apps/server_core/internal/modules/pricing/domain/simulation.go": ["wiki/modules/pricing.md"]
"apps/server_core/internal/modules/integrations/application/oauth_handler.go":
  ["wiki/flows/oauth.md", "wiki/modules/integrations.md"]
"apps/server_core/internal/platform/pgdb/pool.go": ["wiki/platform/pgdb.md"]
"packages/feature-marketplaces/src/MarketplaceSettingsPage.tsx": ["wiki/features/feature-marketplaces.md"]
"packages/sdk-runtime/src/client.ts": ["wiki/contracts/sdk-runtime.md"]
"contracts/api/marketplace-central.openapi.yaml": ["wiki/contracts/openapi.md"]
"raw/marketplaces/vtex/api-reference.pdf": ["wiki/marketplaces/vtex.md"]
"README.md": []
"AGENTS.md": []
```

Task 5's `test_common.py` loads this fixture and asserts `resolve_wiki_pages([p], path_map) == set(expected)` for each entry.

- [ ] **Step 3:** Commit.

```bash
rtk git add tools/wiki/path_map.yaml
rtk git commit -m "feat(wiki): add path_map.yaml authoritative code→page mapping"
```

---

## Task 5: Lint framework skeleton + `common.py` + test harness *(Codex gpt-5.3-codex medium)*

**Goal:** Runnable `python -m tools.wiki.lint` that discovers check modules, emits structured output, exits 0/1/2, with shared helpers and a working `unittest` harness.

**Files:**
- Create: `tools/wiki/lint.py`
- Create: `tools/wiki/checks/common.py`
- Create: `tools/wiki/tests/test_common.py`

**Acceptance Criteria:**
- [ ] `python -m tools.wiki.lint --help` prints usage.
- [ ] `python -m tools.wiki.lint --json` emits `{"findings": [], "exit": 0}` on clean repo.
- [ ] `common.py` exports: `Finding` dataclass, `LintContext` (holds `head_sha`, `base_sha`, `changed_files`, `path_map`, `wiki_pages`, `pr_description`), `parse_frontmatter(text) -> dict|None`, `load_path_map(path) -> dict`, `glob_match(glob, path) -> bool`, `run_git(*args) -> str`, `resolve_wiki_pages(changed_paths, path_map) -> set[str]`.
- [ ] Exit codes: `0` clean, `1` policy HARD fail, `2` policy WARN only, `3` infra error (parser crash / import failure / malformed path_map / missing check module). Lint MUST catch its own exceptions and emit code ≥3 rather than bubble Python traceback with code 1. Infra errors emit to stderr with `[infra] ...` prefix.
- [ ] `test_common.py` covers: frontmatter parse (happy + malformed + missing), glob matching with placeholders, path→page resolution, git helper smoke (uses a tmp git repo fixture).
- [ ] All tests pass: `python -m unittest discover tools/wiki/tests -v`.

**Verify:**
```bash
python -m tools.wiki.lint --json
python -m unittest discover tools/wiki/tests -v
```
Expected: exit 0 clean; all tests PASS.

**Steps:**

- [ ] **Step 1 (Codex prompt):** Dispatch `mcp__codex__codex` with reasoning_effort=medium. Prompt: *"Implement `tools/wiki/lint.py`, `tools/wiki/checks/common.py`, and `tools/wiki/tests/test_common.py` for Marketplace Central per the plan task below. Python stdlib only (no PyYAML — write a minimal YAML subset parser that handles mappings, lists, scalars, comments — no anchors/flow style). Use `dataclasses` and `argparse`. Exit codes: 0 pass, 1 hard fail, 2 warn. Flags: `--json`, `--base <sha>`, `--pr-description-file <path>`, `--fix` (no-op at M1). Check discovery: import every `tools.wiki.checks.check_NN_*` and call `run(ctx)`. Write failing tests FIRST then implementation. Show all file contents in full."*

- [ ] **Step 2:** Review Codex output for: stdlib-only, YAML parser correctness on the `path_map.yaml` from Task 4, test coverage of happy/fail/edge for each helper.

- [ ] **Step 3:** Write files exactly as Codex produced (after review adjustments).

- [ ] **Step 4:** Run harness and verify.

```bash
python -m tools.wiki.lint --json
python -m unittest discover tools/wiki/tests -v
```
Expected: exit 0, all tests PASS.

- [ ] **Step 5:** Commit.

```bash
rtk git add tools/wiki/lint.py tools/wiki/checks/common.py tools/wiki/tests/test_common.py
rtk git commit -m "feat(wiki): lint framework + common helpers + test harness"
```

---

## Tasks 6–17: One check each *(Codex gpt-5.3-codex medium — 12-way PARALLEL)*

Dispatch all twelve as concurrent subagent tasks once Task 5 lands. Each task is self-contained: check module + fixtures + test file. No cross-task dependencies.

### Shared per-task shape

**Each check task:**
- Creates `tools/wiki/checks/check_NN_<name>.py` exporting `def run(ctx: LintContext) -> list[Finding]`.
- Creates `tools/wiki/tests/test_check_NN_<name>.py` with ≥ 3 fixtures: `pass.md`, `fail.md`, `edge.md` (or equivalent multi-file setup).
- Fixtures live under `tools/wiki/tests/fixtures/check_NN/`.
- Test uses `unittest` + `tempfile.TemporaryDirectory`, sets up a fake `LintContext`, asserts finding count and error codes.

**Codex prompt template:**
> Implement check `NN` (<name>) for the Marketplace Central wiki lint tool. Rule: `<rule body from spec §Error Handling check NN>`. Severity: `<hard|warn>`. Import `Finding, LintContext` from `tools.wiki.checks.common`. Emit `Finding(check="<name>", severity=..., path=..., line=..., message="[<name>] ...", fix_hint="...")`. Write unittest-based test with ≥3 fixtures (pass, fail, edge case). Python stdlib only. Return full file contents.

### Task 6: Check 1 — frontmatter presence + required fields *(HARD)*

Rule body: every `wiki/**/*.md` except `index.md`, `log.md`, `_attic/**` has frontmatter with keys `kind, title, status, owners, since, last_verified, depends_on, related, sources`. `owners` must contain ≥ 1 agent and ≥ 1 human. Status ∈ {active, foundation, planned, deprecated, transitional, stub}.

Edge: multi-doc YAML (`---` twice) — reject unless split; missing trailing newline — pass.

### Task 7: Check 2 — section presence per kind *(HARD)*

Per-kind required section lists from spec § Components. Blank body fails; `_N/A — <reason>_` marker passes.

Edge: section present but body only contains a code fence — pass if fence non-empty.

### Task 8: Check 3 — citation canonical form + anchor validation *(HARD)*

Regex: `(apps|packages|contracts|raw|tools)/[^\s:@)]+:\d+(-\d+)?@[0-9a-f]{7,40}`.

Validators — **pure Python, no shell pipelines** (cross-platform: Windows/Linux/macOS):
1. Existence: `common.run_git("cat-file", "-e", f"{sha}:{path}")` returns exit 0.
2. Line-range bounds: fetch full file via `common.run_git("show", f"{sha}:{path}")`, split on `\n` in Python, assert `1 <= start <= end <= len(lines)`. Never shell out to `sed`/`awk`/`wc`.
3. Reachability: `common.run_git("merge-base", "--is-ancestor", sha, "HEAD")` returns exit 0.

At least one citation per grounded section (grounded = any section except `_N/A_`). Utility `--refresh` rewrites citations to HEAD SHA — not implemented at M1, stub with `NotImplementedError`.

Edge: SHA length 7 (minimum) vs 40 (full) both accepted.

### Task 9: Check 4 — bidirectional backlinks *(HARD)*

For every module page `wiki/modules/<mod>.md`, feature page `wiki/features/<feat>.md`, and platform page `wiki/platform/<pkg>.md`, verify the matching entry file (`apps/server_core/internal/modules/<mod>/module.go` or equivalent, `packages/feature-<feat>/src/index.{ts,tsx}`, `apps/server_core/internal/platform/<pkg>/<pkg>.go`) contains `// wiki: wiki/<kind>/<name>.md` OR `{/* wiki: wiki/<kind>/<name>.md */}` in the first 20 lines.

Resolve entry file via convention list. If conventional file does not exist, warn (not hard-fail) and emit `path="<wiki-page>"` so the finding carries a location.

Edge: TypeScript vs Go vs YAML comment syntaxes.

### Task 10: Check 5 — contract drift *(HARD)*

For each `wiki/modules/<mod>.md`:
1. Parse `## Transport` section → extract `(method, path)` pairs from markdown tables or code fences.
2. Load `contracts/api/marketplace-central.openapi.yaml`, collect paths tagged `x-mpc-module: <mod>` (fallback: URL prefix heuristic `/api/<mod>/**`).
3. Diff: symmetric difference must be empty.

At M1 there are no module pages, so this check returns `[]` for a clean repo — still implement + test via fixtures under `check_05/`.

### Task 11: Check 6 — staleness *(HARD)*

**Strictly git-history based — never filesystem ctime/mtime.** Two sub-rules:

1. **Commit-distance drift.** For each wiki page `W` and its mapped source paths `S = resolve(W)`:
   - `src_commit = git rev-list -1 main -- <s>` for each `s ∈ S` → latest commit touching source.
   - `wiki_commit = git rev-list -1 main -- <W>` → latest commit touching wiki page.
   - `distance = git rev-list --count <wiki_commit>..<src_commit> -- <S>` → number of source commits after wiki page's last update.
   - Fail if `distance > 2`.
2. **Verified-date drift (scope-relative).** Parse `last_verified` frontmatter. Compute `scope_latest_ts = max(git log -1 --format=%ct -- <s> for s in S ∪ {W})` — the most recent commit timestamp touching the page itself OR any of its mapped source paths. Fail iff `scope_latest_ts - parse_date(last_verified) > 30 days`. Never compare against `HEAD` globally — unrelated commits to other modules must not mark a page stale.

Both sub-rules use Git commit timestamps and commit counts exclusively — portable across Windows/Linux/CI. No `stat`, no `os.path.getmtime`, no filesystem ctime.

Escape valve: if PR description contains `[wiki-exempt: <reason>]`, skip sub-rule 1 for that PR and append `wiki-exempt: <reason>` to `wiki/log.md` (lint verifies the append happened). Sub-rule 2 is never exempt.

### Task 12: Check 7 — log entry presence *(HARD)*

If PR diff (`ctx.changed_files`) contains any `wiki/**` entry, `wiki/log.md` diff must contain at least one added line matching `^## \[\d{4}-\d{2}-\d{2}\] .+ — .+$`.

### Task 13: Check 8 — index freshness *(HARD)*

Run `python -m tools.wiki.index --check`. If regeneration output differs from committed `wiki/index.md`, fail. Implementation calls Task 18's generator in dry-run mode.

### Task 14: Check 9 — orphans *(WARN)*

For each wiki page except `index.md`, `log.md`, `CONTEXT_MAP.md`, and pages with `status: stub`, check at least one other wiki page references it via `related:` or `depends_on:`. No inbound references → emit WARN.

### Task 15: Check 10 — stub escape on touch *(HARD)*

For each changed code path, resolve via path_map to wiki pages. If any resolved page has `status: stub` AND is not modified in this PR with `status: active` AND all required sections populated → fail.

### Task 16: Check 11 — wiki scope *(HARD)*

Compute:
- `E` = pages resolved directly via `path_map` from `ctx.changed_files`.
- `A` = `E ∪ {p.related | p ∈ E} ∪ {p.depends_on | p ∈ E}` (1-hop).
- `M` = wiki pages modified in `ctx.changed_files`.

Fail iff `M \ A ≠ ∅`.

**Escape-valve signal source (deterministic):**
- **CI / GitHub Actions context** (env `GITHUB_ACTIONS=true` + `GITHUB_EVENT_PATH` present): read PR description from `jq -r .pull_request.body < $GITHUB_EVENT_PATH` and scan for `[wiki-scope: ...]`. Authoritative.
- **Local / pre-push context** (no `GITHUB_ACTIONS`): scan for `[wiki-scope: ...]` in the most recent commit's trailer block (`git log -1 --format=%B`) — developer adds it via `git commit -m "... [wiki-scope: page — reason]"` or as a trailer line. If neither env nor trailer supplies the tag, Check 11 **degrades to WARN** with the actionable message: *"Run in CI (PR description) or add `[wiki-scope: ...]` trailer to the commit to get HARD enforcement."*
- Explicit CLI override for CI scripts: `--pr-description-file <path>` (already in Task 5) wins over both.

Sub-rule (anti-gaming): if any page's `depends_on` or `related` list shrank in this PR AND that page contributed to `A` computation, that shrinkage requires its own `[wiki-scope]` justification from the signal sources above. Same degradation rule applies locally.

### Task 17: Check 12 — rename/move invariants *(HARD)*

Run `git diff --find-renames -M50% <base>..HEAD`. For every rename whose source or destination is under `apps/`, `packages/`, `contracts/`, `raw/`:
1. `tools/wiki/path_map.yaml` must have a diff in this PR.
2. If old path matches `apps/server_core/migrations/<NNNN>_*.sql`, `wiki/_meta/migration-module.json` must also diff.
3. Case-only renames (`Foo.go`→`foo.go`) always trigger rule 1 regardless of OS case sensitivity.

**Per-task Verify (repeated for each of Tasks 6–17):**
```bash
python -m unittest tools.wiki.tests.test_check_NN_<name> -v
python -m tools.wiki.lint --json   # still clean on empty repo
```
Expected: all fixtures pass; empty-repo lint exit 0.

**Per-task commit message:** `feat(wiki): lint check NN — <name>`

**Parallel dispatch instruction (from orchestrator):**
> Dispatch 12 subagent tasks concurrently after Task 5 lands. Each subagent implements one check per the section above. Orchestrator waits for all 12 to return before proceeding to Task 17b. If any check fails review, re-dispatch only that check.

---

## Task 17b: Convergence — integrate parallel checks *(Claude, sequential after 6–17)*

**Goal:** Normalize the 12 independently-implemented checks into one coherent suite. Catches integration drift that isolated per-check tests cannot see.

**Files:**
- Modify: `tools/wiki/lint.py` (check registry)
- Create: `tools/wiki/tests/test_integration.py`

**Acceptance Criteria:**
- [ ] Check discovery order is **deterministic and documented**: checks run in numeric order 1 → 12, registered by explicit import list in `lint.py` (not filesystem iteration). Registry verified by test.
- [ ] All 12 check modules import `Finding` and `LintContext` from `common` with identical type signatures — test asserts each `run(ctx)` callable accepts `LintContext` and returns `list[Finding]`.
- [ ] `Finding.check` field uses canonical names `frontmatter`, `sections`, `citations`, `backlinks`, `contract-drift`, `staleness`, `log-entry`, `index-fresh`, `orphans`, `stub-escape`, `wiki-scope`, `rename-invariants` (no prefix/suffix variants). Test scans all fixtures and asserts names match the canonical set.
- [ ] No duplicate utility helpers — any helper appearing in ≥2 check modules with the same signature gets moved to `common.py` in this task.
- [ ] Full-suite runtime under 5s on current (empty) wiki: `time python -m tools.wiki.lint --json` → wall time < 5000ms on CI runner. Captured in `test_integration.py` with `pytest-style` timing or `time.monotonic()` budget assertion.
- [ ] `test_integration.py` runs the full `python -m unittest discover tools/wiki/tests` suite and asserts 0 failures, then runs `python -m tools.wiki.lint --json` on a synthetic well-formed fixture repo and asserts `findings == []`.
- [ ] **Exit-code adapter tests:** integration test invokes the three call sites (`make wiki-lint`, `bash tools/wiki/hooks/pre-commit`, `bash tools/wiki/hooks/pre-push`) against four canned lint outcomes (clean=0, HARD=1, WARN=2, infra=3) — each call site mocked by injecting a stub `tools/wiki/lint.py` that exits with the target code. Assertions:
  - `make wiki-lint`: 0→exit 0, 1→exit 0 (advisory), 2→exit 0 (advisory), 3→exit 3 (infra block).
  - `pre-commit`: 0→exit 0, 1→exit 0 (advisory), 2→exit 0 (advisory), 3→exit 1 (infra block).
  - `pre-push`: 0→exit 0, 1→exit 1 (HARD block), 2→exit 0 (advisory), 3→exit 3 (infra block).
  - Workflow step simulated via `bash -c "continue-on-error equivalent"` — 0/1/2 continue, 3 fails the step.

**Verify:**
```bash
python -m unittest tools.wiki.tests.test_integration -v
time python -m tools.wiki.lint --json
```
Expected: test passes; wall time < 5s.

**Steps:**

- [ ] **Step 1:** Open each `tools/wiki/checks/check_NN_*.py`. Grep for repeated helper functions (anything defined locally that does path resolution, frontmatter parsing, git shelling, markdown section extraction). List duplicates.

- [ ] **Step 2:** Move every duplicate into `common.py` with a single canonical signature. Update all 12 checks to import from `common`. Run `python -m unittest discover tools/wiki/tests -v` after each consolidation.

- [ ] **Step 3:** In `lint.py`, replace any filesystem-based check discovery with an explicit registry:

```python
from tools.wiki.checks import (
    check_01_frontmatter, check_02_sections, check_03_citations,
    check_04_backlinks, check_05_contract_drift, check_06_staleness,
    check_07_log_entry, check_08_index_fresh, check_09_orphans,
    check_10_stub_escape, check_11_wiki_scope, check_12_rename_invariants,
)

CHECKS = [
    check_01_frontmatter, check_02_sections, check_03_citations,
    check_04_backlinks, check_05_contract_drift, check_06_staleness,
    check_07_log_entry, check_08_index_fresh, check_09_orphans,
    check_10_stub_escape, check_11_wiki_scope, check_12_rename_invariants,
]
```

- [ ] **Step 4:** Author `test_integration.py` covering: canonical names set equals actual `Finding.check` names across all fixtures; registry order 1→12; runtime budget < 5s on empty tree.

- [ ] **Step 5:** Commit.

```bash
rtk git add tools/wiki/lint.py tools/wiki/checks tools/wiki/tests/test_integration.py
rtk git commit -m "refactor(wiki): consolidate check helpers + deterministic registry + runtime budget test"
```

---

## Task 18: `tools/wiki/index.py` generator *(Codex gpt-5.3-codex medium)*

**Goal:** Regenerate `wiki/index.md` from frontmatter of every `wiki/**/*.md`.

**Files:**
- Create: `tools/wiki/index.py`
- Create: `tools/wiki/tests/test_index.py`

**Acceptance Criteria:**
- [ ] `python -m tools.wiki.index` rewrites `wiki/index.md` from scratch.
- [ ] `python -m tools.wiki.index --check` exits 0 if committed file matches, 1 otherwise.
- [ ] Groups pages by `kind`, sorts by `title`, badges `status`, flags `last_verified` older than 30 days with `⚠ stale`.
- [ ] `GENERATED` marker preserved at top.
- [ ] Empty sections print `_No pages yet._`.
- [ ] Test covers: happy path (few pages), stale flagging, empty kind sections.

**Verify:**
```bash
python -m tools.wiki.index --check
python -m unittest tools.wiki.tests.test_index -v
```
Expected: both exit 0.

**Steps:**

- [ ] **Step 1 (Codex prompt):** *"Implement `tools/wiki/index.py` + tests per plan Task 18. Stdlib only. Reuse `parse_frontmatter` from `tools.wiki.checks.common`. Output deterministic (stable sort, stable headings). `--check` mode diffs regenerated content vs file on disk and returns exit 1 on mismatch, printing unified diff."*

- [ ] **Step 2:** Write files.

- [ ] **Step 3:** Run generator against current wiki (only `SCHEMA.md`, `CONTEXT_MAP.md` exist as pages with frontmatter; `index.md` and `log.md` excluded from discovery).

```bash
python -m tools.wiki.index
python -m tools.wiki.index --check
```
Expected: first rewrites, second passes.

- [ ] **Step 4:** Commit.

```bash
rtk git add tools/wiki/index.py tools/wiki/tests/test_index.py wiki/index.md
rtk git commit -m "feat(wiki): index.py generator + freshness flag"
```

---

## Task 19: Makefile targets *(Claude)*

**Goal:** Standard entry points `make wiki-lint`, `make wiki-index`, `make setup-hooks`, `make wiki-audit`.

**Files:**
- Modify: `Makefile`

**Acceptance Criteria:**
- [ ] `make wiki-lint` runs `python -m tools.wiki.lint` and propagates exit code.
- [ ] `make wiki-index` runs `python -m tools.wiki.index`.
- [ ] `make setup-hooks` creates symlinks `.git/hooks/pre-commit → ../../tools/wiki/hooks/pre-commit` and same for `pre-push` (idempotent; existing symlinks replaced, existing non-symlink files refused with clear error).
- [ ] `make wiki-audit` prints `M5 target — not implemented yet` and exits 0.
- [ ] Targets listed in `.PHONY`.

**Verify:**
```bash
make wiki-lint
make wiki-index
make setup-hooks && test -L .git/hooks/pre-commit && test -L .git/hooks/pre-push
make wiki-audit
```
Expected: first three exit 0, symlinks present; fourth prints placeholder and exits 0.

**Steps:**

- [ ] **Step 1:** Append to `Makefile`:

```makefile
.PHONY: wiki-lint wiki-index setup-hooks wiki-audit

wiki-lint:
	@python -m tools.wiki.lint; code=$$?; \
	  if [ $$code -ge 3 ]; then echo "[infra] wiki-lint tool crashed (exit=$$code)" >&2; exit $$code; fi; \
	  if [ $$code -eq 1 ]; then echo "[advisory] wiki-lint HARD findings present (M1 warn-only)"; exit 0; fi; \
	  if [ $$code -eq 2 ]; then echo "[advisory] wiki-lint WARN findings present"; exit 0; fi; \
	  exit 0

wiki-index:
	python -m tools.wiki.index

setup-hooks:
	@for h in pre-commit pre-push; do \
	  src=$$(pwd)/tools/wiki/hooks/$$h; \
	  dst=.git/hooks/$$h; \
	  if [ -e "$$dst" ] && [ ! -L "$$dst" ]; then \
	    echo "refuse: $$dst exists and is not a symlink"; exit 1; \
	  fi; \
	  ln -sfn "$$src" "$$dst"; \
	  chmod +x "$$src"; \
	  echo "linked $$dst -> $$src"; \
	done

wiki-audit:
	@echo "M5 target — not implemented yet"
```

- [ ] **Step 2:** Run targets, verify.

- [ ] **Step 3:** Commit.

```bash
rtk git add Makefile
rtk git commit -m "feat(wiki): Makefile targets wiki-lint/wiki-index/setup-hooks/wiki-audit"
```

---

## Task 20: Git hooks (pre-commit WARN, pre-push HARD) *(Claude — parallel with Task 21)*

**Goal:** Local enforcement — pre-commit warns, pre-push blocks.

**Files:**
- Create: `tools/wiki/hooks/pre-commit`
- Create: `tools/wiki/hooks/pre-push`

**Acceptance Criteria:**
- [ ] Both files start with `#!/usr/bin/env bash` + `set -euo pipefail`.
- [ ] `pre-commit` runs `python -m tools.wiki.lint --json`, on exit 1 prints WARN banner and exits 0 (non-blocking), on exit 0/2 exits 0 silently.
- [ ] `pre-push` runs `python -m tools.wiki.lint`, propagates non-zero exit (blocking).
- [ ] Executable bit set.
- [ ] Hooks skip cleanly when python or `tools/wiki/lint.py` missing (`command -v python` check).

**Verify:**
```bash
bash tools/wiki/hooks/pre-commit && echo "pre-commit ok"
bash tools/wiki/hooks/pre-push && echo "pre-push ok"
```
Expected: both exit 0 on clean repo.

**Steps:**

- [ ] **Step 1:** Write `tools/wiki/hooks/pre-commit`. Exit-code semantics: lint emits **0 = clean**, **1 = policy HARD fail**, **2 = policy WARN only**, **any other non-zero = infra error** (parser crash, import failure, malformed YAML, missing check module). Pre-commit treats 0/1/2 as advisory (prints banner, exits 0). Infra errors (other codes) block the commit so the developer fixes the tool.

```bash
#!/usr/bin/env bash
set -euo pipefail
if ! command -v python >/dev/null 2>&1; then exit 0; fi
if [ ! -f "tools/wiki/lint.py" ]; then exit 0; fi

python -m tools.wiki.lint --json >/tmp/wiki-lint.json 2>/tmp/wiki-lint.err
code=$?
case $code in
  0) exit 0 ;;
  1) echo "⚠ wiki-lint HARD findings (advisory at pre-commit — blocks on pre-push)" >&2
     echo "   run 'make wiki-lint' to see details" >&2
     exit 0 ;;
  2) echo "⚠ wiki-lint WARN findings (advisory)" >&2
     exit 0 ;;
  *) echo "✗ wiki-lint INFRA ERROR (exit=$code) — the linter itself crashed" >&2
     cat /tmp/wiki-lint.err >&2
     echo "   fix tools/wiki/ before committing" >&2
     exit 1 ;;
esac
```

Update `tools/wiki/lint.py` (Task 5) to ensure parser crashes, import failures, and malformed `path_map.yaml` exit with code ≥ 3, not 1 or 2.

- [ ] **Step 2:** Write `tools/wiki/hooks/pre-push`:

```bash
#!/usr/bin/env bash
set -uo pipefail
if ! command -v python >/dev/null 2>&1; then
  echo "wiki-lint: python not found — skipping" >&2; exit 0
fi
if [ ! -f "tools/wiki/lint.py" ]; then exit 0; fi
python -m tools.wiki.lint
code=$?
# pre-push is the HARD gate at M1: block on policy HARD (1) AND infra errors (>=3).
# WARN (2) is advisory, does not block push.
case $code in
  0) exit 0 ;;
  1) echo "✗ wiki-lint HARD findings — fix or push blocked" >&2; exit 1 ;;
  2) echo "⚠ wiki-lint WARN findings (advisory)" >&2; exit 0 ;;
  *) echo "✗ wiki-lint INFRA ERROR (exit=$code) — linter crashed" >&2; exit $code ;;
esac
```

- [ ] **Step 3:** `chmod +x tools/wiki/hooks/pre-commit tools/wiki/hooks/pre-push`.

- [ ] **Step 4:** Commit.

```bash
rtk git add tools/wiki/hooks/pre-commit tools/wiki/hooks/pre-push
rtk git commit -m "feat(wiki): git hooks pre-commit (warn) + pre-push (hard)"
```

---

## Task 21: `.claude/hooks.json` PostToolUse entry *(Claude — parallel with Task 20)*

**Goal:** Claude Code suggests `/wiki-ingest` after Bash `git commit`.

**Files:**
- Modify or create: `.claude/hooks.json`

**Acceptance Criteria:**
- [ ] `PostToolUse` entry matches tool `Bash` with command prefix `git commit` and emits a message: `"Run /wiki-ingest if this commit touched mapped code paths."`
- [ ] Existing hook entries preserved.
- [ ] JSON valid.

**Verify:**
```bash
python -c "import json; json.load(open('.claude/hooks.json'))"
grep -q "wiki-ingest" .claude/hooks.json
```
Expected: no error, grep matches.

**Steps:**

- [ ] **Step 1:** Read existing `.claude/hooks.json` (or create if missing). Insert:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "condition": "command contains 'git commit'",
        "message": "Run /wiki-ingest if this commit touched mapped code paths (apps/, packages/, contracts/, raw/)."
      }
    ]
  }
}
```

(Merge with existing structure if file already exists.)

- [ ] **Step 2:** Validate + commit.

```bash
python -c "import json; json.load(open('.claude/hooks.json'))"
rtk git add .claude/hooks.json
rtk git commit -m "feat(wiki): Claude PostToolUse hook suggests /wiki-ingest after commits"
```

---

## Task 22: `/wiki-ingest` skill *(Claude)*

**Goal:** Skill that Claude invokes to perform the ingest op per spec § Data Flow — Ingest.

**Files:**
- Create: `.claude/skills/wiki-ingest/SKILL.md`

**Acceptance Criteria:**
- [ ] Frontmatter: `name: wiki-ingest`, `description: Use when committing code that maps to wiki pages — updates wiki same-PR`.
- [ ] Body encodes the 5-step ingest flow, the 3 hard constraints (allowed set `A` only, canonical citations only, PR HEAD SHA), and the log append rule.
- [ ] Body references `wiki/SCHEMA.md` as the full manual to read if ambiguity.

**Verify:**
```bash
test -s .claude/skills/wiki-ingest/SKILL.md
head -3 .claude/skills/wiki-ingest/SKILL.md | grep -q "name: wiki-ingest"
```

**Steps:**

- [ ] **Step 1:** Author the skill file:

```markdown
---
name: wiki-ingest
description: Use when committing code that maps to wiki pages — updates the wiki in the same PR. Required when the PR touches apps/, packages/, contracts/, or raw/ paths that resolve through tools/wiki/path_map.yaml.
---

# Wiki Ingest

## When to use
PR diff touches any path matched by `tools/wiki/path_map.yaml`. Triggered manually (`/wiki-ingest`) or suggested by the Claude PostToolUse hook after `git commit`.

## Protocol

1. Read `wiki/SCHEMA.md` end-to-end. It is the authoritative manual.
2. Compute the allowed set `A`:
   - Run `git diff --name-only <base>..HEAD` → changed files.
   - For each, resolve via `tools/wiki/path_map.yaml` → set `E`.
   - Expand with 1-hop `related` + `depends_on` from each page's frontmatter → set `A`.
3. For each page in `A`:
   - Re-verify every grounded section against the current code.
   - Update any drift.
   - Rewrite citations to canonical `path:line-range@sha` using the PR HEAD SHA (`git rev-parse HEAD`).
   - Update `last_verified` frontmatter field to today.
4. Append a `wiki/log.md` entry per changed page: `## [YYYY-MM-DD] <page> — <action>` + 1–3 bullets.
5. Commit wiki changes in the SAME PR as the code change.

## Hard constraints

- Edit only pages in `A`. Drift in other pages → append `drift-spotted: <page>` to `log.md`, stop.
- Every normative claim MUST cite `path:line-range@sha`. Bare paths invalid.
- SHA is the PR HEAD SHA at ingest time.
- Before committing, run `make wiki-lint` and fix any hard-fail.

## Escape valves

- `[wiki-exempt: <reason>]` in PR description → skip staleness check 6 (use sparingly).
- `[wiki-scope: <pages> — <reason>]` in PR description → whitelist pages outside `A`.
Both are logged by lint.

## Failure handling

If lint blocks on a check you disagree with, either fix the wiki or open a separate PR to `tools/wiki/` or `wiki/SCHEMA.md` — never bypass with hook skip flags. The CODEOWNERS gate is the semantic backstop; do not rely on it to catch mechanical errors you could fix yourself.
```

- [ ] **Step 2:** Commit.

```bash
rtk git add .claude/skills/wiki-ingest/SKILL.md
rtk git commit -m "feat(wiki): /wiki-ingest skill for same-PR wiki updates"
```

---

## Task 23: `.github/CODEOWNERS` *(Claude — parallel with Task 24)*

**Goal:** Assign wiki paths to `@leandrotcawork` for codeowner review.

**Files:**
- Create or modify: `.github/CODEOWNERS`

**Acceptance Criteria:**
- [ ] File contains `wiki/**       @leandrotcawork`, `tools/wiki/**       @leandrotcawork`, `.github/workflows/wiki-lint.yml       @leandrotcawork`.
- [ ] Existing CODEOWNERS entries preserved.

**Verify:**
```bash
grep "^wiki/\*\*" .github/CODEOWNERS
grep "^tools/wiki/\*\*" .github/CODEOWNERS
```
Expected: both match.

**Steps:**

- [ ] **Step 1:** Read existing `.github/CODEOWNERS` (create if missing). Append:

```
# LLM Wiki — semantic backstop past mechanical lint
wiki/**                               @leandrotcawork
tools/wiki/**                         @leandrotcawork
.github/workflows/wiki-lint.yml       @leandrotcawork
brain/decisions/004-llm-wiki-adopted.md  @leandrotcawork
```

- [ ] **Step 2:** Commit.

```bash
rtk git add .github/CODEOWNERS
rtk git commit -m "feat(wiki): CODEOWNERS gate on wiki/** and tools/wiki/**"
```

- [ ] **Step 3:** Configure branch protection **in this task, not as follow-up**. Without this, CODEOWNERS is advisory and the governance gate does not actually block merges.

Run (requires `gh` authenticated as repo admin):

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  repos/leandrotcawork/marketplace-central/branches/main/protection \
  -F required_pull_request_reviews.require_code_owner_reviews=true \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F required_pull_request_reviews.dismiss_stale_reviews=true \
  -F required_status_checks.strict=true \
  -F required_status_checks.contexts[]="wiki-lint / lint" \
  -F enforce_admins=false \
  -F restrictions= \
  -F allow_force_pushes=false \
  -F allow_deletions=false
```

- [ ] **Step 4:** Verify branch protection.

```bash
gh api repos/leandrotcawork/marketplace-central/branches/main/protection \
  --jq '.required_pull_request_reviews.require_code_owner_reviews, .required_status_checks.contexts'
```
Expected: `true` on first line; `["wiki-lint / lint"]` on second. If the `wiki-lint` context doesn't exist yet (Actions first runs after this PR), append it via separate `gh api` call once the workflow has run once.

- [ ] **Step 5:** Document the branch-protection change in the PR description under `Ops changes:` section so reviewers know settings changed.

---

## Task 24: GitHub Actions `wiki-lint.yml` (warn-only) *(Claude — parallel with Task 23)*

**Goal:** CI runs lint on every PR; warn-only at M1, flipped to hard-block at M3.

**Files:**
- Create: `.github/workflows/wiki-lint.yml`

**Acceptance Criteria:**
- [ ] Workflow triggers on `pull_request` and `push` to `main`.
- [ ] Runs `python -m tools.wiki.lint --json` + `python -m unittest discover tools/wiki/tests`.
- [ ] Uses `continue-on-error: true` on the lint step at M1 (warn-only).
- [ ] Uploads `wiki-lint-findings.json` as artifact.
- [ ] Python 3.11 on ubuntu-latest.

**Verify:**
```bash
python -c "import yaml" 2>/dev/null || pip install pyyaml --quiet
python -c "
import re
txt = open('.github/workflows/wiki-lint.yml').read()
assert 'continue-on-error: true' in txt
assert 'tools.wiki.lint' in txt
assert 'unittest discover' in txt
print('ok')
"
```
Expected: `ok`.

**Steps:**

- [ ] **Step 1:** Write `.github/workflows/wiki-lint.yml`:

```yaml
name: wiki-lint
on:
  pull_request:
    paths:
      - "wiki/**"
      - "tools/wiki/**"
      - "apps/**"
      - "packages/**"
      - "contracts/**"
      - "raw/**"
      - ".github/workflows/wiki-lint.yml"
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # lint checks need full history for SHA validation
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Run wiki-lint (warn-only for policy at M1, hard-fail on infra errors)
        id: lint
        run: |
          set +e
          python -m tools.wiki.lint --json > wiki-lint-findings.json
          code=$?
          cat wiki-lint-findings.json
          # 0=clean, 1=policy HARD (advisory at M1), 2=policy WARN, >=3=infra error (block).
          if [ $code -ge 3 ]; then
            echo "::error::wiki-lint infra error (exit=$code) — linter crashed"
            exit $code
          fi
          if [ $code -eq 1 ]; then
            echo "::warning::wiki-lint HARD findings present (advisory at M1)"
          fi
          exit 0
      - name: Run unit tests
        run: python -m unittest discover tools/wiki/tests -v
      - name: Upload findings
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: wiki-lint-findings
          path: wiki-lint-findings.json
```

- [ ] **Step 2:** Commit.

```bash
rtk git add .github/workflows/wiki-lint.yml
rtk git commit -m "feat(wiki): GitHub Actions wiki-lint (warn-only at M1)"
```

---

## Task 25: M1 Definition-of-Done verification *(Claude)*

**Goal:** Confirm every M1 DoD from spec passes before PR.

**Files:** (no changes — verification only)

**Acceptance Criteria:**
- [ ] `make wiki-lint` runs clean (exit 0) on current tree.
- [ ] `python -m unittest discover tools/wiki/tests -v` — all tests pass.
- [ ] `make wiki-index --check` passes.
- [ ] `make setup-hooks` idempotent (runs twice, same result).
- [ ] `.git/hooks/pre-commit` and `.git/hooks/pre-push` symlinks exist.
- [ ] `brain/decisions/004-llm-wiki-adopted.md` committed.
- [ ] ADR-004 linked from `wiki/SCHEMA.md`.
- [ ] GitHub Actions workflow runs on the PR and the `wiki-lint-findings` artifact is uploaded. DoD is **not** "green status" (warn-only workflow is always green) — it is: artifact downloaded, parsed, and contains **zero HARD-severity findings** on the PR diff. Verify:
  ```bash
  gh run download <run-id> -n wiki-lint-findings
  python -c "import json; f=json.load(open('wiki-lint-findings.json')); hard=[x for x in f['findings'] if x['severity']=='hard']; assert not hard, hard"
  ```
- [ ] Claude sees `/wiki-ingest` skill: run `ls .claude/skills/wiki-ingest/SKILL.md` and confirm file is non-empty with correct frontmatter.

**Verify:**
```bash
make wiki-lint && \
python -m unittest discover tools/wiki/tests -v && \
python -m tools.wiki.index --check && \
make setup-hooks && make setup-hooks && \
test -L .git/hooks/pre-commit && test -L .git/hooks/pre-push && \
test -f brain/decisions/004-llm-wiki-adopted.md && \
grep -q "004-llm-wiki-adopted" wiki/SCHEMA.md
```
Expected: all pass, exit 0.

**Steps:**

- [ ] **Step 1:** Run all verify commands above. Fix any failure inline (do not skip).

- [ ] **Step 2:** Push branch, open PR, confirm GitHub Actions `wiki-lint` job runs and uploads artifact.

- [ ] **Step 3:** Squash merge. Log final `wiki/log.md` entry `## [YYYY-MM-DD] M1 — scaffolding merged` in a follow-up commit on `main` (one-time bootstrap exception to the same-PR rule, allowed only for M1 merge).

- [ ] **Step 4:** Update `IMPLEMENTATION_PLAN.md` — add row for M2 Seed Pages with link to upcoming plan file `docs/superpowers/plans/2026-04-??-llm-wiki-m2-seed.md`.

```bash
rtk git commit -am "docs(plan): add M2 row to IMPLEMENTATION_PLAN.md"
```

---

## Self-Review Summary

**Spec coverage:**
- M1 DoD items (tree, SCHEMA, tools, Makefile, hooks.json, ingest skill, CODEOWNERS, workflow, ADR) — all mapped.
- All 12 lint checks from spec § Error Handling — Tasks 6–17.
- Ingest op 5-step protocol — Task 22 SKILL.md body.
- Escape valves `[wiki-exempt]` + `[wiki-scope]` — Tasks 11 (Check 6) + 16 (Check 11).
- Path map → Task 4.
- Progressive gate (warn at M1) → Task 24 `continue-on-error: true`.

**Placeholder scan:** None (`make wiki-audit` intentionally stub per spec M5 gate; SKILL body references SCHEMA for overflow, not placeholder).

**Type consistency:** `Finding`, `LintContext`, `run(ctx)`, `parse_frontmatter`, `load_path_map` identical across Tasks 5–17.

**Known deferrals (explicit, not drift):**
- M2 populates `CONTEXT_MAP.md` + three module pages (separate plan).
- M3 flips workflow `continue-on-error` to `false` + adds Check 10 activation (separate plan — Check 10 code ships at M1, activation flag flips at M3).
- M5 revisits `[wiki-exempt]`, semantic-evidence lint, auto-draft agent, audit cron.

---

## Codex Hardening Round

Next step after this plan commits: send plan to `mcp__codex__codex` (gpt-5.4 with gpt-5.3-codex fallback, reasoning_effort=high), mode=COVERAGE, JSON verdict. Apply local fixes inline; one structural revision max.
