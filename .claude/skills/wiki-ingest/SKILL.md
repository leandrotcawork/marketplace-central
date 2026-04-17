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

If lint blocks on a check you disagree with, fix the wiki or open a separate PR to `tools/wiki/` or `wiki/SCHEMA.md` — never bypass with hook skip flags. The CODEOWNERS gate is the semantic backstop.
