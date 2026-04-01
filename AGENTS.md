# AGENTS — Marketplace Central

## On every session start

1. Read `docs/IMPLEMENTATION_PLAN.md` — know current phase and scope
2. Read `ARCHITECTURE.md` — know frozen decisions before touching code
3. After any correction: document the lesson in commit message or PR description

## Engineering bar

Every decision passes this filter:
*"Would a Stripe or Google senior engineer approve this in code review?"*

- Names are self-documenting — no comment needed to understand them
- Errors carry structured codes: `MODULE_ENTITY_REASON` (e.g. `PRICING_SIMULATION_INVALID`)
- Every handler logs `action`, `result`, `duration_ms`
- Every write is idempotent and retry-safe
- All business tables carry `tenant_id`

## Absolute rules — violation = stop and fix immediately

### Go

- Every Postgres query must include `tenant_id` in the WHERE clause — no exceptions
- Every HTTP handler validates request method and returns structured JSON errors
- Every new module registered in `composition/root.go` with dependency injection
- Transport layer never contains business logic — delegate to application service
- Application service never imports `net/http` or database packages — use ports
- Domain entities are pure Go structs with no external dependencies
- Adapters implement port interfaces — one adapter per external dependency
- `pgxpool.Pool` is the only database access mechanism — no raw `sql.DB`
- No `panic()` in production code — return errors
- All monetary values use `float64` in domain, `numeric(14,2)` in Postgres

### Frontend

- Data only via `sdk-runtime` methods — no direct `fetch()` to backend
- No business logic in React components — pricing, margin, commission calculations belong in Go
- No local persistence (localStorage, SQLite) as source of truth — Postgres is canonical
- Loading + error + empty state on every data-fetching component
- Feature packages (`packages/feature-*`) own page-level UI
- Shared primitives live in `packages/ui`

### Process

- No task marked done without: build passes + tests pass + commit made
- One commit per completed task — no uncommitted work at session end
- Legacy files from the old Next.js monolith must not be reintroduced
- Every new endpoint must exist in `contracts/api/marketplace-central.openapi.yaml`
- Every new migration file is sequential: `NNNN_description.sql`
- `packages/generated/` never edited manually (when SDK generation is added)

## Module structure

Every module in `apps/server_core/internal/modules/*` must follow:

```
domain/        — entities and value objects (pure Go, no imports)
application/   — use cases and service layer (imports domain + ports)
ports/         — interfaces for external dependencies
adapters/      — implementations of ports (postgres, http clients, etc.)
transport/     — HTTP handlers (imports application + platform/httpx)
events/        — event types for async communication (future)
readmodel/     — query-optimized views (future)
```

## Connector pattern (for marketplace integrations)

Each marketplace adapter implements a common port interface:

```go
type MarketplaceConnector interface {
    FetchMessages(ctx context.Context) ([]Message, error)
    FetchOrders(ctx context.Context) ([]Order, error)
    ReplyToMessage(ctx context.Context, messageID string, body string) error
}
```

One adapter per marketplace (vtex, mercado_livre, magalu, etc.). The connector
module owns the port; each marketplace adapter lives in its own package under
`adapters/`.

## Commit format

`<type>(<scope>): <what>` — feat | fix | docs | chore | refactor | test

Examples:
- `feat(pricing): add margin threshold alerts`
- `fix(connectors): handle VTEX token refresh on 401`
- `docs(architecture): freeze messaging module scope`

## Skill map

| Task | Reference |
|---|---|
| Any Go implementation | This file + `ARCHITECTURE.md` |
| Database changes | `apps/server_core/migrations/` |
| API contract changes | `contracts/api/marketplace-central.openapi.yaml` |
| Frontend feature | `packages/feature-*/` + `packages/sdk-runtime/` |
| Phase planning | `docs/IMPLEMENTATION_PLAN.md` |

## Integration with MetalShopping

This repository is designed as a future module of MetalShopping. Key compatibility rules:

- Module structure mirrors `MetalShopping_Final/apps/server_core/internal/modules/*`
- Platform packages mirror `MetalShopping_Final/apps/server_core/internal/platform/*`
- Database schema uses prefix `mpc_` or dedicated tables (no collision with MS tables)
- When the merge happens, modules move to MetalShopping's monorepo with minimal rewrite
- The same Postgres cluster can be shared (different schema or same schema with table prefixes)