# Product Integration Rework — Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all CRITICAL and MAJOR issues from the implementation audit. No new features — only correctness fixes.

**Audit source:** Codex gpt-5.4 implementation audit, 2026-04-02

**Tech Stack:** Go 1.22+, pgx/v5, React 19, TypeScript, Vitest

---

## Task 1: Fix Products Page — Use SDK Types Directly

**Severity:** CRITICAL + MAJOR
**Problem:** ProductsPage defines a local `Product` type with wrong field names (`id`, `brand`, `cost`, `price`, `stock`, `taxonomy_id`, `classification_id`, `suggested_price`). The SDK uses `product_id`, `brand_name`, `cost_amount`, `price_amount`, `stock_quantity`, `taxonomy_node_id`, `suggested_price`. The enrichment save sends `suggested_price` instead of `suggested_price_amount`.

**Files:**
- Modify: `packages/feature-products/src/ProductsPage.tsx`
- Modify: `packages/feature-products/src/ProductsPage.test.tsx`

- [ ] **Step 1: Replace local types with SDK imports**

Remove the local `Product`, `TaxonomyNode`, `Classification` interfaces. Import from sdk-runtime:

```typescript
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
  ProductEnrichment,
} from "@marketplace-central/sdk-runtime";
```

Update the client interface to be typed:

```typescript
interface ProductsClient {
  listCatalogProducts: () => Promise<{ items: CatalogProduct[] }>;
  listTaxonomyNodes: () => Promise<{ items: TaxonomyNode[] }>;
  listClassifications: () => Promise<{ items: Classification[] }>;
  updateProductEnrichment: (productId: string, data: Partial<ProductEnrichment>) => Promise<ProductEnrichment>;
}
```

- [ ] **Step 2: Fix all field references in the component**

Replace throughout the file:
- `p.id` → `p.product_id`
- `p.brand` → `p.brand_name`
- `p.cost` → `p.cost_amount`
- `p.price` → `p.price_amount`
- `p.stock` → `p.stock_quantity`
- `p.taxonomy_id` → `p.taxonomy_node_id`
- `p.classification_id` → remove (products don't have classification_id — filtering by classification uses the classification's product_ids array, not a field on the product)
- `p.suggested_price` → `p.suggested_price` (this one is correct in the SDK CatalogProduct)

- [ ] **Step 3: Fix taxonomy/classification filter field references**

Taxonomy nodes: `t.id` → `t.node_id`, `t.name` stays
Classifications: `c.id` → `c.classification_id`, `c.name` stays

Fix the classification filter to use `product_ids` from the classification:
```typescript
const matchesClassification =
  !classificationFilter ||
  classifications.find(c => c.classification_id === classificationFilter)
    ?.product_ids?.includes(p.product_id);
```

- [ ] **Step 4: Fix enrichment save to use `suggested_price_amount`**

In `handleSaveEnrichment`:
```typescript
await client.updateProductEnrichment(editingProduct.product_id, {
  height_cm: enrichForm.height_cm ? parseFloat(enrichForm.height_cm) : null,
  width_cm: enrichForm.width_cm ? parseFloat(enrichForm.width_cm) : null,
  length_cm: enrichForm.length_cm ? parseFloat(enrichForm.length_cm) : null,
  suggested_price_amount: enrichForm.suggested_price
    ? parseFloat(enrichForm.suggested_price)
    : null,
});
```

- [ ] **Step 5: Fix EnrichmentForm helper**

`toEnrichmentForm` — `p.suggested_price` is correct (CatalogProduct uses `suggested_price`). Keep it.

- [ ] **Step 6: Update tests to use correct SDK shapes**

Replace mock data in `ProductsPage.test.tsx`:

```typescript
const sampleProducts = [
  {
    product_id: "prod-1",
    sku: "SKU-001",
    name: "Steel Bolt M10",
    description: "Steel bolt",
    brand_name: "BoltCo",
    status: "active",
    cost_amount: 2.5,
    price_amount: 5.0,
    stock_quantity: 1500,
    ean: "7890000000001",
    reference: "REF-001",
    taxonomy_node_id: "tax-1",
    taxonomy_name: "Fasteners",
    suggested_price: 4.8,
    height_cm: 1,
    width_cm: 1,
    length_cm: 5,
  },
];

// Taxonomy and classification mocks:
{ node_id: "tax-1", name: "Fasteners", level: 0, level_label: "Group", parent_node_id: "", is_active: true, product_count: 1 }
{ classification_id: "cls-1", name: "Hardware", ai_context: "", product_ids: ["prod-1"], product_count: 1, created_at: "...", updated_at: "..." }
```

- [ ] **Step 7: Run tests and verify**

Run: `cd packages/feature-products && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/feature-products/
git commit -m "fix(products): use SDK types directly — fix field mapping and enrichment save"
```

---

## Task 2: Fix Classification List to Include product_ids

**Severity:** MAJOR
**Problem:** `listClassifications` List query returns only `product_count` (via COUNT), but `ProductPicker` and Products page need `product_ids` to filter and preselect products. The SDK `Classification` type includes `product_ids: string[]` but the list endpoint never populates it.

**Files:**
- Modify: `apps/server_core/internal/modules/classifications/adapters/postgres/repository.go`
- Modify: `apps/server_core/tests/unit/classifications_service_test.go`

- [ ] **Step 1: Update the List query to include product_ids**

Replace the List method to also fetch product_ids per classification. Two approaches — use `array_agg` in the query:

```go
func (r *Repository) List(ctx context.Context) ([]domain.Classification, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT c.classification_id, c.tenant_id, c.name, c.ai_context,
		       c.created_at, c.updated_at,
		       COALESCE(array_agg(cp.product_id) FILTER (WHERE cp.product_id IS NOT NULL), '{}')
		FROM classifications c
		LEFT JOIN classification_products cp
			ON cp.classification_id = c.classification_id AND cp.tenant_id = c.tenant_id
		WHERE c.tenant_id = $1
		GROUP BY c.classification_id
		ORDER BY c.created_at DESC
	`, r.tenantID)
	if err != nil {
		return nil, fmt.Errorf("list classifications: %w", err)
	}
	defer rows.Close()

	result := make([]domain.Classification, 0)
	for rows.Next() {
		var c domain.Classification
		if err := rows.Scan(
			&c.ClassificationID, &c.TenantID, &c.Name, &c.AIContext,
			&c.CreatedAt, &c.UpdatedAt, &c.ProductIDs,
		); err != nil {
			return nil, fmt.Errorf("scan classification: %w", err)
		}
		c.ProductCount = len(c.ProductIDs)
		result = append(result, c)
	}
	return result, rows.Err()
}
```

Note: `array_agg` returns a Postgres array which pgx can scan into `[]string`.

- [ ] **Step 2: Run Go tests**

Run: `cd apps/server_core && go test ./... -v -count=1`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/modules/classifications/
git commit -m "fix(classifications): include product_ids in list response for ProductPicker"
```

---

## Task 3: Fix Classification DELETE Status Code

**Severity:** MAJOR
**Problem:** OpenAPI says DELETE `/classifications/{id}` returns 204 No Content. Handler returns 200 with JSON body `{"deleted": true}`.

**Files:**
- Modify: `apps/server_core/internal/modules/classifications/transport/http_handler.go`

- [ ] **Step 1: Fix the handleDelete method**

Change:
```go
httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true})
```
To:
```go
w.WriteHeader(http.StatusNoContent)
```

- [ ] **Step 2: Update SDK deleteJson if needed**

Check that `deleteJson` in `packages/sdk-runtime/src/index.ts` handles 204 correctly (no body to parse). It should:
```typescript
async function deleteJson(path: string): Promise<void> {
  const response = await fetchImpl(`${options.baseUrl}${path}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json();
    throw { status: response.status, error: (data as ErrorResponse).error } satisfies MarketplaceCentralClientError;
  }
  // 204 — no body to parse
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/server_core && go test ./tests/unit/ -v -count=1`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/internal/modules/classifications/transport/ packages/sdk-runtime/
git commit -m "fix(classifications): return 204 on DELETE per OpenAPI contract"
```

---

## Task 4: Add Handler Logging to New Endpoints

**Severity:** MAJOR
**Problem:** AGENTS.md requires every handler to log `action`, `result`, `duration_ms`. The new catalog and classifications handlers have no logger dependency.

**Files:**
- Modify: `apps/server_core/internal/modules/catalog/transport/http_handler.go`
- Modify: `apps/server_core/internal/modules/classifications/transport/http_handler.go`
- Modify: `apps/server_core/internal/composition/root.go`

- [ ] **Step 1: Check the existing connectors handler for the logging pattern**

Read `apps/server_core/internal/modules/connectors/transport/http_handler.go` to see how it does logging. Follow the same pattern.

- [ ] **Step 2: Add logger to catalog Handler struct**

```go
type Handler struct {
	Service application.Service
	Logger  *slog.Logger
}
```

Wrap each handler method with timing:
```go
func (h Handler) handleProducts(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	// ... existing logic ...
	h.Logger.Info("catalog.products", "action", "list", "result", status, "duration_ms", time.Since(start).Milliseconds())
}
```

- [ ] **Step 3: Add logger to classifications Handler struct**

Same pattern.

- [ ] **Step 4: Wire logger in composition root**

Pass `slog.Default()` or the platform logger to both handlers.

- [ ] **Step 5: Run tests — update test setup if handler struct changed**

Run: `cd apps/server_core && go test ./... -v -count=1`
Expected: PASS (tests may need logger field set to `slog.Default()`)

- [ ] **Step 6: Commit**

```bash
git add apps/server_core/
git commit -m "fix(transport): add action/result/duration_ms logging to catalog and classifications handlers"
```

---

## Task 5: Align OpenAPI Error Codes with Handler Implementation

**Severity:** MAJOR
**Problem:** Handlers use `MODULE_ENTITY_REASON` codes (e.g., `CATALOG_PRODUCT_NOT_FOUND`) but OpenAPI still lists old generic codes (`invalid_request`, `internal_error`).

**Files:**
- Modify: `contracts/api/marketplace-central.openapi.yaml`

- [ ] **Step 1: Update error code enum in OpenAPI**

Add the new module-specific codes to the ErrorResponse schema:
```yaml
code:
  type: string
  enum:
    - invalid_request
    - not_found
    - conflict
    - internal_error
    # Catalog
    - CATALOG_METHOD_NOT_ALLOWED
    - CATALOG_INTERNAL_ERROR
    - CATALOG_PRODUCT_NOT_FOUND
    - CATALOG_SEARCH_QUERY_REQUIRED
    - CATALOG_ENRICHMENT_INVALID
    # Classifications
    - CLASSIFICATIONS_METHOD_NOT_ALLOWED
    - CLASSIFICATIONS_INTERNAL_ERROR
    - CLASSIFICATIONS_ENTITY_NOT_FOUND
    - CLASSIFICATIONS_CREATE_INVALID
```

Or use `oneOf` / remove the enum and document codes per-endpoint in description.

- [ ] **Step 2: Commit**

```bash
git add contracts/api/
git commit -m "docs(api): align error codes with MODULE_ENTITY_REASON format in handlers"
```

---

## Task 6: Simulator Results — Add Missing Columns

**Severity:** MINOR
**Problem:** Spec says results table should include suggested price, commission/freight/fees breakdown, and dimensions. Current table has: Product, Cost, Base Price, Margin, Margin %, Status — missing the breakdown columns.

**Files:**
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.tsx`

- [ ] **Step 1: Add suggested price column**

After the Cost column, add:
```tsx
<th>Suggested (R$)</th>
...
<td>{row.product.suggested_price ? formatCurrency(row.product.suggested_price) : "—"}</td>
```

- [ ] **Step 2: Add commission/freight/fees breakdown**

The current `PricingSimulation` response only has `margin_amount`, `margin_percent`, `status`. The breakdown (commission, freight, fees) is not returned by the backend. This is a backend limitation — the pricing service calculates these internally but doesn't persist or return them.

**Decision needed:** Either extend the backend `Simulation` domain to return the breakdown, or accept the current level of detail. For now, note this as a known gap and skip — the simulator is functional without it.

- [ ] **Step 3: Run tests**

Run: `cd packages/feature-simulator && npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/feature-simulator/
git commit -m "fix(simulator): add suggested price column to results table"
```

---

## Task 7: Run Full Verification

- [ ] **Step 1: Run all Go tests**

Run: `cd apps/server_core && go test ./... -v`
Expected: ALL PASS

- [ ] **Step 2: Run all frontend tests**

Run: `npx vitest run --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 3: Run frontend build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: remediation verification — all tests passing"
```
