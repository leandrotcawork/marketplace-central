# Product Integration — Remediation Round 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 1 CRITICAL and 3 MAJOR findings from the post-remediation audit. No new features — only correctness and compliance fixes.

**Architecture:** Belt-and-suspenders tenant isolation in MetalShopping queries (explicit `tenant_id` predicates alongside RLS). Pricing handler brought to parity with catalog/classifications logging and error code patterns. OpenAPI contract aligned with actual list response shape.

**Tech Stack:** Go 1.22+, pgx/v5, log/slog, OpenAPI 3.1.0

---

## File Structure

```
apps/server_core/internal/
  modules/
    catalog/adapters/metalshopping/
      repository.go                MODIFY — add tenant_id predicates to all queries
    pricing/
      application/service.go       MODIFY — descope: add comment documenting cost is required
      transport/http_handler.go    MODIFY — add slog logging + PRICING_* error codes
contracts/api/
  marketplace-central.openapi.yaml MODIFY — ListClassificationsResponse uses Classification not Summary
docs/superpowers/specs/
  2026-04-02-product-integration-rework-design.md  MODIFY — descope optional cost_amount
```

---

### Task 1: Add Explicit tenant_id to MetalShopping Adapter Queries

**Severity:** CRITICAL
**Files:**
- Modify: `apps/server_core/internal/modules/catalog/adapters/metalshopping/repository.go`

- [ ] **Step 1: Add tenant_id predicate to product query**

In the `queryProducts` method, change line 136:
```
WHERE p.status = 'active' ` + filterSQL(kind) + `
```
To:
```
WHERE p.tenant_id = current_setting('app.tenant_id') AND p.status = 'active' ` + filterSQL(kind) + `
```

`current_setting('app.tenant_id')` reads the value set by BeforeAcquire. This is belt-and-suspenders — RLS already filters, but the explicit predicate satisfies AGENTS.md rule.

- [ ] **Step 2: Add tenant_id predicate to taxonomy query**

In the `ListTaxonomyNodes` method, change line 77:
```
WHERE tn.is_active = true
```
To:
```
WHERE tn.tenant_id = current_setting('app.tenant_id') AND tn.is_active = true
```

- [ ] **Step 3: Add tenant_id predicate to shopping snapshot subquery**

In the `queryProducts` method, the LATERAL subquery (lines 129-135) queries `shopping_price_latest_snapshot` without any tenant filter. The shopping table may or may not have a `tenant_id` column — it depends on MetalShopping's schema. Since the subquery joins on `sp2.sku = p.sku` and products are already tenant-filtered, the risk is low. However, for explicit compliance, add a comment:

```sql
LEFT JOIN LATERAL (
    -- shopping_price_latest_snapshot is a cross-tenant view (no tenant_id column).
    -- Tenant isolation is enforced by the outer p.tenant_id predicate on catalog_products.
    SELECT sp2.observed_price
    FROM shopping_price_latest_snapshot sp2
    WHERE sp2.sku = p.sku
    ORDER BY sp2.observed_at DESC
    LIMIT 1
) sp ON true
```

If `shopping_price_latest_snapshot` DOES have a `tenant_id` column, add:
```sql
WHERE sp2.sku = p.sku AND sp2.tenant_id = current_setting('app.tenant_id')
```

Check MetalShopping's schema to determine which approach. The legacy Node.js code in `marketplace-central-review-task3/lib/metalshopping-client.ts` does NOT filter shopping by tenant — it only joins on SKU. Follow the same pattern but document it.

- [ ] **Step 4: Verify compilation**

Run: `cd apps/server_core && go build ./internal/modules/catalog/adapters/metalshopping/`
Expected: PASS

- [ ] **Step 5: Run all Go tests**

Run: `cd apps/server_core && go test ./... -count=1`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server_core/internal/modules/catalog/adapters/metalshopping/repository.go
git commit -m "fix(catalog): add explicit tenant_id predicates to MetalShopping adapter queries"
```

---

### Task 2: Add slog Logging + PRICING_* Error Codes to Pricing Handler

**Severity:** MAJOR
**Files:**
- Modify: `apps/server_core/internal/modules/pricing/transport/http_handler.go`

- [ ] **Step 1: Add imports**

Add `"log/slog"` and `"time"` to the import block.

- [ ] **Step 2: Add start timing to both handler paths**

In the `Register` method's `HandleFunc` closure, add `start := time.Now()` at the top of both the GET and POST cases.

- [ ] **Step 3: Replace generic error codes with PRICING_* codes**

Change `mapPricingError`:
```go
func mapPricingError(msg string) (int, string) {
	if strings.HasPrefix(msg, "PRICING_") {
		return http.StatusBadRequest, "PRICING_SIMULATION_INVALID"
	}
	return http.StatusInternalServerError, "PRICING_INTERNAL_ERROR"
}
```

Update `writePricingError` calls in the handler:
- Malformed body: `"PRICING_REQUEST_INVALID"` instead of `"invalid_request"`
- Method not allowed: `"PRICING_METHOD_NOT_ALLOWED"` instead of `"invalid_request"`

Do NOT expose `err.Error()` in error messages to clients. Replace `err.Error()` in message fields with generic messages like `"internal error"` or `"malformed request body"`.

- [ ] **Step 4: Add slog calls before every return**

Follow the exact pattern from the connectors handler. Example for GET:
```go
case http.MethodGet:
    start := time.Now()
    sims, err := h.svc.ListSimulations(r.Context())
    if err != nil {
        slog.Error("pricing.simulations", "action", "list", "result", "500", "duration_ms", time.Since(start).Milliseconds())
        writePricingError(w, http.StatusInternalServerError, "PRICING_INTERNAL_ERROR", "internal error")
        return
    }
    slog.Info("pricing.simulations", "action", "list", "result", "200", "count", len(sims), "duration_ms", time.Since(start).Milliseconds())
    httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": sims})
```

Example for POST:
```go
case http.MethodPost:
    start := time.Now()
    // ... decode, validate, run simulation ...
    slog.Info("pricing.simulations", "action", "create", "result", "201", "simulation_id", sim.SimulationID, "duration_ms", time.Since(start).Milliseconds())
    httpx.WriteJSON(w, http.StatusCreated, sim)
```

Error paths:
```go
    slog.Error("pricing.simulations", "action", "create", "result", "400", "duration_ms", time.Since(start).Milliseconds())
    slog.Error("pricing.simulations", "action", "create", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
```

Method not allowed:
```go
default:
    start := time.Now()
    slog.Info("pricing.simulations", "action", "reject_method", "result", "405", "duration_ms", time.Since(start).Milliseconds())
    w.Header().Set("Allow", "GET, POST")
    writePricingError(w, http.StatusMethodNotAllowed, "PRICING_METHOD_NOT_ALLOWED", "method not allowed")
```

- [ ] **Step 5: Run tests**

Run: `cd apps/server_core && go test ./tests/unit/ -v -run TestPricing -count=1`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server_core/internal/modules/pricing/transport/http_handler.go
git commit -m "fix(pricing): add slog logging and PRICING_* structured error codes"
```

---

### Task 3: Fix OpenAPI ListClassificationsResponse to Include product_ids

**Severity:** MAJOR
**Files:**
- Modify: `contracts/api/marketplace-central.openapi.yaml`

- [ ] **Step 1: Change ListClassificationsResponse items reference**

Find:
```yaml
    ListClassificationsResponse:
      type: object
      ...
        items:
          type: array
          items:
            $ref: '#/components/schemas/ClassificationSummary'
```

Replace with:
```yaml
    ListClassificationsResponse:
      type: object
      ...
        items:
          type: array
          items:
            $ref: '#/components/schemas/Classification'
```

The `Classification` schema already includes `product_ids`. The `ClassificationSummary` can remain in the spec for potential future use but is no longer referenced by the list endpoint.

- [ ] **Step 2: Verify YAML is valid**

Run: `cd contracts/api && cat marketplace-central.openapi.yaml | head -5`
Expected: Valid YAML header (basic check)

- [ ] **Step 3: Commit**

```bash
git add contracts/api/marketplace-central.openapi.yaml
git commit -m "fix(api): ListClassificationsResponse uses Classification with product_ids"
```

---

### Task 4: Descope Optional cost_amount from Spec

**Severity:** MAJOR (resolution: descope)
**Files:**
- Modify: `docs/superpowers/specs/2026-04-02-product-integration-rework-design.md`

- [ ] **Step 1: Update the spec section on pricing simulator backend**

In section 6 (Pricing Simulator Rework), find the backend change bullet:
```
- Accept `cost_amount` as optional — if omitted, resolve from MetalShopping
```

Replace with:
```
- `cost_amount` remains required in the API request. The frontend resolves cost from MetalShopping product data and sends it explicitly. Backend cost resolution is deferred to a future phase.
```

Also find:
```
- Accept `dimensions` (height_cm, width_cm, length_cm) as optional — if omitted, resolve from product enrichments. Dimensions are used for freight/shipping cost calculation in the simulation.
```

Replace with:
```
- Dimensions (height_cm, width_cm, length_cm) are not yet used in the simulation engine. When freight calculation is added in a future phase, the simulator will accept dimensions from product enrichments.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-02-product-integration-rework-design.md
git commit -m "docs(spec): descope optional cost_amount and dimensions from pricing simulator"
```

---

### Task 5: Full Verification

- [ ] **Step 1: Run all Go tests**

Run: `cd apps/server_core && go test ./... -v -count=1`
Expected: ALL PASS

- [ ] **Step 2: Run all frontend tests**

Run: `npx vitest run --reporter=verbose`
Expected: ALL PASS (45/45)

- [ ] **Step 3: Run frontend build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Verify tenant_id in MetalShopping queries**

Run: `grep -n "current_setting" apps/server_core/internal/modules/catalog/adapters/metalshopping/repository.go`
Expected: At least 2 matches (product query + taxonomy query)

- [ ] **Step 5: Verify PRICING_* error codes**

Run: `grep -n "PRICING_" apps/server_core/internal/modules/pricing/transport/http_handler.go`
Expected: At least 3 matches (INTERNAL_ERROR, REQUEST_INVALID, METHOD_NOT_ALLOWED)

- [ ] **Step 6: Verify slog in pricing handler**

Run: `grep -n "slog\." apps/server_core/internal/modules/pricing/transport/http_handler.go`
Expected: Multiple matches (at least 4)
