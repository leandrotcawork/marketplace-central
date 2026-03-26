# Claude + Codex Collaboration Workflow Request

## Purpose

This document explains what we want from a shared Claude + Codex workflow for this repository.

The goal is not to rebuild the full ForgeFlow plugin inside Codex.

The goal is to make sure we can:

1. Keep implementing features even when Claude is unavailable because of session limits.
2. Switch between Claude and Codex without losing context, decisions, lessons, or implementation history.
3. Use Claude for planning/orchestration and Codex for implementation support and review.
4. Preserve a durable repo-based record so neither agent depends on chat memory.

---

## Why We Want This

Right now the problem is practical:

- Sometimes Claude reaches the session limit and cannot continue.
- When that happens, we still want to keep coding directly with Codex in this repository.
- Later, when Claude is available again, we want Claude to understand exactly:
  - what was implemented
  - why it was implemented that way
  - what remains open
  - what should become memory / lessons / brain updates

We do not want the work to fragment across chats.
We do not want important decisions to live only in conversation history.
We do not want to repeat analysis every time we switch tools.

The workflow we want must survive:

- Claude session limits
- long-running features
- partial implementations
- interrupted sessions
- planning in one tool and implementation/review in another

---

## What We Do Not Want

We do **not** want to port the entire ForgeFlow orchestration model into Codex.

Specifically, we are **not** trying to recreate all of this inside Codex:

- full brain-task automation
- hook-driven lifecycle behavior
- complex routing/circuit breaker logic
- deep multi-agent orchestration
- fake session state that drifts from reality

That would add a lot of ceremony and still drift from the actual repo state.

We want a thinner, more durable collaboration model.

---

## What We Do Want

We want a workflow where Claude and Codex can both operate against the same project truth.

That shared truth should come from the repository itself, not from chat memory.

Candidate sources of truth:

1. The actual codebase
2. Git history and git diffs
3. `.brain/hippocampus/*` for high-level project constitution
4. Task-scoped markdown handoff documents
5. Focused lesson / sinapse proposals when something reusable is learned

This means Codex should be able to:

- read the project constitution
- implement or review changes
- write a durable handoff for Claude
- record lessons or patterns worth keeping

And Claude should be able to:

- read those handoffs
- continue implementation or planning
- update memory/brain artifacts appropriately
- ask Codex to review the plan or the implementation decisions

---

## Real Use Cases We Need To Support

### Use Case 1: Claude Session Limit Reached

1. Claude was working on a feature.
2. Claude session limit is reached.
3. We continue the task directly with Codex.
4. Codex implements part or all of the feature.
5. Codex writes a durable handoff inside the repo.
6. Later, Claude resumes from that handoff with minimal friction.

### Use Case 2: Claude Plans, Codex Reviews the Plan

1. Claude creates a plan for a feature.
2. We bring that plan to Codex in this chat.
3. Codex critiques the plan, identifies gaps, risks, drift, and implementation issues.
4. We send that review back to Claude.
5. Claude revises the plan.

### Use Case 3: Claude Implements, Codex Reviews the Changes

1. Claude implements changes.
2. We come back to Codex and ask for a rigorous review.
3. Codex evaluates:
   - code quality
   - architectural fit
   - conventions
   - verification gaps
   - whether the chosen workflow is working well

### Use Case 4: Codex Implements Alone

1. Claude is unavailable.
2. We ask Codex to implement a feature directly.
3. Codex should still leave enough durable context so Claude can later understand:
   - what happened
   - what changed
   - what remains
   - what should be promoted into the brain

---

## Important Current Reality

This repo already has a `.brain/` directory and active implementation history, but some of the tracked state is likely stale or incomplete.

Examples of the type of problem we want to avoid:

- `.brain/working-memory` can reflect an interrupted session rather than the actual current truth
- old specs can drift from the codebase
- implementation may exist in code without a corresponding task-completion record
- chat history may know more than the repository, which is not durable enough

Because of that, the workflow should treat these as primary:

1. actual code
2. actual git diff / commits
3. durable handoff documents

And these as secondary/supporting:

1. `.brain/working-memory/*`
2. older specs that may be outdated
3. session-local state files

In other words: **repo truth must beat chat truth**.

---

## Candidate Direction To Evaluate

The current best idea is a **thin Codex bridge**, not a second brain system.

### Core idea

- Keep `.brain/hippocampus/*` as the shared constitution.
- Keep git diff / commit history as the factual implementation record.
- Add one durable handoff markdown per task.
- Use `.brain` for curated memory outputs only, not as a fragile full session runtime for Codex.

### Candidate artifact model

#### 1. Shared constitution

Codex and Claude should both read first:

- `.brain/hippocampus/architecture.md`
- `.brain/hippocampus/conventions.md`
- relevant task spec under `docs/superpowers/specs/`

#### 2. Task handoff documents

Create a durable task file, for example:

`docs/superpowers/handoffs/{task_id}.md`

This should contain:

- task goal
- current status
- what changed
- files changed
- verification performed
- decisions made
- open issues
- next best step
- candidate lessons / sinapse updates

#### 3. Curated memory outputs

Keep using `.brain` for things that should persist as project knowledge:

- `.brain/progress/activity.md`
- `.brain/lessons/inbox/*.md`
- proposed sinapse updates

#### 4. Git diff as required context

Any handoff between Claude and Codex should explicitly reference:

- the relevant diff or commit range
- the changed files
- anything not yet committed but present in the working tree

---

## What We Need You (Claude) To Help Design

We want you to propose a concrete workflow for this repository that satisfies the goals above.

Please design the workflow around the reality that:

- Claude may be unavailable due to session limits
- Codex may need to continue implementation directly
- we still want lessons, memory, and task continuity
- we want Codex to review plans and implementation decisions

### Specifically, we want you to propose:

1. A minimal but robust shared workflow between Claude and Codex
2. Which files should be canonical shared artifacts
3. Which `.brain` files should remain important, and which should not be relied on for cross-session truth
4. A handoff file structure and template
5. When Claude should update brain artifacts
6. When Codex should update handoff artifacts
7. How to use git diffs as part of the handoff/resume flow
8. How to detect and handle stale specs or stale brain state
9. How to run planning with Claude and review with Codex
10. How to run implementation with Claude or Codex and keep both tools aligned

---

## Constraints For The Plan

Please design the plan with these constraints:

### 1. Keep it lightweight

Avoid excessive ceremony.
If the workflow is too heavy, we will stop using it.

### 2. Prefer durable artifacts over runtime state

Use repo files, diffs, and concise handoff docs.
Do not rely on implicit chat memory.

### 3. Respect the existing brain

Do not discard `.brain`.
Instead, decide how it should be used responsibly and where it should not be over-trusted.

### 4. The codebase must remain the source of truth

If a spec or state file disagrees with the code, the plan must tell us how to resolve that safely.

### 5. Codex must be useful even without Claude

The workflow cannot assume Claude is always available.

### 6. Codex should be able to review both:

- the proposed workflow itself
- future feature plans and implementations

---

## Request About Codex's Role

After you propose the workflow, we plan to bring the plan back to Codex in this current chat.

At that point, Codex will review:

1. whether the workflow is technically sound
2. whether it is lightweight enough to use consistently
3. whether it protects context and reduces drift
4. whether it fits this repo's current structure
5. what risks remain

So please make the workflow concrete enough that it can be reviewed rigorously.

---

## Recommended Planning Output

Please return a structured plan with sections like:

1. Summary
2. Recommended operating model
3. Canonical artifacts
4. Handoff file format
5. Claude responsibilities
6. Codex responsibilities
7. Feature lifecycle examples
8. Memory / lesson / sinapse policy
9. Rules for resuming interrupted work
10. Initial rollout plan

---

## Strong Preference

A strong candidate answer would likely favor:

- a thin shared artifact workflow
- a durable task handoff file
- explicit use of git diff as factual context
- limited, intentional use of `.brain`
- no attempt to fully clone ForgeFlow behavior inside Codex

But we want your best judgment after reviewing the repo state.

---

## Final Ask

Please analyze this repository and propose the best practical workflow for using both Claude and Codex together without losing context.

The most important requirement is this:

> If Claude becomes unavailable, we must be able to continue coding in Codex and later return to Claude without losing track of what we did, why we did it, and what the brain should remember.

That is the real problem to solve.
