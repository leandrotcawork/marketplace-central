# System Pulse - Marketplace Central
> Last updated: 2026-04-13 | Session: #16

## Project Identity

**Name:** Marketplace Central (MPC)  
**Purpose:** Intelligence and control surface for marketplace operations (pricing, integrations, messaging, orders, SLA).  
**Target:** Brazilian marketplace sellers using VTEX and marketplace channels.  
**Future:** Designed to merge into MetalShopping as a module.

---

## Technology Stack

### Backend
- Language: Go 1.25.x
- Database: PostgreSQL via `pgx/v5` (`pgxpool.Pool` only)
- Pattern: Modular monolith, ports and adapters

### Frontend
- React + Vite
- SDK: `packages/sdk-runtime`
- Testing: Vitest

### Monorepo
- Go workspace: `go.work` (`apps/server_core`)
- Node workspace: npm workspaces (`apps/web`, `packages/*`)

---

## Active Architectural Decisions

- ADR-001: MPC reads products directly from MetalShopping Postgres
- ADR-002: MPC own tables live in `mpc` schema on MetalShopping cluster
- ADR-003: Split integrations delivery into operational specs after foundation (OAuth -> Fee Sync -> UX)

---

## Architecture Overview

```
apps/server_core/
  cmd/server/
  cmd/migrate/
  internal/
    composition/
    modules/
      catalog/
      classifications/
      marketplaces/
      integrations/
      pricing/
      connectors/
    platform/
      config/
      httpx/
      logging/
      pgdb/
  migrations/  # 0001-0018

apps/web/
packages/sdk-runtime/
contracts/api/
```

---

## Module Responsibilities

| Module | Status | Scope |
|---|---|---|
| `catalog` | active | Products, taxonomy, enrichments |
| `classifications` | active | Product classification management |
| `marketplaces` | active consumer | Accounts/policies and bridge to integrations |
| `integrations` | foundation complete | Provider catalog, installations, credentials, auth sessions, capability states, operation runs, base APIs/SDK |
| `pricing` | active | Simulation engine and batch orchestration |
| `connectors` | partial | Provider-specific integration surfaces (legacy/transitional + VTEX/ME flows) |

---

## Established Patterns

- Module structure: `domain/ application/ ports/ adapters/ transport/ events/ readmodel/`
- Structured errors: `MODULE_ENTITY_REASON`
- Handler logs: `action`, `result`, `duration_ms`
- Tenant-safe access: all business queries scoped by `tenant_id`
- Frontend must use `sdk-runtime` (no direct backend fetch in features)
- Money: `float64` in domain, `numeric(14,2)` in Postgres

---

## Current Phase

**Phase 7 - Integrations operationalization** (in progress)

Completed in this phase:
1. OAuth + credential lifecycle (provider operational)
2. Fee sync architecture (installation-scoped) with audit remediation
3. Operational E2E validation (`T-029`) closed as `DONE_WITH_CONCERNS`

Next in sequence:
4. Frontend connection/sync UX (T-028)

---

## Recent Changes

- 2026-04-13: Closed `T-029` as `DONE_WITH_CONCERNS` with consolidated API/UI/log/SQL evidence and new runtime screenshots
- 2026-04-13: Re-ran the full backend+frontend verification workflow after power interruption; all gates passed with only known non-blocking third-party build warnings
- 2026-04-13: Applied migration `0018_marketplaces_tenant_isolation.sql` via `cmd/migrate` and confirmed idempotent re-run (`applied 1`, then `applied 0`)
- 2026-04-13: Re-verified impacted backend/frontend flows for the new implementation (`go test ./...`, `npm test -- --runInBand`, `npm run build`)
- 2026-04-11: Aligned integrations lifecycle and `sdk-runtime` auth methods with OpenAPI contract (authorize + auth status)

---

## Key File Locations

| File | Purpose |
|---|---|
| `AGENTS.md` | Engineering rules and guardrails |
| `ARCHITECTURE.md` | Frozen architecture decisions |
| `IMPLEMENTATION_PLAN.md` | Top-level phased execution plan |
| `contracts/api/marketplace-central.openapi.yaml` | API source of truth |
| `apps/server_core/internal/composition/root.go` | DI and module wiring |
| `apps/server_core/internal/modules/integrations/` | Integrations platform module |
| `packages/sdk-runtime/src/index.ts` | Typed client methods |
| `.brain/decisions/003-integration-spec-split-and-sequencing.md` | Latest integrations sequencing ADR |

---

## Known Risks

- `.brain/` remains gitignored by default (project memory can diverge across machines)
- Migration runner `cmd/migrate/main.go` still needs production-hardening workflow
- Frontend operational UX (`T-028`) is not delivered yet for new fee-sync/auth backend states
- OAuth callback success evidence for external provider consent remains dependent on sandbox availability (tracked as `DONE_WITH_CONCERNS` in `T-029`)
- Windows environments may require local absolute `GOCACHE` for stable test runs
