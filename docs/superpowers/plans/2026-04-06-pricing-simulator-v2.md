# Pricing Simulator v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use nexus:subagent-driven-development (recommended) or nexus:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-policy simulator with a full batch engine that runs all products × all marketplace policies, with Melhor Envio freight quotes, collapsible per-marketplace columns, and inline price editing.

**Architecture:** New `POST /pricing/simulations/batch` Go endpoint backed by a `BatchOrchestrator` in `pricing/application/` that reads products and policies via port interfaces, calls the Melhor Envio HTTP client for freight quotes, calculates margins, and returns a flat result array. The frontend replaces `PricingSimulatorPage` with classification pills for bulk selection, a two-CEP command bar, and a results grid with collapsible per-policy column groups.

**Tech Stack:** Go 1.25 (pgx/v5, net/http), React 19 + TypeScript + Tailwind CSS v4, Vitest + Testing Library, lucide-react, `PaginatedTable` + `Button` from `@marketplace-central/ui`.

**Spec:** `docs/superpowers/specs/2026-04-06-pricing-simulator-v2-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/server_core/migrations/0008_simulator_v2.sql` | weight_g, shipping_provider, connector_oauth_tokens |
| Modify | `apps/server_core/internal/modules/catalog/domain/product.go` | Add WeightG field |
| Modify | `apps/server_core/internal/modules/catalog/adapters/postgres/repository.go` | weight_g in enrichment queries |
| Modify | `apps/server_core/internal/modules/catalog/application/service.go` | propagate WeightG in applyEnrichments |
| Modify | `apps/server_core/internal/modules/catalog/transport/http_handler.go` | weight_g in upsert handler |
| Modify | `apps/server_core/internal/modules/marketplaces/domain/policy.go` | Add ShippingProvider field |
| Modify | `apps/server_core/internal/modules/marketplaces/adapters/postgres/repository.go` | shipping_provider in queries |
| Modify | `apps/server_core/internal/modules/marketplaces/application/service.go` | ShippingProvider in CreatePolicyInput |
| Modify | `apps/server_core/internal/modules/marketplaces/transport/http_handler.go` | shipping_provider in request body |
| Create | `apps/server_core/internal/modules/pricing/ports/batch_ports.go` | FreightQuoter, ProductProvider, PolicyProvider interfaces |
| Create | `apps/server_core/internal/modules/connectors/adapters/melhorenvio/token_store.go` | Postgres-backed ME OAuth token storage |
| Create | `apps/server_core/internal/modules/connectors/adapters/melhorenvio/client.go` | ME HTTP client, implements FreightQuoter |
| Create | `apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth.go` | ME OAuth2 start/callback handlers |
| Create | `apps/server_core/internal/modules/pricing/adapters/catalog/reader.go` | implements ProductProvider, wraps catalog.Service |
| Create | `apps/server_core/internal/modules/pricing/adapters/marketplace/reader.go` | implements PolicyProvider, wraps marketplaces.Service |
| Create | `apps/server_core/internal/modules/pricing/application/batch_orchestrator.go` | RunBatch business logic |
| Modify | `apps/server_core/internal/modules/pricing/transport/http_handler.go` | Add POST /pricing/simulations/batch; accept BatchOrchestrator |
| Modify | `apps/server_core/internal/modules/connectors/transport/http_handler.go` | Add ME auth routes; accept OAuthHandler |
| Modify | `apps/server_core/internal/composition/root.go` | Wire ME client, BatchOrchestrator, update handler constructors |
| Modify | `packages/sdk-runtime/src/index.ts` | weight_g, shipping_provider, batch types, new methods |
| Modify | `packages/feature-simulator/src/PricingSimulatorPage.tsx` | Full rewrite |
| Modify | `packages/feature-simulator/src/PricingSimulatorPage.test.tsx` | Full rewrite |
| Modify | `apps/server_core/tests/unit/router_registration_test.go` | New routes, updated constructors |
| Modify | `apps/server_core/tests/unit/pricing_service_test.go` | BatchOrchestrator tests |

---

## Task 1: Migration 0008

**Files:**
- Create: `apps/server_core/migrations/0008_simulator_v2.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- apps/server_core/migrations/0008_simulator_v2.sql

-- Product weight for Melhor Envio freight quotes
ALTER TABLE product_enrichments ADD COLUMN IF NOT EXISTS weight_g NUMERIC(10,3);

-- Shipping provider per marketplace policy
ALTER TABLE marketplace_pricing_policies
    ADD COLUMN IF NOT EXISTS shipping_provider TEXT NOT NULL DEFAULT 'fixed';

-- OAuth tokens for third-party logistics integrations (Melhor Envio, etc.)
CREATE TABLE IF NOT EXISTS connector_oauth_tokens (
    channel_code  TEXT NOT NULL,
    tenant_id     TEXT NOT NULL,
    access_token  TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL DEFAULT '',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, channel_code)
);
```

- [ ] **Step 2: Apply the migration**

```bash
PGPASSWORD=metalshopping_app_oscar "/c/Program Files/PostgreSQL/16/bin/psql.exe" \
  -h 127.0.0.1 -p 5432 -U metalshopping_app -d metalshopping \
  -c "SET search_path=mpc;" \
  -f apps/server_core/migrations/0008_simulator_v2.sql
```

Expected output: `ALTER TABLE`, `ALTER TABLE`, `CREATE TABLE`

- [ ] **Step 3: Verify**

```bash
PGPASSWORD=metalshopping_app_oscar "/c/Program Files/PostgreSQL/16/bin/psql.exe" \
  -h 127.0.0.1 -p 5432 -U metalshopping_app -d metalshopping \
  -c "SET search_path=mpc; SELECT column_name FROM information_schema.columns WHERE table_name='product_enrichments' AND column_name='weight_g';"
```

Expected: 1 row with `weight_g`

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/migrations/0008_simulator_v2.sql
git commit -m "feat(pricing): migration 0008 — weight_g, shipping_provider, connector_oauth_tokens"
```

---

## Task 2: Go Domain Types — WeightG + ShippingProvider

**Files:**
- Modify: `apps/server_core/internal/modules/catalog/domain/product.go`
- Modify: `apps/server_core/internal/modules/marketplaces/domain/policy.go`

- [ ] **Step 1: Add WeightG to catalog domain**

Replace `apps/server_core/internal/modules/catalog/domain/product.go` with:

```go
package domain

type Product struct {
	ProductID      string   `json:"product_id"`
	SKU            string   `json:"sku"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	BrandName      string   `json:"brand_name"`
	Status         string   `json:"status"`
	CostAmount     float64  `json:"cost_amount"`
	PriceAmount    float64  `json:"price_amount"`
	StockQuantity  float64  `json:"stock_quantity"`
	EAN            string   `json:"ean"`
	Reference      string   `json:"reference"`
	TaxonomyNodeID string   `json:"taxonomy_node_id"`
	TaxonomyName   string   `json:"taxonomy_name"`
	SuggestedPrice *float64 `json:"suggested_price"`
	HeightCM       *float64 `json:"height_cm"`
	WidthCM        *float64 `json:"width_cm"`
	LengthCM       *float64 `json:"length_cm"`
	WeightG        *float64 `json:"weight_g"`
}

type TaxonomyNode struct {
	NodeID       string `json:"node_id"`
	Name         string `json:"name"`
	Level        int    `json:"level"`
	LevelLabel   string `json:"level_label"`
	ParentNodeID string `json:"parent_node_id"`
	IsActive     bool   `json:"is_active"`
	ProductCount int    `json:"product_count"`
}

type ProductEnrichment struct {
	ProductID            string   `json:"product_id"`
	TenantID             string   `json:"tenant_id"`
	HeightCM             *float64 `json:"height_cm"`
	WidthCM              *float64 `json:"width_cm"`
	LengthCM             *float64 `json:"length_cm"`
	WeightG              *float64 `json:"weight_g"`
	SuggestedPriceAmount *float64 `json:"suggested_price_amount"`
}
```

- [ ] **Step 2: Add ShippingProvider to marketplaces domain**

Replace `apps/server_core/internal/modules/marketplaces/domain/policy.go` with:

```go
package domain

type Policy struct {
	PolicyID           string  `json:"policy_id"`
	TenantID           string  `json:"tenant_id"`
	AccountID          string  `json:"account_id"`
	CommissionPercent  float64 `json:"commission_percent"`
	FixedFeeAmount     float64 `json:"fixed_fee_amount"`
	DefaultShipping    float64 `json:"default_shipping"`
	TaxPercent         float64 `json:"tax_percent"`
	MinMarginPercent   float64 `json:"min_margin_percent"`
	SLAQuestionMinutes int     `json:"sla_question_minutes"`
	SLADispatchHours   int     `json:"sla_dispatch_hours"`
	ShippingProvider   string  `json:"shipping_provider"` // "fixed" | "melhor_envio" | "marketplace"
}
```

- [ ] **Step 3: Build to confirm no compile errors**

```bash
cd apps/server_core && go build ./...
```

Expected: no output (success)

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/internal/modules/catalog/domain/product.go \
        apps/server_core/internal/modules/marketplaces/domain/policy.go
git commit -m "feat(pricing): add WeightG to catalog domain, ShippingProvider to policy domain"
```

---

## Task 3: Catalog Enrichment — weight_g

**Files:**
- Modify: `apps/server_core/internal/modules/catalog/adapters/postgres/repository.go`
- Modify: `apps/server_core/internal/modules/catalog/application/service.go`
- Modify: `apps/server_core/internal/modules/catalog/transport/http_handler.go`

- [ ] **Step 1: Write failing test**

Add to `apps/server_core/tests/unit/catalog_service_test.go`:

```go
func TestApplyEnrichmentsSetsWeightG(t *testing.T) {
	weightG := 450.0
	reader := &stubCatalogReaderWithProducts{products: []catalogdomain.Product{
		{ProductID: "p1", SKU: "SKU-1", PriceAmount: 100, CostAmount: 50},
	}}
	enrichments := &stubCatalogEnrichmentsWithData{data: map[string]catalogdomain.ProductEnrichment{
		"p1": {ProductID: "p1", WeightG: &weightG},
	}}
	svc := catalogapp.NewService(reader, enrichments, "t1")
	products, err := svc.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if products[0].WeightG == nil || *products[0].WeightG != 450.0 {
		t.Fatalf("expected WeightG 450.0, got %v", products[0].WeightG)
	}
}
```

Also add the required stubs at the top of that file (or a new file `catalog_service_weight_test.go`):

```go
// stubCatalogReaderWithProducts returns a fixed product list.
type stubCatalogReaderWithProducts struct {
	products []catalogdomain.Product
}

func (r *stubCatalogReaderWithProducts) ListProducts(_ context.Context) ([]catalogdomain.Product, error) {
	return r.products, nil
}
func (r *stubCatalogReaderWithProducts) GetProduct(_ context.Context, id string) (catalogdomain.Product, error) {
	for _, p := range r.products {
		if p.ProductID == id {
			return p, nil
		}
	}
	return catalogdomain.Product{}, nil
}
func (r *stubCatalogReaderWithProducts) SearchProducts(_ context.Context, _ string) ([]catalogdomain.Product, error) {
	return r.products, nil
}
func (r *stubCatalogReaderWithProducts) ListTaxonomyNodes(_ context.Context) ([]catalogdomain.TaxonomyNode, error) {
	return nil, nil
}

// stubCatalogEnrichmentsWithData returns enrichments from a map.
type stubCatalogEnrichmentsWithData struct {
	data map[string]catalogdomain.ProductEnrichment
}

func (s *stubCatalogEnrichmentsWithData) GetEnrichment(_ context.Context, id string) (catalogdomain.ProductEnrichment, error) {
	if e, ok := s.data[id]; ok {
		return e, nil
	}
	return catalogdomain.ProductEnrichment{ProductID: id}, nil
}
func (s *stubCatalogEnrichmentsWithData) UpsertEnrichment(_ context.Context, _ catalogdomain.ProductEnrichment) error {
	return nil
}
func (s *stubCatalogEnrichmentsWithData) ListEnrichments(_ context.Context, ids []string) (map[string]catalogdomain.ProductEnrichment, error) {
	result := make(map[string]catalogdomain.ProductEnrichment)
	for _, id := range ids {
		if e, ok := s.data[id]; ok {
			result[id] = e
		}
	}
	return result, nil
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestApplyEnrichmentsSetsWeightG -v
```

Expected: FAIL — `WeightG` not set (nil)

- [ ] **Step 3: Update enrichment postgres adapter**

Replace `apps/server_core/internal/modules/catalog/adapters/postgres/repository.go` with:

```go
package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

var _ ports.EnrichmentStore = (*EnrichmentRepository)(nil)

type EnrichmentRepository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewEnrichmentRepository(pool *pgxpool.Pool, tenantID string) *EnrichmentRepository {
	return &EnrichmentRepository{pool: pool, tenantID: tenantID}
}

func (r *EnrichmentRepository) GetEnrichment(ctx context.Context, productID string) (domain.ProductEnrichment, error) {
	var e domain.ProductEnrichment
	err := r.pool.QueryRow(ctx, `
		SELECT product_id, tenant_id, height_cm, width_cm, length_cm, weight_g, suggested_price_amount
		FROM product_enrichments
		WHERE tenant_id = $1 AND product_id = $2
	`, r.tenantID, productID).Scan(
		&e.ProductID, &e.TenantID, &e.HeightCM, &e.WidthCM, &e.LengthCM, &e.WeightG, &e.SuggestedPriceAmount,
	)
	if err == pgx.ErrNoRows {
		return domain.ProductEnrichment{ProductID: productID, TenantID: r.tenantID}, nil
	}
	if err != nil {
		return domain.ProductEnrichment{}, fmt.Errorf("get enrichment: %w", err)
	}
	return e, nil
}

func (r *EnrichmentRepository) UpsertEnrichment(ctx context.Context, e domain.ProductEnrichment) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO product_enrichments (product_id, tenant_id, height_cm, width_cm, length_cm, weight_g, suggested_price_amount, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (tenant_id, product_id) DO UPDATE SET
			height_cm = COALESCE(EXCLUDED.height_cm, product_enrichments.height_cm),
			width_cm = COALESCE(EXCLUDED.width_cm, product_enrichments.width_cm),
			length_cm = COALESCE(EXCLUDED.length_cm, product_enrichments.length_cm),
			weight_g = COALESCE(EXCLUDED.weight_g, product_enrichments.weight_g),
			suggested_price_amount = COALESCE(EXCLUDED.suggested_price_amount, product_enrichments.suggested_price_amount),
			updated_at = now()
	`, e.ProductID, r.tenantID, e.HeightCM, e.WidthCM, e.LengthCM, e.WeightG, e.SuggestedPriceAmount)
	if err != nil {
		return fmt.Errorf("upsert enrichment: %w", err)
	}
	return nil
}

func (r *EnrichmentRepository) ListEnrichments(ctx context.Context, productIDs []string) (map[string]domain.ProductEnrichment, error) {
	if len(productIDs) == 0 {
		return make(map[string]domain.ProductEnrichment), nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT product_id, tenant_id, height_cm, width_cm, length_cm, weight_g, suggested_price_amount
		FROM product_enrichments
		WHERE tenant_id = $1 AND product_id = ANY($2)
	`, r.tenantID, productIDs)
	if err != nil {
		return nil, fmt.Errorf("list enrichments: %w", err)
	}
	defer rows.Close()

	result := make(map[string]domain.ProductEnrichment)
	for rows.Next() {
		var e domain.ProductEnrichment
		if err := rows.Scan(&e.ProductID, &e.TenantID, &e.HeightCM, &e.WidthCM, &e.LengthCM, &e.WeightG, &e.SuggestedPriceAmount); err != nil {
			return nil, fmt.Errorf("scan enrichment: %w", err)
		}
		result[e.ProductID] = e
	}
	return result, rows.Err()
}
```

- [ ] **Step 4: Update catalog service applyEnrichments to propagate WeightG**

In `apps/server_core/internal/modules/catalog/application/service.go`, update the `applyEnrichments` method:

```go
func (s Service) applyEnrichments(ctx context.Context, products []domain.Product) ([]domain.Product, error) {
	if len(products) == 0 {
		return products, nil
	}
	ids := make([]string, len(products))
	for i, p := range products {
		ids[i] = p.ProductID
	}
	enrichmentMap, err := s.enrichments.ListEnrichments(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i, p := range products {
		e, ok := enrichmentMap[p.ProductID]
		if !ok {
			continue
		}
		if e.HeightCM != nil {
			products[i].HeightCM = e.HeightCM
		}
		if e.WidthCM != nil {
			products[i].WidthCM = e.WidthCM
		}
		if e.LengthCM != nil {
			products[i].LengthCM = e.LengthCM
		}
		if e.WeightG != nil {
			products[i].WeightG = e.WeightG
		}
		if e.SuggestedPriceAmount != nil {
			products[i].SuggestedPrice = e.SuggestedPriceAmount
		}
	}
	return products, nil
}
```

- [ ] **Step 5: Update catalog transport upsert handler to accept weight_g**

In `apps/server_core/internal/modules/catalog/transport/http_handler.go`, update `handleUpsertEnrichment`:

```go
func (h Handler) handleUpsertEnrichment(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	productID := r.PathValue("id")
	var req struct {
		HeightCM             *float64 `json:"height_cm"`
		WidthCM              *float64 `json:"width_cm"`
		LengthCM             *float64 `json:"length_cm"`
		WeightG              *float64 `json:"weight_g"`
		SuggestedPriceAmount *float64 `json:"suggested_price_amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		slog.Error("catalog.enrichment", "action", "upsert", "result", "400", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusBadRequest, "CATALOG_ENRICHMENT_INVALID", "malformed request body")
		return
	}
	enrichment := domain.ProductEnrichment{
		ProductID:            productID,
		HeightCM:             req.HeightCM,
		WidthCM:              req.WidthCM,
		LengthCM:             req.LengthCM,
		WeightG:              req.WeightG,
		SuggestedPriceAmount: req.SuggestedPriceAmount,
	}
	if err := h.Service.UpsertEnrichment(r.Context(), enrichment); err != nil {
		slog.Error("catalog.enrichment", "action", "upsert", "result", "500", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusInternalServerError, "CATALOG_INTERNAL_ERROR", "internal error")
		return
	}
	slog.Info("catalog.enrichment", "action", "upsert", "result", "200", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, enrichment)
}
```

- [ ] **Step 6: Run tests**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestApplyEnrichmentsSetsWeightG -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server_core/internal/modules/catalog/adapters/postgres/repository.go \
        apps/server_core/internal/modules/catalog/application/service.go \
        apps/server_core/internal/modules/catalog/transport/http_handler.go \
        apps/server_core/tests/unit/catalog_service_test.go
git commit -m "feat(catalog): add weight_g to enrichments — domain, repo, service, transport"
```

---

## Task 4: Marketplaces — shipping_provider

**Files:**
- Modify: `apps/server_core/internal/modules/marketplaces/adapters/postgres/repository.go`
- Modify: `apps/server_core/internal/modules/marketplaces/application/service.go`
- Modify: `apps/server_core/internal/modules/marketplaces/transport/http_handler.go`

- [ ] **Step 1: Update marketplaces postgres adapter**

Replace `apps/server_core/internal/modules/marketplaces/adapters/postgres/repository.go` with:

```go
package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

var _ ports.Repository = (*Repository)(nil)

type Repository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewRepository(pool *pgxpool.Pool, tenantID string) *Repository {
	return &Repository{pool: pool, tenantID: tenantID}
}

func (r *Repository) SaveAccount(ctx context.Context, account domain.Account) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO marketplace_accounts (
			tenant_id, account_id, channel_code, display_name, status, connection_mode
		) VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (account_id) DO UPDATE SET
			channel_code = EXCLUDED.channel_code,
			display_name = EXCLUDED.display_name,
			status = EXCLUDED.status,
			connection_mode = EXCLUDED.connection_mode,
			updated_at = now()
	`, account.TenantID, account.AccountID, account.ChannelCode, account.DisplayName, account.Status, account.ConnectionMode)
	return err
}

func (r *Repository) SavePolicy(ctx context.Context, policy domain.Policy) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO marketplace_pricing_policies (
			tenant_id, policy_id, account_id, commission_percent, fixed_fee_amount,
			default_shipping_amount, tax_percent, min_margin_percent,
			sla_question_minutes, sla_dispatch_hours, shipping_provider
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (policy_id) DO UPDATE SET
			account_id = EXCLUDED.account_id,
			commission_percent = EXCLUDED.commission_percent,
			fixed_fee_amount = EXCLUDED.fixed_fee_amount,
			default_shipping_amount = EXCLUDED.default_shipping_amount,
			tax_percent = EXCLUDED.tax_percent,
			min_margin_percent = EXCLUDED.min_margin_percent,
			sla_question_minutes = EXCLUDED.sla_question_minutes,
			sla_dispatch_hours = EXCLUDED.sla_dispatch_hours,
			shipping_provider = EXCLUDED.shipping_provider,
			updated_at = now()
	`, policy.TenantID, policy.PolicyID, policy.AccountID, policy.CommissionPercent, policy.FixedFeeAmount,
		policy.DefaultShipping, policy.TaxPercent, policy.MinMarginPercent,
		policy.SLAQuestionMinutes, policy.SLADispatchHours, policy.ShippingProvider)
	return err
}

func (r *Repository) ListAccounts(ctx context.Context) ([]domain.Account, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT tenant_id, account_id, channel_code, display_name, status, connection_mode
		FROM marketplace_accounts
		WHERE tenant_id = $1
		ORDER BY account_id
	`, r.tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	accounts := make([]domain.Account, 0)
	for rows.Next() {
		var a domain.Account
		if err := rows.Scan(&a.TenantID, &a.AccountID, &a.ChannelCode, &a.DisplayName, &a.Status, &a.ConnectionMode); err != nil {
			return nil, err
		}
		accounts = append(accounts, a)
	}
	return accounts, rows.Err()
}

func (r *Repository) ListPolicies(ctx context.Context) ([]domain.Policy, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT tenant_id, policy_id, account_id, commission_percent, fixed_fee_amount,
		       default_shipping_amount, tax_percent, min_margin_percent,
		       sla_question_minutes, sla_dispatch_hours, shipping_provider
		FROM marketplace_pricing_policies
		WHERE tenant_id = $1
		ORDER BY policy_id
	`, r.tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	policies := make([]domain.Policy, 0)
	for rows.Next() {
		var p domain.Policy
		if err := rows.Scan(&p.TenantID, &p.PolicyID, &p.AccountID, &p.CommissionPercent, &p.FixedFeeAmount,
			&p.DefaultShipping, &p.TaxPercent, &p.MinMarginPercent,
			&p.SLAQuestionMinutes, &p.SLADispatchHours, &p.ShippingProvider); err != nil {
			return nil, err
		}
		policies = append(policies, p)
	}
	return policies, rows.Err()
}
```

- [ ] **Step 2: Update marketplaces application service**

In `apps/server_core/internal/modules/marketplaces/application/service.go`, add `ShippingProvider` to `CreatePolicyInput` and propagate it:

```go
type CreatePolicyInput struct {
	PolicyID           string
	AccountID          string
	CommissionPercent  float64
	FixedFeeAmount     float64
	DefaultShipping    float64
	MinMarginPercent   float64
	SLAQuestionMinutes int
	SLADispatchHours   int
	ShippingProvider   string // "fixed" | "melhor_envio" | "marketplace"
}
```

In `CreatePolicy`, add to the policy struct:

```go
policy := domain.Policy{
    PolicyID:           input.PolicyID,
    TenantID:           s.tenantID,
    AccountID:          input.AccountID,
    CommissionPercent:  input.CommissionPercent,
    FixedFeeAmount:     input.FixedFeeAmount,
    DefaultShipping:    input.DefaultShipping,
    TaxPercent:         0,
    MinMarginPercent:   input.MinMarginPercent,
    SLAQuestionMinutes: input.SLAQuestionMinutes,
    SLADispatchHours:   input.SLADispatchHours,
    ShippingProvider:   input.ShippingProvider,
}
if policy.ShippingProvider == "" {
    policy.ShippingProvider = "fixed"
}
```

- [ ] **Step 3: Update marketplaces transport handler to accept shipping_provider**

Find `handleCreatePolicy` in `apps/server_core/internal/modules/marketplaces/transport/http_handler.go`. In the request struct, add:

```go
var req struct {
    PolicyID           string  `json:"policy_id"`
    AccountID          string  `json:"account_id"`
    CommissionPercent  float64 `json:"commission_percent"`
    FixedFeeAmount     float64 `json:"fixed_fee_amount"`
    DefaultShipping    float64 `json:"default_shipping"`
    MinMarginPercent   float64 `json:"min_margin_percent"`
    SLAQuestionMinutes int     `json:"sla_question_minutes"`
    SLADispatchHours   int     `json:"sla_dispatch_hours"`
    ShippingProvider   string  `json:"shipping_provider"`
}
```

And pass it to the service input:

```go
policy, err := h.svc.CreatePolicy(r.Context(), application.CreatePolicyInput{
    PolicyID:           req.PolicyID,
    AccountID:          req.AccountID,
    CommissionPercent:  req.CommissionPercent,
    FixedFeeAmount:     req.FixedFeeAmount,
    DefaultShipping:    req.DefaultShipping,
    MinMarginPercent:   req.MinMarginPercent,
    SLAQuestionMinutes: req.SLAQuestionMinutes,
    SLADispatchHours:   req.SLADispatchHours,
    ShippingProvider:   req.ShippingProvider,
})
```

- [ ] **Step 4: Build and run existing tests**

```bash
cd apps/server_core && go build ./... && go test ./tests/unit/... -v 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/marketplaces/
git commit -m "feat(marketplaces): add shipping_provider to policy domain, repo, service, transport"
```

---

## Task 5: Pricing Batch Ports

**Files:**
- Create: `apps/server_core/internal/modules/pricing/ports/batch_ports.go`

- [ ] **Step 1: Create the file**

```go
// apps/server_core/internal/modules/pricing/ports/batch_ports.go
package ports

import "context"

// BatchProduct is all product data needed for batch simulation.
type BatchProduct struct {
	ProductID      string
	SKU            string
	CostAmount     float64
	PriceAmount    float64
	SuggestedPrice *float64
	HeightCM       *float64
	WidthCM        *float64
	LengthCM       *float64
	WeightG        *float64
}

// BatchPolicy is all policy data needed for batch simulation.
type BatchPolicy struct {
	PolicyID          string
	AccountID         string
	CommissionPercent float64
	FixedFeeAmount    float64
	DefaultShipping   float64
	MinMarginPercent  float64
	ShippingProvider  string // "fixed" | "melhor_envio" | "marketplace"
}

// FreightProduct is one product in a freight quote request.
type FreightProduct struct {
	ProductID string
	HeightCM  float64
	WidthCM   float64
	LengthCM  float64
	WeightKg  float64
	Value     float64 // insurance value (product price)
}

// FreightRequest is the input for a freight quote.
type FreightRequest struct {
	OriginCEP string
	DestCEP   string
	Products  []FreightProduct
}

// FreightResult is the freight result for one product.
type FreightResult struct {
	Amount float64
	Source string // "melhor_envio" | "fixed" | "no_dimensions" | "me_error" | "me_not_connected"
}

// ProductProvider fetches product data for batch simulation.
type ProductProvider interface {
	GetProductsForBatch(ctx context.Context, productIDs []string) ([]BatchProduct, error)
}

// PolicyProvider fetches policy data for batch simulation.
type PolicyProvider interface {
	GetPoliciesForBatch(ctx context.Context, policyIDs []string) ([]BatchPolicy, error)
}

// FreightQuoter calculates freight costs via an external service.
type FreightQuoter interface {
	IsConnected(ctx context.Context) bool
	QuoteFreight(ctx context.Context, req FreightRequest) (map[string]FreightResult, error)
}
```

- [ ] **Step 2: Build**

```bash
cd apps/server_core && go build ./...
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/modules/pricing/ports/batch_ports.go
git commit -m "feat(pricing): add batch simulation port interfaces"
```

---

## Task 6: Melhor Envio Token Store

**Files:**
- Create: `apps/server_core/internal/modules/connectors/adapters/melhorenvio/token_store.go`

- [ ] **Step 1: Create the file**

```go
// apps/server_core/internal/modules/connectors/adapters/melhorenvio/token_store.go
package melhorenvio

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TokenStore persists and retrieves the ME OAuth access token in Postgres.
type TokenStore struct {
	pool     *pgxpool.Pool
	tenantID string
}

// NewTokenStore creates a TokenStore backed by the given pool.
func NewTokenStore(pool *pgxpool.Pool, tenantID string) *TokenStore {
	return &TokenStore{pool: pool, tenantID: tenantID}
}

// GetToken returns the stored access token, or "" if none exists.
func (s *TokenStore) GetToken(ctx context.Context) (string, error) {
	var token string
	err := s.pool.QueryRow(ctx, `
		SELECT access_token FROM connector_oauth_tokens
		WHERE tenant_id = $1 AND channel_code = 'melhor_envio'
	`, s.tenantID).Scan(&token)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return token, err
}

// SaveToken upserts the access + refresh token pair.
func (s *TokenStore) SaveToken(ctx context.Context, accessToken, refreshToken string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO connector_oauth_tokens (tenant_id, channel_code, access_token, refresh_token, updated_at)
		VALUES ($1, 'melhor_envio', $2, $3, now())
		ON CONFLICT (tenant_id, channel_code) DO UPDATE SET
			access_token  = EXCLUDED.access_token,
			refresh_token = EXCLUDED.refresh_token,
			updated_at    = now()
	`, s.tenantID, accessToken, refreshToken)
	return err
}
```

- [ ] **Step 2: Build**

```bash
cd apps/server_core && go build ./...
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/modules/connectors/adapters/melhorenvio/token_store.go
git commit -m "feat(connectors): Melhor Envio token store (Postgres)"
```

---

## Task 7: Melhor Envio HTTP Client

**Files:**
- Create: `apps/server_core/internal/modules/connectors/adapters/melhorenvio/client.go`

- [ ] **Step 1: Write the failing test**

Create `apps/server_core/tests/unit/melhorenvio_client_test.go`:

```go
package unit

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/connectors/adapters/melhorenvio"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

func TestMEClientQuoteFreightReturnsLowestPrice(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/me/shipment/calculate" {
			http.NotFound(w, r)
			return
		}
		resp := []map[string]any{
			{"id": 1, "name": "PAC", "custom_price": 18.50, "price": 25.0, "delivery_time": 5},
			{"id": 2, "name": "SEDEX", "custom_price": 32.00, "price": 40.0, "delivery_time": 2},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	store := melhorenvio.NewInMemoryTokenStore("test-token")
	client := melhorenvio.NewClientWithBaseURL(store, srv.URL)

	results, err := client.QuoteFreight(context.Background(), pricingports.FreightRequest{
		OriginCEP: "01310-100",
		DestCEP:   "30140-071",
		Products: []pricingports.FreightProduct{
			{ProductID: "p1", HeightCM: 10, WidthCM: 15, LengthCM: 20, WeightKg: 0.5, Value: 100},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	r, ok := results["p1"]
	if !ok {
		t.Fatal("expected result for p1")
	}
	if r.Amount != 18.50 {
		t.Fatalf("expected 18.50 (lowest custom_price), got %v", r.Amount)
	}
	if r.Source != "melhor_envio" {
		t.Fatalf("expected source melhor_envio, got %q", r.Source)
	}
}

func TestMEClientIsConnectedReturnsFalseWhenNoToken(t *testing.T) {
	store := melhorenvio.NewInMemoryTokenStore("")
	client := melhorenvio.NewClientWithBaseURL(store, "http://unused")
	if client.IsConnected(context.Background()) {
		t.Fatal("expected IsConnected false when token is empty")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestMEClient -v
```

Expected: FAIL — package not found

- [ ] **Step 3: Create the client**

```go
// apps/server_core/internal/modules/connectors/adapters/melhorenvio/client.go
package melhorenvio

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

const (
	meDefaultBaseURL = "https://melhorenvio.com.br/api/v2"
	meUserAgent      = "MarketplaceCentral (contato@empresa.com.br)"
)

// tokenGetter abstracts token retrieval so both the real TokenStore and
// the in-memory test store can satisfy it.
type tokenGetter interface {
	GetToken(ctx context.Context) (string, error)
}

// InMemoryTokenStore is a test helper that returns a fixed token.
type InMemoryTokenStore struct{ token string }

func NewInMemoryTokenStore(token string) *InMemoryTokenStore { return &InMemoryTokenStore{token: token} }
func (s *InMemoryTokenStore) GetToken(_ context.Context) (string, error) { return s.token, nil }

// Client calls the Melhor Envio API. Implements pricingports.FreightQuoter.
type Client struct {
	tokens     tokenGetter
	httpClient *http.Client
	baseURL    string
}

// NewClient creates a production Client using the real TokenStore.
func NewClient(tokens *TokenStore) *Client {
	return &Client{tokens: tokens, httpClient: &http.Client{}, baseURL: meDefaultBaseURL}
}

// NewClientWithBaseURL creates a Client pointing at a custom base URL (for tests).
func NewClientWithBaseURL(tokens tokenGetter, baseURL string) *Client {
	return &Client{tokens: tokens, httpClient: &http.Client{}, baseURL: baseURL}
}

// IsConnected returns true if a non-empty token is stored.
func (c *Client) IsConnected(ctx context.Context) bool {
	token, err := c.tokens.GetToken(ctx)
	return err == nil && token != ""
}

// QuoteFreight sends all products in a single request to ME and returns
// the lowest-priced carrier option as the freight cost for every product.
// Products without dimensions should be filtered by the caller before this.
func (c *Client) QuoteFreight(ctx context.Context, req pricingports.FreightRequest) (map[string]pricingports.FreightResult, error) {
	token, err := c.tokens.GetToken(ctx)
	if err != nil || token == "" {
		return nil, fmt.Errorf("melhor_envio: not connected")
	}

	type meProduct struct {
		ID             string  `json:"id"`
		Width          float64 `json:"width"`
		Height         float64 `json:"height"`
		Length         float64 `json:"length"`
		Weight         float64 `json:"weight"`
		InsuranceValue float64 `json:"insurance_value"`
		Quantity       int     `json:"quantity"`
	}
	meProducts := make([]meProduct, len(req.Products))
	for i, p := range req.Products {
		meProducts[i] = meProduct{
			ID: p.ProductID, Width: p.WidthCM, Height: p.HeightCM,
			Length: p.LengthCM, Weight: p.WeightKg, InsuranceValue: p.Value, Quantity: 1,
		}
	}

	body, _ := json.Marshal(map[string]any{
		"from":     map[string]string{"postal_code": stripNonDigits(req.OriginCEP)},
		"to":       map[string]string{"postal_code": stripNonDigits(req.DestCEP)},
		"products": meProducts,
	})

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/me/shipment/calculate", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("melhor_envio: build request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("User-Agent", meUserAgent)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("melhor_envio: request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("melhor_envio: status %d", resp.StatusCode)
	}

	var raw []struct {
		CustomPrice float64 `json:"custom_price"`
		Price       float64 `json:"price"`
		Error       *string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("melhor_envio: decode: %w", err)
	}

	// Pick lowest custom_price among error-free options.
	lowestPrice := -1.0
	for _, item := range raw {
		if item.Error != nil && *item.Error != "" {
			continue
		}
		price := item.CustomPrice
		if price == 0 {
			price = item.Price
		}
		if lowestPrice < 0 || price < lowestPrice {
			lowestPrice = price
		}
	}

	results := make(map[string]pricingports.FreightResult, len(req.Products))
	for _, p := range req.Products {
		if lowestPrice < 0 {
			results[p.ProductID] = pricingports.FreightResult{Amount: 0, Source: "me_error"}
		} else {
			results[p.ProductID] = pricingports.FreightResult{Amount: lowestPrice, Source: "melhor_envio"}
		}
	}
	return results, nil
}

func stripNonDigits(s string) string {
	b := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] >= '0' && s[i] <= '9' {
			b = append(b, s[i])
		}
	}
	return string(b)
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestMEClient -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/connectors/adapters/melhorenvio/client.go \
        apps/server_core/tests/unit/melhorenvio_client_test.go
git commit -m "feat(connectors): Melhor Envio HTTP client — QuoteFreight + IsConnected"
```

---

## Task 8: Melhor Envio OAuth Handler

**Files:**
- Create: `apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth.go`

- [ ] **Step 1: Create the file**

```go
// apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth.go
package melhorenvio

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/platform/httpx"
)

const (
	meAuthURL  = "https://melhorenvio.com.br/oauth/authorize"
	meTokenURL = "https://melhorenvio.com.br/oauth/token"
)

// OAuthHandler handles ME OAuth2 start, callback, and status routes.
type OAuthHandler struct {
	store        *TokenStore
	clientID     string
	clientSecret string
	redirectURI  string
}

// NewOAuthHandlerFromEnv reads ME_CLIENT_ID, ME_CLIENT_SECRET, ME_REDIRECT_URI from env.
// Returns nil if ME_CLIENT_ID is not set (ME integration disabled).
func NewOAuthHandlerFromEnv(store *TokenStore) *OAuthHandler {
	clientID := os.Getenv("ME_CLIENT_ID")
	if clientID == "" {
		return nil
	}
	redirectURI := os.Getenv("ME_REDIRECT_URI")
	if redirectURI == "" {
		redirectURI = "http://localhost:8080/connectors/melhor-envio/auth/callback"
	}
	return &OAuthHandler{
		store:        store,
		clientID:     clientID,
		clientSecret: os.Getenv("ME_CLIENT_SECRET"),
		redirectURI:  redirectURI,
	}
}

// HandleStart redirects the user to ME's OAuth authorization page.
func (h *OAuthHandler) HandleStart(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	u, _ := url.Parse(meAuthURL)
	q := u.Query()
	q.Set("client_id", h.clientID)
	q.Set("redirect_uri", h.redirectURI)
	q.Set("response_type", "code")
	q.Set("scope", "shipping-calculate")
	u.RawQuery = q.Encode()
	slog.Info("connectors.me_auth", "action", "start", "result", "302", "duration_ms", time.Since(start).Milliseconds())
	http.Redirect(w, r, u.String(), http.StatusFound)
}

// HandleCallback exchanges the authorization code for tokens and saves them.
func (h *OAuthHandler) HandleCallback(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	code := r.URL.Query().Get("code")
	if code == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "missing code"})
		return
	}

	body := url.Values{}
	body.Set("grant_type", "authorization_code")
	body.Set("client_id", h.clientID)
	body.Set("client_secret", h.clientSecret)
	body.Set("redirect_uri", h.redirectURI)
	body.Set("code", code)

	resp, err := http.PostForm(meTokenURL, body)
	if err != nil {
		slog.Error("connectors.me_auth", "action", "callback", "result", "502", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]string{"error": "failed to reach ME"})
		return
	}
	defer resp.Body.Close()

	var data struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		Error        string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || data.AccessToken == "" {
		errMsg := data.Error
		if errMsg == "" {
			errMsg = fmt.Sprintf("ME returned status %d", resp.StatusCode)
		}
		slog.Error("connectors.me_auth", "action", "callback", "result", "400", "me_error", errMsg, "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	if err := h.store.SaveToken(context.Background(), data.AccessToken, data.RefreshToken); err != nil {
		slog.Error("connectors.me_auth", "action", "save_token", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save token"})
		return
	}

	slog.Info("connectors.me_auth", "action", "callback", "result", "200", "duration_ms", time.Since(start).Milliseconds())
	// Redirect back to the app settings page.
	http.Redirect(w, r, "http://localhost:5173/marketplace-settings?me_connected=1", http.StatusFound)
}

// HandleStatus returns {"connected": true/false}.
func (h *OAuthHandler) HandleStatus(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	token, err := h.store.GetToken(r.Context())
	connected := err == nil && strings.TrimSpace(token) != ""
	slog.Info("connectors.me_auth", "action", "status", "result", "200", "connected", connected, "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"connected": connected})
}
```

- [ ] **Step 2: Build**

```bash
cd apps/server_core && go build ./...
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth.go
git commit -m "feat(connectors): Melhor Envio OAuth2 handler — start, callback, status"
```

---

## Task 9: Pricing Adapters — ProductProvider + PolicyProvider

**Files:**
- Create: `apps/server_core/internal/modules/pricing/adapters/catalog/reader.go`
- Create: `apps/server_core/internal/modules/pricing/adapters/marketplace/reader.go`

- [ ] **Step 1: Create catalog reader**

```go
// apps/server_core/internal/modules/pricing/adapters/catalog/reader.go
package catalog

import (
	"context"

	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

// Reader wraps catalog.Service and implements pricing/ports.ProductProvider.
type Reader struct {
	svc catalogapp.Service
}

func NewReader(svc catalogapp.Service) *Reader { return &Reader{svc: svc} }

func (r *Reader) GetProductsForBatch(ctx context.Context, productIDs []string) ([]pricingports.BatchProduct, error) {
	all, err := r.svc.ListProducts(ctx)
	if err != nil {
		return nil, err
	}
	idSet := make(map[string]struct{}, len(productIDs))
	for _, id := range productIDs {
		idSet[id] = struct{}{}
	}
	result := make([]pricingports.BatchProduct, 0, len(productIDs))
	for _, p := range all {
		if _, ok := idSet[p.ProductID]; ok {
			result = append(result, pricingports.BatchProduct{
				ProductID:      p.ProductID,
				SKU:            p.SKU,
				CostAmount:     p.CostAmount,
				PriceAmount:    p.PriceAmount,
				SuggestedPrice: p.SuggestedPrice,
				HeightCM:       p.HeightCM,
				WidthCM:        p.WidthCM,
				LengthCM:       p.LengthCM,
				WeightG:        p.WeightG,
			})
		}
	}
	return result, nil
}
```

- [ ] **Step 2: Create marketplace reader**

```go
// apps/server_core/internal/modules/pricing/adapters/marketplace/reader.go
package marketplace

import (
	"context"

	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

// Reader wraps marketplaces.Service and implements pricing/ports.PolicyProvider.
type Reader struct {
	svc marketplacesapp.Service
}

func NewReader(svc marketplacesapp.Service) *Reader { return &Reader{svc: svc} }

func (r *Reader) GetPoliciesForBatch(ctx context.Context, policyIDs []string) ([]pricingports.BatchPolicy, error) {
	all, err := r.svc.ListPolicies(ctx)
	if err != nil {
		return nil, err
	}
	// If policyIDs is empty, return all policies.
	if len(policyIDs) == 0 {
		result := make([]pricingports.BatchPolicy, len(all))
		for i, p := range all {
			result[i] = toBatchPolicy(p)
		}
		return result, nil
	}
	idSet := make(map[string]struct{}, len(policyIDs))
	for _, id := range policyIDs {
		idSet[id] = struct{}{}
	}
	result := make([]pricingports.BatchPolicy, 0, len(policyIDs))
	for _, p := range all {
		if _, ok := idSet[p.PolicyID]; ok {
			result = append(result, toBatchPolicy(p))
		}
	}
	return result, nil
}

func toBatchPolicy(p interface{ GetPolicyID() string }) pricingports.BatchPolicy {
	// We need to import domain type — use a direct struct assertion.
	return pricingports.BatchPolicy{}
}
```

Wait — the above has a bug. Let me fix `toBatchPolicy` to use the actual type:

```go
// apps/server_core/internal/modules/pricing/adapters/marketplace/reader.go
package marketplace

import (
	"context"

	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	marketplacesdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type Reader struct {
	svc marketplacesapp.Service
}

func NewReader(svc marketplacesapp.Service) *Reader { return &Reader{svc: svc} }

func (r *Reader) GetPoliciesForBatch(ctx context.Context, policyIDs []string) ([]pricingports.BatchPolicy, error) {
	all, err := r.svc.ListPolicies(ctx)
	if err != nil {
		return nil, err
	}
	if len(policyIDs) == 0 {
		result := make([]pricingports.BatchPolicy, len(all))
		for i, p := range all {
			result[i] = fromDomain(p)
		}
		return result, nil
	}
	idSet := make(map[string]struct{}, len(policyIDs))
	for _, id := range policyIDs {
		idSet[id] = struct{}{}
	}
	result := make([]pricingports.BatchPolicy, 0, len(policyIDs))
	for _, p := range all {
		if _, ok := idSet[p.PolicyID]; ok {
			result = append(result, fromDomain(p))
		}
	}
	return result, nil
}

func fromDomain(p marketplacesdomain.Policy) pricingports.BatchPolicy {
	return pricingports.BatchPolicy{
		PolicyID:          p.PolicyID,
		AccountID:         p.AccountID,
		CommissionPercent: p.CommissionPercent,
		FixedFeeAmount:    p.FixedFeeAmount,
		DefaultShipping:   p.DefaultShipping,
		MinMarginPercent:  p.MinMarginPercent,
		ShippingProvider:  p.ShippingProvider,
	}
}
```

- [ ] **Step 3: Build**

```bash
cd apps/server_core && go build ./...
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/internal/modules/pricing/adapters/
git commit -m "feat(pricing): catalog and marketplace adapters implementing batch ports"
```

---

## Task 10: Pricing BatchOrchestrator

**Files:**
- Create: `apps/server_core/internal/modules/pricing/application/batch_orchestrator.go`

- [ ] **Step 1: Write failing test**

Add to `apps/server_core/tests/unit/pricing_service_test.go`:

```go
// --- BatchOrchestrator tests ---

type stubProductProvider struct {
	products []pricingports.BatchProduct
}

func (s *stubProductProvider) GetProductsForBatch(_ context.Context, _ []string) ([]pricingports.BatchProduct, error) {
	return s.products, nil
}

type stubPolicyProvider struct {
	policies []pricingports.BatchPolicy
}

func (s *stubPolicyProvider) GetPoliciesForBatch(_ context.Context, _ []string) ([]pricingports.BatchPolicy, error) {
	return s.policies, nil
}

type stubFreightQuoter struct {
	connected bool
	results   map[string]pricingports.FreightResult
}

func (s *stubFreightQuoter) IsConnected(_ context.Context) bool { return s.connected }
func (s *stubFreightQuoter) QuoteFreight(_ context.Context, _ pricingports.FreightRequest) (map[string]pricingports.FreightResult, error) {
	return s.results, nil
}

func TestBatchOrchestratorCalculatesMarginForAllProductsAndPolicies(t *testing.T) {
	products := []pricingports.BatchProduct{
		{ProductID: "p1", CostAmount: 80, PriceAmount: 150},
		{ProductID: "p2", CostAmount: 50, PriceAmount: 100},
	}
	policies := []pricingports.BatchPolicy{
		{PolicyID: "pol1", CommissionPercent: 0.16, FixedFeeAmount: 0, DefaultShipping: 20, MinMarginPercent: 0.12, ShippingProvider: "fixed"},
	}

	orch := pricingapp.NewBatchOrchestrator(
		&stubProductProvider{products: products},
		&stubPolicyProvider{policies: policies},
		&stubFreightQuoter{connected: false},
		"tenant_default",
	)

	result, err := orch.RunBatch(context.Background(), pricingapp.BatchRunRequest{
		ProductIDs:  []string{"p1", "p2"},
		PolicyIDs:   []string{"pol1"},
		OriginCEP:   "01310100",
		DestCEP:     "30140071",
		PriceSource: "my_price",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Items) != 2 {
		t.Fatalf("expected 2 items (2 products × 1 policy), got %d", len(result.Items))
	}
	// p1: 150 - 80 - (150*0.16) - 0 - 20 = 26 margin; 26/150 = 0.1733 → warning (< 0.12? no, > 0.12 → healthy)
	// wait: 0.1733 > 0.12, so status = healthy
	var p1Result pricingapp.BatchSimulationItem
	for _, item := range result.Items {
		if item.ProductID == "p1" {
			p1Result = item
		}
	}
	if p1Result.ProductID == "" {
		t.Fatal("no result for p1")
	}
	expectedMarginAmt := 150.0 - 80.0 - (150.0 * 0.16) - 0 - 20.0 // = 26.0
	if p1Result.MarginAmount != expectedMarginAmt {
		t.Fatalf("expected margin %v, got %v", expectedMarginAmt, p1Result.MarginAmount)
	}
	if p1Result.Status != "healthy" {
		t.Fatalf("expected healthy, got %q", p1Result.Status)
	}
}

func TestBatchOrchestratorUsesSuggestedPriceWhenRequested(t *testing.T) {
	suggested := 200.0
	products := []pricingports.BatchProduct{
		{ProductID: "p1", CostAmount: 80, PriceAmount: 150, SuggestedPrice: &suggested},
	}
	policies := []pricingports.BatchPolicy{
		{PolicyID: "pol1", CommissionPercent: 0.16, FixedFeeAmount: 0, DefaultShipping: 0, MinMarginPercent: 0.10, ShippingProvider: "fixed"},
	}

	orch := pricingapp.NewBatchOrchestrator(
		&stubProductProvider{products: products},
		&stubPolicyProvider{policies: policies},
		&stubFreightQuoter{connected: false},
		"tenant_default",
	)

	result, err := orch.RunBatch(context.Background(), pricingapp.BatchRunRequest{
		ProductIDs: []string{"p1"}, PolicyIDs: []string{"pol1"},
		PriceSource: "suggested_price",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Items[0].SellingPrice != 200.0 {
		t.Fatalf("expected selling price 200 (suggested), got %v", result.Items[0].SellingPrice)
	}
}
```

Also add the import for `pricingports` at the top of the file:

```go
import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/pricing/application"
	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestBatchOrchestrator -v
```

Expected: FAIL — `BatchOrchestrator` not found

- [ ] **Step 3: Create the BatchOrchestrator**

```go
// apps/server_core/internal/modules/pricing/application/batch_orchestrator.go
package application

import (
	"context"
	"fmt"

	"marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

// BatchRunRequest is the input for RunBatch.
type BatchRunRequest struct {
	ProductIDs     []string
	PolicyIDs      []string
	OriginCEP      string
	DestCEP        string
	PriceSource    string            // "my_price" | "suggested_price"
	PriceOverrides map[string]float64 // "productID::policyID" -> override price
}

// BatchSimulationItem is one product × policy result row.
type BatchSimulationItem struct {
	ProductID        string  `json:"product_id"`
	PolicyID         string  `json:"policy_id"`
	SellingPrice     float64 `json:"selling_price"`
	CostAmount       float64 `json:"cost_amount"`
	CommissionAmount float64 `json:"commission_amount"`
	FreightAmount    float64 `json:"freight_amount"`
	FixedFeeAmount   float64 `json:"fixed_fee_amount"`
	MarginAmount     float64 `json:"margin_amount"`
	MarginPercent    float64 `json:"margin_percent"`
	Status           string  `json:"status"`
	FreightSource    string  `json:"freight_source"`
}

// BatchRunResult holds all simulation rows.
type BatchRunResult struct {
	Items []BatchSimulationItem
}

// BatchOrchestrator runs batch simulations across all products × policies.
type BatchOrchestrator struct {
	products ports.ProductProvider
	policies ports.PolicyProvider
	freight  ports.FreightQuoter
	tenantID string
}

// NewBatchOrchestrator creates a BatchOrchestrator with its dependencies.
func NewBatchOrchestrator(
	products ports.ProductProvider,
	policies ports.PolicyProvider,
	freight ports.FreightQuoter,
	tenantID string,
) *BatchOrchestrator {
	return &BatchOrchestrator{products: products, policies: policies, freight: freight, tenantID: tenantID}
}

// RunBatch calculates margins for every product × policy combination.
func (o *BatchOrchestrator) RunBatch(ctx context.Context, req BatchRunRequest) (BatchRunResult, error) {
	prods, err := o.products.GetProductsForBatch(ctx, req.ProductIDs)
	if err != nil {
		return BatchRunResult{}, fmt.Errorf("PRICING_BATCH_LOAD_PRODUCTS: %w", err)
	}
	pols, err := o.policies.GetPoliciesForBatch(ctx, req.PolicyIDs)
	if err != nil {
		return BatchRunResult{}, fmt.Errorf("PRICING_BATCH_LOAD_POLICIES: %w", err)
	}

	// Get ME freight quotes once if ME is connected and any policy uses it.
	freightResults := make(map[string]ports.FreightResult)
	meConnected := o.freight.IsConnected(ctx)
	if meConnected {
		for _, pol := range pols {
			if pol.ShippingProvider == "melhor_envio" {
				freightReq := ports.FreightRequest{OriginCEP: req.OriginCEP, DestCEP: req.DestCEP}
				for _, p := range prods {
					if p.HeightCM != nil && p.WidthCM != nil && p.LengthCM != nil && p.WeightG != nil {
						freightReq.Products = append(freightReq.Products, ports.FreightProduct{
							ProductID: p.ProductID,
							HeightCM:  *p.HeightCM, WidthCM: *p.WidthCM,
							LengthCM: *p.LengthCM, WeightKg: *p.WeightG / 1000,
							Value: p.PriceAmount,
						})
					}
				}
				if len(freightReq.Products) > 0 {
					if quoted, err := o.freight.QuoteFreight(ctx, freightReq); err == nil {
						for k, v := range quoted {
							freightResults[k] = v
						}
					}
				}
				break // Only need to call ME once — same CEPs for all policies.
			}
		}
	}

	items := make([]BatchSimulationItem, 0, len(prods)*len(pols))
	for _, pol := range pols {
		for _, prod := range prods {
			// Resolve selling price.
			sellingPrice := prod.PriceAmount
			if req.PriceSource == "suggested_price" && prod.SuggestedPrice != nil {
				sellingPrice = *prod.SuggestedPrice
			}
			overrideKey := prod.ProductID + "::" + pol.PolicyID
			if override, ok := req.PriceOverrides[overrideKey]; ok && override > 0 {
				sellingPrice = override
			}

			// Resolve freight.
			var freightAmt float64
			var freightSource string
			switch pol.ShippingProvider {
			case "melhor_envio":
				if !meConnected {
					freightAmt, freightSource = 0, "me_not_connected"
				} else if fr, ok := freightResults[prod.ProductID]; ok {
					freightAmt, freightSource = fr.Amount, fr.Source
				} else if prod.HeightCM == nil || prod.WidthCM == nil || prod.LengthCM == nil || prod.WeightG == nil {
					freightAmt, freightSource = 0, "no_dimensions"
				} else {
					freightAmt, freightSource = 0, "me_error"
				}
			default:
				freightAmt, freightSource = pol.DefaultShipping, "fixed"
			}

			// Calculate margin.
			commissionAmt := sellingPrice * pol.CommissionPercent
			marginAmt := sellingPrice - prod.CostAmount - commissionAmt - pol.FixedFeeAmount - freightAmt
			var marginPct float64
			if sellingPrice > 0 {
				marginPct = marginAmt / sellingPrice
			}
			status := "healthy"
			if marginPct < pol.MinMarginPercent {
				status = "warning"
			}

			items = append(items, BatchSimulationItem{
				ProductID:        prod.ProductID,
				PolicyID:         pol.PolicyID,
				SellingPrice:     sellingPrice,
				CostAmount:       prod.CostAmount,
				CommissionAmount: commissionAmt,
				FreightAmount:    freightAmt,
				FixedFeeAmount:   pol.FixedFeeAmount,
				MarginAmount:     marginAmt,
				MarginPercent:    marginPct,
				Status:           status,
				FreightSource:    freightSource,
			})
		}
	}
	return BatchRunResult{Items: items}, nil
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestBatchOrchestrator -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/pricing/application/batch_orchestrator.go \
        apps/server_core/tests/unit/pricing_service_test.go
git commit -m "feat(pricing): BatchOrchestrator — RunBatch with ME freight + margin calculation"
```

---

## Task 11: Pricing Batch Transport Handler

**Files:**
- Modify: `apps/server_core/internal/modules/pricing/transport/http_handler.go`

- [ ] **Step 1: Write failing test**

Add to `apps/server_core/tests/unit/pricing_handler_test.go`:

```go
func TestPricingBatchEndpointReturnsResults(t *testing.T) {
	stubProducts := &stubProductProvider{products: []pricingports.BatchProduct{
		{ProductID: "p1", CostAmount: 80, PriceAmount: 150},
	}}
	stubPolicies := &stubPolicyProvider{policies: []pricingports.BatchPolicy{
		{PolicyID: "pol1", CommissionPercent: 0.16, DefaultShipping: 20, MinMarginPercent: 0.10, ShippingProvider: "fixed"},
	}}
	stubFreight := &stubFreightQuoter{connected: false}
	batch := pricingapp.NewBatchOrchestrator(stubProducts, stubPolicies, stubFreight, "t1")

	repo := &pricingRepoStub{}
	svc := pricingapp.NewService(repo, "t1")
	handler := pricingtransport.NewHandler(svc, batch)

	mux := http.NewServeMux()
	handler.Register(mux)

	body := `{"product_ids":["p1"],"policy_ids":["pol1"],"origin_cep":"01310100","destination_cep":"30140071","price_source":"my_price"}`
	req := httptest.NewRequest(http.MethodPost, "/pricing/simulations/batch", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(resp.Items))
	}
}
```

Add imports at the top of `pricing_handler_test.go`:

```go
import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	pricingapp "marketplace-central/apps/server_core/internal/modules/pricing/application"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
	pricingtransport "marketplace-central/apps/server_core/internal/modules/pricing/transport"
)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestPricingBatch -v
```

Expected: FAIL — `NewHandler` signature mismatch

- [ ] **Step 3: Update pricing transport handler**

Replace `apps/server_core/internal/modules/pricing/transport/http_handler.go` with:

```go
package transport

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/pricing/application"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct {
	svc   application.Service
	batch *application.BatchOrchestrator
}

func NewHandler(svc application.Service, batch *application.BatchOrchestrator) Handler {
	return Handler{svc: svc, batch: batch}
}

type apiError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details"`
}

type apiErrorResponse struct {
	Error apiError `json:"error"`
}

func writePricingError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, apiErrorResponse{Error: apiError{Code: code, Message: message, Details: map[string]any{}}})
}

func mapPricingError(msg string) (int, string) {
	if strings.HasPrefix(msg, "PRICING_") {
		return http.StatusBadRequest, "PRICING_SIMULATION_INVALID"
	}
	return http.StatusInternalServerError, "PRICING_INTERNAL_ERROR"
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/pricing/simulations", h.handleSimulations)
	mux.HandleFunc("/pricing/simulations/batch", h.handleBatch)
}

func (h Handler) handleSimulations(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		start := time.Now()
		sims, err := h.svc.ListSimulations(r.Context())
		if err != nil {
			slog.Error("pricing.simulations", "action", "list", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
			writePricingError(w, http.StatusInternalServerError, "PRICING_INTERNAL_ERROR", "internal error")
			return
		}
		slog.Info("pricing.simulations", "action", "list", "result", "200", "count", len(sims), "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": sims})

	case http.MethodPost:
		start := time.Now()
		var req struct {
			SimulationID      string  `json:"simulation_id"`
			ProductID         string  `json:"product_id"`
			AccountID         string  `json:"account_id"`
			BasePriceAmount   float64 `json:"base_price_amount"`
			CostAmount        float64 `json:"cost_amount"`
			CommissionPercent float64 `json:"commission_percent"`
			FixedFeeAmount    float64 `json:"fixed_fee_amount"`
			ShippingAmount    float64 `json:"shipping_amount"`
			MinMarginPercent  float64 `json:"min_margin_percent"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			slog.Info("pricing.simulations", "action", "create", "result", "400", "duration_ms", time.Since(start).Milliseconds())
			writePricingError(w, http.StatusBadRequest, "PRICING_REQUEST_INVALID", "malformed request body")
			return
		}
		sim, err := h.svc.RunSimulation(r.Context(), application.RunSimulationInput{
			SimulationID:      req.SimulationID,
			ProductID:         req.ProductID,
			AccountID:         req.AccountID,
			BasePriceAmount:   req.BasePriceAmount,
			CostAmount:        req.CostAmount,
			CommissionPercent: req.CommissionPercent,
			FixedFeeAmount:    req.FixedFeeAmount,
			ShippingAmount:    req.ShippingAmount,
			MinMarginPercent:  req.MinMarginPercent,
		})
		if err != nil {
			status, code := mapPricingError(err.Error())
			slog.Error("pricing.simulations", "action", "create", "result", strconv.Itoa(status), "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
			writePricingError(w, status, code, "internal error")
			return
		}
		slog.Info("pricing.simulations", "action", "create", "result", "201", "simulation_id", sim.SimulationID, "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusCreated, sim)

	default:
		start := time.Now()
		w.Header().Set("Allow", "GET, POST")
		slog.Info("pricing.simulations", "action", "reject_method", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		writePricingError(w, http.StatusMethodNotAllowed, "PRICING_METHOD_NOT_ALLOWED", "method not allowed")
	}
}

func (h Handler) handleBatch(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writePricingError(w, http.StatusMethodNotAllowed, "PRICING_METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if h.batch == nil {
		writePricingError(w, http.StatusServiceUnavailable, "PRICING_BATCH_UNAVAILABLE", "batch simulation not configured")
		return
	}
	var req struct {
		ProductIDs     []string           `json:"product_ids"`
		PolicyIDs      []string           `json:"policy_ids"`
		OriginCEP      string             `json:"origin_cep"`
		DestinationCEP string             `json:"destination_cep"`
		PriceSource    string             `json:"price_source"`
		PriceOverrides map[string]float64 `json:"price_overrides"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		slog.Info("pricing.batch", "action", "decode", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		writePricingError(w, http.StatusBadRequest, "PRICING_REQUEST_INVALID", "malformed request body")
		return
	}
	if len(req.ProductIDs) == 0 {
		writePricingError(w, http.StatusBadRequest, "PRICING_REQUEST_INVALID", "product_ids must not be empty")
		return
	}
	if req.PriceSource == "" {
		req.PriceSource = "my_price"
	}

	result, err := h.batch.RunBatch(r.Context(), application.BatchRunRequest{
		ProductIDs:     req.ProductIDs,
		PolicyIDs:      req.PolicyIDs,
		OriginCEP:      req.OriginCEP,
		DestCEP:        req.DestinationCEP,
		PriceSource:    req.PriceSource,
		PriceOverrides: req.PriceOverrides,
	})
	if err != nil {
		slog.Error("pricing.batch", "action", "run", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		writePricingError(w, http.StatusInternalServerError, "PRICING_INTERNAL_ERROR", "batch simulation failed")
		return
	}
	slog.Info("pricing.batch", "action", "run", "result", "200", "items", len(result.Items), "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": result.Items})
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestPricingBatch -v
```

Expected: PASS

- [ ] **Step 5: Run all tests**

```bash
cd apps/server_core && go test ./tests/unit/... -v 2>&1 | tail -30
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server_core/internal/modules/pricing/transport/http_handler.go \
        apps/server_core/tests/unit/pricing_handler_test.go
git commit -m "feat(pricing): POST /pricing/simulations/batch transport handler"
```

---

## Task 12: ME Auth Routes + Wire Root

**Files:**
- Modify: `apps/server_core/internal/modules/connectors/transport/http_handler.go`
- Modify: `apps/server_core/internal/composition/root.go`
- Modify: `apps/server_core/tests/unit/router_registration_test.go`

- [ ] **Step 1: Add ME OAuth routes to connectors handler**

At the top of `apps/server_core/internal/modules/connectors/transport/http_handler.go`, add the import:

```go
melhorenvio "marketplace-central/apps/server_core/internal/modules/connectors/adapters/melhorenvio"
```

Change `Handler` struct and `NewHandler`:

```go
type Handler struct {
	orchestrator *app.BatchOrchestrator
	meAuth       *melhorenvio.OAuthHandler // nil if ME_CLIENT_ID not set
}

func NewHandler(orchestrator *app.BatchOrchestrator, meAuth *melhorenvio.OAuthHandler) *Handler {
	return &Handler{orchestrator: orchestrator, meAuth: meAuth}
}
```

In `Register`, add:

```go
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/connectors/vtex/publish", h.handlePublish)
	mux.HandleFunc("/connectors/vtex/publish/batch/", h.handleBatchRoutes)
	mux.HandleFunc("/connectors/vtex/validate-connection", h.handleValidateConnection)
	mux.HandleFunc("/connectors/melhor-envio/auth/start", h.handleMEAuthStart)
	mux.HandleFunc("/connectors/melhor-envio/auth/callback", h.handleMEAuthCallback)
	mux.HandleFunc("/connectors/melhor-envio/status", h.handleMEStatus)
}
```

Add the three new handler methods at the bottom of the file:

```go
func (h *Handler) handleMEAuthStart(w http.ResponseWriter, r *http.Request) {
	if h.meAuth == nil {
		writeConnectorsError(w, http.StatusServiceUnavailable, "CONNECTORS_ME_NOT_CONFIGURED", "Melhor Envio is not configured (ME_CLIENT_ID missing)")
		return
	}
	h.meAuth.HandleStart(w, r)
}

func (h *Handler) handleMEAuthCallback(w http.ResponseWriter, r *http.Request) {
	if h.meAuth == nil {
		writeConnectorsError(w, http.StatusServiceUnavailable, "CONNECTORS_ME_NOT_CONFIGURED", "Melhor Envio is not configured")
		return
	}
	h.meAuth.HandleCallback(w, r)
}

func (h *Handler) handleMEStatus(w http.ResponseWriter, r *http.Request) {
	if h.meAuth == nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]bool{"connected": false})
		return
	}
	h.meAuth.HandleStatus(w, r)
}
```

- [ ] **Step 2: Update root.go**

Replace `apps/server_core/internal/composition/root.go` with:

```go
package composition

import (
	"log"
	"net/http"

	catalogmetalshopping "marketplace-central/apps/server_core/internal/modules/catalog/adapters/metalshopping"
	catalogpostgres "marketplace-central/apps/server_core/internal/modules/catalog/adapters/postgres"
	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	catalogtransport "marketplace-central/apps/server_core/internal/modules/catalog/transport"
	classpostgres "marketplace-central/apps/server_core/internal/modules/classifications/adapters/postgres"
	classapp "marketplace-central/apps/server_core/internal/modules/classifications/application"
	classtransport "marketplace-central/apps/server_core/internal/modules/classifications/transport"
	melhorenvio "marketplace-central/apps/server_core/internal/modules/connectors/adapters/melhorenvio"
	connectorspostgres "marketplace-central/apps/server_core/internal/modules/connectors/adapters/postgres"
	connectorshttp "marketplace-central/apps/server_core/internal/modules/connectors/adapters/vtex/http"
	connectorsapp "marketplace-central/apps/server_core/internal/modules/connectors/application"
	connectorstransport "marketplace-central/apps/server_core/internal/modules/connectors/transport"
	marketplacespostgres "marketplace-central/apps/server_core/internal/modules/marketplaces/adapters/postgres"
	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	marketplacestransport "marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
	pricingcatalog "marketplace-central/apps/server_core/internal/modules/pricing/adapters/catalog"
	pricingmarket "marketplace-central/apps/server_core/internal/modules/pricing/adapters/marketplace"
	pricingpostgres "marketplace-central/apps/server_core/internal/modules/pricing/adapters/postgres"
	pricingapp "marketplace-central/apps/server_core/internal/modules/pricing/application"
	pricingtransport "marketplace-central/apps/server_core/internal/modules/pricing/transport"
	"marketplace-central/apps/server_core/internal/platform/httpx"
	"marketplace-central/apps/server_core/internal/platform/pgdb"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewRootRouter(pool *pgxpool.Pool, msPool *pgxpool.Pool, cfg pgdb.Config) http.Handler {
	mux := http.NewServeMux()

	base := httpx.NewRouter()
	mux.Handle("/healthz", base)

	catalogReader := catalogmetalshopping.NewRepository(msPool)
	catalogEnrichments := catalogpostgres.NewEnrichmentRepository(pool, cfg.DefaultTenantID)
	catalogSvc := catalogapp.NewService(catalogReader, catalogEnrichments, cfg.DefaultTenantID)
	catalogtransport.Handler{Service: catalogSvc}.Register(mux)

	classRepo := classpostgres.NewRepository(pool, cfg.DefaultTenantID)
	classSvc := classapp.NewService(classRepo, cfg.DefaultTenantID)
	classtransport.NewHandler(classSvc).Register(mux)

	marketRepo := marketplacespostgres.NewRepository(pool, cfg.DefaultTenantID)
	marketSvc := marketplacesapp.NewService(marketRepo, cfg.DefaultTenantID)
	marketplacestransport.NewHandler(marketSvc).Register(mux)

	pricingRepo := pricingpostgres.NewRepository(pool, cfg.DefaultTenantID)
	pricingSvc := pricingapp.NewService(pricingRepo, cfg.DefaultTenantID)

	// Melhor Envio
	meTokenStore := melhorenvio.NewTokenStore(pool, cfg.DefaultTenantID)
	meClient := melhorenvio.NewClient(meTokenStore)
	meOAuth := melhorenvio.NewOAuthHandlerFromEnv(meTokenStore) // nil if ME_CLIENT_ID unset

	// Pricing batch orchestrator
	prodReader := pricingcatalog.NewReader(catalogSvc)
	polReader := pricingmarket.NewReader(marketSvc)
	batchOrch := pricingapp.NewBatchOrchestrator(prodReader, polReader, meClient, cfg.DefaultTenantID)
	pricingtransport.NewHandler(pricingSvc, batchOrch).Register(mux)

	// Connectors (VTEX + ME auth)
	vtexCredentials, err := connectorshttp.NewEnvCredentialProvider()
	if err != nil {
		log.Fatalf("vtex credentials: %v", err)
	}
	connectorsRepo := connectorspostgres.NewRepository(pool, cfg.DefaultTenantID)
	vtexAdapter := connectorshttp.NewAdapter(vtexCredentials)
	connectorsOrch := connectorsapp.NewBatchOrchestrator(connectorsRepo, vtexAdapter, cfg.DefaultTenantID)
	connectorstransport.NewHandler(connectorsOrch, meOAuth).Register(mux)

	return httpx.CORSMiddleware(mux)
}
```

- [ ] **Step 3: Update router_registration_test.go**

In `apps/server_core/tests/unit/router_registration_test.go`:

1. Change `connectorstransport.NewHandler(connectorsOrch).Register(mux)` to `connectorstransport.NewHandler(connectorsOrch, nil).Register(mux)`
2. Change `pricingtransport.NewHandler(pricingSvc).Register(mux)` to `pricingtransport.NewHandler(pricingSvc, nil).Register(mux)`
3. Add new routes to the `cases` slice:

```go
"/pricing/simulations/batch",
"/connectors/melhor-envio/auth/start",
"/connectors/melhor-envio/status",
```

- [ ] **Step 4: Build and run all tests**

```bash
cd apps/server_core && go build ./... && go test ./tests/unit/... -v 2>&1 | tail -30
```

Expected: all PASS, `BUILD OK`

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/connectors/transport/http_handler.go \
        apps/server_core/internal/composition/root.go \
        apps/server_core/tests/unit/router_registration_test.go
git commit -m "feat(pricing): wire BatchOrchestrator and ME OAuth into composition root"
```

---

## Task 13: SDK Updates

**Files:**
- Modify: `packages/sdk-runtime/src/index.ts`

- [ ] **Step 1: Add weight_g to CatalogProduct and ProductEnrichment**

In `CatalogProduct` interface, add after `length_cm`:
```typescript
  weight_g: number | null;
```

In `ProductEnrichment` interface, add after `length_cm`:
```typescript
  weight_g: number | null;
```

- [ ] **Step 2: Add shipping_provider to MarketplacePolicy**

In `MarketplacePolicy` interface, add:
```typescript
  shipping_provider: string; // "fixed" | "melhor_envio" | "marketplace"
```

In `CreateMarketplacePolicyRequest` interface, add:
```typescript
  shipping_provider?: string;
```

- [ ] **Step 3: Add batch simulation types**

After `RunPricingSimulationRequest`, add:

```typescript
export interface BatchSimulationRequest {
  product_ids: string[];
  policy_ids: string[];
  origin_cep: string;
  destination_cep: string;
  price_source: "my_price" | "suggested_price";
  price_overrides?: Record<string, number>; // "productId::policyId" -> price
}

export interface BatchSimulationItem {
  product_id: string;
  policy_id: string;
  selling_price: number;
  cost_amount: number;
  commission_amount: number;
  freight_amount: number;
  fixed_fee_amount: number;
  margin_amount: number;
  margin_percent: number;
  status: string;
  freight_source: string; // "melhor_envio" | "fixed" | "no_dimensions" | "me_error" | "me_not_connected"
}
```

- [ ] **Step 4: Add new SDK methods**

In the `return` block of `createMarketplaceCentralClient`, add:

```typescript
    runBatchSimulation: (req: BatchSimulationRequest) =>
      postJson<{ items: BatchSimulationItem[] }>("/pricing/simulations/batch", req),
    getMelhorEnvioStatus: () =>
      getJson<{ connected: boolean }>("/connectors/melhor-envio/status"),
```

- [ ] **Step 5: Run SDK tests**

```bash
npm run test --workspace=packages/sdk-runtime
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/sdk-runtime/src/index.ts
git commit -m "feat(sdk): weight_g, shipping_provider, BatchSimulationRequest/Item, runBatchSimulation, getMelhorEnvioStatus"
```

---

## Task 14: Frontend — PricingSimulatorPage Rewrite

**Files:**
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.tsx`
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Replace `packages/feature-simulator/src/PricingSimulatorPage.test.tsx` with:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PricingSimulatorPage } from "./PricingSimulatorPage";
import type { SimulatorClient } from "./PricingSimulatorPage";

const makeProduct = (id: string, sku: string) => ({
  product_id: id, sku, name: `Product ${sku}`,
  description: "", brand_name: "", status: "active",
  cost_amount: 80, price_amount: 150, stock_quantity: 10,
  ean: "", reference: "", taxonomy_node_id: "t1", taxonomy_name: "Category",
  suggested_price: null, height_cm: 10, width_cm: 15, length_cm: 20, weight_g: 500,
});

const makePolicy = (id: string) => ({
  policy_id: id, tenant_id: "t1", account_id: "acc1",
  commission_percent: 0.16, fixed_fee_amount: 0,
  default_shipping: 20, tax_percent: 0, min_margin_percent: 0.10,
  sla_question_minutes: 60, sla_dispatch_hours: 24, shipping_provider: "fixed",
});

const makeClassification = (id: string, name: string, productIds: string[]) => ({
  classification_id: id, tenant_id: "t1", name,
  ai_context: "", product_ids: productIds, product_count: productIds.length,
  created_at: "", updated_at: "",
});

const makeBatchItem = (productId: string, policyId: string) => ({
  product_id: productId, policy_id: policyId,
  selling_price: 150, cost_amount: 80, commission_amount: 24,
  freight_amount: 20, fixed_fee_amount: 0,
  margin_amount: 26, margin_percent: 0.1733, status: "healthy",
  freight_source: "fixed",
});

function makeClient(overrides: Partial<SimulatorClient> = {}): SimulatorClient {
  return {
    listCatalogProducts: vi.fn().mockResolvedValue({ items: [makeProduct("p1", "SKU-001"), makeProduct("p2", "SKU-002")] }),
    listClassifications: vi.fn().mockResolvedValue({ items: [makeClassification("cls1", "Ativos", ["p1", "p2"])] }),
    listMarketplacePolicies: vi.fn().mockResolvedValue({ items: [makePolicy("pol1")] }),
    listTaxonomyNodes: vi.fn().mockResolvedValue({ items: [] }),
    runBatchSimulation: vi.fn().mockResolvedValue({ items: [makeBatchItem("p1", "pol1"), makeBatchItem("p2", "pol1")] }),
    getMelhorEnvioStatus: vi.fn().mockResolvedValue({ connected: false }),
    ...overrides,
  };
}

describe("PricingSimulatorPage", () => {
  it("renders command bar with CEP inputs and Run button disabled initially", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await screen.findByText("Product SKU-001");
    expect(screen.getByLabelText(/origin cep/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/destination cep/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeDisabled();
  });

  it("Run button stays disabled when no products are selected", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeDisabled();
  });

  it("Run button enables when products selected and CEPs filled", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product sku-001/i }));
    expect(screen.getByRole("button", { name: /run simulation/i })).not.toBeDisabled();
  });

  it("clicking a classification pill selects all its products", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await screen.findByText("Ativos");
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
  });

  it("clicking classification pill twice deselects all its products", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await screen.findByText("Ativos");
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    expect(screen.queryByText(/2 selected/i)).not.toBeInTheDocument();
  });

  it("running simulation renders results and summary banner", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() => expect(client.runBatchSimulation).toHaveBeenCalledOnce());
    expect(await screen.findByText(/avg/i)).toBeInTheDocument();
    expect(await screen.findByText(/healthy/i)).toBeInTheDocument();
  });

  it("results show collapsed policy columns by default", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() => expect(client.runBatchSimulation).toHaveBeenCalledOnce());
    // Policy column should be collapsed — shows policy id but not "Commission"
    await screen.findByText("pol1");
    expect(screen.queryByText(/commission/i)).not.toBeInTheDocument();
  });

  it("expanding a policy column reveals detail columns", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await screen.findByText("pol1");
    fireEvent.click(screen.getByRole("button", { name: /expand pol1/i }));
    expect(await screen.findByText(/commission/i)).toBeInTheDocument();
    expect(screen.getByText(/freight/i)).toBeInTheDocument();
  });

  it("shows load error when data fetch fails", async () => {
    const client = makeClient({
      listCatalogProducts: vi.fn().mockRejectedValue(new Error("network error")),
    });
    render(<PricingSimulatorPage client={client} />);
    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
  });

  it("shows run error when batch simulation fails", async () => {
    const client = makeClient({
      runBatchSimulation: vi.fn().mockRejectedValue({ error: { message: "batch failed" } }),
    });
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    expect(await screen.findByText(/batch failed/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test --workspace=packages/feature-simulator -- --reporter=verbose 2>&1 | tail -20
```

Expected: multiple FAIL — component not matching

- [ ] **Step 3: Implement PricingSimulatorPage**

Replace `packages/feature-simulator/src/PricingSimulatorPage.tsx` with:

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button, PaginatedTable } from "@marketplace-central/ui";
import { ToggleLeft, ToggleRight, ChevronRight, ChevronDown } from "lucide-react";
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
  MarketplacePolicy,
  BatchSimulationRequest,
  BatchSimulationItem,
} from "@marketplace-central/sdk-runtime";

export interface SimulatorClient {
  listCatalogProducts: () => Promise<{ items: CatalogProduct[] }>;
  listClassifications: () => Promise<{ items: Classification[] }>;
  listMarketplacePolicies: () => Promise<{ items: MarketplacePolicy[] }>;
  listTaxonomyNodes: () => Promise<{ items: TaxonomyNode[] }>;
  runBatchSimulation: (req: BatchSimulationRequest) => Promise<{ items: BatchSimulationItem[] }>;
  getMelhorEnvioStatus: () => Promise<{ connected: boolean }>;
}

interface Props { client: SimulatorClient; }

function fmt(v: number | null | undefined) {
  return v == null ? "—" : `R$ ${v.toFixed(2)}`;
}
function marginColor(pct: number) {
  if (pct >= 0.20) return "text-emerald-700";
  if (pct >= 0.10) return "text-amber-700";
  return "text-red-700";
}
function marginBg(pct: number) {
  if (pct >= 0.20) return "bg-emerald-100";
  if (pct >= 0.10) return "bg-amber-100";
  return "bg-red-100";
}

export function PricingSimulatorPage({ client }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [policies, setPolicies] = useState<MarketplacePolicy[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [originCep, setOriginCep] = useState("");
  const [destinationCep, setDestinationCep] = useState("");
  const [priceSource, setPriceSource] = useState<"my_price" | "suggested_price">("my_price");
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set());

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BatchSimulationItem[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [healthFilter, setHealthFilter] = useState<"all" | "healthy" | "warning" | "critical">("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [prodRes, clsRes, polRes, taxRes] = await Promise.all([
          client.listCatalogProducts(),
          client.listClassifications(),
          client.listMarketplacePolicies(),
          client.listTaxonomyNodes(),
        ]);
        if (cancelled) return;
        setProducts(prodRes.items);
        setClassifications(clsRes.items);
        setPolicies(polRes.items);
        setTaxonomyNodes(taxRes.items);
      } catch {
        if (!cancelled) setLoadError("Failed to load data.");
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [client]);

  const resultMap = useMemo(() => {
    const m: Record<string, BatchSimulationItem> = {};
    for (const item of results) {
      m[`${item.product_id}::${item.policy_id}`] = item;
    }
    return m;
  }, [results]);

  const hasResults = results.length > 0;

  const filtered = useMemo(() => {
    let items = products.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchTax = !taxonomyFilter || p.taxonomy_node_id === taxonomyFilter;
      return matchSearch && matchTax;
    });
    if (hasResults && healthFilter !== "all") {
      items = items.filter((p) => {
        const statuses = policies.map((pol) => resultMap[`${p.product_id}::${pol.policy_id}`]?.status).filter(Boolean);
        if (healthFilter === "healthy") return statuses.some((s) => s === "healthy");
        if (healthFilter === "warning") return statuses.some((s) => s === "warning");
        if (healthFilter === "critical") return statuses.some((s) => s !== "healthy" && s !== "warning");
        return true;
      });
    }
    return items;
  }, [products, search, taxonomyFilter, healthFilter, hasResults, policies, resultMap]);

  function toggleProduct(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleClassification(cls: Classification) {
    const allSelected = cls.product_ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) cls.product_ids.forEach((id) => next.delete(id));
      else cls.product_ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleExpand(policyId: string) {
    setExpandedPolicies((prev) => {
      const next = new Set(prev);
      if (next.has(policyId)) next.delete(policyId); else next.add(policyId);
      return next;
    });
  }

  const cepDigits = (s: string) => s.replace(/\D/g, "");
  const canRun = selectedIds.size > 0
    && cepDigits(originCep).length >= 8
    && cepDigits(destinationCep).length >= 8
    && !running;

  const handleRun = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setResults([]);
    try {
      const res = await client.runBatchSimulation({
        product_ids: Array.from(selectedIds),
        policy_ids: policies.map((p) => p.policy_id),
        origin_cep: cepDigits(originCep),
        destination_cep: cepDigits(destinationCep),
        price_source: priceSource,
        price_overrides: priceOverrides,
      });
      setResults(res.items);
    } catch (err: any) {
      setRunError(err?.error?.message ?? "Simulation failed.");
    } finally {
      setRunning(false);
    }
  }, [selectedIds, policies, originCep, destinationCep, priceSource, priceOverrides, client]);

  function commitOverride(productId: string, policyId: string, raw: string) {
    const val = parseFloat(raw.replace(",", "."));
    if (!isFinite(val) || val <= 0) return;
    const key = `${productId}::${policyId}`;
    setPriceOverrides((prev) => ({ ...prev, [key]: val }));
    // Recalculate this cell locally.
    setResults((prev) => prev.map((item) => {
      if (item.product_id !== productId || item.policy_id !== policyId) return item;
      const policy = policies.find((p) => p.policy_id === policyId);
      if (!policy) return item;
      const commissionAmt = val * policy.commission_percent;
      const marginAmt = val - item.cost_amount - commissionAmt - item.fixed_fee_amount - item.freight_amount;
      const marginPct = val > 0 ? marginAmt / val : 0;
      const status = marginPct >= policy.min_margin_percent ? "healthy" : "warning";
      return { ...item, selling_price: val, commission_amount: commissionAmt, margin_amount: marginAmt, margin_percent: marginPct, status };
    }));
  }

  // Summary stats
  const avgMargin = results.length > 0
    ? results.reduce((s, r) => s + r.margin_percent, 0) / results.length : 0;
  const healthyCount = results.filter((r) => r.status === "healthy").length;
  const warningCount = results.filter((r) => r.status === "warning").length;
  const criticalCount = results.filter((r) => r.status !== "healthy" && r.status !== "warning").length;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">Pricing Simulator</h2>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{loadError}</div>
      )}

      {/* Command bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label htmlFor="origin-cep" className="block text-xs font-medium text-slate-700">Origin CEP</label>
            <input
              id="origin-cep"
              aria-label="Origin CEP"
              value={originCep}
              onChange={(e) => setOriginCep(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="w-32 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="dest-cep" className="block text-xs font-medium text-slate-700">Destination CEP</label>
            <input
              id="dest-cep"
              aria-label="Destination CEP"
              value={destinationCep}
              onChange={(e) => setDestinationCep(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="w-32 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end gap-2 pb-0.5">
            <button
              type="button"
              onClick={() => setPriceSource((v) => v === "my_price" ? "suggested_price" : "my_price")}
              className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
              aria-label="Toggle price source"
            >
              {priceSource === "suggested_price"
                ? <ToggleRight className="h-5 w-5 text-blue-600" />
                : <ToggleLeft className="h-5 w-5 text-slate-400" />}
              {priceSource === "suggested_price" ? "Using suggested price" : "Using my price"}
            </button>
          </div>
          <div className="ml-auto pb-0.5">
            <Button variant="primary" onClick={handleRun} loading={running} disabled={!canRun}>
              Run Simulation
            </Button>
          </div>
        </div>
        {runError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{runError}</div>
        )}
      </div>

      {/* Classification pills (scope selector) */}
      {classifications.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {classifications.map((cls) => {
            const allSelected = cls.product_ids.length > 0 && cls.product_ids.every((id) => selectedIds.has(id));
            return (
              <button
                key={cls.classification_id}
                type="button"
                aria-label={`${cls.name} ×${cls.product_count}`}
                onClick={() => toggleClassification(cls)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
                  allSelected
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"
                }`}
              >
                {cls.name} <span className="opacity-75">×{cls.product_count}</span>
              </button>
            );
          })}
          {selectedIds.size > 0 && (
            <span className="text-sm text-slate-500 ml-2">{selectedIds.size} selected</span>
          )}
        </div>
      )}

      {/* Summary banner */}
      {hasResults && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 flex flex-wrap gap-6 items-center text-sm">
          <span className="font-medium text-slate-700">
            Avg margin <span className={marginColor(avgMargin)}>{(avgMargin * 100).toFixed(1)}%</span>
          </span>
          <span className="text-emerald-700">Healthy: {healthyCount}</span>
          <span className="text-amber-700">Warning: {warningCount}</span>
          {criticalCount > 0 && <span className="text-red-700">Critical: {criticalCount}</span>}
          <button onClick={() => setResults([])} className="ml-auto text-xs text-slate-500 hover:text-slate-700 cursor-pointer">
            Clear Results
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={taxonomyFilter}
          onChange={(e) => setTaxonomyFilter(e.target.value)}
          aria-label="Taxonomy filter"
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Taxonomy</option>
          {taxonomyNodes.map((t) => <option key={t.node_id} value={t.node_id}>{t.name}</option>)}
        </select>
        {hasResults && (
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value as any)}
            aria-label="Health filter"
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Health</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        )}
      </div>

      {/* Product table */}
      <PaginatedTable
        items={filtered}
        pageSize={25}
        loading={loadingData}
        renderHeader={() => (
          <tr>
            <th className="px-3 py-3 w-10"></th>
            <th className="px-4 py-3 font-medium text-slate-600 text-left">Name</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-left">SKU</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Cost</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Price</th>
            {!hasResults && <th className="px-4 py-3 font-medium text-slate-600 text-right">Stock</th>}
            {hasResults && policies.flatMap((pol) => {
              const isExpanded = expandedPolicies.has(pol.policy_id);
              if (isExpanded) {
                return [
                  <th key={`${pol.policy_id}_sp`} className="px-3 py-3 font-medium text-slate-600 text-right text-xs">Sell Price</th>,
                  <th key={`${pol.policy_id}_cm`} className="px-3 py-3 font-medium text-slate-600 text-right text-xs">Commission</th>,
                  <th key={`${pol.policy_id}_fr`} className="px-3 py-3 font-medium text-slate-600 text-right text-xs">Freight</th>,
                  <th key={`${pol.policy_id}_ff`} className="px-3 py-3 font-medium text-slate-600 text-right text-xs">Fixed Fee</th>,
                  <th key={`${pol.policy_id}_mg`} className="px-3 py-3 font-medium text-slate-600 text-right text-xs">
                    <button
                      type="button"
                      aria-label={`Expand ${pol.policy_id}`}
                      onClick={() => toggleExpand(pol.policy_id)}
                      className="flex items-center gap-1 text-blue-700 font-semibold cursor-pointer"
                    >
                      {pol.policy_id} <ChevronDown className="h-3 w-3" />
                    </button>
                    Margin
                  </th>,
                ];
              }
              return [
                <th key={pol.policy_id} className="px-4 py-3 font-medium text-slate-600 text-right text-xs">
                  <button
                    type="button"
                    aria-label={`Expand ${pol.policy_id}`}
                    onClick={() => toggleExpand(pol.policy_id)}
                    className="flex items-center gap-1 text-slate-700 cursor-pointer hover:text-blue-600"
                  >
                    {pol.policy_id} <ChevronRight className="h-3 w-3" />
                  </button>
                </th>,
              ];
            })}
          </tr>
        )}
        renderRow={(p) => {
          const checked = selectedIds.has(p.product_id);
          return (
            <tr
              key={p.product_id}
              className={`border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${checked ? "bg-blue-50/30" : ""}`}
              onClick={() => toggleProduct(p.product_id)}
            >
              <td className="px-3 py-3 text-center">
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={`Select product ${p.sku}`}
                  onChange={() => toggleProduct(p.product_id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
              <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.sku}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">{fmt(p.cost_amount)}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">{fmt(p.price_amount)}</td>
              {!hasResults && (
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{p.stock_quantity}</td>
              )}
              {hasResults && policies.flatMap((pol) => {
                const item = resultMap[`${p.product_id}::${pol.policy_id}`];
                const isExpanded = expandedPolicies.has(pol.policy_id);
                if (isExpanded) {
                  const overrideKey = `${p.product_id}::${pol.policy_id}`;
                  return [
                    <td key={`${overrideKey}_sp`} className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {item ? (
                        <input
                          type="text"
                          defaultValue={item.selling_price.toFixed(2)}
                          aria-label={`Selling price ${p.sku} ${pol.policy_id}`}
                          onBlur={(e) => commitOverride(p.product_id, pol.policy_id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") e.currentTarget.value = item.selling_price.toFixed(2); }}
                          className="w-20 px-1.5 py-0.5 text-right text-xs font-mono border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>,
                    <td key={`${overrideKey}_cm`} className="px-3 py-2 text-right font-mono text-xs text-slate-600 tabular-nums">
                      {item ? fmt(item.commission_amount) : <span className="text-slate-300">—</span>}
                    </td>,
                    <td key={`${overrideKey}_fr`} className="px-3 py-2 text-right font-mono text-xs text-slate-600 tabular-nums">
                      {item ? (
                        <span title={item.freight_source}>{fmt(item.freight_amount)}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>,
                    <td key={`${overrideKey}_ff`} className="px-3 py-2 text-right font-mono text-xs text-slate-600 tabular-nums">
                      {item ? fmt(item.fixed_fee_amount) : <span className="text-slate-300">—</span>}
                    </td>,
                    <td key={`${overrideKey}_mg`} className="px-3 py-2 text-right">
                      {item ? (
                        <span className={`inline-block px-2 py-0.5 rounded font-mono text-xs font-bold ${marginBg(item.margin_percent)} ${marginColor(item.margin_percent)}`}>
                          {(item.margin_percent * 100).toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>,
                  ];
                }
                return [
                  <td key={`${p.product_id}::${pol.policy_id}_col`} className="px-4 py-2 text-right">
                    {item ? (
                      <span className={`inline-block px-2 py-0.5 rounded font-mono text-xs font-bold ${marginBg(item.margin_percent)} ${marginColor(item.margin_percent)}`}>
                        {(item.margin_percent * 100).toFixed(1)}%
                      </span>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>,
                ];
              })}
            </tr>
          );
        }}
        emptyState={<p className="text-sm text-slate-500">No products match your filters.</p>}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test --workspace=packages/feature-simulator -- --reporter=verbose 2>&1 | tail -30
```

Expected: all PASS

- [ ] **Step 5: Run all frontend tests**

```bash
npm run test --workspaces 2>&1 | tail -20
```

Expected: all suites PASS

- [ ] **Step 6: Commit**

```bash
git add packages/feature-simulator/src/PricingSimulatorPage.tsx \
        packages/feature-simulator/src/PricingSimulatorPage.test.tsx
git commit -m "feat(simulator): v2 — classification pills, batch simulation, collapsible policy columns, inline price editing"
```

---

## Task 15: Build Verification + Push

- [ ] **Step 1: Full Go build and test**

```bash
cd apps/server_core && go build ./... && go test ./... 2>&1 | tail -20
```

Expected: `BUILD OK`, all tests PASS

- [ ] **Step 2: Full frontend test**

```bash
npm run test --workspaces 2>&1 | tail -10
```

Expected: all suites PASS

- [ ] **Step 3: Run server smoke test**

In PowerShell:
```powershell
.\run-server.ps1
```

Expected: `server starting on :8080`

In a second terminal:
```bash
curl -s http://localhost:8080/connectors/melhor-envio/status
```

Expected: `{"connected":false}`

```bash
curl -s -X POST http://localhost:8080/pricing/simulations/batch \
  -H "Content-Type: application/json" \
  -d '{"product_ids":[],"policy_ids":[],"origin_cep":"01310100","destination_cep":"30140071","price_source":"my_price"}'
```

Expected: `{"error":{"code":"PRICING_REQUEST_INVALID",...}}`

- [ ] **Step 4: Push**

```bash
git push origin master
```
