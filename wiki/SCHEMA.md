# Wiki Schema

**Spec:** `docs/superpowers/specs/2026-04-17-llm-wiki-design.md` — this file is the operating manual; the spec is the rationale.

**ADR:** `brain/decisions/004-llm-wiki-adopted.md`

This file is authoritative for wiki authorship. When spec and this file conflict, update BOTH in the same PR.

---

## Purpose

The Marketplace Central wiki captures the **present state** of the codebase in a form that both Claude and humans can load to reorient without re-reading the source tree. It compounds knowledge across sessions, never drifts more than one merged PR behind the code, and resolves concrete organizational pain (module overlap across `marketplaces`, `integrations`, and `connectors`) by serving as the single map of bounded contexts.

The wiki is an artifact with three layers, three operations, and one strict enforcement contract. It does **not** replace ADRs, design specs, or the `brain/` folder — it cross-links them. Its scope is strictly the "as it is today" slice of the system; future plans belong in `IMPLEMENTATION_PLAN.md` and `brain/roadmap.json`.

Concretely, a page in this wiki must be good enough that a fresh Claude session (or a new engineer) can:

1. Load `wiki/index.md` and `wiki/CONTEXT_MAP.md`.
2. Follow 1-hop `depends_on` / `related` links from the relevant module/flow page.
3. Begin making correct, grounded changes **without** re-reading the code.

If a wiki page cannot satisfy that loop, it is defective and must be fixed before new work continues.

## Layers

The wiki is structured into three layers. Each layer has distinct mutability and ownership rules.

### Layer 1 — `raw/`

Immutable external sources: marketplace API PDFs, OpenAPI dumps from vendors, signing specifications, vendor SDK snapshots, provider console screenshots, RFCs, public docs.

- Never edited after ingest. Corrections happen by adding a new dated source, never by rewriting.
- Git LFS for files larger than 100KB.
- Organized under `raw/marketplaces/<provider>/`, `raw/rfcs/`, `raw/assets/`.
- The wiki itself is forbidden from mutating any file under `raw/`.

### Layer 2 — `wiki/`

LLM-maintained synthesis of the codebase. Present-tense only. Every claim cites either an `apps|packages|contracts|raw|tools/...` anchor or a `raw/...` source.

- Folders: `modules/`, `features/`, `flows/`, `marketplaces/`, `platform/`, `contracts/`.
- Top-level files: `index.md`, `log.md`, `SCHEMA.md` (this file), `CONTEXT_MAP.md`.
- Meta: `wiki/_meta/migration-module.json` maps migration numbers to owning modules.

### Layer 3 — Governance

Governance lives in two places:

- `AGENTS.md` carries a short rule that fires every session (read the plan, read architecture, read wiki when editing).
- `wiki/SCHEMA.md` (this file) carries the full operating manual, loaded only when editing wiki content.

Relationship to adjacent documents — all preserved and cross-linked rather than absorbed:

| Document | Role | Relation to wiki |
|---|---|---|
| `wiki/` | Present state | — |
| `IMPLEMENTATION_PLAN.md` | Future roadmap | Wiki links plan items; plan links wiki for definitions |
| `brain/roadmap.json` | Task-level tracking | Untouched |
| `brain/system-pulse.md` | Project pulse + session state | Untouched |
| `brain/decisions/` | ADRs | Wiki pages cite relevant ADRs by ID |
| `docs/superpowers/specs/` | Design specs | Cross-linked from the wiki page each spec describes |
| `docs/marketplaces/` | Legacy per-marketplace notes | Migrates during M2 into `raw/` + `wiki/marketplaces/` |

### Frozen invariants

- The wiki never mutates `raw/`.
- The wiki never duplicates ADR or spec content; it links.
- The wiki never describes future state.
- Every frontmatter field is mandatory — missing = lint fail.
- Every normative claim in a grounded section carries a canonical citation `path:line-range@sha`.

## Page kinds

Six kinds, one folder each. Every page shares the frontmatter contract in the next section and satisfies a per-kind required-section list.

| Kind | Folder | Target count | Naming |
|---|---|---|---|
| module | `wiki/modules/` | 1 per directory under `apps/server_core/internal/modules/` | `<module>.md` |
| feature | `wiki/features/` | 1 per `packages/feature-*` | `<feature>.md` |
| flow | `wiki/flows/` | Curated: oauth, fee-sync, pricing-simulation, publish-vtex, tenant-isolation, session-lifecycle | `<flow>.md` |
| marketplace | `wiki/marketplaces/` | 1 per provider (vtex, mercado_livre, shopee, magalu, amazon, leroy_merlin, madeira_madeira) | `<provider>.md` |
| platform | `wiki/platform/` | 1 per directory under `apps/server_core/internal/platform/` | `<pkg>.md` |
| contract | `wiki/contracts/` | Fixed: `openapi.md`, `sdk-runtime.md` | fixed |

A page must match exactly one kind. New kinds require an ADR and an update to this file in the same PR.

## Frontmatter contract

Every `wiki/**/*.md` page except `index.md`, `log.md`, and `_attic/**` must start with this YAML block. All nine keys are mandatory.

```yaml
---
kind: module | feature | flow | marketplace | platform | contract
title: <short title>
status: active | foundation | planned | deprecated | transitional | stub
owners: [<agent-id>, <human-handle>]
since: YYYY-MM-DD
last_verified: YYYY-MM-DD
depends_on: [<wiki page refs>]
related: [<wiki page refs>]
sources: [<raw/ or apps|packages|contracts|tools/ paths>]
---
```

Field rules:

- **`kind`** — one of the six enum values. Determines the required-section list.
- **`title`** — short human label, used by `wiki/index.md` for sort and display.
- **`status`** — enum:
  - `active`: populated, verified, in use.
  - `foundation`: cross-cutting platform page (e.g. tenancy, auth) that rarely changes.
  - `planned`: reserved page for work called out in `IMPLEMENTATION_PLAN.md` but not yet implemented. Not permitted to carry citations to non-existent code.
  - `deprecated`: slated for removal; see Deprecation flow below.
  - `transitional`: actively mid-migration (e.g. during a module split).
  - `stub`: placeholder page; see Stub lifecycle below.
- **`owners`** — YAML list; **must contain at least one agent identity AND at least one human handle**. Example: `[claude, leandro]`. Lint fails if either is missing.
- **`since`** — date the page was first created, `YYYY-MM-DD`.
- **`last_verified`** — date of the most recent ingest pass that re-confirmed every citation and section. Updated automatically by `/wiki-ingest`.
- **`depends_on`** — pages whose content this page builds on. Consumed by the query operation (1-hop load) and by the scope lint check.
- **`related`** — pages that are useful companion reading but not strict dependencies. Also consumed for 1-hop expansion.
- **`sources`** — the set of canonical `raw/` and code paths this page is grounded in. At minimum one entry.

Empty lists must be rendered as `[]`, never omitted.

## Required sections per kind

Each kind has a fixed section list. Headings must appear in the listed order, as level-2 (`## `) headings. Section bodies may not be blank; use `_N/A — <one-line justification>_` when a section genuinely does not apply.

**module**
1. Purpose
2. Scope — In
3. Scope — Out
4. Key entities
5. Ports
6. Adapters
7. Transport
8. Data model
9. Flows referenced
10. Gotchas
11. Related wiki
12. Sources

**feature**
1. Purpose
2. UI surface
3. State & data deps
4. Components
5. Key UX states
6. Gotchas
7. Related wiki
8. Sources

**flow**
1. Actors
2. Trigger
3. Step-by-step sequence
4. Failure modes
5. Idempotency / retry
6. Observability
7. Related wiki
8. Sources

**marketplace**
1. Provider summary
2. Auth flow
3. Supported capabilities
4. API endpoints used
5. Fee schedule source
6. Quirks
7. Open issues
8. Raw references
9. Related wiki

**platform**
1. Purpose
2. Public API
3. Consumers
4. Gotchas
5. Related wiki
6. Sources

**contract**
1. Surface
2. Generation / hand-written status
3. Change policy
4. Consumers
5. Related wiki
6. Sources

Sections grouped under a "grounded" heading — Key entities, Ports, Adapters, Transport, Data model for modules; Components and State & data deps for features; Step-by-step sequence and Failure modes for flows; Public API for platform; Surface for contract — must each carry **at least one** canonical citation (see next section).

## Citation rules

Every normative claim in a grounded section must be backed by a canonical code anchor.

**Canonical form:** `path:line-range@sha`

- `path` is repo-relative and starts with one of `apps/`, `packages/`, `contracts/`, `raw/`, or `tools/`.
- `line-range` is `N` or `N-M` (1-indexed, inclusive).
- `sha` is a 7–40 character hex commit SHA, reachable from `main` at the time of the PR.

**Regex the linter applies:**

```
(apps|packages|contracts|raw|tools)/[^\s:@)]+:\d+(-\d+)?@[0-9a-f]{7,40}
```

**Example citations:**

```
apps/server_core/internal/modules/pricing/application/service.go:42-88@a1b2c3d
packages/feature-integrations/src/pages/RuntimeHub.tsx:12-30@9f8e7d6
contracts/api/marketplace-central.openapi.yaml:210-244@a1b2c3d
```

Bare paths (`apps/...:42`), branch refs (`@main`), and line numbers without an SHA are all lint failures.

**Three validators run during `make wiki-lint` (Check 3):**

1. **Existence** — `git cat-file -e <sha>:<path>` confirms the path exists at that SHA.
2. **Line bounds** — `git cat-file -p <sha>:<path>` is read in-memory and the linter confirms the requested line range is within the file's line count.
3. **Reachability** — `git merge-base --is-ancestor <sha> HEAD` confirms the SHA is reachable from the current HEAD.

During ingest, `make wiki-citations --refresh` rewrites citations to the PR's HEAD SHA. This utility is only run by `/wiki-ingest`; never hand-edit a SHA to "keep up."

## Operations

The wiki supports three operations, all enforced mechanically.

### Ingest

Triggered on every PR that modifies tracked paths. Claude runs the `/wiki-ingest` skill. The 5-step protocol:

1. Read the git diff between PR base and HEAD.
2. For each changed file, resolve affected wiki pages via `tools/wiki/path_map.yaml` plus 1-hop `depends_on` and `related` from those pages' frontmatter. This is the **allowed set `A`**.
3. For each page in `A`: read the current page and the changed code; re-verify every grounded section against the code; update any drift; set `last_verified` to today; rewrite citations to the current `path:line-range@sha` form via `make wiki-citations --refresh`.
4. Append a `wiki/log.md` entry (see Lint check 7 for format).
5. Commit the wiki changes in the **same PR** as the code change.

**Three hard constraints on the ingest skill:**

1. Edit **only** pages in the allowed set `A`. Do not touch unrelated pages even if drift is spotted — instead, append a `drift-spotted: <page>` line to `wiki/log.md` and stop.
2. Every normative claim must cite `path:line-range@sha`. Bare paths are invalid.
3. The SHA used for citations must be the PR's HEAD SHA at ingest time — not `main`, not a historical SHA.

**Allowed set `A` formal definition:** given the PR diff, resolve each changed code path through `path_to_page` in `tools/wiki/path_map.yaml` to produce the expected set `E`. Expand `E` with 1-hop `depends_on` and `related` edges from each page's frontmatter to produce `A`. `A ⊇ E` always. The scope linter (Check 11) rejects any PR whose actually-modified wiki pages `M` satisfy `M \ A ≠ ∅`.

### Query

Two entry points.

**Human via Obsidian** — open `wiki/index.md`, navigate by kind or status. The index is auto-generated from frontmatter.

**Claude session start** (adapted `nexus-orient`):

1. Read `wiki/index.md`.
2. Read `wiki/CONTEXT_MAP.md`.
3. For task topic `T`, read `wiki/modules/<T>.md` if applicable and `wiki/flows/<T>.md` if cross-cutting.
4. Read all pages referenced in `depends_on` or `related` from those pages (1 hop).
5. Do **not** re-read the codebase to orient. If any relevant page has `status != active` OR `last_verified` older than 14 days, note staleness, then either read code directly or trigger ingest first.

If Claude discovers during a task that the wiki is wrong, the correction lands in the **same PR** as the task work.

### Lint

`make wiki-lint` runs `tools/wiki/lint.py`, Python standard library only, target runtime under 5 seconds. Exit codes: `0` pass, `1` hard fail, `2` warn. JSON output via `make wiki-lint --json` for Claude consumption. See the Lint checks section for the full rule set.

## Lint checks

`make wiki-lint` runs twelve checks. Unless marked WARN, each is a hard block. Every failure message carries a machine-readable prefix `[check-name]`, a precise location, and a fix hint.

1. **Check 1 — Frontmatter presence + required fields (HARD):** every `wiki/**/*.md` except `index.md`, `log.md`, and `_attic/**` carries the full frontmatter with all nine keys present and well-formed.
2. **Check 2 — Section presence per kind (HARD):** page section list matches its `kind` template exactly. Blank bodies fail; `_N/A — reason_` markers pass.
3. **Check 3 — Citation canonical form + anchor validation (HARD):** every grounded section contains at least one citation matching the canonical regex, and the three validators (existence, line bounds, reachability) succeed.
4. **Check 4 — Bidirectional backlinks (HARD):** every module, feature, and platform entry file carries `// wiki: wiki/<kind>/<name>.md` in its first 20 lines. Lint verifies both comment presence and that the target exists and matches `path_map.yaml`.
5. **Check 5 — Contract drift (HARD):** for each module page, count unique `(method, path)` pairs in `## Transport`, compare against OpenAPI paths tagged `x-mpc-module: <module>` (fallback: URL prefix). Mismatch fails; OpenAPI is the source of truth.
6. **Check 6 — Staleness (HARD):** for each page, the max ctime of resolved source paths must not exceed the page's own ctime by more than one merged PR window (approximated as > 2 commits on `main`). `last_verified` older than 30 days also fails.
7. **Check 7 — Log entry presence (HARD):** any PR diff touching `wiki/**` must add at least one new `## [YYYY-MM-DD] <page> — <action>` entry to `wiki/log.md`, with 1–3 bullets.
8. **Check 8 — Index freshness (HARD):** `make wiki-index --check` regenerates `wiki/index.md` and fails if the regeneration differs from the committed file.
9. **Check 9 — Orphan detection (WARN):** a page with no inbound `related` or `depends_on` reference (excluding `index.md`, `log.md`, `CONTEXT_MAP.md`, and stubs) emits a warning.
10. **Check 10 — Stub escape on touch (HARD):** if a PR touches code that resolves (via `path_map.yaml`) to a wiki page with `status: stub`, the PR must transition that page out of stub state by populating every required section.
11. **Check 11 — Wiki scope (HARD):** resolve PR code changes to expected set `E`, expand to allowed set `A` via 1-hop `depends_on`/`related`, collect actually-modified wiki pages as `M`. If `M \ A ≠ ∅`, fail. Sub-rule: if any page's `depends_on`/`related` list shrinks in the PR AND that page participated in computing `A`, the reduction itself requires `[wiki-scope]` justification (anti-gaming).
12. **Check 12 — Rename / move invariants (HARD):** `git diff --find-renames -M50%` is run against the PR. Any rename whose source or destination is under `apps/`, `packages/`, `contracts/`, or `raw/` requires a corresponding update to `tools/wiki/path_map.yaml` and, where applicable, `wiki/_meta/migration-module.json`, in the same PR. Case-only renames (`Foo.go → foo.go`) always require a path-map update regardless of filesystem case sensitivity.

## Escape valves

Two PR-description tokens grant narrow, logged exceptions. Both are recorded to `wiki/log.md` automatically by the linter.

- **`[wiki-exempt: <reason>]`** — skips Check 6 (staleness) for the current PR only. Use when the code change is intentionally non-semantic (e.g. whitespace-only, dependency bump). The reason is free-form but must be human-readable.
- **`[wiki-scope: <pages> — <reason>]`** — whitelists explicitly named pages for Check 11 (scope) or the anti-gaming sub-rule. Use when a legitimate multi-page edit cannot be expressed through the `depends_on`/`related` graph. `<pages>` is a comma-separated list of `wiki/...` paths.

**Signal source for PR description:**

- **CI context:** the linter reads `$GITHUB_EVENT_PATH` and extracts `.pull_request.body`.
- **Local context:** the linter reads the latest commit trailer (`git log -1 --format=%B`).
- **Neither available:** Check 6 and Check 11 degrade to **WARN** instead of failing, so that hand-run `make wiki-lint` on a feature branch without commits yet never hard-blocks authoring.

Escape valves are emergency exits, not workflow tools. M5 tightens or removes `[wiki-exempt]` entirely.

## Ownership and rotation

The `owners` frontmatter field **must** contain at least one agent identity and at least one human handle. Examples:

- `owners: [claude, leandro]`
- `owners: [claude, leandro, felipe]`

**Why both:** the agent owner is accountable for mechanical freshness (ingest correctness, citation validity). The human owner is accountable for semantic correctness (does the prose actually match reality) and is the codeowner gate for merges under `wiki/**`.

**Rotation triggers** — the owners list must be updated when:

- A human on the list changes roles or leaves the project.
- An agent identity is retired (e.g. we stop using a given Claude model family as the ingest agent) or replaced.
- A page's subject area is handed off to a different team member.

Rotation is a regular PR touching only the frontmatter; it must still pass every lint check. `.github/CODEOWNERS` assigns `wiki/**` paths to the current human codeowner; when human owners rotate, CODEOWNERS is updated in the same PR as the frontmatter.

## Deprecation flow

Pages are never deleted in a single step. The lifecycle is:

1. **`active` → `deprecated`** — the page's frontmatter `status` flips to `deprecated`. The `## Purpose` section gains a leading paragraph of the form `_This page is deprecated as of YYYY-MM-DD. Successor: <wiki path or "none">. Rationale: <one sentence>._` A `wiki/log.md` entry records the transition.
2. **Minimum 30 days in `deprecated`** — the page remains readable, linter still enforces Checks 1–4 and 7. Other pages may keep links so long as they pass lint.
3. **`deprecated` → removed** — after at least 30 days, the page may be deleted. On removal, a **tombstone entry** is appended to `wiki/log.md`:

   ```
   ## [YYYY-MM-DD] wiki/modules/<name>.md — removed
   - Deprecated since YYYY-MM-DD.
   - Successor: <wiki path or "none">.
   - Final SHA: <commit SHA of the last version>.
   ```

   Any page that still referenced the removed page in `depends_on` or `related` must drop the reference in the same PR; failure to do so trips Check 11.

A page cannot be force-removed early. If the underlying code is deleted before the 30-day clock runs out, the page transitions through `deprecated` anyway — the clock is about signaling, not about preserving dead code.

## Stub lifecycle

`status: stub` marks a placeholder page. A stub carries valid frontmatter and a non-empty `## Purpose` section. All remaining required sections appear as `_N/A — stub_`.

**Who may start as a stub:** only `wiki/CONTEXT_MAP.md` (during M2 before full population) and first-draft pages created during M3's stub-scaffolding pass. New pages created after M3 must enter as `status: active` or `status: planned`, never as `stub`.

**Populating a stub is forced by Check 10.** When a PR touches code that `path_map.yaml` resolves to a stub page, the PR **must** transition that page out of stub state by:

1. Filling every required section for the page's `kind` with real, grounded content.
2. Adding at least one canonical citation per grounded section.
3. Flipping `status` from `stub` to `active` (or `foundation` / `transitional` if appropriate).
4. Setting `last_verified` to the current date.
5. Adding a `wiki/log.md` entry.

Stubs are not "drafts to polish later." They exist so that the path map resolves cleanly on day one, and they self-heal the moment they become load-bearing. A stub that has been `status: stub` for more than 90 days with no triggering code activity is an orphan; `make wiki-audit` (M5) flags these for review.
