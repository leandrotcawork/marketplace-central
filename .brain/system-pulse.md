# System Pulse — Marketplace Central
> Last updated: 2026-04-07 | Session: #6

## Project Identity

**Name:** Marketplace Central (MPC)
**Purpose:** Intelligence and control surface for marketplace operations — pricing simulation, message centralization, order monitoring, SLA guardrails.
**Target:** Brazilian marketplace sellers using VTEX, Mercado Livre, Magalu, Amazon.
**Future:** Designed to merge into MetalShopping as a module (MetalShopping_Final on GitHub).

---

## Technology Stack

### Backend
- **Language:** Go 1.25.1
- **Database:** PostgreSQL via `pgx/v5` (pgxpool.Pool only)
- **Module:** `marketplace-central/apps/server_core`
- **Pattern:** Hexagonal / ports & adapters, modular monolith

### Frontend
- **Framework:** React 19 + Vite 7
- **Router:** React Router 7
- **Styling:** Tailwind CSS v4
- **SDK:** Hand-written TypeScript client in `packages/sdk-runtime`
- **Testing:** Vitest + Testing Library
- **Icons:** lucide-react

### Monorepo
- **Go workspace:** `go.work` (single workspace: `apps/server_core`)
- **Node workspace:** npm workspaces (`apps/web`, `packages/*`)

---

## Architecture Overview

```
apps/server_core/          # Go backend
  cmd/server/              # HTTP server entrypoint
  cmd/migrate/             # Migration runner
  internal/
    composition/           # Dependency injection + module registration
    modules/
      catalog/             # Products, SKUs, taxonomy, enrichments
      classifications/     # Product classification data
      marketplaces/        # Accounts + pricing policies
      pricing/             # Price simulation engine + batch orchestrator
      connectors/          # [early] Marketplace API adapters (VTEX etc.)
    platform/
      config/              # Env config loading
      httpx/               # JSON writer, router
      logging/             # Structured logger (slog)
      pgdb/                # Postgres pool + tenant helpers
  migrations/              # Sequential SQL: 0001–0007

apps/web/                  # React client (thin)
  src/
    app/                   # Route definitions
    pages/                 # Page components

packages/
  sdk-runtime/             # TypeScript SDK (typed fetch wrappers)
  ui/                      # Shared UI primitives
  feature-connectors/      # Connectors settings page
  feature-marketplaces/    # Marketplace settings page
  feature-products/        # Products page
  feature-simulator/       # Pricing simulator page
  feature-classifications/ # Classifications management page

contracts/api/             # OpenAPI spec (source of truth for HTTP)
docs/marketplaces/         # Per-marketplace API reference docs
```

---

## Module Responsibilities

| Module | Status | Scope |
|---|---|---|
| `catalog` | Foundation done | Products, SKU/EAN, cost tracking, taxonomy, enrichments, classifications |
| `marketplaces` | Foundation done | Accounts, pricing policies (commission, fees, freight, SLA) |
| `pricing` | Foundation done | Simulation engine, batch orchestrator, snapshots, manual overrides, suggested price |
| `connectors` | Early/partial | VTEX adapter (in progress) |
| `messaging` | Planned (Phase 4) | Unified inbox, SLA tracking |
| `orders` | Planned (Phase 4) | Order monitoring, dispatch SLA |
| `alerts` | Planned (Phase 4) | SLA guardrails, notifications |

---

## Established Patterns

- **Module structure:** `domain/ application/ ports/ adapters/ transport/ events/ readmodel/`
- **Error codes:** Structured `MODULE_ENTITY_REASON` format (e.g., `PRICING_SIMULATION_INVALID`)
- **Logging:** slog with `action`, `result`, `duration_ms` fields on every handler
- **Database:** All queries include `tenant_id` predicate; `pgxpool.Pool` only
- **Money:** `float64` in domain, `numeric(14,2)` in Postgres
- **Transport layer:** Validates, delegates to application service, returns JSON
- **Frontend:** No direct fetch — all via `sdk-runtime`
- **Commits:** `<type>(<scope>): <what>` (feat | fix | docs | chore | refactor | test)
- **Migrations:** Sequential `NNNN_description.sql`, forward-only (0001–0007 exist)
- **Commissions:** Stored as decimal (e.g., 0.16 = 16%); frontend multiplies by 100 for display

---

## Current Phase

**Phase 2 — Pricing simulator** (active, now in progress)

Goal: Full simulation engine with backend batch runs and the matching frontend UI.

Completed this phase:
- Batch orchestrator implemented in `pricing/application/batch_orchestrator.go` for product x policy batch runs
- `pricing_service_test.go` now covers standard pricing and suggested-price batch scenarios
- Freight connectivity contract updated to `IsConnected(ctx) (bool, error)` in the pricing ports

Still pending:
- Pricing batch HTTP transport handler
- SDK batch method + frontend batch UI

**Recent completed work (from git):**
- Feat: Pricing batch orchestrator (Task 10) — batch engine + unit tests in worktree `fbd3b0a`
- Feat: Classifications management page — new `feature-classifications` package, `/classifications` route
- Feat: UX redesign (Plans 1–4) — PaginatedTable, DetailPanel, sticky bars, slide-over panels
- Feat: POST /connectors/vtex/validate-connection — full hexagonal stack, live VTEX 200 confirmed
- Fix: CORS middleware added — browser can now reach the API from localhost:5173

---

## Database Migrations

| File | Description |
|---|---|
| `0001_foundation.sql` | Base tenant/foundation tables |
| `0003_marketplaces.sql` | Marketplace accounts + policies |
| `0004_pricing.sql` | Pricing simulations + overrides |
| `0005_connectors.sql` | Connector accounts/config |
| `0006_product_enrichments.sql` | Product enrichments (dimensions, suggested price) |
| `0007_classifications.sql` | Product classifications |

Note: No `0002` file exists — was merged/removed as part of Phase 0 cleanup.

---

## Key File Locations

| File | Purpose |
|---|---|
| `AGENTS.md` | Engineering rules (absolute — read on every session) |
| `ARCHITECTURE.md` | Frozen architectural decisions |
| `IMPLEMENTATION_PLAN.md` | Phase plan with task checklist |
| `contracts/api/marketplace-central.openapi.yaml` | API source of truth |
| `apps/server_core/internal/composition/root.go` | Module registration + DI |
| `apps/server_core/internal/platform/msdb/pool.go` | MetalShopping read-only pool |
| `apps/server_core/internal/modules/catalog/` | Catalog module (MS reader + enrichments) |
| `apps/server_core/internal/modules/classifications/` | Classifications module (full CRUD) |
| `apps/server_core/internal/modules/pricing/application/batch_orchestrator.go` | Pricing batch engine |
| `apps/server_core/migrations/` | Sequential SQL migrations (0001–0007) |
| `packages/sdk-runtime/src/index.ts` | TypeScript API client |
| `packages/ui/src/PaginatedTable.tsx` | Shared paginated table with render props |
| `packages/ui/src/DetailPanel.tsx` | Shared slide-over panel |
| `packages/feature-classifications/src/ClassificationsPage.tsx` | Classifications management UI |
| `run-server.ps1` | PowerShell script — loads .env (CRLF-safe) + starts Go server |
| `.env` | Local env vars (MS_DATABASE_URL, MC_DATABASE_URL, VTEX_*) |

---

## Known Risks

- `.brain/` is in `.gitignore` — brain files won't be committed unless removed from gitignore
- `zero_commit_rate` is 38.9% (sessions where no commits were made) — many sessions end without a commit
- Migration `0002` is missing from sequence (was cleaned up) — not a bug, just a gap
- `server.exe` is untracked in git (compiled binary checked into working dir)
- Pricing batch transport and SDK work still pending after the batch orchestrator
- Marketplace Settings, Pricing Simulator, VTEX Publisher publish flow not smoke-tested end-to-end
- Migration runner cmd/migrate/main.go is still a stub — migrations run manually via psql for now
- VTEX credential validation confirmed working (account tfcvgo, ~762ms); VTEX_ACCOUNT=tfcvgo in local .env (gitignored)
