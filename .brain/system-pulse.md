# System Pulse — Marketplace Central
> Last updated: 2026-04-04 | Session: #3 (final)

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
      pricing/             # Price simulation engine
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

contracts/api/             # OpenAPI spec (source of truth for HTTP)
docs/marketplaces/         # Per-marketplace API reference docs
```

---

## Module Responsibilities

| Module | Status | Scope |
|---|---|---|
| `catalog` | Foundation done | Products, SKU/EAN, cost tracking, taxonomy, enrichments, classifications |
| `marketplaces` | Foundation done | Accounts, pricing policies (commission, fees, freight, SLA) |
| `pricing` | Foundation done | Simulation engine, margin calc, snapshots, manual overrides, suggested price |
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

**Phase 1 — Foundation Wiring** (active)

Goal: Make 3 modules functional end-to-end with real database operations.

Completed this phase:
- Both pgxpool instances wired (pgdb for MPC, msdb for MetalShopping read-only)
- Catalog module: MetalShopping reader adapter + EnrichmentRepository (Postgres)
- Classifications module: full CRUD (domain → application → adapters → transport)
- Pricing module: slog logging + PRICING_* structured error codes
- SDK extended: 11 new methods + CatalogProduct, Classification, ProductEnrichment types
- ProductPicker shared component + Products/VTEX Publisher/Simulator pages rewired
- Migrations 0006–0007 applied to mpc schema (12 tables verified)

Still pending:
- Migration runner (cmd/migrate/main.go — still a stub, low priority)
- Smoke test remaining pages in browser: Marketplace Settings forms, Pricing Simulator, VTEX Publisher publish flow

**Recent completed work (from git):**
- Fix: marketplaces adapter ON CONFLICT targets and default_shipping_amount column name
- Fix: CORS middleware added — browser can now reach the API from localhost:5173
- Fix: EAN/reference queries drop is_primary filter (pn_interno is primary in MS, not EAN)
- Fix: shopping_price_latest_snapshot joins on product_id not sku
- Server verified live: 3,858 products, 100 taxonomy nodes, accounts/policies/simulation all working

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
| `apps/server_core/migrations/` | Sequential SQL migrations (0001–0007) |
| `packages/sdk-runtime/src/index.ts` | TypeScript API client |
| `packages/ui/src/ProductPicker.tsx` | Shared product picker component |
| `.env` | Local env vars (MS_DATABASE_URL, MC_DATABASE_URL, VTEX_*) |

---

## Known Risks

- `.brain/` is in `.gitignore` — brain files won't be committed unless removed from gitignore
- `zero_commit_rate` is 38.9% (sessions where no commits were made) — many sessions end without a commit
- Migration `0002` is missing from sequence (was cleaned up) — not a bug, just a gap
- `server.exe` is untracked in git (compiled binary checked into working dir)
- Connectors module is partially implemented (appears in modules list but phase 3 planning)
- Marketplace Settings, Pricing Simulator, VTEX Publisher publish flow not smoke-tested end-to-end
- Migration runner cmd/migrate/main.go is still a stub — migrations run manually via psql for now
- VTEX Publisher publish flow (batch → pipeline → VTEX API) not tested end-to-end
