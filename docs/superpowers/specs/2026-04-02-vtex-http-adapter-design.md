# VTEX HTTP Adapter Design

## Goal

Implement the real HTTP adapter for the VTEX Catalog API, replacing the stub adapter with actual HTTP calls. The adapter implements the existing `VTEXCatalogPort` interface (13 methods) and slots into the hexagonal architecture without changing application or domain logic.

## Architecture

### File Structure

```
apps/server_core/internal/modules/connectors/adapters/vtex/
  http/
    adapter.go    — VTEXCatalogPort implementation, orchestrates client + mapper + errors
    client.go     — HTTP wrapper (timeouts, retries, jittered exponential backoff)
    mapper.go     — Request/Response mapping (ports params ↔ VTEX API JSON)
    errors.go     — Error classifier (HTTP status → domain errors)
    config.go     — Per-method retry configuration
    types.go      — VTEX API request/response structs
```

### Flow per method

```
PipelineExecutor calls port method (e.g. CreateProduct)
  → adapter.CreateProduct(params)
    → mapper.ToVTEXProductPayload(params)        → VTEXProductRequest
    → client.Post(ctx, path, payload, retryConf)  → (status, body, err)
    → errors.classifyError(status, body, err)     → domain error or nil
    → mapper.FromVTEXProductResponse(body)        → vtexID string
  → returns (vtexID, error) to executor
```

## Components

### HTTP Client (`client.go`)

```go
type Client struct {
    baseURL    string        // https://{vtexAccount}.vtexcommercerce.com.br
    appKey     string        // X-VTEX-API-AppKey header
    appToken   string        // X-VTEX-API-AppToken header
    httpClient *http.Client  // with configurable timeout
}
```

**Responsibilities:**
- Build base URL from vtexAccount
- Inject auth headers on every request
- Retry with jittered exponential backoff (per-method config)
- Default timeout: 30s
- Return `(statusCode, body, error)` — does not classify errors

**Methods:**
```go
func (c *Client) Get(ctx, path, retryConfig)       (int, []byte, error)
func (c *Client) Post(ctx, path, body, retryConfig) (int, []byte, error)
func (c *Client) Put(ctx, path, body, retryConfig)  (int, []byte, error)
```

**Retry behavior:**
- Retryable: 429, 500, 502, 503, 504, timeouts, connection errors
- Terminal (no retry): 400, 401, 403, 404, 409
- Jitter: ±25% on exponential base

### Error Classifier (`errors.go`)

| HTTP Status | Domain Error | Behavior |
|---|---|---|
| 400 | `domain.ErrVTEXValidation` | Terminal — VTEX rejected payload |
| 401, 403 | `domain.ErrVTEXAuth` | Terminal — halts entire batch |
| 404 | `domain.ErrVTEXNotFound` | Terminal — resource does not exist |
| 429 | `domain.ErrVTEXTransient` | After retries exhausted |
| 500, 502, 503, 504 | `domain.ErrVTEXTransient` | After retries exhausted |
| Timeout/connection | `domain.ErrVTEXTransient` | After retries exhausted |

Errors wrap the VTEX message for debugging:
```go
fmt.Errorf("VTEX %d on %s %s: %s: %w", status, method, path, vtexMsg, domainErr)
```

### Per-Method Retry Config (`config.go`)

```go
type RetryConfig struct {
    MaxAttempts int
    BaseDelay   time.Duration
    JitterPct   float64  // 0.25 = ±25%
}
```

| Method | Max Attempts | Base Delay | Rationale |
|---|---|---|---|
| FindOrCreateCategory | 5 | 1s | Idempotent, safe |
| FindOrCreateBrand | 5 | 1s | Idempotent, safe |
| CreateProduct | 3 | 2s | Creates resource, reconciliation protects |
| CreateSKU | 3 | 2s | Same as product |
| AttachSpecsAndImages | 3 | 1s | Idempotent (PUT/overwrite) |
| AssociateTradePolicy | 3 | 1s | Idempotent |
| SetPrice | 2 | 2s | Overwrite, financially sensitive |
| SetStock | 2 | 2s | Overwrite, financially sensitive |
| ActivateProduct | 3 | 1s | Idempotent (boolean toggle) |
| Get* (4 methods) | 3 | 1s | Read-only, safe |

All use fixed ±25% jitter.

### Request/Response Mapper (`mapper.go` + `types.go`)

**`types.go`** — VTEX API JSON structs (request and response bodies for each entity).

**`mapper.go`** — Conversion functions:
```go
func ToVTEXProductPayload(params ports.ProductParams) VTEXProductRequest
func FromVTEXProductResponse(body []byte) (vtexID string, err error)
// ... one pair per entity type
```

**ID conversion:** VTEX uses numeric IDs (`int`). Our system stores external IDs as `string` (industry standard for third-party IDs). Mapper uses `strconv.Itoa()` on responses and `strconv.Atoi()` on requests where needed.

**VTEX API endpoints:**

| Method | VTEX Endpoint | HTTP Verb |
|---|---|---|
| FindOrCreateCategory | `/api/catalog/pvt/category` | POST |
| FindOrCreateBrand | `/api/catalog/pvt/brand` | POST |
| CreateProduct | `/api/catalog/pvt/product` | POST |
| CreateSKU | `/api/catalog/pvt/stockkeepingunit` | POST |
| AttachSpecsAndImages | `/api/catalog/pvt/stockkeepingunit/{skuId}/file` | POST |
| AssociateTradePolicy | `/api/catalog/pvt/product/{productId}/salespolicy/{policyId}` | POST |
| SetPrice | `/api/pricing/prices/{skuId}` | PUT |
| SetStock | `/api/logistics/pvt/inventory/skus/{skuId}/warehouses/{warehouseId}` | PUT |
| ActivateProduct | `/api/catalog/pvt/product/{productId}` | PUT (IsActive=true) |
| GetProduct | `/api/catalog/pvt/product/{productId}` | GET |
| GetSKU | `/api/catalog/pvt/stockkeepingunit/{skuId}` | GET |
| GetCategory | `/api/catalog/pvt/category/{categoryId}` | GET |
| GetBrand | `/api/catalog/pvt/brand/{brandId}` | GET |

### Adapter (`adapter.go`)

```go
type Adapter struct {
    client *Client
}

func NewAdapter(appKey, appToken, vtexAccount string) *Adapter
```

Implements `ports.VTEXCatalogPort`. Each method follows the same pattern: mapper → client → error classify → mapper.

## Credentials & Config

**`.env` (local, already in `.gitignore`):**
```env
VTEX_APP_KEY=vtexappkey-xxxx-xxxx
VTEX_APP_TOKEN=XXXXXXXXXXXXXXXXXXXXXXXXXXXX
VTEX_ACCOUNT=mystore
```

**Startup behavior:**
- If any of the 3 vars is missing → app does NOT start, logs fatal error
- No fallback to stub adapter — fail fast
- Stub adapter is only used in unit tests

**Security:**
- Never log appKey/appToken
- Auth headers only in `client.go`, never exposed elsewhere

## Wiring

In `composition/root.go`:
```go
// Replace:
// vtexAdapter := connectorsstub.NewAdapter()
// With:
vtexAdapter := connectorshttp.NewAdapter(cfg.VTEXAppKey, cfg.VTEXAppToken, cfg.VTEXAccount)
```

## Testing Strategy

Test against real VTEX, step-by-step, with manual authorization at each stage.

**Test sequence (9 steps):**
1. Create category → review request/response → approve → next
2. Create brand → idem
3. Create product (using category + brand from steps 1-2) → idem
4. Create SKU (using product from step 3) → idem
5. Attach specs/images → idem
6. Associate trade policy → idem
7. Set price → idem
8. Set stock → idem
9. Activate product → idem
10. Get product/SKU/category/brand → verify all exists

**Execution:** Integration test file (`tests/integration/vtex_adapter_test.go`) with each step as a separate function. Output shows request sent + response received + vtexID returned. User validates in VTEX admin panel.

**Cleanup:** Deactivate/remove test resources in VTEX after testing (manual or via API).
