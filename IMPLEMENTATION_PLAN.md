# Marketplace Central — Implementation Plan

## Status

Active. Phase 1 foundation scaffold is complete. Next: wire handlers to database.

## Phase overview

| Phase | Name | Focus | Status |
|---|---|---|---|
| 0 | Foundation scaffold | Monorepo structure, stubs, tests, documents | done |
| 1 | Foundation wiring | Connect handlers to Postgres, real CRUD, SDK methods | next |
| 2 | Pricing simulator | Full simulation engine with frontend UI | planned |
| 3 | VTEX connector | Product registration via VTEX API, catalog sync | planned |
| 4 | Messaging + Orders | Message centralization, order monitoring, SLA alerts | planned |
| 5 | Multi-marketplace | Additional connectors (ML, Magalu), unified inbox | planned |

---

## Phase 0 — Foundation scaffold (done)

What was delivered:

- [x] Monorepo structure: `apps/server_core`, `apps/web`, `packages/*`, `contracts/`
- [x] Go backend with 3 modules: `catalog`, `marketplaces`, `pricing`
- [x] Each module follows `domain/application/ports/adapters/transport/events/readmodel`
- [x] PostgreSQL migrations: foundation, catalog_products, marketplace_accounts, marketplace_pricing_policies, pricing_simulations, pricing_manual_overrides
- [x] Platform packages: config, httpx, logging, pgdb
- [x] Composition root with module registration
- [x] Unit tests: service logic, handler routing, config loading, router registration
- [x] Frontend: Vite + React + react-router with feature packages
- [x] SDK runtime with typed client methods
- [x] OpenAPI contract stub
- [x] AGENTS.md and ARCHITECTURE.md (v1 — replaced by current versions)

What needs cleanup before Phase 1:

- [ ] Remove legacy files: `scripts/` (old Next.js scripts), `docs/superpowers/` (old monolith plans), `public/` (Next.js default SVGs), `templates/`
- [ ] Fix migration 0002b (merge fix into 0002, remove 0002b)
- [ ] Remove root `vitest.config.ts` (tests run via workspace)
- [ ] Update `.gitignore` for new structure

---

## Phase 1 — Foundation wiring (next)

Goal: Make the 3 existing modules functional end-to-end with real database operations.

### 1.1 Database connectivity

- [ ] Wire `pgxpool.Pool` into composition root via `pgdb.NewPool()`
- [ ] Pass pool to module adapters via dependency injection
- [ ] Implement `catalog/adapters/postgres/repository.go` — real SaveProduct, ListProducts
- [ ] Implement `marketplaces/adapters/postgres/repository.go` — real SaveAccount, SavePolicy, List operations
- [ ] Implement `pricing/adapters/postgres/repository.go` — real SaveSimulation, ListSimulations

### 1.2 Handler wiring

- [ ] Inject services into transport handlers (currently Handler structs are empty)
- [ ] Catalog handler: decode JSON body on POST, call service.CreateProduct, return created entity
- [ ] Marketplaces handler: decode JSON body on POST for accounts and policies
- [ ] Pricing handler: decode JSON body on POST, call service.RunSimulation, return result with margin data
- [ ] Add proper error responses with structured JSON errors

### 1.3 SDK and frontend

- [ ] Extend `sdk-runtime` with POST methods (createProduct, createAccount, createPolicy, runSimulation)
- [ ] Add request/response TypeScript types matching OpenAPI contract
- [ ] Update OpenAPI contract with request/response schemas
- [ ] Wire feature pages to SDK methods (form → SDK → backend → display result)

### 1.4 Migration runner

- [ ] Implement real migration runner in `cmd/migrate/main.go` (read SQL files, track applied migrations)
- [ ] Or use a lightweight migration tool (golang-migrate, goose)

### 1.5 Verification

- [ ] Integration test: create product → create account → create policy → run simulation → verify margin
- [ ] Frontend smoke test: fill form → submit → see result
- [ ] All existing unit tests still pass

---

## Phase 2 — Pricing simulator (planned)

Goal: Full-featured pricing simulation with frontend UI.

### 2.1 Backend

- [ ] Batch simulation: run simulation for all products × all active marketplaces
- [ ] Simulation history: list past simulations with snapshots
- [ ] Manual price overrides: CRUD for target prices per product per marketplace
- [ ] Margin threshold alerts: flag products below minimum margin
- [ ] Freight calculation: integrate freight cost into simulation (initially manual input, later Melhor Envios)

### 2.2 Frontend

- [ ] Pricing simulator page: cross-table (products × marketplaces) with margin cells
- [ ] Inline price editing for scenario simulation
- [ ] Health indicators: green (>20%), yellow (10-20%), red (<10%)
- [ ] Summary KPIs: total products, average margin, critical products count
- [ ] Export simulation results (CSV)

### 2.3 SDK

- [ ] Add batch simulation method
- [ ] Add simulation history method
- [ ] Add manual override methods

---

## Phase 3 — VTEX connector (planned)

Goal: Register products on VTEX via API. Sync catalog data.

### 3.1 Connector infrastructure

- [ ] Create `connectors` module with port interface
- [ ] Implement VTEX adapter: authentication, product registration, price update
- [ ] Scheduler infrastructure: cron-style job runner in the server
- [ ] Job: sync products from VTEX catalog into MPC catalog

### 3.2 Catalog enhancement

- [ ] Product registration flow: MPC → VTEX API → confirmation
- [ ] Catalog sync: VTEX → MPC (pull product data, prices, stock)
- [ ] Link MPC product_id to VTEX SKU/product IDs

### 3.3 Frontend

- [ ] Product registration form with VTEX publish button
- [ ] Sync status display (last sync, errors)

---

## Phase 4 — Messaging + Orders + Alerts (planned)

Goal: Centralized customer communication and order monitoring with SLA guardrails.

### 4.1 Messaging module

- [ ] Message entity: id, marketplace, thread_id, customer, content, status, received_at, responded_at
- [ ] Polling job: fetch messages from VTEX (and later other marketplaces)
- [ ] Unified inbox API: list messages, filter by status/marketplace
- [ ] Reply dispatch: send reply through connector adapter
- [ ] SLA tracking: 1-hour response time target

### 4.2 Orders module

- [ ] Order entity: id, marketplace, order_number, status, items, created_at, dispatched_at
- [ ] Polling job: fetch orders from VTEX
- [ ] Order timeline API: list orders with status history
- [ ] SLA tracking: 24-hour dispatch target

### 4.3 Alerts module

- [ ] Alert entity: id, type, severity, module, entity_id, message, created_at, acknowledged_at
- [ ] Alert rules: message approaching 1h SLA, order approaching 24h SLA, margin below threshold
- [ ] Alert API: list active alerts, acknowledge
- [ ] Frontend: alert badge in sidebar, alert list page

### 4.4 Frontend

- [ ] Unified inbox page (messages from all marketplaces)
- [ ] Order monitoring page with SLA countdown
- [ ] Alert dashboard with severity indicators

---

## Phase 5 — Multi-marketplace (planned)

Goal: Extend connectors to Mercado Livre, Magalu, Amazon. Unified experience.

### 5.1 Additional connectors

- [ ] Mercado Livre adapter (messages, orders, Q&A)
- [ ] Magalu adapter (messages, orders, tickets)
- [ ] Amazon adapter (messages, orders — limited by SP-API)

### 5.2 Unified features

- [ ] Cross-marketplace message inbox
- [ ] Cross-marketplace order dashboard
- [ ] Aggregated SLA metrics
- [ ] Per-marketplace performance comparison

---

## Technical debt to address

| Item | When | Description |
|---|---|---|
| Legacy cleanup | Before Phase 1 | Remove old scripts, docs/superpowers, public SVGs, templates |
| Migration 0002b | Before Phase 1 | Merge fix into 0002, remove 0002b |
| Handler DI | Phase 1 | Inject services into handlers (currently empty structs) |
| Error middleware | Phase 1 | Structured error responses with codes |
| Request validation | Phase 1 | Validate incoming JSON before processing |
| Auth | Phase 3+ | Add authentication when VTEX connector requires it |
| SDK generation | Phase 3+ | Generate TypeScript SDK from OpenAPI (currently hand-written) |
| CI/CD | Phase 2 | GitHub Actions: Go tests, frontend build, migration check |

## Success criteria per phase

- **Phase 1**: `curl POST /catalog/products` creates a real row in Postgres. Pricing simulation returns calculated margin. Frontend form submits and displays result.
- **Phase 2**: User can simulate pricing for 50+ products across 3 marketplaces in one view. Export works.
- **Phase 3**: Product registered in MPC appears in VTEX. Catalog sync pulls VTEX data.
- **Phase 4**: Messages from VTEX appear in MPC inbox. Reply from MPC reaches customer. SLA alerts fire before deadline.
- **Phase 5**: Messages from ML + Magalu appear in same inbox. One reply interface for all marketplaces.