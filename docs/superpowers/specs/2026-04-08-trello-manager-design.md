# Trello Manager Agent Design

## Context

The goal is to operate Trello as the main project execution surface through an agent system instead of using Trello manually. The system must support multiple project boards, board-specific workflows, assisted card writes, and local sprint tracking that Trello does not model well for this workflow.

The design explicitly excludes Nexus integration. This is a standalone Trello agent system with its own local memory and operating rules.

## Chosen Approach

Use a three-part architecture:

1. One `Trello Manager` as the only direct entry point.
2. One `Board Agent` per Trello board.
3. Shared local memory for registry, rules, and sprint mapping.

This keeps cross-project orchestration centralized while preserving board-specific behavior and avoiding a monolithic agent.

## Alternatives Considered

- Single agent with all board logic embedded: rejected because board-specific workflow logic would become tangled and hard to scale.
- Manager plus functional specialist agents plus board agents: rejected for v1 because it adds coordination overhead before the core model is proven.
- Trello as the only memory: rejected because Trello is weak at durable operating rules, routing, and cross-board sprint coordination.

## System Topology

### Trello Manager

The manager is the only agent the user talks to directly. Its responsibilities are:

- interpret user requests
- classify intent such as status, create, update, blocked review, or sprint operations
- resolve the target board from shared memory
- delegate to the appropriate board agent
- consolidate and format the response
- enforce global write safety rules

The manager must not contain board-specific workflow logic.

### Board Agents

Each board agent owns exactly one Trello board, for example `metal-docs`. Its responsibilities are:

- understand that board's workflow and list semantics
- read board state from Trello
- create and update cards according to board-specific rules
- summarize board status and blocked work
- return structured results to the manager

Board agents must not coordinate across boards and must not own sprint membership.

### Bootstrap Skill

The system includes a setup-only skill, `trello-board-bootstrap`, used to register a new managed board. It is separate from day-to-day board operations.

Its responsibilities are:

- create a board-agent folder
- create board config and board rules files
- create the board prompt file
- register the board in the manager registry
- optionally inspect Trello and pre-fill list mappings

## Memory Model

Trello is the source of truth for operational task state:

- cards
- lists
- labels
- due dates
- checklist progress
- current board status

Local files are the source of truth for durable control memory:

- board registry
- board-agent configuration
- workflow semantics
- reporting rules
- card creation conventions
- sprint membership
- manager-level operating rules

Recommended structure:

```text
agents/
  trello-manager/
    manager-rules.md
    registry.json
    prompts/
      manager.md
    sprints/
      active-sprint.json
      sprint-YYYY-MM-DD.json
  boards/
    metal-docs/
      board-config.json
      board-rules.md
      prompt.md
```

### Versioning Rules

The `agents/` tree is split into versioned configuration and non-versioned runtime state.

Version these files:

- `agents/trello-manager/registry.json`
- `agents/trello-manager/manager-rules.md`
- `agents/trello-manager/prompts/manager.md`
- `agents/boards/<slug>/board-config.json`
- `agents/boards/<slug>/board-rules.md`
- `agents/boards/<slug>/prompt.md`

Do not version these files:

- `agents/trello-manager/sprints/active-sprint.json` when used as live operational state
- ephemeral logs
- temporary snapshots
- runtime caches or transient reconciliation artifacts

Historical sprint files may be versioned later if the team wants sprint history in git, but v1 should treat active sprint state as operational runtime data.

### `registry.json`

Maps user-facing project names and slugs to Trello workspace IDs, board IDs, and local board-agent folders.

### `board-config.json`

Structured data only. It should include:

- board id
- workspace id
- project slug
- list ids by semantic meaning such as `backlog`, `doing`, `blocked`, `done`
- default labels
- reporting preferences
- allowed write actions

### `board-rules.md`

Qualitative behavior only. It should define:

- what counts as progress
- what counts as blocked
- when to create a new card versus update an existing one
- naming conventions
- how to summarize the board

Structured config must not be buried in prose, and qualitative rules must not be forced into JSON.

## Request Model

The manager supports both natural language and stable command patterns.

Examples:

- `how are we doing on Metal Docs`
- `add a card for Marketplace Central to track API retry safety`
- `what is blocked across my projects`
- `trello status metal-docs`
- `trello add marketplace-central improve retry handling`
- `trello blocked metal-docs`
- `trello summary all`

Execution flow:

1. Manager receives request.
2. Manager classifies intent.
3. Manager resolves the target board from `registry.json`.
4. Manager loads the board config and rules.
5. Manager delegates to the correct board agent.
6. Board agent reads Trello and performs the allowed operation.
7. Manager formats the final response.

## Write Policy

The system uses `assisted write` as the default mode.

This means:

- the agent may create or update cards when explicitly asked
- the agent does not perform destructive actions by default
- the agent does not silently reorganize the board

Allowed initial behavior:

- create a card when the user asks to track work
- update a matching card when the user asks to add progress or adjust details
- produce a concise action log for every write

Disallowed automatic behavior in v1:

- archive or delete cards
- infer reprioritization
- silently merge duplicates
- bulk move cards across workflow stages
- cross-board mutation from one inferred request

If a write target is ambiguous, the agent must stop and ask instead of guessing.

## Sprint Layer

Trello does not natively model the sprint abstraction required here, so sprint membership lives in local memory owned by the manager.

Each sprint file contains:

- sprint id
- sprint name
- start date
- end date
- sprint goal
- board-scoped card id sets
- optional notes such as risks or carry-over rationale

Example shape:

```json
{
  "id": "sprint-2026-04-14",
  "name": "Sprint 2026-04-14",
  "start_date": "2026-04-14",
  "end_date": "2026-04-28",
  "goal": "Ship simulator comparison redesign and stabilize connector flows",
  "boards": {
    "metal-docs": ["card_id_1", "card_id_2"],
    "marketplace-central": ["card_id_3"]
  }
}
```

Sprint membership must reference Trello card IDs, never card names.

Sprint ownership is manager-level, not board-level, because sprint planning is a coordination layer above any single board.

### Sprint Reconciliation Rules

Sprint reporting must reconcile local sprint membership against live Trello state every time sprint status is requested.

Rules:

- if a sprint card id no longer exists, report it in `missing`
- if a sprint card is archived, keep it in sprint history but exclude it from active completion counts
- if a sprint card now belongs to a different board, report it in `moved` with the detected board id
- if a sprint card still exists on the expected board, classify it using the board agent's workflow rules

The manager must not silently drop stale sprint references. Reconciliation output is part of the status result so the user can correct or carry over sprint membership intentionally.

## Reporting Model

Every board agent should return a standard status shape:

- board name
- overall state: `on_track`, `at_risk`, or `blocked`
- in-progress summary
- blocked summary
- recent progress
- next focus

The board agent should interpret Trello state through local board rules, not dump raw card lists.

Portfolio reporting is produced by aggregating board-agent summaries rather than by the manager reinterpreting every board directly.

Recommended standard report types:

- board status
- blocked review
- portfolio summary
- sprint status

## Board-Agent Contract

Each board agent should implement the same contract:

```text
get_board_status()
get_blocked_items()
find_card(query)
create_card(input)
update_card(input)
list_candidate_cards_for_sprint()
summarize_sprint_cards(card_ids)
```

Definitions:

- `get_board_status()`: return the standard board summary
- `get_blocked_items()`: return blocked cards according to the board's rules
- `find_card(query)`: locate an existing card before any write operation
- `create_card(input)`: create a card in the correct list with board conventions
- `update_card(input)`: update an existing card safely
- `list_candidate_cards_for_sprint()`: return cards that are reasonable sprint candidates
- `summarize_sprint_cards(card_ids)`: summarize only the cards already assigned to a sprint

Board agents interpret sprint cards but do not own sprint membership.

### Structured Payloads

The contract must use structured payloads so the manager can reason about writes deterministically.

#### `find_card(query)`

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

#### `create_card(input)`

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

#### `update_card(input)`

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

#### `summarize_sprint_cards(card_ids)`

Input:

```json
{
  "card_ids": ["abc123", "def456"]
}
```

Output:

```json
{
  "active": [
    {
      "card_id": "abc123",
      "name": "Improve API retry safety",
      "list_key": "doing",
      "status": "active"
    }
  ],
  "completed": [],
  "blocked": [],
  "missing": [],
  "moved": []
}
```

## Skill Layout

The recommended skill layout is:

- `trello-manager`: runtime orchestration, reporting, assisted writes, sprint coordination
- `trello-board-agent`: reusable board-level operational pattern
- `trello-board-bootstrap`: setup and registration of new managed boards

This avoids hardcoding runtime orchestration into a global entry skill and keeps setup concerns separate from daily operation.

## v1 Scope

Include:

- one Trello Manager
- one board agent implementation for `Metal Docs`
- shared memory structure
- assisted-write only
- board status reporting
- blocked review
- create and update card flows
- sprint file creation and sprint membership management

Exclude:

- autonomous backlog grooming
- archive and delete automation
- cross-board bulk mutation
- specialist sub-agents beyond board agents
- broad auto-move rules not triggered by explicit intent

## Recommended Build Order

1. Create shared memory foundation.
2. Implement manager request classification and board resolution.
3. Implement one board agent for `Metal Docs`.
4. Add sprint file support and sprint-aware status reporting.
5. Add `trello-board-bootstrap` to provision future board agents.

## Success Criteria

The design is successful if:

- the user can ask for board status in natural language
- the manager routes to the right board agent deterministically
- the system can safely create and update cards through assisted write
- sprint membership can be tracked locally across one or more boards
- adding a new board agent becomes a setup task rather than custom engineering
