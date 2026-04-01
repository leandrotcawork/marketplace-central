# Co-Brainstorming Skill Redesign

## Goal

Rewrite the `co-brainstorming` skill to behave like `brainstorming` — asking clarifying questions, exploring the domain with the user, and producing a full spec — with Codex as a silent advisor consulted at two inflection points to enrich the option set and validate the final design.

## Problem With the Current Skill

The current skill skips directly into a protocol (Design Brief → Opus proposes → Codex challenges → 4-line verdict). It never asks clarifying questions, produces no spec, and leaves the user with a decision instead of a design. Codex is only used to challenge a pre-formed proposal, not to expand the search space or surface approaches Opus might miss.

## Architecture

The new skill is `brainstorming` with Codex inserted at two inflection points:

1. **After clarifying questions close** — Codex enriches the approach set before the user sees any options
2. **After design approval** — Codex validates the full design before the spec is written

No gate check. Always runs when invoked. Codex never speaks to the user directly — Opus absorbs Codex output and presents only what is worth surfacing. The user sees a single-line note ("Checking with Codex…") when each call happens.

## Full Flow

```
1. Explore project context (files, docs, recent commits)
2. Clarifying questions — one at a time until domain is understood
3. "Checking with Codex…" → Call 1: enrich approach set
4. Present 2-3 enriched approaches + recommendation
5. User picks direction
6. Present design sections, get approval per section
7. "Checking with Codex…" → Call 2: validate full design
8. Surface Codex findings if NEEDS_ATTENTION; user decides whether to adjust
9. Write spec to docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md, commit
10. Spec self-review (placeholder scan, consistency, scope, ambiguity) — fix inline
11. Ask user to review the written spec
12. Invoke writing-plans
```

## Codex Interaction Design

### Call 1 — Approach Enrichment

Triggered after clarifying questions close, before presenting options to the user.

**Input to Codex:** compressed problem context + Opus's internally drafted 2-3 approaches.

**Prompt:** "What approaches are missing or underweighted here? Return JSON only."

**Expected response:**
```json
{
  "missing_approaches": ["..."],
  "underweighted_risks": ["..."],
  "confidence": 0.0
}
```

**Opus behavior:** Fold anything valuable into the presented options. If Codex adds nothing new, still show the "Checking with Codex…" note but do not pad the output.

### Call 2 — Design Validation

Triggered after the user approves the design, before writing the spec.

**Input to Codex:** full agreed design.

**Prompt:** "What is the highest-risk assumption or missing constraint in this design? Return JSON only."

**Expected response:**
```json
{
  "risks": ["..."],
  "missing_constraints": ["..."],
  "verdict": "READY | NEEDS_ATTENTION",
  "confidence": 0.0
}
```

**Opus behavior:**
- `READY` → proceed to spec writing immediately
- `NEEDS_ATTENTION` → present findings to user, ask whether to adjust design before writing spec

## Spec Output

Identical format to brainstorming:

```
# [Topic] Design

## Goal
## Architecture
## Components
## Data Flow
## Error Handling
## Testing Approach
## Out of Scope
```

Saved to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, committed to git.

After writing: run self-review (placeholder scan, consistency, scope, ambiguity), fix inline, then ask the user to review before proceeding.

## Transition

After user approves the spec → invoke `writing-plans`. No other skill is invoked.

## What This Skill Is Not

- Not a challenge protocol — Codex enriches and flags, it does not veto
- Not gate-checked — always runs when invoked
- Not a decision-delivery tool — produces a full spec, not a 4-line verdict
- Codex never speaks to the user directly

## Differences From `brainstorming`

| | brainstorming | co-brainstorming (new) |
|---|---|---|
| Codex involvement | None | Two focused calls |
| Option set | Opus-only | Opus + Codex-enriched |
| Design validation | None | Codex validates before spec write |
| Codex visibility | N/A | Single-line note per call |
| Output | Full spec | Full spec |
| Gate | None | None |
| Transition | writing-plans | writing-plans |

## Out of Scope

- Codex writing any part of the spec
- Codex communicating directly with the user
- More than two Codex calls per session
- Replacing brainstorming for topics where Codex adds no value (purely UX/product questions)
