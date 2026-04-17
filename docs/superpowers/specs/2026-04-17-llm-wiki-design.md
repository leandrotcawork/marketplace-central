# LLM Wiki Design

## Goal

Introduce a Karpathy-style LLM wiki under `/wiki/` that captures the present state of the Marketplace Central codebase so that both Claude and humans can reorient without re-reading the code. The wiki must compound knowledge across sessions, never drift more than one merged PR behind the code, and resolve the current "disorganized" pain (module overlap between `marketplaces`, `integrations`, and `connectors`) as a first concrete deliverable.

The wiki is an artifact with three layers, three operations, and one strict enforcement contract. It does not replace ADRs, specs, or the brain — it cross-links them.

## Architecture

Three layers, repo-local:

1. **Layer 1 — `raw/`**: immutable external sources. Marketplace API PDFs, OpenAPI dumps, signing specifications, vendor SDK snapshots, provider console screenshots, RFCs. Never edited after ingest. Git LFS for files larger than 100KB.
2. **Layer 2 — `wiki/`**: LLM-maintained synthesis. Present-tense only. Every claim cites either a `src/...` code anchor or a `raw/...` source. Folders: `modules/`, `features/`, `flows/`, `marketplaces/`, `platform/`, `contracts/`. Top-level files: `index.md`, `log.md`, `SCHEMA.md`, `CONTEXT_MAP.md`.
3. **Layer 3 — Governance**: `AGENTS.md` carries a short rule that fires every session; `wiki/SCHEMA.md` carries the full operating manual loaded only when editing wiki content.

Relationship to existing documents, all preserved and cross-linked rather than absorbed:

| Document | Role | Relation to wiki |
|---|---|---|
| `wiki/` | Present state of the system | — |
| `IMPLEMENTATION_PLAN.md` | Future roadmap | Wiki links plan items; plan links to wiki pages for definitions |
| `brain/roadmap.json` | Task-level tracking | Untouched |
| `brain/system-pulse.md` | Project pulse and session state | Untouched |
| `brain/decisions/` | ADRs | Wiki pages cite relevant ADRs by ID |
| `docs/superpowers/specs/` | Design specs | Cross-linked from the wiki page each spec describes |
| `docs/marketplaces/` | Existing per-marketplace notes | Migrates during M2: raw portions to `raw/marketplaces/`, synthesis to `wiki/marketplaces/` |

Frozen invariants:

- The wiki never mutates `raw/`.
- The wiki never duplicates ADR or spec content; it links.
- The wiki never describes future state; that belongs in `IMPLEMENTATION_PLAN.md` and `brain/`.
- Every page frontmatter field is mandatory — missing = lint fail.
- Every normative claim in a grounded section carries a canonical citation `path:line-range@sha`.

Directory layout:

```
marketplace-central/
├── raw/
│   ├── marketplaces/{vtex,mercado_livre,shopee,magalu,amazon,leroy_merlin,madeira_madeira}/
│   ├── rfcs/
│   └── assets/
├── wiki/
│   ├── index.md
│   ├── log.md
│   ├── SCHEMA.md
│   ├── CONTEXT_MAP.md
│   ├── modules/
│   ├── features/
│   ├── flows/
│   ├── marketplaces/
│   ├── platform/
│   ├── contracts/
│   └── _meta/migration-module.json
├── tools/wiki/
│   ├── lint.py
│   ├── index.py
│   ├── path_map.yaml
│   └── hooks/{pre-commit,pre-push}
└── .github/{CODEOWNERS,workflows/wiki-lint.yml}
```

## Components

### Page kinds

Six kinds, one folder each. Every page shares a YAML frontmatter contract and has a per-kind required section list.

| Kind | Folder | Page count target | Naming |
|---|---|---|---|
| module | `wiki/modules/` | 1 per dir under `apps/server_core/internal/modules/` | `<module>.md` |
| feature | `wiki/features/` | 1 per `packages/feature-*` | `<feature>.md` |
| flow | `wiki/flows/` | Curated: oauth, fee-sync, pricing-simulation, publish-vtex, tenant-isolation, session-lifecycle | `<flow>.md` |
| marketplace | `wiki/marketplaces/` | 1 per provider | `<provider>.md` |
| platform | `wiki/platform/` | 1 per `apps/server_core/internal/platform/*` | `<pkg>.md` |
| contract | `wiki/contracts/` | `openapi.md`, `sdk-runtime.md` | fixed |

### Shared frontmatter

```yaml
---
kind: module | feature | flow | marketplace | platform | contract
title: <short title>
status: active | foundation | planned | deprecated | transitional | stub
owners: [<agent>, <human>]
since: YYYY-MM-DD
last_verified: YYYY-MM-DD
depends_on: [<wiki page refs>]
related: [<wiki page refs>]
sources: [<raw/ or src/ paths>]
---
```

All keys mandatory. `owners` must contain at least one agent and one human. `status: stub` flags a placeholder page; populating a stub page is forced by Check 10 whenever its mapped code is touched.

### Required sections by kind

**module**: Purpose · Scope — In · Scope — Out · Key entities · Ports · Adapters · Transport · Data model · Flows referenced · Gotchas · Related wiki · Sources.

**feature**: Purpose · UI surface · State & data deps · Components · Key UX states · Gotchas · Related wiki · Sources.

**flow**: Actors · Trigger · Step-by-step sequence · Failure modes · Idempotency / retry · Observability · Related wiki · Sources.

**marketplace**: Provider summary · Auth flow · Supported capabilities · API endpoints used · Fee schedule source · Quirks · Open issues · Raw references · Related wiki.

**platform**: Purpose · Public API · Consumers · Gotchas · Related wiki · Sources.

**contract**: Surface · Generation / hand-written status · Change policy · Consumers · Related wiki · Sources.

Empty sections are allowed only as `_N/A — <one-line justification>_`. Blank body is a lint fail.

### Special files

- **`wiki/index.md`**: catalog of all pages, auto-generated from frontmatter via `make wiki-index`. Groups by `kind`, sorts by `title`, badges `status`, flags pages whose `last_verified` is older than 30 days.
- **`wiki/log.md`**: append-only ingest record. Format `## [YYYY-MM-DD] <page> — <action>` plus 1–3 bullets. Every PR that modifies `wiki/**` must add at least one entry.
- **`wiki/SCHEMA.md`**: full governance doc. Holds purpose, layer definitions, page kinds + frontmatter contract, required sections, citation rules, ops definitions, lint rules, scope rules, ownership rotation, deprecation flow.
- **`wiki/CONTEXT_MAP.md`**: written first during M2. Holds bounded contexts, module-to-domain mapping, the current overlap matrix (`marketplaces × integrations × connectors`), ownership of shared concepts, and ADR links for deferred decisions.

## Data Flow

Three operations, all defined in `wiki/SCHEMA.md`.

### Ingest

Triggered on every PR that modifies tracked paths (see path map below). Claude runs the `/wiki-ingest` skill.

1. Read the git diff between PR base and HEAD.
2. For each changed file, resolve affected wiki pages via the `path_to_page` map plus 1-hop `depends_on` and `related` from those pages' frontmatter. This is the allowed set `A`.
3. For each page in `A`, read the current page and the changed code; re-verify every grounded section against the code; update any drift; update `last_verified` to today; rewrite citations to current `path:line-range@sha` form.
4. Append a `wiki/log.md` entry.
5. Commit the wiki changes in the **same PR** as the code change.

Hard constraints on the ingest skill:

- Edit only pages in `A`. Do not touch unrelated pages even if drift is spotted; instead, append a `drift-spotted: <page>` line to `log.md` and stop.
- Every normative claim must cite `path:line-range@sha`. Bare paths are invalid.
- The SHA used for citations must be the PR's HEAD SHA at ingest time.

### Query

Two entry points.

**Human via Obsidian**: open `wiki/index.md`, navigate by kind or status.

**Claude session start (`nexus-orient` adapted)**:

1. Read `wiki/index.md`.
2. Read `wiki/CONTEXT_MAP.md`.
3. For task topic `T`, read `wiki/modules/<T>.md` if applicable and `wiki/flows/<T>.md` if cross-cutting.
4. Read all pages referenced in `related` or `depends_on` of those pages (1 hop).
5. Do not re-read the codebase to orient. If any relevant page has `status != active` OR `last_verified` older than 14 days, note staleness, then either read code or trigger ingest first.

If Claude discovers the wiki is wrong during a task, the correction MUST land in the same PR as the task work.

### Lint

`make wiki-lint`, implemented in `tools/wiki/lint.py` using only the Python standard library. Target runtime under 5 seconds. Exit codes: `0` pass, `1` hard fail, `2` warn. JSON output available via `--json`.

All checks detailed in the Error Handling section below.

### Hook layers

| Layer | Where | Mode |
|---|---|---|
| L1 | `git pre-commit` (local) | WARN on drift |
| L2 | `git pre-push` (local) | HARD BLOCK via `make wiki-lint` |
| L3 | Claude Code `PostToolUse` on Bash `git commit` | Suggest `/wiki-ingest` |
| L4 | GitHub Actions `wiki-lint.yml` on PR | HARD BLOCK merge |
| L5 | GitHub Action + Claude Agent auto-draft | Deferred, re-evaluated at M5 |

L1 and L2 installed via `make setup-hooks` (idempotent symlinks from `.git/hooks/*` to `tools/wiki/hooks/*`). L3 lives in `.claude/hooks.json`. L4 lives in `.github/workflows/wiki-lint.yml`.

### Path map

Authoritative mapping lives in `tools/wiki/path_map.yaml`. Changes to the map require an ADR.

```yaml
path_to_page:
  "apps/server_core/internal/modules/<mod>/**":
    - wiki/modules/<mod>.md
  "apps/server_core/internal/modules/integrations/application/oauth*.go":
    - wiki/flows/oauth.md
  "apps/server_core/internal/platform/<pkg>/**":
    - wiki/platform/<pkg>.md
  "packages/feature-<name>/**":
    - wiki/features/feature-<name>.md
  "packages/sdk-runtime/**":
    - wiki/contracts/sdk-runtime.md
  "contracts/api/marketplace-central.openapi.yaml":
    - wiki/contracts/openapi.md
  "apps/server_core/migrations/<NNNN>_*.sql":
    - wiki/modules/<resolved via _meta/migration-module.json>.md
  "raw/marketplaces/<p>/**":
    - wiki/marketplaces/<p>.md
```

Auxiliary file `wiki/_meta/migration-module.json` maps migration numbers to module names; lint requires an entry for every migration file.

## Error Handling

`make wiki-lint` runs the following checks. Unless marked WARN, all are hard blocks.

1. **Frontmatter presence + required fields (HARD)** — every `wiki/**/*.md` except `index.md`, `log.md`, and `_attic/**` must carry the shared frontmatter with all keys present.
2. **Section presence per kind (HARD)** — each page's section list matches its `kind` template. Blank bodies fail; `_N/A — reason_` markers pass.
3. **Citation canonical form + anchor validation (HARD)** — every grounded section contains at least one citation matching the regex `(apps|packages|contracts|raw|tools)/[^\s:@)]+:\d+(-\d+)?@[0-9a-f]{7,40}`. The validator then runs `git cat-file -e <sha>:<path>` to confirm the path exists at that SHA, `git cat-file -p` plus `sed` to confirm the line range is in bounds, and `git merge-base --is-ancestor <sha> HEAD` to confirm the SHA is reachable from the current HEAD. Utility: `make wiki-citations --refresh` rewrites citations to HEAD SHA during ingest only.
4. **Bidirectional backlinks (HARD)** — every module, feature, and platform entry file carries `// wiki: wiki/<kind>/<name>.md` in its first 20 lines. Lint verifies both the comment presence and that its target page exists and matches the path map.
5. **Contract drift (HARD)** — for each module page, count unique `(method, path)` pairs in `## Transport`, compare with OpenAPI paths tagged `x-mpc-module: <module>` (fallback: URL prefix). Mismatch fails; OpenAPI is the source of truth.
6. **Staleness (HARD)** — for each wiki page, `max git log ctime` of resolved source paths must not exceed the wiki page's own ctime by more than one merged PR window (approximated as more than 2 commits on `main`). `last_verified` older than 30 days also fails. PR description escape valve: `[wiki-exempt: <reason>]` skips Check 6 for that PR only and is logged to `wiki/log.md`.
7. **Log entry presence (HARD)** — any PR diff touching `wiki/**` must add at least one new `## [YYYY-MM-DD] <page> — <action>` entry to `wiki/log.md`.
8. **Index freshness (HARD)** — `make wiki-index --check` regenerates `index.md` and fails if the regeneration differs from the committed file.
9. **Orphan detection (WARN)** — a page with no inbound `related` or `depends_on` reference (excluding `index.md`, `log.md`, `CONTEXT_MAP.md`, and stubs) emits a warning.
10. **Stub escape on touch (HARD)** — if a PR touches code that resolves to a wiki page with `status: stub`, the PR must transition that page out of stub state by populating every required section.
11. **Wiki scope (HARD)** — given a PR, resolve code changes through `path_to_page` to expected set `E`, expand with 1-hop `depends_on` and `related` to allowed set `A`, collect actual wiki pages modified as `M`. If `M \ A ≠ ∅`, fail. Escape valve: `[wiki-scope: <pages> — <reason>]` in PR description whitelists explicit pages and is logged. Sub-rule: if any page's `depends_on` or `related` list shrinks in the PR AND that page participated in computing `A`, the reduction itself requires `[wiki-scope]` justification to prevent anti-gaming.
12. **Rename / move invariants (HARD)** — lint runs `git diff --find-renames -M50%` against the PR. Any rename whose source or destination path is under `apps/`, `packages/`, `contracts/`, or `raw/` requires a corresponding update to `tools/wiki/path_map.yaml` and, when applicable, `wiki/_meta/migration-module.json`, in the same PR. Case-only renames (`Foo.go → foo.go`) always require path-map update regardless of filesystem case sensitivity.

Every failure message carries a machine-readable prefix (`[check-name]`), a precise location, and a fix hint. `make wiki-lint --json` emits structured output for Claude ingest-op consumption.

Branch protection: `.github/CODEOWNERS` assigns every `wiki/**` path to `@leandro`. GitHub branch protection requires codeowner approval on PRs that touch wiki paths; non-bypassable for merges to `main`. This is the human gate that catches semantically wrong content that passed all mechanical checks.

## Testing Approach

The wiki system itself is tested on three axes.

**Lint rules**: `tools/wiki/tests/test_lint.py` uses Python `unittest` with the standard library only. Each check has a pass fixture, a fail fixture, and an edge-case fixture (for example, `_N/A_` bodies, rename-only PRs, scope-expansion via deps). CI runs tests on every PR to `tools/wiki/**` or `wiki/SCHEMA.md`.

**Path map consistency**: a property test iterates every file under `apps/server_core/internal/modules/**`, `packages/feature-*/**`, `apps/server_core/internal/platform/**`, and `apps/server_core/migrations/**` and asserts that `path_to_page` resolves each to at least one wiki page. Unmapped paths fail.

**End-to-end ingest**: a smoke script runs the `/wiki-ingest` skill against a synthetic PR (golden diff + expected updated wiki output) and diffs the result. Runs only during milestones M1, M3, M5, and on changes to the skill definition.

Lint runtime is benchmarked; a regression beyond 5 seconds on the full repo fails CI as a separate non-blocking check until it crosses 10 seconds, at which point it blocks.

## Rollout

Approach: Seed + Progressive Gate. Five milestones.

### M1 — Scaffolding (1 PR, ~1 day)

- Create `wiki/` and `raw/` directory trees (empty, `.gitkeep`).
- Write `wiki/SCHEMA.md` in full (mirrors this spec's governance content, self-contained).
- Write `wiki/index.md` and `wiki/log.md` headers only.
- Add `tools/wiki/` with `lint.py`, `index.py`, `path_map.yaml`, `hooks/pre-commit`, `hooks/pre-push`, and `tests/`.
- Add Makefile targets: `wiki-lint`, `wiki-index`, `setup-hooks`, `wiki-audit` (stub for M5).
- Add `.claude/hooks.json` `PostToolUse` entry suggesting `/wiki-ingest` after Bash `git commit`.
- Author `.claude/skills/wiki-ingest/SKILL.md` with the hard rules listed in Data Flow — Ingest.
- Seed `.github/CODEOWNERS` with wiki paths assigned to `@leandro` and configure branch protection.
- Add `.github/workflows/wiki-lint.yml` — runs on PR, warn-only at M1.
- Author ADR: "Wiki architecture adopted" (`brain/decisions/004-llm-wiki-adopted.md`).

**DoD**: `make wiki-lint` runs clean on empty tree, CI green, pre-push hook installed, ADR-004 created.

### M2 — Seed pages (3 PRs, ~3–4 days)

- PR-1 `wiki/CONTEXT_MAP.md` — bounded contexts + overlap matrix across all six modules. Resolves the original pain.
- PR-2 `wiki/modules/marketplaces.md` + `wiki/modules/integrations.md` + `wiki/modules/connectors.md` — fully populated with canonical citations. Add `// wiki:` backlinks to the three entry files.
- PR-3 Migrate `docs/marketplaces/*` to `raw/marketplaces/<p>/` (raw vendor content) plus `wiki/marketplaces/<p>.md` stubs (frontmatter + `## Purpose` only; full content arrives via M4).

**DoD**: three module pages + `CONTEXT_MAP.md` pass lint checks 1–5, 7, 8, 11. Overlap resolution either inline in `CONTEXT_MAP` or tracked as an open ADR in `brain/decisions/`.

### M3 — Stub remaining + progressive gate on (1 PR)

- Scaffold stubs for every remaining module, feature, flow, platform, and contract page. Frontmatter plus `## Purpose`; all other sections `_N/A — stub_`. `status: stub`.
- Switch GitHub Actions `wiki-lint.yml` from warn-only to hard-block.
- Add Check 10 (stub escape on touch).
- Update `AGENTS.md`: "If a touched code path maps to a stub wiki page, you MUST fully populate it in the same PR."

**DoD**: every tracked code unit has a wiki page; CI hard-blocks PRs that violate any check.

### M4 — Risk-ordered population (4–8 weeks, natural PR cadence)

No timebox per page. Pages exit stub state during normal work, forced by Check 10. Suggested natural order when no external pressure:

1. `wiki/modules/pricing.md`
2. `wiki/modules/catalog.md`
3. `wiki/contracts/openapi.md`
4. `wiki/contracts/sdk-runtime.md`
5. Flow pages: oauth, fee-sync, pricing-simulation, publish-vtex, tenant-isolation
6. `wiki/marketplaces/*` (full content)
7. Feature pages
8. Platform pages

**DoD per page**: lint checks 1–8, 11, 12 pass; `status: active`; `last_verified` current.

### M5 — Ops hardening (1 PR, after ~50% coverage)

- Tighten Check 6 threshold from 30 days to 14 days.
- Remove or restrict `[wiki-exempt]` PR flag.
- Evaluate L5 (Claude Agent SDK auto-draft) in a spike PR; enable only if lint rejection rate on hand-written wiki content is already below 5% over a 20-PR rolling window.
- Enable `make wiki-audit` as a scheduled monthly job that re-verifies all `active` pages against code and emits a staleness report.
- Evaluate semantic-evidence lint upgrade (see Open Risks below); design if lint rejection and codeowner rework rate justify the cost.

**DoD**: wiki-lint rejection rate under 5%, every module has a fully populated page, zero stubs remain.

### Global Definition of Done

- 100% page coverage; zero stubs.
- Every page `status: active`, `last_verified` within 14 days.
- Zero hard-block lint failures on `main` for 2 consecutive weeks.
- `CONTEXT_MAP.md` overlap decisions resolved inline or tracked as open ADRs.
- `nexus-orient` skill updated to read the wiki first and trust it.
- `docs/marketplaces/` fully migrated and emptied.

## Open Risks

- **Citation laundering (Codex finding #1, accepted as open risk)** — mechanical validation proves a citation is reachable, not that the cited lines semantically support the surrounding prose. Current mitigation: the human codeowner gate. Future mitigation: an M5 spike into NLI or bounded-quote-hash verification per normative claim. Tracked and reviewed at M5 milestone.

## Out of Scope

- Layer 5 auto-draft Claude Agent (revisited at M5 per the gate above).
- Obsidian vault configuration files and plugin presets (users configure their own).
- Public documentation export or publishing (blog, GitHub Pages).
- Multi-repo wiki federation for the future MetalShopping merge.
- Wiki-driven code generation (e.g., generating OpenAPI from wiki pages).
- Semantic-evidence lint using LLM or embedding models (tracked under Open Risks, re-evaluated at M5).

## References

- Karpathy LLM Wiki gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- `AGENTS.md` — engineering rules this design hooks into.
- `ARCHITECTURE.md` — frozen decisions the wiki must not violate.
- `brain/decisions/_index.md` — ADRs cross-linked from wiki pages.
- `IMPLEMENTATION_PLAN.md` — future roadmap that wiki pages cross-link to, never duplicate.
