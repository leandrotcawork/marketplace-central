# Trello Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Codex-only Trello manager skill bundle with one working `Metal Docs` board agent, assisted card writes, and local sprint memory in `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent`.

**Architecture:** The implementation is a skill-first system, not a standalone web app. A top-level `trello-manager` skill routes requests, a reusable `trello-board-agent` skill handles one board at a time, and a `trello-board-bootstrap` skill provisions future board agents. Stable board configuration is versioned in the Trello Agent workspace, while active sprint state remains runtime data.

**Tech Stack:** Codex skills (`SKILL.md`), Markdown prompts/rules, JSON config files, PowerShell validation commands, Trello MCP live checks.

---

## File Structure

The implementation should create or modify these files.

- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\README.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\.gitignore`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\registry.json`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\manager-rules.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\prompts\manager.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\sprints\.gitkeep`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\boards\metal-docs\board-config.json`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\boards\metal-docs\board-rules.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\boards\metal-docs\prompt.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-manager\SKILL.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-board-agent\SKILL.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-board-bootstrap\SKILL.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\templates\board-config.template.json`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\templates\board-rules.template.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\templates\board-prompt.template.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\docs\smoke-test.md`

Design boundaries:

- `agents/trello-manager/*` holds stable manager-owned memory and prompts.
- `agents/boards/*` holds one folder per managed board.
- `skills/*` holds Codex skill implementations.
- `templates/*` holds bootstrap templates for new board-agent folders.
- `agents/trello-manager/sprints/` exists for runtime sprint files and must remain out of version control except for `.gitkeep`.

### Task 1: Scaffold The Trello Agent Workspace

**Files:**
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\README.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\.gitignore`

- [ ] **Step 1: Create the base workspace directories**

```powershell
New-Item -ItemType Directory -Force "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\prompts" | Out-Null
New-Item -ItemType Directory -Force "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\sprints" | Out-Null
New-Item -ItemType Directory -Force "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\boards\metal-docs" | Out-Null
New-Item -ItemType Directory -Force "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-manager" | Out-Null
New-Item -ItemType Directory -Force "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-board-agent" | Out-Null
New-Item -ItemType Directory -Force "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-board-bootstrap" | Out-Null
New-Item -ItemType Directory -Force "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\templates" | Out-Null
New-Item -ItemType Directory -Force "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\docs" | Out-Null
```

- [ ] **Step 2: Write the workspace README**

```markdown
# Trello Agent

Codex-only Trello orchestration workspace.

## Purpose

- one top-level Trello manager skill
- one board agent per managed board
- assisted Trello writes only
- local sprint memory layered over Trello card state

## Layout

- `agents/trello-manager/` - manager memory, prompts, sprint runtime state
- `agents/boards/` - one folder per managed Trello board
- `skills/` - Codex skill implementations
- `templates/` - bootstrap templates for new boards
- `docs/` - smoke tests and operator notes

## First Managed Board

- `Metal Docs`
- workspace: `Projetos Desenvolvimento`
- board id: `69d6468c0adb297e46bbc32a`
```

- [ ] **Step 3: Write `.gitignore` to keep runtime state out**

```gitignore
agents/trello-manager/sprints/active-sprint.json
agents/trello-manager/sprints/*.runtime.json
logs/
tmp/
cache/
snapshots/
```

- [ ] **Step 4: Add a placeholder to keep the sprint directory present**

```text
# runtime sprint files live here
```

- [ ] **Step 5: Verify the scaffold exists**

Run: `Get-ChildItem -Recurse "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent"`

Expected: directory tree shows `agents`, `skills`, `templates`, and `docs`.

- [ ] **Step 6: Commit**

```powershell
git add "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent"
git commit -m "feat(trello): scaffold trello agent workspace"
```

### Task 2: Create Manager Memory And Prompt Files

**Files:**
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\registry.json`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\manager-rules.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\prompts\manager.md`

- [ ] **Step 1: Write the initial board registry**

```json
{
  "version": 1,
  "boards": {
    "metal-docs": {
      "display_name": "Metal Docs",
      "workspace_name": "Projetos Desenvolvimento",
      "workspace_id": "69d644e15e22821f43f6cf0a",
      "board_id": "69d6468c0adb297e46bbc32a",
      "board_path": "agents/boards/metal-docs"
    }
  }
}
```

- [ ] **Step 2: Write manager rules**

```markdown
# Trello Manager Rules

## Operating Mode

- assisted write only
- no archive or delete
- no silent reprioritization
- no cross-board mutation from inferred intent

## Routing

- resolve boards from `registry.json`
- delegate board-local work to the matching board agent
- aggregate board summaries for portfolio requests

## Write Safety

- always call card lookup before create or update
- if multiple plausible cards match, stop and ask
- return a short action log after every write

## Sprint Ownership

- sprint membership is manager-owned runtime state
- board agents interpret sprint cards but never assign sprint membership

## Reconciliation

- if sprint card id is missing, surface it as `missing`
- if sprint card is archived, keep it in history and exclude it from active completion counts
- if sprint card moved boards, surface it as `moved`
```

- [ ] **Step 3: Write the manager prompt**

```markdown
You are the Trello Manager.

Your job is to:
- interpret the user's request
- classify the intent
- resolve the target board from `agents/trello-manager/registry.json`
- load board-local rules and config
- delegate board-local actions to the board agent
- enforce assisted-write safety rules

Supported intents:
- board status
- blocked review
- portfolio summary
- card create
- card update
- sprint create
- sprint add
- sprint status

Never guess on ambiguous writes. Ask instead.
Never mutate multiple boards from one inferred request.
Never archive or delete cards.
```

- [ ] **Step 4: Validate the registry JSON**

Run: `Get-Content "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\registry.json" | ConvertFrom-Json | Out-Null`

Expected: no output and exit code `0`.

- [ ] **Step 5: Commit**

```powershell
git add "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager"
git commit -m "feat(trello): add manager memory and prompt"
```

### Task 3: Define The Metal Docs Board Agent Memory

**Files:**
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\boards\metal-docs\board-config.json`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\boards\metal-docs\board-rules.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\boards\metal-docs\prompt.md`

- [ ] **Step 1: Read Metal Docs lists from Trello and capture their ids**

Run in Codex using Trello MCP: set active board to `69d6468c0adb297e46bbc32a`, then call the list API.

Expected: exact list ids for semantic mapping such as `backlog`, `doing`, `blocked`, and `done`.

- [ ] **Step 2: Write the board config**

```json
{
  "version": 1,
  "board_id": "69d6468c0adb297e46bbc32a",
  "workspace_id": "69d644e15e22821f43f6cf0a",
  "project_slug": "metal-docs",
  "list_map": {
    "backlog": "REPLACE_WITH_BACKLOG_LIST_ID",
    "doing": "REPLACE_WITH_DOING_LIST_ID",
    "blocked": "REPLACE_WITH_BLOCKED_LIST_ID",
    "done": "REPLACE_WITH_DONE_LIST_ID"
  },
  "default_labels": [],
  "reporting": {
    "recent_done_window_days": 7
  },
  "allowed_write_actions": [
    "create_card",
    "add_comment",
    "move_card",
    "set_due_date",
    "update_labels"
  ]
}
```

- [ ] **Step 3: Write board rules**

```markdown
# Metal Docs Board Rules

## Purpose

Track documentation and project-management work for Metal Docs.

## Workflow Semantics

- `backlog` means approved but not started
- `doing` means actively in progress
- `blocked` means cannot move without an external decision or dependency
- `done` means finished and no further immediate action is required

## Reporting

- summarize only high-signal work
- surface blocked items first if any exist
- count recent progress from cards moved to `done` in the last 7 days

## Writes

- prefer updating an existing card over creating a duplicate
- create a new card only if no match is found
- only move to `doing` or `done` when the user explicitly asks or supplies clear progress context
```

- [ ] **Step 4: Write the board prompt**

```markdown
You are the board agent for `Metal Docs`.

Load:
- `board-config.json`
- `board-rules.md`

Your job is to:
- read the current Trello board state
- summarize board health
- find existing cards before writes
- create or update cards according to board rules
- summarize sprint-scoped cards passed in by the manager

You never assign sprint membership yourself.
You never act outside this board.
```

- [ ] **Step 5: Validate the board config JSON**

Run: `Get-Content "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\boards\metal-docs\board-config.json" | ConvertFrom-Json | Out-Null`

Expected: no output and exit code `0`.

- [ ] **Step 6: Commit**

```powershell
git add "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\boards\metal-docs"
git commit -m "feat(trello): add metal docs board agent memory"
```

### Task 4: Implement The `trello-manager` Skill

**Files:**
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-manager\SKILL.md`

- [ ] **Step 1: Write the `trello-manager` skill file**

```markdown
---
name: trello-manager
description: Route Trello requests to one managed board agent, enforce assisted writes, and coordinate sprint state.
---

# Trello Manager

Use this skill when the user asks to:
- inspect project status in Trello
- add or update Trello cards
- review blocked work
- manage sprint membership or sprint summaries

## Inputs

- user request text
- `agents/trello-manager/registry.json`
- `agents/trello-manager/manager-rules.md`
- `agents/trello-manager/prompts/manager.md`

## Flow

1. Classify intent: `board_status`, `blocked_review`, `portfolio_summary`, `create_card`, `update_card`, `sprint_create`, `sprint_add`, or `sprint_status`.
2. Resolve the target board from `registry.json`.
3. Load the board folder for that board.
4. Delegate the board-local operation to `trello-board-agent`.
5. If the request is sprint-related, load runtime sprint state from `agents/trello-manager/sprints/`.
6. Return a concise result and action log.

## Guardrails

- assisted write only
- no archive or delete
- no ambiguous writes
- no cross-board write from inferred intent
```

- [ ] **Step 2: Verify the skill file is present**

Run: `Test-Path "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-manager\SKILL.md"`

Expected: `True`.

- [ ] **Step 3: Commit**

```powershell
git add "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-manager\SKILL.md"
git commit -m "feat(trello): add trello manager skill"
```

### Task 5: Implement The `trello-board-agent` Skill With Structured Contract

**Files:**
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-board-agent\SKILL.md`

- [ ] **Step 1: Write the board-agent skill file**

```markdown
---
name: trello-board-agent
description: Operate on one managed Trello board using board-local config and rules.
---

# Trello Board Agent

Use this skill only after the manager has already resolved the board path.

## Required Inputs

- `agents/boards/<slug>/board-config.json`
- `agents/boards/<slug>/board-rules.md`
- `agents/boards/<slug>/prompt.md`

## Contract

### `find_card(query)`

Input:
```json
{
  "query_text": "retry safety",
  "list_scope": ["backlog", "doing", "blocked"],
  "label_scope": ["backend"],
  "limit": 5
}
```

Output:
```json
{
  "matches": [
    {
      "card_id": "abc123",
      "name": "Improve API retry safety",
      "list_key": "doing",
      "confidence": 0.92
    }
  ],
  "ambiguous": false
}
```

### `create_card(input)`

Input:
```json
{
  "title": "Improve API retry safety",
  "description": "Track retry-safe writes for the pricing flow.",
  "target_list_key": "backlog",
  "labels": ["backend"],
  "due_date": null,
  "checklist_items": []
}
```

Output:
```json
{
  "action": "created",
  "card": {
    "card_id": "abc123",
    "name": "Improve API retry safety",
    "list_key": "backlog",
    "url": "https://trello.com/c/example"
  }
}
```

### `update_card(input)`

Input:
```json
{
  "card_id": "abc123",
  "comment": "Implementation started in current session.",
  "set_due_date": null,
  "move_to_list_key": "doing",
  "labels_to_add": [],
  "labels_to_remove": []
}
```

Output:
```json
{
  "action": "updated",
  "card_id": "abc123",
  "changes": {
    "comment_added": true,
    "moved_to_list_key": "doing"
  }
}
```

### `summarize_sprint_cards(card_ids)`

Input:
```json
{
  "card_ids": ["abc123", "def456"]
}
```

Output:
```json
{
  "active": [],
  "completed": [],
  "blocked": [],
  "missing": [],
  "moved": []
}
```

## Guardrails

- never act outside the resolved board
- never assign sprint membership
- never create a duplicate card without running `find_card` first
```

- [ ] **Step 2: Verify the contract section exists**

Run: `Select-String -Path "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-board-agent\SKILL.md" -Pattern "find_card|create_card|update_card|summarize_sprint_cards"`

Expected: four matches.

- [ ] **Step 3: Commit**

```powershell
git add "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-board-agent\SKILL.md"
git commit -m "feat(trello): add board agent skill contract"
```

### Task 6: Implement The `trello-board-bootstrap` Skill And Templates

**Files:**
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-board-bootstrap\SKILL.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\templates\board-config.template.json`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\templates\board-rules.template.md`
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\templates\board-prompt.template.md`

- [ ] **Step 1: Write the bootstrap skill**

```markdown
---
name: trello-board-bootstrap
description: Register a new managed Trello board by creating board memory files and updating the manager registry.
---

# Trello Board Bootstrap

Use this skill when the user asks to:
- create a board agent
- register a new Trello board
- set up a managed project board

## Required Actions

1. Create `agents/boards/<slug>/`.
2. Create `board-config.json` from template.
3. Create `board-rules.md` from template.
4. Create `prompt.md` from template.
5. Add the board entry to `agents/trello-manager/registry.json`.
6. Optionally inspect Trello and fill list ids.

## Guardrails

- do not overwrite an existing board folder
- do not modify unrelated registry entries
- require a real Trello board id before registration
```

- [ ] **Step 2: Write the board-config template**

```json
{
  "version": 1,
  "board_id": "{{BOARD_ID}}",
  "workspace_id": "{{WORKSPACE_ID}}",
  "project_slug": "{{PROJECT_SLUG}}",
  "list_map": {
    "backlog": "{{BACKLOG_LIST_ID}}",
    "doing": "{{DOING_LIST_ID}}",
    "blocked": "{{BLOCKED_LIST_ID}}",
    "done": "{{DONE_LIST_ID}}"
  },
  "default_labels": [],
  "reporting": {
    "recent_done_window_days": 7
  },
  "allowed_write_actions": [
    "create_card",
    "add_comment",
    "move_card",
    "set_due_date",
    "update_labels"
  ]
}
```

- [ ] **Step 3: Write the board-rules template**

```markdown
# {{DISPLAY_NAME}} Board Rules

## Purpose

Describe what this board tracks.

## Workflow Semantics

- `backlog` means approved but not started
- `doing` means actively in progress
- `blocked` means waiting on an external dependency
- `done` means completed

## Reporting

- define what counts as progress
- define what counts as blocked

## Writes

- prefer update over duplicate create
- only move cards when user intent or board rules clearly justify it
```

- [ ] **Step 4: Write the board-prompt template**

```markdown
You are the board agent for `{{DISPLAY_NAME}}`.

Load:
- `board-config.json`
- `board-rules.md`

Operate only on this board.
Never assign sprint membership.
```

- [ ] **Step 5: Validate the JSON template**

Run: `Get-Content "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\templates\board-config.template.json" | ConvertFrom-Json | Out-Null`

Expected: no output and exit code `0`.

- [ ] **Step 6: Commit**

```powershell
git add "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\skills\trello-board-bootstrap\SKILL.md" "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\templates"
git commit -m "feat(trello): add board bootstrap skill and templates"
```

### Task 7: Add Sprint Runtime And Smoke-Test Documentation

**Files:**
- Create: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\docs\smoke-test.md`

- [ ] **Step 1: Write the smoke test guide**

```markdown
# Trello Agent Smoke Test

## Preconditions

- Trello MCP is connected in Codex
- `Metal Docs` is registered in `agents/trello-manager/registry.json`
- `board-config.json` contains real list ids

## Test 1: Board status

Prompt:
`Use trello-manager to show me how we are doing on Metal Docs.`

Expected:
- board resolves to `metal-docs`
- response includes overall state, blocked work, recent progress, and next focus

## Test 2: Assisted create

Prompt:
`Use trello-manager to add a card to Metal Docs for documenting sprint reconciliation rules.`

Expected:
- manager runs card lookup first
- if no match exists, a new card is created in backlog
- response includes action log and Trello card url

## Test 3: Assisted update

Prompt:
`Use trello-manager to mark the sprint reconciliation card as in progress and add a comment that implementation has started.`

Expected:
- existing card is found
- card is moved to `doing`
- comment is added

## Test 4: Sprint summary

Prompt:
`Use trello-manager to create an active sprint, add the reconciliation card, and show sprint status.`

Expected:
- active sprint runtime file is created
- sprint membership stores Trello card ids
- sprint report surfaces `active`, `completed`, `blocked`, `missing`, and `moved`
```

- [ ] **Step 2: Create a sample active sprint file only for local smoke testing**

```json
{
  "id": "active-sprint",
  "name": "Active Sprint",
  "start_date": "2026-04-08",
  "end_date": "2026-04-22",
  "goal": "Validate Trello manager flows end to end",
  "boards": {
    "metal-docs": []
  }
}
```

- [ ] **Step 3: Verify the smoke-test files exist**

Run: `Get-ChildItem "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\docs","C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\sprints"`

Expected: `smoke-test.md` and `active-sprint.json` are present.

- [ ] **Step 4: Commit**

```powershell
git add "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\docs\smoke-test.md" "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Documents\Agents\Trello Agent\agents\trello-manager\sprints\active-sprint.json"
git commit -m "docs(trello): add smoke tests and sprint runtime example"
```

## Plan Self-Review

Spec coverage:

- Manager topology is implemented by Tasks 2 and 4.
- Board-agent memory and runtime contract are implemented by Tasks 3 and 5.
- Bootstrap capability is implemented by Task 6.
- Sprint ownership and reconciliation are covered by Tasks 2, 5, and 7.
- Versioned config versus runtime state is covered by Tasks 1 and 7.

Placeholder scan:

- The only intentional placeholders are `REPLACE_WITH_*` and `{{...}}` tokens inside bootstrap-oriented template files or the first real board config before live list ids are retrieved. These are required by design, not unresolved plan gaps.

Type consistency:

- Contract method names, registry keys, sprint keys, and board config fields are consistent with the design spec.

Plan complete and saved to `docs/superpowers/plans/2026-04-08-trello-manager.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
