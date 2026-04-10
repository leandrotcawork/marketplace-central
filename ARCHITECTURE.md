# Marketplace Central Architecture

## Status

This architecture is approved as the official foundation of the repository. Frozen decisions below must not be rediscussed without an explicit ADR.

## Reference baseline

This repository mirrors the structural rules of MetalShopping Final:

- GitHub: https://github.com/leandrotcawork/MetalShopping_Final
- The engineering bar, module pattern, and platform conventions are inherited from MetalShopping

## North Star

Marketplace Central is an intelligence and control surface for marketplace operations:

- Independent monorepo, architecturally compatible with future MetalShopping integration
- Server-first: all business logic lives in Go
- Modular monolith core with explicit module boundaries
- PostgreSQL as the only canonical state
- Thin web client consuming SDK-generated methods
- VTEX handles operational marketplace flows (publishing, stock sync)
- MPC handles intelligence: pricing simulation, message centralization, order monitoring, SLA guardrails
- Read-heavy from external APIs, write-light (only message replies and product registration via VTEX)

## Frozen decisions

1. Independent monorepo — merge into MetalShopping is a future module migration, not a rewrite
2. Go `apps/server_core` is the canonical backend
3. `apps/web` is a thin React client — no business logic
4. PostgreSQL is the only canonical persistence — no SQLite, no localStorage as source of truth
5. Single-tenant operation, but every business table carries `tenant_id` (tenant-ready by design)
6. Stable API routes without `/v1` prefix in URLs — versioning is in the OpenAPI document
7. External marketplace integrations enter only through the `connectors` module via port interfaces
8. VTEX is the primary operational platform — MPC does not own publishing flows directly
9. Scheduler-based polling for marketplace data sync (messages, orders) — not real-time webhooks initially
10. Frontend consumes only `packages/sdk-runtime` — never calls backend directly

## Layout

```
apps/
  server_core/          # Go backend — canonical business logic
    cmd/
      server/           # HTTP server entrypoint
      migrate/          # Migration runner
    internal/
      composition/      # Module registration and dependency injection
      modules/
        catalog/        # Product entities for pricing simulation
        marketplaces/   # Marketplace accounts and pricing policies
        pricing/        # Price simulation engine
        messaging/      # [planned] Centralized customer messages from all marketplaces
        orders/         # [planned] Order tracking with SLA monitoring
        alerts/         # [planned] SLA guardrails and notifications
        connectors/     # [planned] Marketplace API adapters (VTEX, ML, Magalu, etc.)
      platform/
        config/         # Environment configuration
        httpx/          # HTTP helpers (JSON writer, router)
        logging/        # Structured logger
        pgdb/           # PostgreSQL pool, tenant helpers
    migrations/         # Sequential SQL migrations
    tests/
      unit/             # Unit tests with stub repositories

  web/                  # Thin React client (Vite + React Router)
    src/
      app/              # Route definitions
      main.tsx          # Entry point

contracts/
  api/                  # OpenAPI spec — source of truth for HTTP behavior
  events/               # [reserved] Async event contracts
  governance/           # [reserved] Runtime governance schemas

packages/
  sdk-runtime/          # TypeScript client for web-to-core communication
  ui/                   # Shared UI primitives (Button, SurfaceCard, etc.)
  feature-marketplaces/ # Marketplace settings page
  feature-simulator/    # Pricing simulator page

docs/
  marketplaces/         # Per-marketplace API reference docs (ML, Magalu, Amazon, etc.)
  IMPLEMENTATION_PLAN.md
```

## Module responsibilities

### `catalog` (implemented — foundation)

Product entities used by the pricing simulator. Supports manual creation and future import from VTEX.

Scope: product CRUD, SKU/EAN management, cost tracking.

### `marketplaces` (implemented — foundation)

Marketplace account configuration and pricing policies (commission, fixed fees, freight, SLA thresholds).

Scope: account registration, policy management, connection status tracking.

### `pricing` (implemented — foundation)

Price simulation engine. Calculates margin, commission impact, freight cost, and viability per product per marketplace.

Scope: simulation execution, snapshot persistence, manual price overrides, margin alerts.

### `messaging` (planned — phase 2)

Centralizes customer messages from all connected marketplaces. Provides a unified inbox with SLA tracking (1-hour response target).

Scope: message polling from marketplace APIs, unified thread view, reply dispatch, response time tracking.

Read from: marketplace APIs via `connectors` adapters.
Write to: marketplace APIs (reply only) via `connectors` adapters.

### `orders` (planned — phase 2)

Order monitoring across all marketplaces. Tracks order lifecycle with SLA enforcement (24-hour dispatch target).

Scope: order polling, status tracking, dispatch deadline monitoring, order history.

Read from: marketplace APIs via `connectors` adapters. Also reads from VTEX if VTEX is the order source.

### `alerts` (planned — phase 2)

SLA guardrails and notification engine. Monitors messaging response times, order dispatch deadlines, and pricing thresholds.

Scope: deadline calculation, alert generation, notification dispatch (initially in-app, future email/webhook).

Reads from: `messaging` and `orders` modules for SLA data.

### `connectors` (planned — phase 2)

Marketplace API adapters. Each marketplace (VTEX, Mercado Livre, Magalu, Amazon) implements a common port interface.

Scope: authentication management, API request/response mapping, rate limiting, error handling.

Pattern: one adapter package per marketplace under `connectors/adapters/`. The module owns the port interfaces; adapters implement them.

Initial connector: VTEX only (phase 1 focus). Other marketplaces added as needed.

## Platform packages

Located in `apps/server_core/internal/platform/`:

- `config/` — environment variable loading
- `httpx/` — JSON response writer, router factory, middleware
- `logging/` — structured logger
- `pgdb/` — PostgreSQL pool creation, tenant context helpers

These are shared infrastructure — not business logic. They mirror MetalShopping's `internal/platform/` structure.

## Communication flow

### Current (foundation)

```
web → sdk-runtime → server_core HTTP handlers → application services → postgres
```

### Target (phase 2+)

```
web → sdk-runtime → server_core HTTP handlers → application services → postgres
                                                       ↓
                                              scheduler jobs (polling)
                                                       ↓
                                              connectors adapters → marketplace APIs
                                                       ↓
                                              messaging/orders modules → postgres
                                                       ↓
                                              alerts module → notifications
```

### Rules

- Web client never calls marketplace APIs directly
- Connectors never own business state — they fetch and deliver to domain modules
- Scheduler runs polling jobs at configured intervals (e.g., every 5 min for messages, every 15 min for orders)
- Synchronous HTTP requests from web never depend on connector availability

## Database

- Engine: PostgreSQL (same cluster as MetalShopping, separate tables or schema)
- All business tables carry `tenant_id` as part of the primary key or with NOT NULL constraint
- Migrations are sequential files in `apps/server_core/migrations/`
- Naming: `NNNN_description.sql`
- No down migrations — forward-only

## Future MetalShopping integration

When the time comes to merge MPC into MetalShopping:

1. Move `apps/server_core/internal/modules/*` into MetalShopping's module directory
2. Register modules in MetalShopping's composition root
3. Migrate database tables (add to MetalShopping's migration sequence)
4. Move `packages/feature-*` into MetalShopping's frontend packages
5. Point SDK methods to MetalShopping's API routes

The merge should be a module migration, not a rewrite. This is why structure compatibility matters now.

## Related documents

- `AGENTS.md` — daily operational rules
- `IMPLEMENTATION_PLAN.md` — phased execution plan
- `contracts/api/marketplace-central.openapi.yaml` — API source of truth
- `docs/marketplaces/*.md` — per-marketplace API reference
