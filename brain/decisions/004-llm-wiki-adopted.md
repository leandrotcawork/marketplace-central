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
