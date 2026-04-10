# System Pulse - Marketplace Central
> Last updated: 2026-04-10 | Session: #10

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
  migrations/  # 0001-0016

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

**Phase 7 - Integrations operationalization** (planning)

Foundation already delivered on `master`:
- Canonical `integrations` module implemented and wired
- Marketplace bridge via `integration_installation_id` implemented
- `/integrations/providers` and `/integrations/installations` exposed in API + SDK

Next execution is intentionally split:
1. OAuth + credential lifecycle (provider operational)
2. Fee sync architecture (installation-scoped)
3. Frontend connection/sync UX

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
- Operational provider flows (OAuth real flow, fee sync runtime robustness, UX operational states) are not fully delivered yet
- Windows environments may require local absolute `GOCACHE` for stable test runs
