---
name: implementation-audit
description: Use when a spec-driven implementation is materially complete and needs a final Codex audit against the original spec, plan, and quality bar before marking work done or opening a PR.
---

# Implementation Audit

## Purpose

This is a **post-execution audit gate**.

It audits the implementation against **intent**:

* spec
* plan
* expected quality bar

It identifies:

* missing requirements
* correctness risks
* architecture weaknesses
* justified improvements

---

## Model Requirement

This audit must **always run through Codex via MCP**.

### Default

* model: `gpt-5.4`
* reasoning: `high`

### Fallback

* model: `gpt-5.2-codex`
* reasoning: `high`

### Rule

* Do NOT run without Codex
* If unavailable → stop and inform the user

---

## Trigger

Do NOT run automatically.

Suggest after execution:

> Execution is complete. Do you want a full implementation audit? It will check spec compliance, plan compliance, code correctness, architecture quality, and improvement opportunities.

---

## Preconditions

Run only if:

* execution is complete
* diff or changed files exist
* Codex is available

Skip if:

* trivial change
* no implementation artifact
* user declines

---

## Review Bundle

Collect:

### Required

* changed files / diff
* spec (if available)
* plan (if available)
* tests (if available)

### Rule

Do NOT use raw conversation history.

---

## Audit Order

### 1. Spec Compliance

* requirements implemented?
* missing / partial work?
* scope creep?

### 2. Plan Compliance

* tasks followed?
* shortcuts?
* incomplete steps?

### 3. Code Correctness

* bugs
* null/type risks
* validation gaps
* error handling
* edge cases
* test gaps

### 4. Architecture Quality

* complexity
* bad boundaries
* coupling
* scalability risks
* brittle contracts
* backend leaking into frontend
* poor separation of concerns

### 5. Improvements

* quick wins
* cleanup
* refactors

---

## Severity

* [CRITICAL]
* [MAJOR]
* [MINOR]
* [SUGGESTION]

---

## Verdict

* PASS
* PASS_WITH_ISSUES
* FAIL

### Rules

* PASS → no CRITICAL or MAJOR
* PASS_WITH_ISSUES → MAJOR exists
* FAIL → any CRITICAL

A clean audit is allowed. Do not invent issues.

---

## Output

### Header

```
## Implementation Audit
Date: YYYY-MM-DD
Spec: ...
Plan: ...
Files: ...
Scope: ...
Model: ...
```

### Sections

* Verdict
* Executive Summary
* Findings
* Missing Requirements
* Better Alternatives (only if justified)
* Next Actions

---

## Next Actions

* Must fix now → CRITICAL
* Should fix soon → MAJOR
* Optional → MINOR / SUGGESTION

---

## Round 2

Trigger only if:

* CRITICAL exists
* OR 3+ MAJOR issues

Options:

1. Generate remediation plan
2. Fix issues

Never auto-run.

---

## Rules

### Architecture rule

Only suggest big changes if current design is:

* unsafe
* tightly coupled
* not scalable
* hard to maintain

### Boundaries

Do:

* audit intent vs implementation
* focus on real issues

Do NOT:

* review unrelated code
* suggest rewrites without reason
* nitpick style

---

## Token Discipline

* no spec restating
* no unchanged code summaries
* high signal only
* concise

---

## Principle

This is NOT a code review.

This is an **implementation audit against intent**.

Main question:

> Is this implementation truly complete, correct, and aligned with what we intended to build?
