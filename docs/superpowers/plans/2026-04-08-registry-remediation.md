# Implementation Plan — Registry Audit Remediation
> Audit: post-execution audit of `feat/marketplace-registry`
> Date: 2026-04-08 | Branch: `feat/marketplace-registry`
> Codex hardening: 2 rounds — QUALITY + OPERATIONS

Fixes two MAJOR audit findings plus all structural root causes uncovered in Codex hardening.

---

## Findings Fixed

| # | Severity | Finding | Root Cause |
|---|---|---|---|
| 1 | MAJOR | LookupFee skips `listing_type IS NULL` catch-all rows when listingType is non-empty | SQL predicate doesn't model "NULL = applies to all types" |
| 2 | MAJOR | Admin endpoints missing from OpenAPI contract | Plan incomplete — verify as parity gap, not creation |
| 3 | STRUCTURAL | `BatchProduct` carries no category → orchestrator hardcodes `"default"` → 4-level fee fallback unreachable from real pricing path | `BatchProduct` never got `CategoryID`; catalog reader doesn't map it |
| 4 | STRUCTURAL | `pricing/adapters/marketplace/reader.go` drops `MarketplaceCode` + `CommissionOverride` in `fromDomain` | Fields added to domain were not mapped in adapter |
| 5 | STRUCTURAL | `POST /marketplaces/policies` transport drops `commission_override` JSON field | Transport struct not updated after domain change |
| 6 | STRUCTURAL | SDK types stale: `MarketplacePolicy` missing `commission_override`, `MarketplaceAccount` missing `marketplace_code` | SDK not updated when transport/domain changed |
| 7 | LOCAL | `valid_from` date filter missing from LookupFee SQL (table has both `valid_from` and `valid_to`) | Oversight in original plan |

---

## File Map

```
apps/server_core/internal/modules/pricing/ports/
  batch_ports.go                              MODIFIED — add CategoryID to BatchProduct

apps/server_core/internal/modules/pricing/adapters/catalog/
  reader.go                                   MODIFIED — map CategoryID from TaxonomyNodeID

apps/server_core/internal/modules/pricing/adapters/marketplace/
  reader.go                                   MODIFIED — map MarketplaceCode + CommissionOverride
  reader_test.go                              MODIFIED — test new field mapping

apps/server_core/internal/modules/pricing/application/
  batch_orchestrator.go                       MODIFIED — pass prod.CategoryID to LookupFee
  batch_orchestrator_test.go                  NEW — three-level fallback precedence tests

apps/server_core/internal/modules/marketplaces/adapters/postgres/
  fee_schedule_repo.go                        MODIFIED — LookupFee SQL rewrite (single query + valid_from)

apps/server_core/internal/modules/marketplaces/application/
  fee_schedule_service_test.go                MODIFIED — stubFeeRepo fix + 4 listing_type tests

apps/server_core/internal/modules/marketplaces/transport/
  http_handler.go                             MODIFIED — commission_override in POST /policies

contracts/api/marketplace-central.openapi.yaml
                                              MODIFIED — admin endpoints + schema fields (parity)

packages/sdk-runtime/src/index.ts            MODIFIED — MarketplaceAccount + Policy types updated

IMPLEMENTATION_PLAN.md                        MODIFIED — Phase 3 entry corrected (repo root)
```

---

## Group 1 — Wire Category Through Pricing Path

### Task 1 — Add `CategoryID` to `BatchProduct`

File: `apps/server_core/internal/modules/pricing/ports/batch_ports.go`

Add one field to `BatchProduct`:

```go
type BatchProduct struct {
    ProductID      string
    SKU            string
    CategoryID     string  // ADD — taxonomy node ID used as fee schedule category proxy; empty = use "default"
    CostAmount     float64
    PriceAmount    float64
    SuggestedPrice *float64
    HeightCM       *float64
    WidthCM        *float64
    LengthCM       *float64
    WeightG        *float64
}
```

**Verification:** `go build ./apps/server_core/...` — zero errors.

---

### Task 2 — Populate `CategoryID` in catalog reader

File: `apps/server_core/internal/modules/pricing/adapters/catalog/reader.go`

In `GetProductsForBatch`, add `CategoryID: p.TaxonomyNodeID` to the `BatchProduct{}` literal:

```go
result = append(result, pricingports.BatchProduct{
    ProductID:      p.ProductID,
    SKU:            p.SKU,
    CategoryID:     p.TaxonomyNodeID,  // ADD — maps catalog taxonomy to fee schedule category proxy
    CostAmount:     p.CostAmount,
    PriceAmount:    p.PriceAmount,
    SuggestedPrice: p.SuggestedPrice,
    HeightCM:       p.HeightCM,
    WidthCM:        p.WidthCM,
    LengthCM:       p.LengthCM,
    WeightG:        p.WeightG,
})
```

**Verification:** `go build ./apps/server_core/...` — zero errors.

---

### Task 3 — Pass real `CategoryID` in orchestrator fee lookup

File: `apps/server_core/internal/modules/pricing/application/batch_orchestrator.go`

Find the fee lookup block (currently hardcodes `"default"`):

```go
// BEFORE:
if fee, found, err := o.feeLookup.LookupFee(ctx, pol.MarketplaceCode, "default", ""); err == nil && found {
```

Replace with:

```go
// AFTER:
categoryID := prod.CategoryID
if categoryID == "" {
    categoryID = "default"
}
if fee, found, err := o.feeLookup.LookupFee(ctx, pol.MarketplaceCode, categoryID, ""); err == nil && found {
```

**Verification:** `go build ./apps/server_core/...` — zero errors.

---

### Task 4 — Commit Group 1

```bash
git add \
  apps/server_core/internal/modules/pricing/ports/batch_ports.go \
  apps/server_core/internal/modules/pricing/adapters/catalog/reader.go \
  apps/server_core/internal/modules/pricing/application/batch_orchestrator.go
git commit -m "feat(pricing): wire product CategoryID through BatchProduct for fee schedule lookup"
```

---

## Group 2 — Fix Pricing Adapter + Transport

### Task 5 — Map `MarketplaceCode` and `CommissionOverride` in reader adapter

File: `apps/server_core/internal/modules/pricing/adapters/marketplace/reader.go`

**Problem:** `fromDomain` omits two fields added in Phase 3. The orchestrator reads both — they are always zero/nil in production.

Replace `fromDomain`:

```go
func fromDomain(p marketplacesdomain.Policy) pricingports.BatchPolicy {
    return pricingports.BatchPolicy{
        PolicyID:           p.PolicyID,
        AccountID:          p.AccountID,
        MarketplaceCode:    p.MarketplaceCode,    // required for fee schedule lookup
        CommissionPercent:  p.CommissionPercent,
        CommissionOverride: p.CommissionOverride,  // nil = use fee schedule / policy rate
        FixedFeeAmount:     p.FixedFeeAmount,
        DefaultShipping:    p.DefaultShipping,
        MinMarginPercent:   p.MinMarginPercent,
        ShippingProvider:   p.ShippingProvider,
    }
}
```

**Verification:** `go build ./apps/server_core/...` — zero errors.

---

### Task 6 — Add field-mapping test to `reader_test.go`

File: `apps/server_core/internal/modules/pricing/adapters/marketplace/reader_test.go`

Read the existing file first (match the `fakeMarketplacesService` stub pattern exactly). Append:

```go
func TestReader_GetPoliciesForBatch_MapsMarketplaceCodeAndCommissionOverride(t *testing.T) {
    override := 0.05
    svc := &fakeMarketplacesService{policiesByID: map[string]domain.Policy{
        "p1": {
            PolicyID:           "p1",
            AccountID:          "a1",
            MarketplaceCode:    "mercado_livre",
            CommissionPercent:  0.16,
            CommissionOverride: &override,
        },
    }}
    reader := NewReader(svc)
    policies, err := reader.GetPoliciesForBatch(context.Background(), []string{"p1"})
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if len(policies) != 1 {
        t.Fatalf("expected 1 policy, got %d", len(policies))
    }
    got := policies[0]
    if got.MarketplaceCode != "mercado_livre" {
        t.Errorf("MarketplaceCode: expected mercado_livre, got %q", got.MarketplaceCode)
    }
    if got.CommissionOverride == nil || *got.CommissionOverride != 0.05 {
        t.Errorf("CommissionOverride: expected 0.05, got %v", got.CommissionOverride)
    }
}
```

**Verification:** `cd apps/server_core && go test ./internal/modules/pricing/adapters/marketplace/...`
Expected: `ok` — all tests pass.

---

### Task 7 — Wire `commission_override` through policy transport handler

File: `apps/server_core/internal/modules/marketplaces/transport/http_handler.go`

In the `case http.MethodPost:` block for `/marketplaces/policies`, add `CommissionOverride *float64` to the request struct and pass it through.

Change the request struct to add (after `CommissionPercent`):

```go
CommissionOverride *float64 `json:"commission_override"`
```

Add to the `CreatePolicyInput{}` literal:

```go
CommissionOverride: req.CommissionOverride,
```

**Verification:** `go build ./apps/server_core/...` — zero errors.

---

### Task 8 — Commit Group 2

```bash
git add \
  apps/server_core/internal/modules/pricing/adapters/marketplace/reader.go \
  apps/server_core/internal/modules/pricing/adapters/marketplace/reader_test.go \
  apps/server_core/internal/modules/marketplaces/transport/http_handler.go
git commit -m "fix(pricing): map MarketplaceCode + CommissionOverride in reader adapter; wire commission_override in policy handler"
```

---

## Group 3 — Fix `LookupFee` SQL

### Task 9 — Rewrite `LookupFee` with single priority-ordered query + `valid_from` guard

File: `apps/server_core/internal/modules/marketplaces/adapters/postgres/fee_schedule_repo.go`

**Problem 1:** Current loop predicate `(listing_type = $3 OR ($3 = '' AND listing_type IS NULL))` silently skips `listing_type IS NULL` catch-all rows when caller passes a non-empty listing type.

**Problem 2:** `valid_from` date column exists in the table but is not checked — future-dated rows can be selected.

Replace the entire `LookupFee` method body:

```go
func (r *FeeScheduleRepository) LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (domain.FeeSchedule, bool, error) {
    var s domain.FeeSchedule
    var lt *string
    var syncedAt time.Time

    // Single query covers the full fallback matrix in one round-trip.
    // Priority (ORDER BY): exact category > "default"; exact listing_type > NULL catch-all.
    // When listingType="" only IS NULL rows are valid (caller has no listing type).
    // valid_from/valid_to enforce date-window correctness.
    err := r.pool.QueryRow(ctx, `
        SELECT id, marketplace_code, category_id, COALESCE(listing_type, ''),
               commission_percent, fixed_fee_amount, COALESCE(notes, ''), source, synced_at
        FROM marketplace_fee_schedules
        WHERE marketplace_code = $1
          AND (category_id = $2 OR category_id = 'default')
          AND (
                listing_type IS NULL
            OR  ($3 <> '' AND listing_type = $3)
          )
          AND (valid_from IS NULL OR valid_from <= current_date)
          AND (valid_to   IS NULL OR valid_to   >= current_date)
        ORDER BY
          (category_id = $2)          DESC,  -- exact category before 'default'
          (listing_type IS NOT NULL)   DESC   -- exact listing_type before NULL catch-all
        LIMIT 1
    `, marketplaceCode, categoryID, listingType).Scan(
        &s.ID, &s.MarketplaceCode, &s.CategoryID, &lt,
        &s.CommissionPercent, &s.FixedFeeAmount, &s.Notes, &s.Source, &syncedAt,
    )
    if err != nil {
        if errors.Is(err, pgx.ErrNoRows) {
            return domain.FeeSchedule{}, false, nil
        }
        return domain.FeeSchedule{}, false, err
    }
    if lt != nil {
        s.ListingType = *lt
    }
    s.SyncedAt = syncedAt
    return s, true, nil
}
```

Priority matrix (highest to lowest):

| `category_id` | `listing_type` | Condition |
|---|---|---|
| exact `categoryID` | exact `listingType` | most specific |
| exact `categoryID` | `NULL` | category catch-all |
| `"default"` | exact `listingType` | global default for listing type |
| `"default"` | `NULL` | global catch-all |

**Verification:** `go build ./apps/server_core/...` — zero errors.

---

### Task 10 — Fix `stubFeeRepo` and add listing_type tests

File: `apps/server_core/internal/modules/marketplaces/application/fee_schedule_service_test.go`

**Step A — Fix stubFeeRepo.LookupFee** to mirror the real repo priority (replaces existing method):

```go
func (s *stubFeeRepo) LookupFee(_ context.Context, code, cat, lt string) (domain.FeeSchedule, bool, error) {
    type scored struct {
        row      domain.FeeSchedule
        catScore int // 2=exact, 1=default
        ltScore  int // 2=exact, 1=null
    }
    var best *scored
    for _, row := range s.schedules {
        if row.MarketplaceCode != code {
            continue
        }
        catScore := 0
        if row.CategoryID == cat {
            catScore = 2
        } else if row.CategoryID == "default" {
            catScore = 1
        } else {
            continue
        }
        ltScore := 0
        if lt != "" && row.ListingType == lt {
            ltScore = 2
        } else if row.ListingType == "" {
            ltScore = 1
        } else {
            continue // specific listing_type row when caller passed "" — skip
        }
        c := &scored{row: row, catScore: catScore, ltScore: ltScore}
        if best == nil || c.catScore > best.catScore || (c.catScore == best.catScore && c.ltScore > best.ltScore) {
            best = c
        }
    }
    if best != nil {
        return best.row, true, nil
    }
    return domain.FeeSchedule{}, false, nil
}
```

**Step B — Append 4 new tests:**

```go
func TestLookupFee_ExactListingTypeBeatsNullCatchAll(t *testing.T) {
    repo := &stubFeeRepo{
        schedules: []domain.FeeSchedule{
            {MarketplaceCode: "mercado_livre", CategoryID: "default", ListingType: "classico", CommissionPercent: 0.16},
            {MarketplaceCode: "mercado_livre", CategoryID: "default", ListingType: "",         CommissionPercent: 0.99},
        },
    }
    svc := application.NewFeeScheduleService(repo)
    fee, found, err := svc.LookupFee(context.Background(), "mercado_livre", "electronics", "classico")
    if err != nil || !found {
        t.Fatalf("expected found, got found=%v err=%v", found, err)
    }
    if fee.CommissionPercent != 0.16 {
        t.Errorf("exact listing_type should win: expected 0.16, got %v", fee.CommissionPercent)
    }
}

func TestLookupFee_NullCatchAllUsedWhenNoExactListingType(t *testing.T) {
    repo := &stubFeeRepo{
        schedules: []domain.FeeSchedule{
            {MarketplaceCode: "mercado_livre", CategoryID: "default", ListingType: "", CommissionPercent: 0.16},
        },
    }
    svc := application.NewFeeScheduleService(repo)
    fee, found, err := svc.LookupFee(context.Background(), "mercado_livre", "electronics", "classico")
    if err != nil || !found {
        t.Fatalf("expected NULL catch-all to match, got found=%v err=%v", found, err)
    }
    if fee.CommissionPercent != 0.16 {
        t.Errorf("expected 0.16, got %v", fee.CommissionPercent)
    }
}

func TestLookupFee_ExactCategoryBeatsDefault(t *testing.T) {
    repo := &stubFeeRepo{
        schedules: []domain.FeeSchedule{
            {MarketplaceCode: "shopee", CategoryID: "electronics", ListingType: "", CommissionPercent: 0.12},
            {MarketplaceCode: "shopee", CategoryID: "default",     ListingType: "", CommissionPercent: 0.14},
        },
    }
    svc := application.NewFeeScheduleService(repo)
    fee, found, err := svc.LookupFee(context.Background(), "shopee", "electronics", "")
    if err != nil || !found {
        t.Fatalf("expected found, got found=%v err=%v", found, err)
    }
    if fee.CommissionPercent != 0.12 {
        t.Errorf("exact category should win: expected 0.12, got %v", fee.CommissionPercent)
    }
}

func TestLookupFee_EmptyListingTypeSkipsSpecificRows(t *testing.T) {
    repo := &stubFeeRepo{
        schedules: []domain.FeeSchedule{
            {MarketplaceCode: "mercado_livre", CategoryID: "default", ListingType: "classico", CommissionPercent: 0.16},
            {MarketplaceCode: "mercado_livre", CategoryID: "default", ListingType: "premium",  CommissionPercent: 0.22},
        },
    }
    svc := application.NewFeeScheduleService(repo)
    _, found, err := svc.LookupFee(context.Background(), "mercado_livre", "any_cat", "")
    if err != nil {
        t.Fatal(err)
    }
    if found {
        t.Error("expected not found — no NULL catch-all, caller passed empty listing type")
    }
}
```

**Verification:** `cd apps/server_core && go test ./internal/modules/marketplaces/application/...`
Expected: `ok` — 7 tests pass (3 original + 4 new).

---

### Task 11 — Commit Group 3

```bash
git add \
  apps/server_core/internal/modules/marketplaces/adapters/postgres/fee_schedule_repo.go \
  apps/server_core/internal/modules/marketplaces/application/fee_schedule_service_test.go
git commit -m "fix(marketplaces): rewrite LookupFee with single-query priority matrix and valid_from guard"
```

---

## Group 4 — BatchOrchestrator Precedence Tests

### Task 12 — Create `batch_orchestrator_test.go`

File: `apps/server_core/internal/modules/pricing/application/batch_orchestrator_test.go` (NEW)

The stubs must implement the exact interface signatures from `pricing/ports/batch_ports.go`:
- `ProductProvider.GetProductsForBatch(ctx, productIDs []string) ([]BatchProduct, error)`
- `PolicyProvider.GetPoliciesForBatch(ctx, policyIDs []string) ([]BatchPolicy, error)`
- `FreightQuoter.IsConnected(ctx context.Context) (bool, error)` AND `QuoteFreight(ctx context.Context, req FreightRequest) (map[string]FreightResult, error)`
- `FeeScheduleLookup.LookupFee(ctx, marketplaceCode, categoryID, listingType string) (MarketplaceFees, bool, error)`

Product is priced at `prod.PriceAmount`. Use `PriceAmount: 200` to get predictable commission math.

```go
package application_test

import (
    "context"
    "testing"

    "marketplace-central/apps/server_core/internal/modules/pricing/application"
    pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type stubFeeScheduleLookup struct {
    fee   pricingports.MarketplaceFees
    found bool
}

func (s *stubFeeScheduleLookup) LookupFee(_ context.Context, _, _, _ string) (pricingports.MarketplaceFees, bool, error) {
    return s.fee, s.found, nil
}

type stubBatchProductProvider struct{}

func (s *stubBatchProductProvider) GetProductsForBatch(_ context.Context, _ []string) ([]pricingports.BatchProduct, error) {
    return []pricingports.BatchProduct{
        {ProductID: "prod-1", CategoryID: "electronics", CostAmount: 100, PriceAmount: 200},
    }, nil
}

type stubBatchPolicyProvider struct {
    override        *float64
    marketplaceCode string
}

func (s *stubBatchPolicyProvider) GetPoliciesForBatch(_ context.Context, _ []string) ([]pricingports.BatchPolicy, error) {
    return []pricingports.BatchPolicy{
        {
            PolicyID:           "pol-1",
            MarketplaceCode:    s.marketplaceCode,
            CommissionPercent:  0.10,
            CommissionOverride: s.override,
            FixedFeeAmount:     0,
            DefaultShipping:    0,
            ShippingProvider:   "fixed",
            MinMarginPercent:   0.05,
        },
    }, nil
}

type stubFreightQuoter struct{}

func (s *stubFreightQuoter) IsConnected(_ context.Context) (bool, error) { return false, nil }
func (s *stubFreightQuoter) QuoteFreight(_ context.Context, _ pricingports.FreightRequest) (map[string]pricingports.FreightResult, error) {
    return nil, nil
}

func ptrF64(f float64) *float64 { return &f }

func runBatch(t *testing.T, override *float64, marketplaceCode string, feeLookup pricingports.FeeScheduleLookup) float64 {
    t.Helper()
    orch := application.NewBatchOrchestrator(
        &stubBatchProductProvider{},
        &stubBatchPolicyProvider{override: override, marketplaceCode: marketplaceCode},
        &stubFreightQuoter{},
        feeLookup,
        "tenant_default",
    )
    result, err := orch.RunBatch(context.Background(), application.BatchRunRequest{
        ProductIDs: []string{"prod-1"},
        PolicyIDs:  []string{"pol-1"},
    })
    if err != nil {
        t.Fatalf("RunBatch: %v", err)
    }
    if len(result.Items) == 0 {
        t.Fatal("expected at least one item")
    }
    return result.Items[0].CommissionAmount
}

func TestBatchOrchestrator_CommissionOverrideTakesPriority(t *testing.T) {
    // override=0.05 wins over feeLookup=0.99 and policy=0.10
    // selling=200, commission=200*0.05=10
    got := runBatch(t, ptrF64(0.05), "shopee", &stubFeeScheduleLookup{fee: pricingports.MarketplaceFees{CommissionPercent: 0.99}, found: true})
    if got != 10 {
        t.Errorf("CommissionOverride priority: expected 10, got %v", got)
    }
}

func TestBatchOrchestrator_FeeLookupUsedWhenNoOverride(t *testing.T) {
    // No override; feeLookup=0.20 wins over policy=0.10
    // selling=200, commission=200*0.20=40
    got := runBatch(t, nil, "mercado_livre", &stubFeeScheduleLookup{fee: pricingports.MarketplaceFees{CommissionPercent: 0.20}, found: true})
    if got != 40 {
        t.Errorf("fee lookup: expected 40, got %v", got)
    }
}

func TestBatchOrchestrator_PolicyRateUsedWhenLookupMisses(t *testing.T) {
    // No override; feeLookup found=false → policy=0.10
    // selling=200, commission=200*0.10=20
    got := runBatch(t, nil, "magalu", &stubFeeScheduleLookup{found: false})
    if got != 20 {
        t.Errorf("policy rate fallback: expected 20, got %v", got)
    }
}

func TestBatchOrchestrator_NilFeeLookupFallsBackToPolicy(t *testing.T) {
    // feeLookup=nil → policy=0.10
    // selling=200, commission=200*0.10=20
    got := runBatch(t, nil, "shopee", nil)
    if got != 20 {
        t.Errorf("nil feeLookup → policy: expected 20, got %v", got)
    }
}
```

**Verification:** `cd apps/server_core && go test ./internal/modules/pricing/application/...`
Expected: `ok` — all 4 new tests pass.

---

### Task 13 — Commit Group 4

```bash
git add apps/server_core/internal/modules/pricing/application/batch_orchestrator_test.go
git commit -m "test(pricing): add BatchOrchestrator three-level commission fallback precedence tests"
```

---

## Group 5 — OpenAPI Contract (parity)

> These are parity fixes — the transport handlers already exist. The spec was not updated to match.

### Task 14 — Add admin endpoints to OpenAPI

File: `contracts/api/marketplace-central.openapi.yaml`

Under `paths:`, after `/marketplaces/fee-schedules`, add:

```yaml
  /admin/fee-schedules/seed:
    post:
      operationId: seedMarketplaceFeeSchedules
      summary: Force-seed fee schedules for a marketplace
      tags: [admin]
      parameters:
        - name: marketplace_code
          in: query
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  marketplace_code: { type: string }
                  seeded:           { type: integer }
        "400":
          description: Unknown marketplace_code or missing param
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /admin/fee-schedules/sync:
    post:
      operationId: syncMarketplaceFeeSchedules
      summary: Force-sync fee schedules for a marketplace
      tags: [admin]
      parameters:
        - name: marketplace_code
          in: query
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  marketplace_code: { type: string }
                  synced:           { type: integer }
        "400":
          description: Unknown marketplace_code or missing param
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
```

---

### Task 15 — Update `CreateMarketplaceAccountRequest` schema

File: `contracts/api/marketplace-central.openapi.yaml`

In `components.schemas.CreateMarketplaceAccountRequest`, add two optional properties (do NOT add to `required`):

```yaml
        marketplace_code:
          type: string
          description: "Registered marketplace plugin code (e.g. mercado_livre, shopee, magalu)."
        credentials_json:
          type: object
          additionalProperties:
            type: string
          description: "Credential key-value pairs matching credential_schema. Write-only — not returned in list responses."
```

---

### Task 16 — Update policy schemas

File: `contracts/api/marketplace-central.openapi.yaml`

**A — `CreateMarketplacePolicyRequest`:** Add after `commission_percent`:
```yaml
        commission_override:
          type: number
          format: double
          nullable: true
          description: "When set, overrides fee_schedules lookup. Null = use standard schedule."
```

**B — `MarketplacePolicy`** (response schema): Add after `commission_percent`:
```yaml
        marketplace_code:
          type: string
          description: "The marketplace this policy applies to."
        commission_override:
          type: number
          format: double
          nullable: true
          description: "Tenant-specific override. Null = standard fee schedule applies."
```

**Verification:**
```bash
python3 -c "import yaml; yaml.safe_load(open('contracts/api/marketplace-central.openapi.yaml')); print('YAML OK')"
```
Expected: `YAML OK`

---

### Task 17 — Commit Group 5

```bash
git add contracts/api/marketplace-central.openapi.yaml
git commit -m "fix(api): add admin fee-schedule endpoints and missing schema fields to OpenAPI contract"
```

---

## Group 6 — SDK Types

### Task 18 — Update SDK type definitions

File: `packages/sdk-runtime/src/index.ts`

**A — `MarketplaceAccount`:** Add `marketplace_code` after `channel_code`:
```typescript
export interface MarketplaceAccount {
  account_id: string;
  tenant_id: string;
  channel_code: string;
  marketplace_code: string;   // ADD
  display_name: string;
  status: string;
  connection_mode: string;
}
```

**B — `MarketplacePolicy`:** Add `marketplace_code` after `account_id`, `commission_override` after `commission_percent`:
```typescript
export interface MarketplacePolicy {
  policy_id: string;
  tenant_id: string;
  account_id: string;
  marketplace_code: string;           // ADD
  commission_percent: number;
  commission_override: number | null; // ADD
  fixed_fee_amount: number;
  default_shipping: number;
  tax_percent: number;
  min_margin_percent: number;
  sla_question_minutes: number;
  sla_dispatch_hours: number;
  shipping_provider: string;
}
```

**C — `CreateMarketplacePolicyRequest`:** Add `commission_override` as optional:
```typescript
export interface CreateMarketplacePolicyRequest {
  policy_id: string;
  account_id: string;
  commission_percent: number;
  commission_override?: number | null; // ADD
  fixed_fee_amount: number;
  default_shipping: number;
  min_margin_percent: number;
  sla_question_minutes: number;
  sla_dispatch_hours: number;
  shipping_provider?: string;
}
```

**Note:** `CreateMarketplaceAccountRequest` already has `marketplace_code?` and `credentials_json?` — verify and skip if present.

**Verification:** No TypeScript build errors referencing these interfaces.

---

### Task 19 — Commit Group 6

```bash
git add packages/sdk-runtime/src/index.ts
git commit -m "fix(sdk): add marketplace_code and commission_override to MarketplaceAccount/Policy types"
```

---

## Group 7 — Plan Documentation

### Task 20 — Update `IMPLEMENTATION_PLAN.md`

File: `IMPLEMENTATION_PLAN.md` (repo root — NOT `docs/`)

Read the file first. Find the Phase 3 entry and replace it with:

```markdown
### Phase 3 — Marketplace Registry & Fee Foundation (COMPLETE — 2026-04-08)

**Branch:** `feat/marketplace-registry`
**Spec:** `docs/superpowers/specs/2026-04-08-marketplace-registry-design.md`
**Plan:** `docs/superpowers/plans/2026-04-08-marketplace-registry.md`

Three-layer marketplace plugin architecture:
- `marketplace_definitions` (global, code-defined) — mercado_livre, shopee, magalu
- `marketplace_fee_schedules` (global, DB seeded at startup) — per-category commission rates
- `marketplace_accounts` + `marketplace_pricing_policies` (per-tenant)

Fee lookup fallback chain: `CommissionOverride → fee_schedules (4-level: exact category + listing_type priority) → policy.CommissionPercent`

Deliverables: migrations 0010–0013, registry package, FeeScheduleService, FeeSyncService, connector seed adapters (ML 16%/22%, Shopee 8 categories, Magalu 7 categories), transport (definitions, fee-schedules, admin seed/sync endpoints), FeeScheduleLookup injected into BatchOrchestrator, frontend dynamic credential form.
```

---

### Task 21 — Commit Group 7

```bash
git add IMPLEMENTATION_PLAN.md
git commit -m "docs: update IMPLEMENTATION_PLAN.md Phase 3 to reflect completed Marketplace Registry"
```

---

## Group 8 — Full Build & Test Gate

### Task 22 — Full build

```bash
cd apps/server_core && go build ./...
```
Expected: zero errors.

---

### Task 23 — Full test suite

```bash
cd apps/server_core && go test ./...
```

Verify specifically:
- `.../marketplaces/application` — 7 tests (3 original + 4 listing_type) ✓
- `.../pricing/adapters/marketplace` — all existing + 1 new field-mapping test ✓
- `.../pricing/adapters/catalog` — all existing (no new tests; field addition is structural) ✓
- `.../pricing/application` — 4 new precedence tests ✓
- `.../tests/unit` — all existing tests unchanged ✓

---

## Known Remaining Caveat

The `LookupFee` call in the orchestrator passes `listingType = ""` (no listing type). This means rows with a specific `listing_type` (e.g. `classico`, `premium`) will only be reachable when the caller explicitly passes the listing type. Phase 3.1 should add `ListingType string` to `BatchPolicy` (or derive it from the product's marketplace channel) so per-listing-type rates are used in pricing simulation.
