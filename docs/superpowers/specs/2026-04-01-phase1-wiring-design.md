# Phase 1 (1.1 + 1.2) — Wiring Handlers to Postgres

## Scope

Wire database connectivity and HTTP handlers for `marketplaces` and `pricing`, plus **read-only** `catalog` against `metalshopping.catalog_products`. This phase explicitly **does not** include SDK, frontend wiring, or migration tooling.

## Architecture

- The server uses a single `pgxpool.Pool` created via `pgdb.NewPool()` in the composition root.
- Repositories receive the pool via dependency injection.
- Handlers decode JSON input, call application services, and return JSON responses.
- All errors return a standardized JSON shape.

## Data Sources

- **Catalog (read-only):** `metalshopping.catalog_products`
  - No inserts or updates in this phase.
  - `GET /catalog/products` reads from this table.
- **Marketplaces:** MPC schema tables (`marketplace_accounts`, `marketplace_pricing_policies`)
- **Pricing:** MPC schema tables (`pricing_simulations`, `pricing_manual_overrides`)

## Error Contract

All errors must return:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Human readable message",
    "details": {}
  }
}
```

Allowed `code` values:
- `invalid_request`
- `not_found`
- `conflict`
- `internal_error`

## Handler Behavior

### Catalog

- `GET /catalog/products`:
  - Reads from `metalshopping.catalog_products`
  - Filters by `tenant_id`
  - Returns `[]` if no products
- `POST /catalog/products`: **not supported** in this phase

### Marketplaces

- `POST /marketplaces/accounts`:
  - Decode JSON body
  - Call `CreateAccount` (service)
  - Persist via Postgres repository
- `POST /marketplaces/policies`:
  - Decode JSON body
  - Call `CreatePolicy` (service)
  - Persist via Postgres repository
- `GET /marketplaces/accounts`, `GET /marketplaces/policies`:
  - List by `tenant_id`

### Pricing

- `POST /pricing/simulations`:
  - Decode JSON body
  - Call `RunSimulation`
  - Persist simulation via Postgres repository
- `GET /pricing/simulations`:
  - List by `tenant_id`

## Tests

- Existing unit tests must remain green.
- Add unit tests for handler error responses to verify JSON error shape.
- Add repository tests for `marketplaces` and `pricing` basic queries.
- For `catalog`, add read-only repository test if feasible.

## Out of Scope

- SDK changes
- Frontend wiring
- Migration runner
- Auth
- VTEX connector work

