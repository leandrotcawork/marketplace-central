# VTEX Connector Design

## Goal

Build a `connectors` module that lets users manually select products in Marketplace Central, trigger a batch publication to VTEX, and track per-product progress through a 9-step catalog pipeline. The VTEX adapter is stubbed initially (no credentials yet); the real HTTP adapter slots in without changing application logic.

## Architecture

The connector follows the same hexagonal module structure as `catalog`, `marketplaces`, and `pricing`:

```
apps/server_core/internal/modules/connectors/
  domain/           — PublicationBatch, PublicationOperation, PipelineStepResult, VTEXEntityMapping
  application/      — BatchOrchestrator, PipelineExecutor
  ports/            — VTEXCatalogPort interface, ConnectorsRepository interface
  adapters/
    postgres/       — ConnectorsRepository implementation
    vtex/
      stub/         — stubbed VTEXCatalogPort (returns fake VTEX IDs)
      http/         — real HTTP adapter (placeholder, wired when credentials arrive)
  transport/        — HTTP handlers for publish, status, retry
  events/           — doc.go placeholder
  readmodel/        — doc.go placeholder
```

The module is registered in `composition/root.go` following the existing DI pattern.

## Components

### Domain Entities

**PublicationBatch**
```
batch_id        string  (UUID)
tenant_id       string
vtex_account    string  — VTEX store account name
status          string  — pending | in_progress | completed | failed
total_products  int
succeeded_count int
failed_count    int
created_at      time.Time
completed_at    *time.Time
```

**PublicationOperation**
```
operation_id  string  (UUID)
batch_id      string
tenant_id     string
vtex_account  string
product_id    string
current_step  string  — one of the 9 step names
status        string  — pending | in_progress | succeeded | failed
error_code    string  — structured: CONNECTORS_PUBLISH_<REASON>
error_message string
created_at    time.Time
updated_at    time.Time
```

**PipelineStepResult**
```
step_result_id  string  (UUID)
operation_id    string
tenant_id       string
step_name       string  — category | brand | product | sku | specs_images | trade_policy | price | stock | activate
status          string  — pending | in_progress | succeeded | failed | skipped
vtex_entity_id  *string — VTEX ID returned by the step (nil for steps that don't create entities: specs_images, trade_policy, price, stock, activate)
attempt_count   int
error_code      string
error_message   string
started_at      *time.Time
completed_at    *time.Time
```

**VTEXEntityMapping**
```
mapping_id    string  (UUID)
tenant_id     string
vtex_account  string  — scopes the mapping to a specific VTEX store
entity_type   string  — category | brand | product | sku
local_id      string
vtex_id       string
created_at    time.Time
updated_at    time.Time

Unique constraint: (tenant_id, vtex_account, entity_type, local_id)
```

### Port Interface

**VTEXCatalogPort**
```go
type VTEXCatalogPort interface {
    // Shared resources (steps 1-2)
    FindOrCreateCategory(ctx context.Context, params CategoryParams) (vtexID string, err error)
    FindOrCreateBrand(ctx context.Context, params BrandParams) (vtexID string, err error)

    // Per-product pipeline (steps 3-9)
    CreateProduct(ctx context.Context, params ProductParams) (vtexID string, err error)
    CreateSKU(ctx context.Context, params SKUParams) (vtexID string, err error)
    AttachSpecsAndImages(ctx context.Context, params SpecsImagesParams) error
    AssociateTradePolicy(ctx context.Context, params TradePolicyParams) error
    SetPrice(ctx context.Context, params PriceParams) error
    SetStock(ctx context.Context, params StockParams) error
    ActivateProduct(ctx context.Context, params ActivateParams) error

    // Read-first verification (used in tests and pre-write checks)
    GetProduct(ctx context.Context, vtexAccount, vtexID string) (ProductData, error)
    GetSKU(ctx context.Context, vtexAccount, vtexID string) (SKUData, error)
    GetCategory(ctx context.Context, vtexAccount, vtexID string) (CategoryData, error)
    GetBrand(ctx context.Context, vtexAccount, vtexID string) (BrandData, error)
}
```

Each param struct carries `VTEXAccount` plus the relevant local entity data and any previously resolved VTEX IDs (e.g., `SKUParams` carries `VTEXProductID` from step 3).

**Typed errors returned by the port:**
- `ErrVTEXValidation` — VTEX rejected the payload (terminal, halt pipeline)
- `ErrVTEXNotFound` — referenced VTEX resource does not exist (terminal)
- `ErrVTEXTransient` — timeout, rate limit, 5xx (retryable in future)
- `ErrVTEXAuth` — 401/403, credentials invalid (terminal, halt entire batch)

### Application Layer

**BatchOrchestrator** — owns the full publication flow:

1. **Preflight validation** — checks each product has name, at least one SKU, category, brand, price, and stock quantity. Invalid products get `PublicationOperation` created with status `failed` and error `CONNECTORS_PUBLISH_MISSING_<FIELD>`. Valid products proceed.
2. **Concurrency check** — queries for any active (non-terminal) operation for each `(tenant_id, vtex_account, product_id)`. If found, rejects with `CONNECTORS_PUBLISH_ALREADY_IN_PROGRESS`.
3. **Shared resource resolution** — collects unique categories and brands across valid products. For each: check `VTEXEntityMapping` first (cache hit → reuse); if not mapped, call `FindOrCreateCategory` / `FindOrCreateBrand`, persist mapping. If a shared resource fails, all products depending on it are marked `failed` with `CONNECTORS_PUBLISH_DEPENDENCY_FAILED`.
4. **Per-product fan-out** — for each valid product with resolved dependencies, runs steps 3–9 sequentially via `PipelineExecutor`. Each product runs independently — one failure does not block others.
5. **Batch completion** — once all operations reach a terminal state, updates `PublicationBatch.status`, `succeeded_count`, `failed_count`.

**PipelineExecutor** — runs steps 3–9 for a single operation:
- For each step: checks `VTEXEntityMapping` first (reconciliation-first, idempotent re-entry)
- On success: persists `VTEXEntityMapping` if applicable, writes `PipelineStepResult` with `succeeded`
- On failure: writes `PipelineStepResult` with `failed` + structured error, halts pipeline for this product
- Activation (step 9) only executes if all prior steps are `succeeded`

**Retry** — re-runs all failed operations in a batch from their `current_step`. Re-runs shared resource resolution if any shared resource step had failed. Each retry increments `attempt_count` on the step result.

### Transport Layer

**`POST /connectors/vtex/publish`**

Request:
```json
{
  "product_ids": ["prod_1", "prod_2", "prod_3"],
  "vtex_account": "mystore"
}
```

Response 201:
```json
{
  "batch_id": "batch_abc",
  "total_products": 3,
  "validated": 2,
  "rejected": 1,
  "rejections": [
    { "product_id": "prod_3", "error_code": "CONNECTORS_PUBLISH_MISSING_SKU" }
  ]
}
```

Pipeline execution runs after the response is returned. For the initial implementation (manual, few products) this runs inline in a goroutine spawned after the response is written.

**`GET /connectors/vtex/publish/batch/{batch_id}`**

Response 200:
```json
{
  "batch_id": "batch_abc",
  "vtex_account": "mystore",
  "status": "in_progress",
  "total": 2,
  "succeeded": 1,
  "failed": 0,
  "in_progress": 1,
  "operations": [
    {
      "product_id": "prod_1",
      "status": "succeeded",
      "current_step": "activate",
      "error_code": null
    },
    {
      "product_id": "prod_2",
      "status": "in_progress",
      "current_step": "price",
      "error_code": null
    }
  ]
}
```

**`POST /connectors/vtex/publish/batch/{batch_id}/retry`**

Retries all failed operations in the batch from their failed step. Returns same shape as the publish response.

All three endpoints added to `contracts/api/marketplace-central.openapi.yaml`.

## Data Flow

```
User selects products → POST /connectors/vtex/publish
  → BatchOrchestrator.CreateBatch()
      → Preflight validation (local data checks)
      → Concurrency lock check (DB query per product)
      → Shared resource resolution (categories, brands)
          → VTEXEntityMapping lookup → cache hit: reuse vtex_id
          → cache miss: VTEXCatalogPort.FindOrCreateCategory/Brand()
          → Persist mapping
      → Per-product fan-out (sequential — one product at a time, simpler for manual use)
          → PipelineExecutor.Run(operation)
              → For each step (3-9):
                  → VTEXEntityMapping lookup (reconciliation)
                  → VTEXCatalogPort.StepMethod()
                  → Persist VTEXEntityMapping + PipelineStepResult
                  → On failure: persist error, halt this product
      → Batch completion update
  ← 201 batch_id returned immediately

User polls → GET /connectors/vtex/publish/batch/{batch_id}
  → Read PublicationBatch + PublicationOperation records
  ← Live status

User retries → POST /connectors/vtex/publish/batch/{batch_id}/retry
  → Re-run failed operations from current_step
```

## Error Handling

- All errors carry structured codes: `CONNECTORS_<ENTITY>_<REASON>` (e.g., `CONNECTORS_PUBLISH_MISSING_SKU`, `CONNECTORS_PUBLISH_DEPENDENCY_FAILED`)
- Port errors are classified (terminal vs. transient) and mapped to domain error codes before persistence
- `ErrVTEXAuth` halts the entire batch immediately, marks all pending operations as failed
- A product with a failed shared resource dependency is marked failed without attempting further steps
- Every handler logs `action`, `result`, `duration_ms`
- No panic() in any path

## Testing Approach

**Unit tests** (`apps/server_core/tests/unit/`):
- `BatchOrchestrator` with stub port + in-memory repo stubs
- Preflight validation: missing SKU, missing price, missing category
- Concurrency lock: second publish on active product is rejected
- Shared resource resolution: cache hit, cache miss, dependency failure propagation
- Step error classification: `ErrVTEXAuth` halts batch; `ErrVTEXValidation` halts product only
- Retry: resumes from correct step, increments attempt_count

**Contract tests** (conformance suite in `adapters/vtex/`):
- Fixture-driven — fixtures based on real GET responses from existing VTEX products in the account
- Both stub and real HTTP adapter must pass the same suite
- One fixture file per step (category, brand, product, sku, etc.)
- Explicit error class fixtures: what a 400 validation error looks like, what a 401 looks like

**Integration smoke test**:
- Full 9-step run for one product using stub adapter
- Verifies all `PipelineStepResult` records written with correct step names and statuses
- Verifies `VTEXEntityMapping` records persisted with correct entity types
- Verifies `PublicationBatch` status transitions from `pending` → `in_progress` → `completed`

## Out of Scope

- OMS order synchronization (Phase 4)
- Customer message polling (Phase 4)
- Real-time webhooks from VTEX
- Promotional price layers (can be added to `SetPrice` params later)
- Multi-warehouse stock resolution (initial implementation writes to default warehouse)
- Frontend UI for the publish trigger and status polling (follows after backend is complete)
- Automatic scheduler-driven sync (manual on-demand only)
