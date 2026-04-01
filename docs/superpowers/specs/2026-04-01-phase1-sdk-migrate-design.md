# Phase 1 (1.3, 1.4, 1.5) — SDK, OpenAPI, Migrations, and Verification

## Scope

Complete the remaining Phase 1 work by adding a real API contract, a usable typed SDK, a simple in-house migration runner, and backend-centered verification. This phase explicitly excludes a fully interactive UI and keeps frontend work limited to technical integration support only.

## Architecture

- OpenAPI becomes the canonical HTTP contract for the endpoints already implemented in the backend.
- `packages/sdk-runtime` remains hand-written and gains typed request/response methods for the real `GET` and `POST` flows.
- `apps/server_core/cmd/migrate/main.go` becomes a lightweight internal migration runner with no external migration library.
- Verification focuses on backend, SDK, and technical smoke coverage rather than full product UI.

## API Contract

The OpenAPI file must describe the current backend surface exactly:

- `GET /catalog/products`
- `GET /marketplaces/accounts`
- `POST /marketplaces/accounts`
- `GET /marketplaces/policies`
- `POST /marketplaces/policies`
- `GET /pricing/simulations`
- `POST /pricing/simulations`

`POST /catalog/products` must be removed from the contract because catalog is read-only in this phase.

The contract must include request/response schemas for:

- marketplace account creation
- marketplace policy creation
- pricing simulation creation
- list responses with `items`
- structured error response:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Human readable message",
    "details": {}
  }
}
```

Allowed error codes remain:

- `invalid_request`
- `not_found`
- `conflict`
- `internal_error`

## SDK Runtime

The SDK must remain hand-written for now.

It must expose typed methods for:

- `listCatalogProducts`
- `listMarketplaceAccounts`
- `createMarketplaceAccount`
- `listMarketplacePolicies`
- `createMarketplacePolicy`
- `listPricingSimulations`
- `runPricingSimulation`

The SDK must:

- accept `baseUrl`
- use injectable `fetch`
- send JSON for `POST`
- parse JSON responses
- surface structured error payloads when responses are not OK

TypeScript request/response types must be written manually and match the OpenAPI contract.

## Migration Runner

`apps/server_core/cmd/migrate/main.go` must become a real migration entrypoint.

Required behavior:

- load `MC_DATABASE_URL`
- connect to Postgres
- ensure a `schema_migrations` table exists
- read SQL files from `apps/server_core/migrations`
- sort and apply them in lexical filename order
- skip files already registered in `schema_migrations`
- record each applied migration with filename and applied timestamp
- stop immediately on the first failed migration

No external migration tool is introduced in this phase.

## Verification

Phase 1 is considered complete when:

- the OpenAPI file matches the backend behavior
- the SDK can execute real `GET` and `POST` flows for marketplaces and pricing
- the migration runner can initialize a database and avoid reapplying migrations
- backend tests remain green
- SDK tests cover both success and error handling
- a technical smoke flow succeeds:
  - create marketplace account
  - create marketplace policy
  - run pricing simulation
  - list created entities back

## Out of Scope

- full user-facing UI forms
- generated SDK code
- authentication
- VTEX connector work
- Phase 2 pricing UX

