# System Pulse - Marketplace Central
> Last updated: 2026-04-08 | Session: #9

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
| `marketplaces` | Phase 3 complete | Accounts, pricing policies + marketplace_definitions, fee_schedules, fee_sync, registry plugin (ML/Shopee/Magalu) |
| `pricing` | Phase 2+3 delivered | Batch simulation engine, margin calc, fee schedule lookup fallback chain, CategoryID wired |
| `connectors` | Early/partial | VTEX adapter plus Melhor Envio OAuth, status, freight; ML/Shopee/Magalu fee seed adapters |
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

**Phase 4 - VTEX connector** (next — not started)

Phase 3 (Marketplace Registry & Fee Foundation) is complete and merged to master.

Phase 3 delivered:
- Three-layer marketplace plugin: marketplace_definitions (code) → fee_schedules (DB, seeded at startup) → tenant accounts/policies
- Fee lookup fallback chain: CommissionOverride → fee_schedules (4-level: exact category + listing_type priority) → policy.CommissionPercent
- Connector seed adapters: ML (classico 16%, premium 22%), Shopee (8 categories), Magalu (7 categories)
- CategoryID wired through BatchProduct → catalog reader → orchestrator
- Admin endpoints: /admin/fee-schedules/seed, /admin/fee-schedules/sync
- Full Chrome validation passed (all 6 pages, zero console errors, batch simulation running at 19.9% avg margin)

Still open (Phase 3.1 scope):
- Add Policy form doesn't expose commission_override in UI (backend accepts it)
- ListingType not in BatchPolicy — per-listing-type ML rates (classico/premium) unreachable from orchestrator
- Migration runner `cmd/migrate/main.go` remains a stub

**Recent changes (top 5):**
- feat(pricing): wire product CategoryID through BatchProduct for fee schedule lookup
- fix(pricing): map MarketplaceCode + CommissionOverride in reader adapter; wire commission_override in policy handler
- fix(marketplaces): rewrite LookupFee with single-query priority matrix and valid_from guard
- test(pricing): add BatchOrchestrator three-level commission fallback precedence tests
- fix(api): add admin fee-schedule endpoints and missing schema fields to OpenAPI contract

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
| `0010_marketplace_definitions.sql` | Global marketplace plugin registry (code, display_name, fee_source, credential_schema) |
| `0011_marketplace_fee_schedules.sql` | Per-category fee schedule table with 4-level priority UNIQUE NULLS NOT DISTINCT |
| `0012_marketplace_accounts_v2.sql` | Adds marketplace_code FK + credentials_json to accounts; backfills 3 seeded codes |
| `0013_pricing_policies_override.sql` | Adds commission_override numeric(8,4) to pricing policies |

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
| `docs/superpowers/plans/2026-04-08-registry-remediation.md` | Remediation plan for Phase 3 audit — all 23 tasks executed |
| `apps/server_core/internal/modules/marketplaces/registry/` | Marketplace plugin definitions (ML, Shopee, Magalu) |
| `apps/server_core/internal/modules/marketplaces/adapters/postgres/fee_schedule_repo.go` | FeeScheduleRepository with single-query LookupFee |
| `apps/server_core/internal/modules/connectors/application/fee_sync_service.go` | FeeSyncService — SeedAll + SeedMarketplace (idempotent) |
| `run-server.ps1` | PowerShell script - loads `.env` and starts Go server |

---

## Known Risks

- `.brain/` is in `.gitignore` - brain files will not be committed unless that changes
- `server.exe` may still appear untracked in the working dir after local runs
- Connectors publish flow (batch -> pipeline -> VTEX API) still needs browser-level smoke validation
- Add Policy form missing commission_override UI field (backend accepts it, Phase 3.1 scope)
- ListingType not in BatchPolicy — ML classico/premium per-listing-type rates unreachable from orchestrator (Phase 3.1)
- Migration runner `cmd/migrate/main.go` is still a stub - migrations are still being run manually via psql
- `.env` is local-only and gitignored, so required runtime settings like `API_PORT` and VTEX credentials are not shared through git
