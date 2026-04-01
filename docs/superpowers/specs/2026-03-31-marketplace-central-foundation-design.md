# Marketplace Central Foundation Design

## Status

Approved for foundation reset.

## Context

The current `marketplace-central` repository evolved as a rushed Next.js monolith. UI, API routes, external clients, SQLite persistence, PostgreSQL access, and business rules are mixed together. That shape is not suitable for long-term growth or future integration with MetalShopping.

The product direction is now clearer:

- Marketplace Central will not be the operational owner of marketplace publishing flows end to end.
- VTEX is expected to handle marketplace integrations and product publication flows.
- Marketplace Central should become an intelligence and control surface around marketplace operations.
- The first usable slice should be a professional pricing simulator plus marketplace configuration.

The reset must use the current repository only as a requirements reference, not as a codebase to restructure in place.

## Goals

- Rebuild the repository from zero with a professional structure aligned with MetalShopping standards.
- Keep the new repository independent, but architecturally compatible with future adaptation into MetalShopping.
- Start with a simple operational model: `single-tenant`, but explicitly `tenant-ready`.
- Use PostgreSQL as the only canonical persistence layer from day one.
- Deliver a first usable flow around pricing simulation and marketplace configuration.
- Freeze architectural rules early through `AGENTS.md` and `ARCHITECTURE.md`.

## Non-Goals

- Reusing the existing Next.js monolith structure.
- Real marketplace authentication or live connector integrations in the first phase.
- Pulling the full operational complexity of MetalShopping auth, governance, SDK generation, or multitenancy into the first build.
- Making VTEX, Melhor Envio, Mercado Livre, Magalu, Amazon, or other marketplace APIs operational in the foundation phase.

## Source Reference

Architectural inspiration and target engineering bar come from MetalShopping Final:

- GitHub reference: `https://github.com/leandrotcawork/MetalShopping_Final`

This reference belongs in `ARCHITECTURE.md` as the canonical external architecture baseline. `AGENTS.md` may mention that the repository mirrors MetalShopping conventions, but should not carry reference detail that belongs in architecture documentation.

## Core Decisions

| Decision | Choice | Reason |
|---|---|---|
| Repository strategy | New independent monorepo | Keeps Marketplace Central isolated while matching MetalShopping shape |
| Backend | Go in `apps/server_core` | Matches the target architectural direction and future adaptation path |
| Frontend | Thin client in `apps/web` | Prevents business logic drift into the UI |
| Persistence | PostgreSQL only | Avoids split truth between local persistence and canonical state |
| Tenancy | Single-tenant, tenant-ready | Simplifies v1 without blocking future multitenancy |
| API shape | Stable routes without `/v1` in URL | Avoids needless URL churn at this stage |
| Contract style | Contract-first, lean | Creates explicit API boundaries without overbuilding infrastructure too early |
| Existing code reuse | Requirements and naming only | The current implementation shape should not be migrated forward |

## Repository Layout

```text
apps/
  server_core/
  web/

contracts/
  api/
  events/
  governance/

packages/
  sdk-runtime/
  ui/
  feature-simulator/
  feature-marketplaces/

docs/
  adrs/
  superpowers/
```

## Architecture

### North Star

Marketplace Central should grow as a smaller sibling architecture to MetalShopping:

- monorepo
- server-first
- modular monolith core
- Go for canonical business logic
- PostgreSQL as canonical write model
- thin web client
- explicit contracts and boundaries
- external integrations entering only through adapters

### Core Ownership

`apps/server_core` owns:

- catalog products used by simulation
- marketplace accounts and policies
- pricing simulations and snapshots
- business rules for margin, commission, fees, freight, and alerts
- HTTP serving for web clients

`apps/web` owns only:

- screen composition
- client-side UX state
- form handling
- rendering simulation results

The web app must not own business rules, database access, connector clients, or canonical pricing calculations.

## Server Core Shape

Every business module must follow the MetalShopping module pattern:

```text
domain/
application/
ports/
adapters/
transport/
events/
readmodel/
```

Initial module set:

```text
apps/server_core/internal/modules/
  catalog/
  marketplaces/
  pricing/
```

Shared platform structure:

```text
apps/server_core/internal/platform/
  config/
  httpx/
  logging/
  migrations/
  pgdb/
```

## Initial Domain Scope

### `catalog`

Purpose:

- own the minimal canonical product entity required by the pricing simulator
- support manual creation and future import flows
- provide a stable product boundary before VTEX integration arrives

### `marketplaces`

Purpose:

- own configured marketplace accounts
- store operational and pricing-related marketplace settings
- keep connection metadata manual in the first phase

No live authentication is required in the foundation phase. The module should still model connection-related fields so external authentication can be introduced later through adapters without changing module ownership.

### `pricing`

Purpose:

- own simulation inputs and outputs
- calculate margin and viability
- persist snapshots for history and auditability
- raise result-level alerts such as low margin or invalid policy combinations

## Initial Data Model

All business tables must carry `tenant_id`, even in single-tenant operation.

### `catalog_products`

- `product_id`
- `tenant_id`
- `sku`
- `name`
- `status`
- `cost_amount`
- `weight_grams`
- `width_cm`
- `height_cm`
- `length_cm`
- `created_at`
- `updated_at`

### `marketplace_accounts`

- `account_id`
- `tenant_id`
- `channel_code`
- `display_name`
- `status`
- `connection_mode`
- `manual_credentials_json`
- `created_at`
- `updated_at`

### `marketplace_pricing_policies`

- `policy_id`
- `tenant_id`
- `account_id`
- `commission_percent`
- `fixed_fee_amount`
- `default_shipping_amount`
- `tax_percent`
- `min_margin_percent`
- `sla_question_minutes`
- `sla_dispatch_hours`
- `created_at`
- `updated_at`

### `pricing_simulations`

- `simulation_id`
- `tenant_id`
- `product_id`
- `account_id`
- `input_snapshot_json`
- `result_snapshot_json`
- `created_at`

### `pricing_manual_overrides`

- `override_id`
- `tenant_id`
- `product_id`
- `account_id`
- `target_price_amount`
- `notes`
- `created_at`
- `updated_at`

## API Boundary

Public routes should be stable and simple, without URL version prefixes in the foundation phase.

Initial routes:

- `GET /catalog/products`
- `POST /catalog/products`
- `GET /marketplaces/accounts`
- `POST /marketplaces/accounts`
- `PUT /marketplaces/accounts/{accountId}`
- `GET /marketplaces/policies`
- `POST /marketplaces/policies`
- `POST /pricing/simulations`
- `GET /pricing/simulations`

The OpenAPI contract remains versioned as a document and source of truth, even when routes are not URL-versioned.

## Contracts

```text
contracts/
  api/
    marketplace-central.openapi.yaml
  events/
    README.md
  governance/
    README.md
```

Rules:

- `contracts/api` is the source of truth for public HTTP behavior
- `packages/sdk-runtime` encapsulates web-to-core communication
- automatic SDK generation can be deferred if it slows the first slice, but the contract still governs behavior
- `events/` and `governance/` exist from day one as official boundaries, even if initially minimal

## AGENTS.md Direction

`AGENTS.md` should be short, strict, and operational. It should enforce:

- `apps/server_core` is the canonical center of the system
- every business capability enters through a proper module shape
- frontend consumes only `sdk-runtime`
- PostgreSQL is the only source of truth
- every business table has `tenant_id`
- no business logic in frontend state or components
- no local persistence as canonical state
- every change needs contract, plan, and verification discipline
- logs and errors must be structured

It should reference `ARCHITECTURE.md` for architectural context instead of duplicating that material.

## ARCHITECTURE.md Direction

`ARCHITECTURE.md` should freeze the following:

- the repository mirrors the architectural form of MetalShopping Final
- MetalShopping Final GitHub link is the external reference baseline
- `apps/server_core` in Go is the canonical center
- `apps/web` is a thin client
- PostgreSQL is canonical
- the platform is single-tenant for now but tenant-ready by design
- initial modules are `catalog`, `marketplaces`, and `pricing`
- future VTEX and marketplace integrations arrive through ports and adapters
- the long-term goal is future adaptation into the MetalShopping ecosystem with minimal rewrite

## Migration Strategy

Recommended migration path:

1. Freeze the current repository as a functional reference only.
2. Replace the repository foundation with the new monorepo structure.
3. Write `AGENTS.md` and `ARCHITECTURE.md` before implementation work.
4. Build platform minimums in `apps/server_core`: config, logger, HTTP, Postgres, migrations, composition root.
5. Implement `catalog`, `marketplaces`, and `pricing`.
6. Build `apps/web` as a thin client over `sdk-runtime`.
7. Deliver the first complete flow:
   - create product
   - create marketplace account
   - create pricing policy
   - run pricing simulation
   - persist and review simulation snapshot
8. Defer VTEX, messaging, order monitoring, and SLA alerting to later phases.

## Success Criteria

The foundation is successful when:

- the new repository shape is stable and professional
- the first flow runs through Go core, not frontend logic
- PostgreSQL is the only canonical persistence
- all business tables already include `tenant_id`
- the simulator works end to end with saved simulation history
- `AGENTS.md` and `ARCHITECTURE.md` clearly constrain future work
- future adaptation into MetalShopping is primarily a module and contract migration problem, not a rewrite

## Deferred Work

These items are intentionally deferred beyond the foundation phase:

- VTEX API integration
- live marketplace authentication
- customer messages centralization
- order monitoring and SLA guardrails
- Melhor Envio automation
- event-driven async integration flows
- full SDK generation pipeline
- real multitenant enforcement

## Acceptance Summary

Approved foundation direction:

- reset from zero
- independent repository
- MetalShopping-style architecture
- single-tenant tenant-ready
- PostgreSQL only
- Go core plus thin web client
- initial focus on pricing simulator and marketplace configuration
- architecture reference stored in `ARCHITECTURE.md`
- stable API routes without `/v1`
