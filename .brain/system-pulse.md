# System Pulse - Marketplace Central
> Last updated: 2026-04-07 | Session: #6

## Project Identity

**Name:** Marketplace Central (MPC)
**Purpose:** Intelligence and control surface for marketplace operations - pricing simulation, message centralization, order monitoring, SLA guardrails.
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
      connectors/          # VTEX + Melhor Envio integration surfaces
    platform/
      config/              # Env config loading
      httpx/               # JSON writer, router
      logging/             # Structured logger (slog)
      pgdb/                # Postgres pool + tenant helpers
  migrations/              # Sequential SQL: 0001-0009

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
| `pricing` | Phase 2 delivered | Batch simulation engine, margin calc, snapshots, manual overrides, suggested price |
| `connectors` | Early/partial | VTEX adapter plus Melhor Envio OAuth, status, and freight quote support |
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
- **Frontend:** No direct fetch - all via `sdk-runtime`
- **Commits:** `<type>(<scope>): <what>` (feat | fix | docs | chore | refactor | test)
- **Migrations:** Sequential `NNNN_description.sql`, forward-only (0001-0009 exist)
- **Commissions:** Stored as decimal (e.g. `0.16 = 16%`); frontend multiplies by 100 only for display
- **Connector boundaries:** transport depends on ports, not concrete adapter packages

---

## Current Phase

**Phase 2 - Pricing simulator** (active, core implementation complete)

Goal: deliver batch pricing simulation across marketplace policies with real freight inputs and a comparison-oriented UI.

Completed in this phase:
- Batch simulation endpoint shipped in Go and wired in composition root
- SDK/runtime expanded with batch simulation and Melhor Envio status methods
- Melhor Envio OAuth/status flow and freight quote support added, with port-based transport decoupling
- Simulator page rewritten for batch execution and verified with tests, build, and smoke checks
- Feature branch merged to `master`; `API_PORT` override added and verified on port `8082`

Still pending:
- Simulator UI refinement: current results grid is functionally correct but too collapsed for effective marketplace comparison
- Migration runner (`cmd/migrate/main.go`) remains a low-priority gap from foundation work
- Browser-level polish pass after simulator redesign lands

**Recent completed work (from git):**
- Feat: pricing simulator v2 - batch simulation endpoint, SDK/runtime types, Melhor Envio auth/status flows, simulator rewrite, and verification completed
- Refactor: Melhor Envio transport now depends on a port interface instead of importing the concrete adapter
- Merge: `feat/pricing-simulator-v2` merged into `master` after conflict validation against leaked older master changes
- Feat: `API_PORT` override added to server config and verified on port `8082`
- Feat: classifications management page - new `feature-classifications` package, `/classifications` route

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
| `0008_simulator_v2.sql` | Weight and shipping provider support for batch simulation |
| `0009_melhor_envio_tokens.sql` | Melhor Envio token/account support updates |

Note: No `0002` file exists - was merged/removed as part of Phase 0 cleanup.

---

## Key File Locations

| File | Purpose |
|---|---|
| `AGENTS.md` | Engineering rules (absolute - read on every session) |
| `ARCHITECTURE.md` | Frozen architectural decisions |
| `docs/superpowers/plans/2026-04-06-pricing-simulator-v2.md` | Execution plan for simulator v2 |
| `contracts/api/marketplace-central.openapi.yaml` | API source of truth |
| `apps/server_core/internal/composition/root.go` | Module registration + DI |
| `apps/server_core/internal/modules/connectors/ports/me_auth.go` | Port boundary for Melhor Envio auth/status |
| `apps/server_core/internal/platform/config/config.go` | Server env loading, including `API_PORT` |
| `packages/sdk-runtime/src/index.ts` | TypeScript API client |
| `packages/feature-simulator/src/PricingSimulatorPage.tsx` | Current simulator UI, pending redesign follow-up |
| `docs/superpowers/specs/2026-04-07-me-auth-port-design.md` | Design record for port-based Melhor Envio auth/status decoupling |
| `run-server.ps1` | PowerShell script - loads `.env` and starts Go server |

---

## Known Risks

- `.brain/` is in `.gitignore` - brain files will not be committed unless that changes
- `server.exe` may still appear untracked in the working dir after local runs
- Simulator v2 UI currently hides too much comparison detail in collapsed marketplace columns; redesign work is next
- Connectors publish flow (batch -> pipeline -> VTEX API) still needs browser-level smoke validation
- Migration runner `cmd/migrate/main.go` is still a stub - migrations are still being run manually via psql
- `.env` is local-only and gitignored, so required runtime settings like `API_PORT` and VTEX credentials are not shared through git
