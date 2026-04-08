# Marketplace Registry & Fee Foundation — Design Spec
> Date: 2026-04-08 | Status: approved

## Context

The current `marketplace_pricing_policies` table uses a flat fee model: a single
`commission_percent` and `fixed_fee_amount` per policy. This is too generic to
support real margin simulation. Mercado Livre charges different commission rates
per category and listing type. Shopee and Magalu have published rate tables.
The system is unusable for real pricing decisions until this is fixed.

Additionally, each marketplace has its own API, credential schema, and
capabilities. There is no structured way to register a new marketplace —
developers add code without a consistent contract, and the UI has no way to
render the correct credential form per marketplace.

This spec defines the Marketplace Registry and Fee Foundation that makes the
software usable and sets the extensible pattern for all future marketplace
integrations.

---

## Goals

1. Define a plugin contract so every marketplace follows the same structure
2. Store real fee schedules (commission per category/listing type) in the DB
3. Feed the simulator with real rates instead of flat approximations
4. Make adding a new marketplace a mechanical, predictable task
5. Support both API-synced fees (Mercado Livre) and static tables (Shopee, Magalu)

## Non-Goals

- Direct product publishing to marketplaces (VTEX handles that)
- Webhook-based real-time fee updates (polling is sufficient)
- Tenant-facing UI to edit fee schedules (admin seeding only in this phase)

---

## Architecture — Three Layers

### Layer 1: Marketplace Definition (code, system-level)

Each marketplace is a Go package under `modules/marketplaces/registry/`. It
declares at compile time:

- `channel_code` — canonical identifier: `"mercado_livre"`, `"shopee"`, `"magalu"`
- `display_name` — human label for UI
- `capabilities` — what the marketplace supports: `FeeAPI`, `Orders`, `Messages`, `CatalogSync`
- `fee_source` — `"api_sync"` or `"static_table"`
- `credential_schema` — JSON array of fields the tenant must provide (key, label, whether secret)

All definitions are registered at startup in `composition/root.go`. The registry
is read-only at runtime. Adding a new marketplace = new package + registration.

### Layer 2: Fee Schedule (database, system-level)

A `marketplace_fee_schedules` table stores commission rates per
`(marketplace_code, category_id, listing_type)`. This is the single source of
truth for fee data regardless of how it was populated (API sync or static seed).

### Layer 3: Tenant Account (database, tenant-level)

The existing `marketplace_accounts` table stores the tenant's connection:
credentials (encrypted JSONB), status, last sync timestamp. The existing
`marketplace_pricing_policies` stores simulation overrides: default shipping,
min margin, SLA targets, and an optional commission override for tenants whose
contract rate differs from the standard table.

### Simulation Fallback Chain

```
1. policy.commission_override set?   → use it (tenant contract rate)
2. fee_schedules row exists for
   (marketplace_code, product_category)? → use it (real rate from table)
3. policy.commission_percent          → use it (legacy flat rate, always present)
```

The simulator works today via step 3. Improves automatically once fee schedules
are seeded (step 2). Tenant can pin a custom rate at step 1.

---

## Data Model

### New: `marketplace_definitions`

Seeded at startup from the registry. Read-only at runtime.

```sql
CREATE TABLE marketplace_definitions (
  marketplace_code     text PRIMARY KEY,
  display_name         text NOT NULL,
  fee_source           text NOT NULL CHECK (fee_source IN ('api_sync', 'static_table')),
  capabilities         text[] NOT NULL DEFAULT '{}',
  credential_schema    jsonb NOT NULL DEFAULT '[]',
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);
```

Example row for Mercado Livre:
```json
{
  "marketplace_code": "mercado_livre",
  "display_name": "Mercado Livre",
  "fee_source": "api_sync",
  "capabilities": ["fee_api", "orders", "messages"],
  "credential_schema": [
    {"key": "client_id",     "label": "Client ID",     "secret": false},
    {"key": "client_secret", "label": "Client Secret", "secret": true},
    {"key": "redirect_uri",  "label": "Redirect URI",  "secret": false}
  ]
}
```

### New: `marketplace_fee_schedules`

```sql
CREATE TABLE marketplace_fee_schedules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_code     text NOT NULL REFERENCES marketplace_definitions(marketplace_code),
  category_id          text NOT NULL,
  listing_type         text,               -- ML: 'classico'|'premium', NULL for others
  commission_percent   numeric(8,4) NOT NULL,
  fixed_fee_amount     numeric(14,2) NOT NULL DEFAULT 0,
  notes                text,
  source               text NOT NULL CHECK (source IN ('api_sync', 'seeded', 'manual')),
  synced_at            timestamptz NOT NULL DEFAULT now(),
  valid_from           date,
  valid_to             date,               -- NULL = currently active
  UNIQUE NULLS NOT DISTINCT (marketplace_code, category_id, listing_type)
);

-- NULLS NOT DISTINCT required: listing_type is NULL for most marketplaces,
-- and Postgres treats NULL != NULL in UNIQUE constraints without this clause.
CREATE INDEX ON marketplace_fee_schedules (marketplace_code, category_id);
```

### Altered: `marketplace_accounts`

Add three columns to the existing table:

```sql
ALTER TABLE marketplace_accounts
  ADD COLUMN marketplace_code    text REFERENCES marketplace_definitions(marketplace_code),
  ADD COLUMN credentials_json    jsonb,   -- replaces manual_credentials_json, encrypted at rest
  ADD COLUMN last_fee_sync_at    timestamptz;
```

`channel_code` is kept for backwards compatibility during migration. New code
reads `marketplace_code`. A migration step backfills `marketplace_code` from
`channel_code` where the values match.

### Unchanged: `marketplace_pricing_policies`

Existing schema is sufficient. A new optional column is added only if a tenant
needs to pin a commission override:

```sql
ALTER TABLE marketplace_pricing_policies
  ADD COLUMN commission_override numeric(8,4);  -- NULL = use fee_schedules lookup
```

---

## Code Structure

### `modules/marketplaces/`

```
domain/
  account.go             -- existing
  policy.go              -- existing
  fee_schedule.go        -- NEW: FeeSchedule entity
  marketplace_def.go     -- NEW: MarketplaceDefinition value object
ports/
  fee_schedule_repo.go   -- NEW: FeeScheduleRepository interface
  fee_sync.go            -- NEW: FeeScheduleSyncer interface
adapters/postgres/
  fee_schedule_repo.go   -- NEW: DB queries for fee_schedules
application/
  fee_schedule_service.go -- NEW: LookupFee(code, categoryID, listingType)
registry/
  registry.go            -- NEW: registered definitions map, loaded at startup
  mercado_livre.go       -- NEW: ML definition
  shopee.go              -- NEW: Shopee definition
  magalu.go              -- NEW: Magalu definition
transport/
  definitions_handler.go    -- NEW: GET /marketplaces/definitions
  fee_schedules_handler.go  -- NEW: GET /marketplaces/fee-schedules
```

### `modules/connectors/`

```
adapters/
  mercado_livre/
    fee_sync.go          -- NEW: implements FeeScheduleSyncer, calls ML Fees API
  shopee/
    fee_seed.go          -- NEW: upserts static Shopee rate tables
  magalu/
    fee_seed.go          -- NEW: upserts static Magalu rate tables
application/
  fee_sync_service.go    -- NEW: orchestrates sync/seed per marketplace
```

**Dependency rule:** `marketplaces` defines the `FeeScheduleSyncer` port.
`connectors` implements it. `pricing` only imports `marketplaces` — never
`connectors`. All dependency arrows point inward.

---

## Sync Strategy

### Mercado Livre — API sync

ML exposes a Fees API. Given `category_id` and `listing_type`, it returns
`commission_percent`. The sync job in `connectors/application/fee_sync_service.go`
runs daily (fee tables rarely change). It discovers categories by querying
distinct `category_id` values from the `catalog_products` table for the tenant,
calls the ML Fees API for each `(category_id, listing_type)` pair, and upserts `marketplace_fee_schedules`
with `source = "api_sync"`. If the API is unreachable, existing rows are kept
unchanged (`synced_at` is not updated, alerting is a Phase 4 concern).

### Shopee + Magalu — static seeding

These marketplaces publish rate tables in PDFs or documentation pages. We
translate our `.md` docs into Go seed functions that upsert the full
`(category_id → commission_percent)` table with `source = "seeded"`. Seeding
runs at startup if the marketplace has zero rows in `fee_schedules`. When
Shopee or Magalu publishes new rates, we update the seed function and redeploy.
An admin endpoint `POST /admin/fee-schedules/seed` allows manual re-seeding
without a restart.

---

## New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/marketplaces/definitions` | List all registered marketplace types with capabilities and credential schema |
| `GET` | `/marketplaces/fee-schedules` | List fee schedule rows (filterable by marketplace_code, category_id) |
| `POST` | `/admin/fee-schedules/seed` | Trigger re-seed for a specific marketplace (admin only) |
| `POST` | `/admin/fee-schedules/sync` | Trigger immediate API sync for ML (admin only) |

All existing marketplace account and policy endpoints remain unchanged.

---

## Simulator Change

`pricing/application/simulation_service.go` currently reads `policy.CommissionPercent`
directly. The change:

```go
// Before
commission := policy.CommissionPercent * sellingPrice

// After
fee, err := feeScheduleService.LookupFee(ctx, marketplaceCode, product.CategoryID, listingType)
commissionPct := fee.CommissionPercent  // from fee_schedules
if policy.CommissionOverride != nil {
  commissionPct = *policy.CommissionOverride
}
commission := commissionPct * sellingPrice
```

The `feeScheduleService` is injected into the pricing module via its port
interface — no circular dependency.

---

## Roadmap Impact

This replaces Phase 3 (VTEX connector / product publishing). The new Phase 3 is:

**Phase 3: Marketplace Registry + Fee Foundation**
- Migration: `marketplace_definitions`, `marketplace_fee_schedules`, alterations to `marketplace_accounts` and `marketplace_pricing_policies`
- Registry code: ML, Shopee, Magalu definitions
- Fee sync adapter (ML) + seed adapters (Shopee, Magalu)
- Simulator updated to use fee schedule lookup
- New endpoints: definitions + fee-schedules
- Frontend: marketplace account form renders credential fields from `credential_schema`

**Phase 4: Information Centralization** (unchanged scope)
- Orders, messages, SLA alerts — now feasible because marketplace credentials are properly stored

Direct VTEX product publishing is out of scope for MPC. VTEX handles that.
MPC connects to marketplaces to read data (orders, messages, fees), not to push products.

---

## Migration Sequence

```
0010_marketplace_definitions.sql   -- new marketplace_definitions table
0011_marketplace_fee_schedules.sql -- new marketplace_fee_schedules table
0012_marketplace_accounts_v2.sql   -- add marketplace_code, credentials_json, last_fee_sync_at
0013_pricing_policies_override.sql -- add commission_override to pricing_policies
```

---

## Open Questions (resolved)

- **Fee source per marketplace:** ML → API sync; Shopee, Magalu → static seed ✓
- **Scope:** simulation + information centralization only; no direct product publishing ✓
- **Fallback:** three-level chain (override → fee_schedules → flat policy rate) ✓
