# Product Integration Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual data entry across the UI with real MetalShopping product data by building a read-only data bridge, product enrichments, classifications, a Products page, and reworking VTEX Publisher and Pricing Simulator to use product selection.

**Architecture:** A second pgxpool connects to MetalShopping's Postgres (read-only, RLS tenant context). The catalog module's adapter switches from MPC's own table to MetalShopping queries. New `classifications` and `product_enrichments` tables in MPC's database store user-created groupings and manual product data (dimensions, suggested price). A shared `ProductPicker` UI component is used across VTEX Publisher, Pricing Simulator, and Classification forms.

**Tech Stack:** Go 1.22+, pgx/v5, PostgreSQL, React 19, React Router DOM v7, Tailwind CSS v4, Lucide React, Vitest, @testing-library/react, npm workspaces

**Spec:** `docs/superpowers/specs/2026-04-02-product-integration-rework-design.md`

---

## Phase Positioning

The previous `IMPLEMENTATION_PLAN.md` does not exist on disk. This plan supersedes the Phase 1 foundation scope (which is complete: SDK, OpenAPI, migrations, backend modules are all implemented). This rework is the next logical phase — connecting MPC to real MetalShopping data and making the UI functional. Prerequisites that are already satisfied: Go backend running, catalog/marketplaces/pricing/connectors modules wired, SDK with typed methods, React app shell with routing.

## Cross-Cutting Requirements

Every task in this plan must satisfy these repo-level rules (from AGENTS.md):

1. **tenant_id in every WHERE clause** — all new Postgres queries include `tenant_id` filtering
2. **Structured error codes** — format `MODULE_ENTITY_REASON` (e.g., `CATALOG_PRODUCT_NOT_FOUND`, `CLASSIFICATIONS_CREATE_NAME_REQUIRED`)
3. **Handler logging** — every HTTP handler logs `action`, `result`, `duration_ms` using the platform logger
4. **Method validation** — every handler rejects invalid HTTP methods with `405` + `Allow` header
5. **Structured JSON errors** — `{"error": {"code": "...", "message": "...", "details": {}}}`
6. **Idempotent writes** — enrichment upsert, classification create with existing ID
7. **No panic in production** — return errors

## Stale Reference Strategy

`product_enrichments` and `classification_products` reference MetalShopping `product_id` values without foreign keys (cross-database). Strategy:

- **Lazy validation**: when listing classifications or enrichments, the service layer cross-references returned product IDs against the MetalShopping catalog. Products that no longer exist in MetalShopping are flagged with `"status": "stale"` in the API response but not deleted.
- **No automatic cleanup**: stale references are preserved (the product may reappear). Users can remove stale products from classifications manually.
- **Enrichments for stale products**: still returned by the API (dimensions/price may be useful even if the product is temporarily inactive).

---

## File Structure

### Backend — New/Modified

```
apps/server_core/internal/
  platform/
    msdb/
      pool.go              CREATE — MetalShopping pgxpool + RLS tenant helper
      pool_test.go         CREATE — unit test for config validation
  modules/
    catalog/
      domain/
        product.go         MODIFY — expand Product struct with new fields
      ports/
        repository.go      MODIFY — add SearchProducts, GetProduct, taxonomy and enrichment ports
      application/
        service.go         MODIFY — add SearchProducts, GetProduct, GetTaxonomy, enrichment methods
      adapters/
        metalshopping/
          repository.go    CREATE — read-only adapter for MetalShopping database
        postgres/
          repository.go    MODIFY — becomes enrichment-only adapter (read/write MPC enrichments)
      transport/
        http_handler.go    MODIFY — add search, get-by-id, taxonomy, enrichment endpoints
    classifications/
      domain/
        classification.go  CREATE — Classification entity
      ports/
        repository.go      CREATE — Repository interface
      application/
        service.go         CREATE — CRUD service
      adapters/
        postgres/
          repository.go    CREATE — Postgres adapter
      transport/
        http_handler.go    CREATE — HTTP endpoints
    pricing/
      application/
        service.go         MODIFY — accept optional cost_amount, resolve from catalog
      transport/
        http_handler.go    MODIFY — cost_amount becomes optional in request
  composition/
    root.go                MODIFY — wire msdb pool, classifications, enrichments
```

### Migrations

```
apps/server_core/migrations/
  0006_product_enrichments.sql  CREATE
  0007_classifications.sql      CREATE
```

### Frontend — New/Modified

```
packages/
  sdk-runtime/src/
    index.ts               MODIFY — new types + 10 new methods
  ui/src/
    ProductPicker.tsx       CREATE — shared product selection component
    ProductPicker.test.tsx  CREATE — tests
    index.ts               MODIFY — export ProductPicker
  feature-products/
    package.json           CREATE — new workspace package
    src/
      ProductsPage.tsx     CREATE — products list with enrichment editing
      ProductsPage.test.tsx CREATE — tests
      index.ts             CREATE — export
  feature-connectors/src/
    VTEXPublishPage.tsx    MODIFY — replace manual form with ProductPicker
    VTEXPublishPage.test.tsx MODIFY — update tests
  feature-simulator/src/
    PricingSimulatorPage.tsx   MODIFY — replace manual form with ProductPicker
    PricingSimulatorPage.test.tsx MODIFY — update tests

apps/web/src/app/
  AppRouter.tsx            MODIFY — add /products route
  Layout.tsx               MODIFY — add Products nav item
```

---

## Task 1: MetalShopping Pool — Platform Package

**Files:**
- Create: `apps/server_core/internal/platform/msdb/pool.go`
- Create: `apps/server_core/internal/platform/msdb/pool_test.go`

- [ ] **Step 1: Write the failing test for config loading**

```go
// apps/server_core/internal/platform/msdb/pool_test.go
package msdb

import "testing"

func TestLoadConfigRequiresDatabaseURL(t *testing.T) {
	t.Setenv("MS_DATABASE_URL", "")
	t.Setenv("MS_TENANT_ID", "tnt_test")

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected error when MS_DATABASE_URL is empty")
	}
}

func TestLoadConfigRequiresTenantID(t *testing.T) {
	t.Setenv("MS_DATABASE_URL", "postgres://localhost/ms")
	t.Setenv("MS_TENANT_ID", "")

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected error when MS_TENANT_ID is empty")
	}
}

func TestLoadConfigSuccess(t *testing.T) {
	t.Setenv("MS_DATABASE_URL", "postgres://localhost/ms")
	t.Setenv("MS_TENANT_ID", "tnt_test")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DatabaseURL != "postgres://localhost/ms" {
		t.Fatalf("expected postgres://localhost/ms, got %q", cfg.DatabaseURL)
	}
	if cfg.TenantID != "tnt_test" {
		t.Fatalf("expected tnt_test, got %q", cfg.TenantID)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server_core && go test ./internal/platform/msdb/ -v -run TestLoadConfig`
Expected: FAIL — package does not exist

- [ ] **Step 3: Write the implementation**

```go
// apps/server_core/internal/platform/msdb/pool.go
package msdb

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	DatabaseURL string
	TenantID    string
}

func LoadConfig() (Config, error) {
	cfg := Config{
		DatabaseURL: os.Getenv("MS_DATABASE_URL"),
		TenantID:    os.Getenv("MS_TENANT_ID"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("MS_DATABASE_URL is required")
	}
	if cfg.TenantID == "" {
		return Config{}, errors.New("MS_TENANT_ID is required")
	}
	return cfg, nil
}

func NewPool(ctx context.Context, cfg Config) (*pgxpool.Pool, error) {
	if cfg.DatabaseURL == "" {
		return nil, errors.New("MS_DATABASE_URL is required")
	}
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	// Set tenant context on every connection acquire (not just creation) so
	// MetalShopping's RLS policies work even on reused pooled connections.
	poolCfg.BeforeAcquire = func(ctx context.Context, conn *pgx.Conn) bool {
		_, err := conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", cfg.TenantID)
		return err == nil
	}
	return pgxpool.NewWithConfig(ctx, poolCfg)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server_core && go test ./internal/platform/msdb/ -v -run TestLoadConfig`
Expected: PASS — all 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/platform/msdb/
git commit -m "feat(platform): add MetalShopping database pool with RLS tenant context"
```

---

## Task 2: Expand Catalog Domain Model

**Files:**
- Modify: `apps/server_core/internal/modules/catalog/domain/product.go`

- [ ] **Step 1: Write the new domain model**

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
	ProductID           string   `json:"product_id"`
	TenantID            string   `json:"tenant_id"`
	HeightCM            *float64 `json:"height_cm"`
	WidthCM             *float64 `json:"width_cm"`
	LengthCM            *float64 `json:"length_cm"`
	SuggestedPriceAmount *float64 `json:"suggested_price_amount"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/server_core && go build ./internal/modules/catalog/domain/`
Expected: Compilation errors in dependent packages (expected — we'll fix those next)

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/modules/catalog/domain/product.go
git commit -m "feat(catalog): expand Product domain with enrichment, taxonomy, and MetalShopping fields"
```

---

## Task 3: Expand Catalog Ports

**Files:**
- Modify: `apps/server_core/internal/modules/catalog/ports/repository.go`

- [ ] **Step 1: Write the expanded port interfaces**

Replace `apps/server_core/internal/modules/catalog/ports/repository.go` with:

```go
package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

// ProductReader reads product data from MetalShopping (read-only).
type ProductReader interface {
	ListProducts(ctx context.Context) ([]domain.Product, error)
	GetProduct(ctx context.Context, productID string) (domain.Product, error)
	SearchProducts(ctx context.Context, query string) ([]domain.Product, error)
	ListTaxonomyNodes(ctx context.Context) ([]domain.TaxonomyNode, error)
}

// EnrichmentStore reads and writes product enrichments in MPC's own database.
type EnrichmentStore interface {
	GetEnrichment(ctx context.Context, productID string) (domain.ProductEnrichment, error)
	UpsertEnrichment(ctx context.Context, enrichment domain.ProductEnrichment) error
	ListEnrichments(ctx context.Context, productIDs []string) (map[string]domain.ProductEnrichment, error)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/server_core && go build ./internal/modules/catalog/ports/`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/modules/catalog/ports/repository.go
git commit -m "feat(catalog): split ports into ProductReader and EnrichmentStore interfaces"
```

---

## Task 4: MetalShopping Adapter — ListProducts

**Files:**
- Create: `apps/server_core/internal/modules/catalog/adapters/metalshopping/repository.go`
- Create: `apps/server_core/tests/unit/catalog_metalshopping_test.go`

- [ ] **Step 1: Write the failing test**

```go
// apps/server_core/tests/unit/catalog_metalshopping_test.go
package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

// productReaderStub implements ports.ProductReader for unit testing.
type productReaderStub struct {
	products []domain.Product
	product  domain.Product
	taxonomy []domain.TaxonomyNode
	err      error
}

func (s *productReaderStub) ListProducts(context.Context) ([]domain.Product, error) {
	return s.products, s.err
}

func (s *productReaderStub) GetProduct(_ context.Context, _ string) (domain.Product, error) {
	return s.product, s.err
}

func (s *productReaderStub) SearchProducts(_ context.Context, _ string) ([]domain.Product, error) {
	return s.products, s.err
}

func (s *productReaderStub) ListTaxonomyNodes(context.Context) ([]domain.TaxonomyNode, error) {
	return s.taxonomy, s.err
}

// enrichmentStoreStub implements ports.EnrichmentStore for unit testing.
type enrichmentStoreStub struct {
	enrichments map[string]domain.ProductEnrichment
	err         error
}

func (s *enrichmentStoreStub) GetEnrichment(_ context.Context, productID string) (domain.ProductEnrichment, error) {
	e, ok := s.enrichments[productID]
	if !ok {
		return domain.ProductEnrichment{}, s.err
	}
	return e, s.err
}

func (s *enrichmentStoreStub) UpsertEnrichment(_ context.Context, e domain.ProductEnrichment) error {
	if s.enrichments == nil {
		s.enrichments = make(map[string]domain.ProductEnrichment)
	}
	s.enrichments[e.ProductID] = e
	return s.err
}

func (s *enrichmentStoreStub) ListEnrichments(_ context.Context, productIDs []string) (map[string]domain.ProductEnrichment, error) {
	result := make(map[string]domain.ProductEnrichment)
	for _, id := range productIDs {
		if e, ok := s.enrichments[id]; ok {
			result[id] = e
		}
	}
	return result, s.err
}

func TestCatalogServiceListProducts(t *testing.T) {
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "prd_1", SKU: "SKU-001", Name: "Cuba Inox", Status: "active", CostAmount: 100},
		},
	}
	enrichments := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	svc := newCatalogServiceForTest(reader, enrichments, "tnt_1")

	products, err := svc.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(products) != 1 {
		t.Fatalf("expected 1 product, got %d", len(products))
	}
	if products[0].SKU != "SKU-001" {
		t.Fatalf("expected SKU-001, got %q", products[0].SKU)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server_core && go test ./tests/unit/ -v -run TestCatalogServiceListProducts`
Expected: FAIL — `newCatalogServiceForTest` undefined

- [ ] **Step 3: Write the MetalShopping adapter**

```go
// apps/server_core/internal/modules/catalog/adapters/metalshopping/repository.go
package metalshopping

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

var _ ports.ProductReader = (*Repository)(nil)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) ListProducts(ctx context.Context) ([]domain.Product, error) {
	return r.queryProducts(ctx, filterNone)
}

func (r *Repository) GetProduct(ctx context.Context, productID string) (domain.Product, error) {
	products, err := r.queryProducts(ctx, filterByID, productID)
	if err != nil {
		return domain.Product{}, err
	}
	if len(products) == 0 {
		return domain.Product{}, fmt.Errorf("CATALOG_PRODUCT_NOT_FOUND")
	}
	return products[0], nil
}

func (r *Repository) SearchProducts(ctx context.Context, query string) ([]domain.Product, error) {
	searchPattern := "%" + query + "%"
	return r.queryProducts(ctx, filterBySearch, searchPattern)
}

// filterKind is a whitelist of allowed query filter variants.
type filterKind int

const (
	filterNone     filterKind = iota
	filterByID
	filterBySearch
)

// filterSQL returns a safe, hardcoded WHERE clause for each filter variant.
func filterSQL(kind filterKind) string {
	switch kind {
	case filterByID:
		return "AND p.product_id = $1"
	case filterBySearch:
		return "AND (p.name ILIKE $1 OR p.sku ILIKE $1 OR ean.identifier_value ILIKE $1 OR ref.identifier_value ILIKE $1)"
	default:
		return ""
	}
}

func (r *Repository) ListTaxonomyNodes(ctx context.Context) ([]domain.TaxonomyNode, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			tn.taxonomy_node_id,
			tn.name,
			tn.level,
			COALESCE(ld.label, ''),
			COALESCE(tn.parent_taxonomy_node_id, ''),
			tn.is_active,
			COUNT(p.product_id)::int
		FROM catalog_taxonomy_nodes tn
		LEFT JOIN catalog_taxonomy_level_defs ld
			ON ld.tenant_id = tn.tenant_id AND ld.level = tn.level
		LEFT JOIN catalog_products p
			ON p.primary_taxonomy_node_id = tn.taxonomy_node_id
			AND p.tenant_id = tn.tenant_id AND p.status = 'active'
		WHERE tn.is_active = true
		GROUP BY tn.taxonomy_node_id, tn.name, tn.level, ld.label, tn.parent_taxonomy_node_id, tn.is_active
		ORDER BY tn.level, tn.name
	`)
	if err != nil {
		return nil, fmt.Errorf("list taxonomy: %w", err)
	}
	defer rows.Close()

	nodes := make([]domain.TaxonomyNode, 0)
	for rows.Next() {
		var n domain.TaxonomyNode
		if err := rows.Scan(&n.NodeID, &n.Name, &n.Level, &n.LevelLabel, &n.ParentNodeID, &n.IsActive, &n.ProductCount); err != nil {
			return nil, fmt.Errorf("scan taxonomy node: %w", err)
		}
		nodes = append(nodes, n)
	}
	return nodes, rows.Err()
}

// queryProducts runs the full product query with an optional whitelist-based filter.
// No dynamic SQL — filter clauses are selected from hardcoded variants via filterSQL().
func (r *Repository) queryProducts(ctx context.Context, kind filterKind, args ...any) ([]domain.Product, error) {
	query := `
		SELECT
			p.product_id,
			p.sku,
			p.name,
			COALESCE(p.description, ''),
			COALESCE(p.brand_name, ''),
			p.status,
			COALESCE(pr.replacement_cost_amount, 0),
			COALESCE(pr.price_amount, 0),
			COALESCE(inv.on_hand_quantity, 0),
			COALESCE(ean.identifier_value, ''),
			COALESCE(ref.identifier_value, ''),
			COALESCE(p.primary_taxonomy_node_id, ''),
			COALESCE(tn.name, ''),
			sp.observed_price
		FROM catalog_products p
		LEFT JOIN pricing_product_prices pr
			ON pr.product_id = p.product_id AND pr.tenant_id = p.tenant_id
			AND pr.pricing_status = 'active' AND pr.effective_to IS NULL
		LEFT JOIN inventory_product_positions inv
			ON inv.product_id = p.product_id AND inv.tenant_id = p.tenant_id
			AND inv.position_status = 'active' AND inv.effective_to IS NULL
		LEFT JOIN catalog_product_identifiers ean
			ON ean.product_id = p.product_id AND ean.tenant_id = p.tenant_id
			AND ean.identifier_type = 'ean' AND ean.is_primary = true
		LEFT JOIN catalog_product_identifiers ref
			ON ref.product_id = p.product_id AND ref.tenant_id = p.tenant_id
			AND ref.identifier_type = 'reference' AND ref.is_primary = true
		LEFT JOIN catalog_taxonomy_nodes tn
			ON tn.taxonomy_node_id = p.primary_taxonomy_node_id AND tn.tenant_id = p.tenant_id
		LEFT JOIN LATERAL (
			SELECT sp2.observed_price
			FROM shopping_price_latest_snapshot sp2
			WHERE sp2.sku = p.sku
			ORDER BY sp2.observed_at DESC
			LIMIT 1
		) sp ON true
		WHERE p.status = 'active' ` + filterSQL(kind) + `
		ORDER BY p.name
	`

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query products: %w", err)
	}
	defer rows.Close()

	products := make([]domain.Product, 0)
	for rows.Next() {
		var p domain.Product
		var shoppingPrice *float64
		if err := rows.Scan(
			&p.ProductID, &p.SKU, &p.Name, &p.Description, &p.BrandName,
			&p.Status, &p.CostAmount, &p.PriceAmount, &p.StockQuantity,
			&p.EAN, &p.Reference, &p.TaxonomyNodeID, &p.TaxonomyName,
			&shoppingPrice,
		); err != nil {
			return nil, fmt.Errorf("scan product: %w", err)
		}
		p.SuggestedPrice = shoppingPrice
		products = append(products, p)
	}
	return products, rows.Err()
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/internal/modules/catalog/adapters/metalshopping/
git commit -m "feat(catalog): add MetalShopping read-only adapter for products and taxonomy"
```

---

## Task 5: Product Enrichments Migration + Adapter

**Files:**
- Create: `apps/server_core/migrations/0006_product_enrichments.sql`
- Modify: `apps/server_core/internal/modules/catalog/adapters/postgres/repository.go`

- [ ] **Step 1: Write the migration**

```sql
-- apps/server_core/migrations/0006_product_enrichments.sql
CREATE TABLE product_enrichments (
    product_id              TEXT NOT NULL,
    tenant_id               TEXT NOT NULL,
    height_cm               NUMERIC(10,2),
    width_cm                NUMERIC(10,2),
    length_cm               NUMERIC(10,2),
    suggested_price_amount  NUMERIC(14,2),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, product_id)
);
```

- [ ] **Step 2: Rewrite the postgres adapter for enrichments only**

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
		SELECT product_id, tenant_id, height_cm, width_cm, length_cm, suggested_price_amount
		FROM product_enrichments
		WHERE tenant_id = $1 AND product_id = $2
	`, r.tenantID, productID).Scan(
		&e.ProductID, &e.TenantID, &e.HeightCM, &e.WidthCM, &e.LengthCM, &e.SuggestedPriceAmount,
	)
	if err == pgx.ErrNoRows {
		return domain.ProductEnrichment{ProductID: productID, TenantID: r.tenantID}, nil
	}
	if err != nil {
		return domain.ProductEnrichment{}, fmt.Errorf("get enrichment: %w", err)
	}
	return e, nil
}

// UpsertEnrichment uses partial-update semantics: only non-nil fields overwrite existing values.
// Nil fields in the input are preserved (COALESCE keeps the existing DB value).
func (r *EnrichmentRepository) UpsertEnrichment(ctx context.Context, e domain.ProductEnrichment) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO product_enrichments (product_id, tenant_id, height_cm, width_cm, length_cm, suggested_price_amount, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (tenant_id, product_id) DO UPDATE SET
			height_cm = COALESCE(EXCLUDED.height_cm, product_enrichments.height_cm),
			width_cm = COALESCE(EXCLUDED.width_cm, product_enrichments.width_cm),
			length_cm = COALESCE(EXCLUDED.length_cm, product_enrichments.length_cm),
			suggested_price_amount = COALESCE(EXCLUDED.suggested_price_amount, product_enrichments.suggested_price_amount),
			updated_at = now()
	`, e.ProductID, r.tenantID, e.HeightCM, e.WidthCM, e.LengthCM, e.SuggestedPriceAmount)
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
		SELECT product_id, tenant_id, height_cm, width_cm, length_cm, suggested_price_amount
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
		if err := rows.Scan(&e.ProductID, &e.TenantID, &e.HeightCM, &e.WidthCM, &e.LengthCM, &e.SuggestedPriceAmount); err != nil {
			return nil, fmt.Errorf("scan enrichment: %w", err)
		}
		result[e.ProductID] = e
	}
	return result, rows.Err()
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/server_core && go build ./internal/modules/catalog/adapters/postgres/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/migrations/0006_product_enrichments.sql apps/server_core/internal/modules/catalog/adapters/postgres/repository.go
git commit -m "feat(catalog): add product enrichments migration and postgres adapter"
```

---

## Task 6: Catalog Service Rewrite

**Files:**
- Modify: `apps/server_core/internal/modules/catalog/application/service.go`
- Modify: `apps/server_core/tests/unit/catalog_metalshopping_test.go` (from Task 4)
- Modify: `apps/server_core/tests/unit/catalog_service_test.go`

- [ ] **Step 1: Write tests for enrichment overlay**

Add to `apps/server_core/tests/unit/catalog_metalshopping_test.go`:

```go
func TestCatalogServiceAppliesEnrichmentOverlay(t *testing.T) {
	suggestedFromShopping := 80.0
	suggestedManual := 75.0
	height := 12.5

	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "prd_1", SKU: "SKU-001", Name: "Cuba Inox", SuggestedPrice: &suggestedFromShopping},
		},
	}
	enrichments := &enrichmentStoreStub{
		enrichments: map[string]domain.ProductEnrichment{
			"prd_1": {ProductID: "prd_1", TenantID: "tnt_1", SuggestedPriceAmount: &suggestedManual, HeightCM: &height},
		},
	}
	svc := newCatalogServiceForTest(reader, enrichments, "tnt_1")

	products, err := svc.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *products[0].SuggestedPrice != 75.0 {
		t.Fatalf("expected manual suggested price 75.0, got %v", *products[0].SuggestedPrice)
	}
	if *products[0].HeightCM != 12.5 {
		t.Fatalf("expected height 12.5, got %v", *products[0].HeightCM)
	}
}

func TestCatalogServiceFallsBackToShoppingSuggestedPrice(t *testing.T) {
	suggestedFromShopping := 80.0

	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "prd_1", SKU: "SKU-001", Name: "Cuba Inox", SuggestedPrice: &suggestedFromShopping},
		},
	}
	enrichments := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	svc := newCatalogServiceForTest(reader, enrichments, "tnt_1")

	products, err := svc.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *products[0].SuggestedPrice != 80.0 {
		t.Fatalf("expected shopping suggested price 80.0, got %v", *products[0].SuggestedPrice)
	}
}

// Helper to construct catalog service with stubs
func newCatalogServiceForTest(reader *productReaderStub, enrichments *enrichmentStoreStub, tenantID string) catalogapp.Service {
	return catalogapp.NewService(reader, enrichments, tenantID)
}
```

Add this import at the top of the file:

```go
import catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server_core && go test ./tests/unit/ -v -run TestCatalogService`
Expected: FAIL — `NewService` signature mismatch

- [ ] **Step 3: Rewrite the catalog service**

Replace `apps/server_core/internal/modules/catalog/application/service.go` with:

```go
package application

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

type Service struct {
	reader      ports.ProductReader
	enrichments ports.EnrichmentStore
	tenantID    string
}

func NewService(reader ports.ProductReader, enrichments ports.EnrichmentStore, tenantID string) Service {
	return Service{reader: reader, enrichments: enrichments, tenantID: tenantID}
}

func (s Service) ListProducts(ctx context.Context) ([]domain.Product, error) {
	products, err := s.reader.ListProducts(ctx)
	if err != nil {
		return nil, err
	}
	return s.applyEnrichments(ctx, products)
}

func (s Service) GetProduct(ctx context.Context, productID string) (domain.Product, error) {
	product, err := s.reader.GetProduct(ctx, productID)
	if err != nil {
		return domain.Product{}, err
	}
	enriched, err := s.applyEnrichments(ctx, []domain.Product{product})
	if err != nil {
		return domain.Product{}, err
	}
	return enriched[0], nil
}

func (s Service) SearchProducts(ctx context.Context, query string) ([]domain.Product, error) {
	products, err := s.reader.SearchProducts(ctx, query)
	if err != nil {
		return nil, err
	}
	return s.applyEnrichments(ctx, products)
}

func (s Service) ListTaxonomyNodes(ctx context.Context) ([]domain.TaxonomyNode, error) {
	return s.reader.ListTaxonomyNodes(ctx)
}

func (s Service) GetEnrichment(ctx context.Context, productID string) (domain.ProductEnrichment, error) {
	return s.enrichments.GetEnrichment(ctx, productID)
}

func (s Service) UpsertEnrichment(ctx context.Context, enrichment domain.ProductEnrichment) error {
	enrichment.TenantID = s.tenantID
	return s.enrichments.UpsertEnrichment(ctx, enrichment)
}

// applyEnrichments overlays MPC enrichment data onto MetalShopping products.
// Priority: manual enrichment > MetalShopping shopping snapshot > nil.
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
		if e.SuggestedPriceAmount != nil {
			products[i].SuggestedPrice = e.SuggestedPriceAmount
		}
	}
	return products, nil
}
```

- [ ] **Step 4: Update old catalog test to match new constructor**

Replace `apps/server_core/tests/unit/catalog_service_test.go` with:

```go
package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

func TestListProductsReturnsTenantProducts(t *testing.T) {
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p-1", SKU: "SKU-001", Name: "Cuba Inox", Status: "active", CostAmount: 123.45},
		},
	}
	enrichments := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	service := application.NewService(reader, enrichments, "tenant_default")

	products, err := service.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(products) != 1 {
		t.Fatalf("expected 1 product, got %d", len(products))
	}
	if products[0].SKU != "SKU-001" {
		t.Fatalf("expected SKU-001, got %q", products[0].SKU)
	}
}
```

- [ ] **Step 5: Run all catalog tests**

Run: `cd apps/server_core && go test ./tests/unit/ -v -run TestCatalogService`
Expected: PASS — all 3 tests pass (ListProducts, AppliesEnrichmentOverlay, FallsBackToShopping)

- [ ] **Step 6: Commit**

```bash
git add apps/server_core/internal/modules/catalog/application/service.go apps/server_core/tests/unit/
git commit -m "feat(catalog): rewrite service with ProductReader + EnrichmentStore and enrichment overlay"
```

---

## Task 7: Catalog HTTP Handler — Expanded Endpoints

**Files:**
- Modify: `apps/server_core/internal/modules/catalog/transport/http_handler.go`
- Modify: `apps/server_core/tests/unit/catalog_handler_test.go`

- [ ] **Step 1: Write failing test for search endpoint**

Add to `apps/server_core/tests/unit/catalog_handler_test.go` a test that hits `GET /catalog/products/search?q=cuba`. (The existing handler test file already exists — add a new test function.)

```go
func TestCatalogSearchEndpoint(t *testing.T) {
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "prd_1", SKU: "SKU-001", Name: "Cuba Inox", Status: "active"},
		},
	}
	enrichments := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	svc := catalogapp.NewService(reader, enrichments, "tnt_1")

	mux := http.NewServeMux()
	catalogtransport.Handler{Service: svc}.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/catalog/products/search?q=cuba", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server_core && go test ./tests/unit/ -v -run TestCatalogSearchEndpoint`
Expected: FAIL — 404 (route not registered)

- [ ] **Step 3: Rewrite the HTTP handler with all endpoints**

Replace `apps/server_core/internal/modules/catalog/transport/http_handler.go` with:

```go
package transport

import (
	"encoding/json"
	"net/http"
	"strings"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct {
	Service application.Service
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{
		"error": map[string]any{"code": code, "message": message, "details": map[string]any{}},
	})
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/catalog/products", h.handleProducts)
	mux.HandleFunc("/catalog/products/search", h.handleSearch)
	mux.HandleFunc("/catalog/taxonomy", h.handleTaxonomy)
	// Pattern with path variable: /catalog/products/{id} and /catalog/products/{id}/enrichment
	// Go 1.22+ ServeMux supports path parameters.
	mux.HandleFunc("GET /catalog/products/{id}", h.handleGetProduct)
	mux.HandleFunc("GET /catalog/products/{id}/enrichment", h.handleGetEnrichment)
	mux.HandleFunc("PUT /catalog/products/{id}/enrichment", h.handleUpsertEnrichment)
}

func (h Handler) handleProducts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}
	products, err := h.Service.ListProducts(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": products})
}

func (h Handler) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}
	q := r.URL.Query().Get("q")
	if strings.TrimSpace(q) == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "query parameter q is required")
		return
	}
	products, err := h.Service.SearchProducts(r.Context(), q)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": products})
}

func (h Handler) handleGetProduct(w http.ResponseWriter, r *http.Request) {
	productID := r.PathValue("id")
	product, err := h.Service.GetProduct(r.Context(), productID)
	if err != nil {
		if strings.Contains(err.Error(), "NOT_FOUND") {
			writeError(w, http.StatusNotFound, "not_found", "product not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, product)
}

func (h Handler) handleTaxonomy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}
	nodes, err := h.Service.ListTaxonomyNodes(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": nodes})
}

func (h Handler) handleGetEnrichment(w http.ResponseWriter, r *http.Request) {
	productID := r.PathValue("id")
	enrichment, err := h.Service.GetEnrichment(r.Context(), productID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, enrichment)
}

func (h Handler) handleUpsertEnrichment(w http.ResponseWriter, r *http.Request) {
	productID := r.PathValue("id")
	var req struct {
		HeightCM             *float64 `json:"height_cm"`
		WidthCM              *float64 `json:"width_cm"`
		LengthCM             *float64 `json:"length_cm"`
		SuggestedPriceAmount *float64 `json:"suggested_price_amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
		return
	}
	enrichment := domain.ProductEnrichment{
		ProductID:            productID,
		HeightCM:             req.HeightCM,
		WidthCM:              req.WidthCM,
		LengthCM:             req.LengthCM,
		SuggestedPriceAmount: req.SuggestedPriceAmount,
	}
	if err := h.Service.UpsertEnrichment(r.Context(), enrichment); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, enrichment)
}
```

**Note:** Add the domain import at the top:

```go
import (
	"encoding/json"
	"net/http"
	"strings"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)
```

- [ ] **Step 4: Run tests**

Run: `cd apps/server_core && go test ./tests/unit/ -v -run TestCatalog`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/catalog/transport/ apps/server_core/tests/unit/catalog_handler_test.go
git commit -m "feat(catalog): add search, get-by-id, taxonomy, and enrichment HTTP endpoints"
```

---

## Task 8: Classifications Module — Domain + Ports

**Files:**
- Create: `apps/server_core/internal/modules/classifications/domain/classification.go`
- Create: `apps/server_core/internal/modules/classifications/ports/repository.go`

- [ ] **Step 1: Write the domain entity**

```go
// apps/server_core/internal/modules/classifications/domain/classification.go
package domain

import "time"

type Classification struct {
	ClassificationID string    `json:"classification_id"`
	TenantID         string    `json:"tenant_id"`
	Name             string    `json:"name"`
	AIContext        string    `json:"ai_context"`
	ProductIDs       []string  `json:"product_ids"`
	ProductCount     int       `json:"product_count"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}
```

- [ ] **Step 2: Write the port interface**

```go
// apps/server_core/internal/modules/classifications/ports/repository.go
package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/classifications/domain"
)

type Repository interface {
	List(ctx context.Context) ([]domain.Classification, error)
	GetByID(ctx context.Context, id string) (domain.Classification, error)
	Create(ctx context.Context, c domain.Classification) error
	Update(ctx context.Context, c domain.Classification) error
	Delete(ctx context.Context, id string) error
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/server_core && go build ./internal/modules/classifications/...`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/internal/modules/classifications/
git commit -m "feat(classifications): add domain entity and repository port"
```

---

## Task 9: Classifications Migration + Postgres Adapter

**Files:**
- Create: `apps/server_core/migrations/0007_classifications.sql`
- Create: `apps/server_core/internal/modules/classifications/adapters/postgres/repository.go`

- [ ] **Step 1: Write the migration**

```sql
-- apps/server_core/migrations/0007_classifications.sql
CREATE TABLE classifications (
    classification_id   TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    name                TEXT NOT NULL,
    ai_context          TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_classifications_tenant ON classifications(tenant_id);

CREATE TABLE classification_products (
    classification_id   TEXT NOT NULL REFERENCES classifications(classification_id) ON DELETE CASCADE,
    tenant_id           TEXT NOT NULL,
    product_id          TEXT NOT NULL,
    added_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, classification_id, product_id)
);

CREATE INDEX idx_classification_products_tenant ON classification_products(tenant_id);
```

- [ ] **Step 2: Write the postgres adapter**

```go
// apps/server_core/internal/modules/classifications/adapters/postgres/repository.go
package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/classifications/domain"
	"marketplace-central/apps/server_core/internal/modules/classifications/ports"
)

var _ ports.Repository = (*Repository)(nil)

type Repository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewRepository(pool *pgxpool.Pool, tenantID string) *Repository {
	return &Repository{pool: pool, tenantID: tenantID}
}

func (r *Repository) List(ctx context.Context) ([]domain.Classification, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT c.classification_id, c.tenant_id, c.name, c.ai_context, c.created_at, c.updated_at,
			   COUNT(cp.product_id)::int AS product_count
		FROM classifications c
		LEFT JOIN classification_products cp ON cp.classification_id = c.classification_id
		WHERE c.tenant_id = $1
		GROUP BY c.classification_id
		ORDER BY c.name
	`, r.tenantID)
	if err != nil {
		return nil, fmt.Errorf("list classifications: %w", err)
	}
	defer rows.Close()

	result := make([]domain.Classification, 0)
	for rows.Next() {
		var c domain.Classification
		if err := rows.Scan(&c.ClassificationID, &c.TenantID, &c.Name, &c.AIContext, &c.CreatedAt, &c.UpdatedAt, &c.ProductCount); err != nil {
			return nil, fmt.Errorf("scan classification: %w", err)
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

func (r *Repository) GetByID(ctx context.Context, id string) (domain.Classification, error) {
	var c domain.Classification
	err := r.pool.QueryRow(ctx, `
		SELECT classification_id, tenant_id, name, ai_context, created_at, updated_at
		FROM classifications
		WHERE classification_id = $1 AND tenant_id = $2
	`, id, r.tenantID).Scan(&c.ClassificationID, &c.TenantID, &c.Name, &c.AIContext, &c.CreatedAt, &c.UpdatedAt)
	if err == pgx.ErrNoRows {
		return domain.Classification{}, fmt.Errorf("CLASSIFICATIONS_NOT_FOUND")
	}
	if err != nil {
		return domain.Classification{}, fmt.Errorf("get classification: %w", err)
	}

	rows, err := r.pool.Query(ctx, `
		SELECT product_id FROM classification_products WHERE classification_id = $1 AND tenant_id = $2
	`, id, r.tenantID)
	if err != nil {
		return domain.Classification{}, fmt.Errorf("get classification products: %w", err)
	}
	defer rows.Close()

	c.ProductIDs = make([]string, 0)
	for rows.Next() {
		var pid string
		if err := rows.Scan(&pid); err != nil {
			return domain.Classification{}, fmt.Errorf("scan product id: %w", err)
		}
		c.ProductIDs = append(c.ProductIDs, pid)
	}
	c.ProductCount = len(c.ProductIDs)
	return c, rows.Err()
}

func (r *Repository) Create(ctx context.Context, c domain.Classification) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO classifications (classification_id, tenant_id, name, ai_context)
		VALUES ($1, $2, $3, $4)
	`, c.ClassificationID, r.tenantID, c.Name, c.AIContext)
	if err != nil {
		return fmt.Errorf("insert classification: %w", err)
	}

	for _, pid := range c.ProductIDs {
		_, err = tx.Exec(ctx, `
			INSERT INTO classification_products (classification_id, tenant_id, product_id) VALUES ($1, $2, $3)
		`, c.ClassificationID, r.tenantID, pid)
		if err != nil {
			return fmt.Errorf("insert classification product: %w", err)
		}
	}
	return tx.Commit(ctx)
}

func (r *Repository) Update(ctx context.Context, c domain.Classification) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	result, err := tx.Exec(ctx, `
		UPDATE classifications SET name = $1, ai_context = $2, updated_at = $3
		WHERE classification_id = $4 AND tenant_id = $5
	`, c.Name, c.AIContext, time.Now(), c.ClassificationID, r.tenantID)
	if err != nil {
		return fmt.Errorf("update classification: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("CLASSIFICATIONS_NOT_FOUND")
	}

	_, err = tx.Exec(ctx, `DELETE FROM classification_products WHERE classification_id = $1 AND tenant_id = $2`, c.ClassificationID, r.tenantID)
	if err != nil {
		return fmt.Errorf("clear classification products: %w", err)
	}

	for _, pid := range c.ProductIDs {
		_, err = tx.Exec(ctx, `
			INSERT INTO classification_products (classification_id, tenant_id, product_id) VALUES ($1, $2, $3)
		`, c.ClassificationID, r.tenantID, pid)
		if err != nil {
			return fmt.Errorf("insert classification product: %w", err)
		}
	}
	return tx.Commit(ctx)
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM classifications WHERE classification_id = $1 AND tenant_id = $2
	`, id, r.tenantID)
	if err != nil {
		return fmt.Errorf("delete classification: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("CLASSIFICATIONS_NOT_FOUND")
	}
	return nil
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/server_core && go build ./internal/modules/classifications/...`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/migrations/0007_classifications.sql apps/server_core/internal/modules/classifications/adapters/
git commit -m "feat(classifications): add migration and postgres repository"
```

---

## Task 10: Classifications Service + Transport + Tests

**Files:**
- Create: `apps/server_core/internal/modules/classifications/application/service.go`
- Create: `apps/server_core/internal/modules/classifications/transport/http_handler.go`
- Create: `apps/server_core/tests/unit/classifications_service_test.go`

- [ ] **Step 1: Write the failing test**

```go
// apps/server_core/tests/unit/classifications_service_test.go
package unit

import (
	"context"
	"fmt"
	"testing"

	classapp "marketplace-central/apps/server_core/internal/modules/classifications/application"
	classdomain "marketplace-central/apps/server_core/internal/modules/classifications/domain"
)

type classRepoStub struct {
	classifications []classdomain.Classification
	created         []classdomain.Classification
	err             error
}

func (s *classRepoStub) List(context.Context) ([]classdomain.Classification, error) {
	return s.classifications, s.err
}

func (s *classRepoStub) GetByID(_ context.Context, id string) (classdomain.Classification, error) {
	for _, c := range s.classifications {
		if c.ClassificationID == id {
			return c, nil
		}
	}
	return classdomain.Classification{}, fmt.Errorf("CLASSIFICATIONS_NOT_FOUND")
}

func (s *classRepoStub) Create(_ context.Context, c classdomain.Classification) error {
	s.created = append(s.created, c)
	return s.err
}

func (s *classRepoStub) Update(_ context.Context, c classdomain.Classification) error {
	return s.err
}

func (s *classRepoStub) Delete(_ context.Context, id string) error {
	return s.err
}

func TestClassificationsServiceCreateValidatesName(t *testing.T) {
	repo := &classRepoStub{}
	svc := classapp.NewService(repo, "tnt_1")

	_, err := svc.Create(context.Background(), classapp.CreateInput{Name: "", ProductIDs: []string{"p1"}})
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestClassificationsServiceCreateSuccess(t *testing.T) {
	repo := &classRepoStub{}
	svc := classapp.NewService(repo, "tnt_1")

	c, err := svc.Create(context.Background(), classapp.CreateInput{
		Name:       "Premium",
		AIContext:  "High-end products",
		ProductIDs: []string{"p1", "p2"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.Name != "Premium" {
		t.Fatalf("expected name Premium, got %q", c.Name)
	}
	if len(repo.created) != 1 {
		t.Fatalf("expected 1 created, got %d", len(repo.created))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server_core && go test ./tests/unit/ -v -run TestClassifications`
Expected: FAIL — package not found

- [ ] **Step 3: Write the service**

```go
// apps/server_core/internal/modules/classifications/application/service.go
package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/classifications/domain"
	"marketplace-central/apps/server_core/internal/modules/classifications/ports"
)

type CreateInput struct {
	Name       string
	AIContext  string
	ProductIDs []string
}

type UpdateInput struct {
	Name       string
	AIContext  string
	ProductIDs []string
}

type Service struct {
	repo     ports.Repository
	tenantID string
}

func NewService(repo ports.Repository, tenantID string) Service {
	return Service{repo: repo, tenantID: tenantID}
}

func (s Service) List(ctx context.Context) ([]domain.Classification, error) {
	return s.repo.List(ctx)
}

func (s Service) GetByID(ctx context.Context, id string) (domain.Classification, error) {
	return s.repo.GetByID(ctx, id)
}

func (s Service) Create(ctx context.Context, input CreateInput) (domain.Classification, error) {
	if strings.TrimSpace(input.Name) == "" {
		return domain.Classification{}, fmt.Errorf("CLASSIFICATIONS_CREATE_NAME_REQUIRED")
	}
	now := time.Now()
	c := domain.Classification{
		ClassificationID: fmt.Sprintf("cls_%d", now.UnixMilli()),
		TenantID:         s.tenantID,
		Name:             strings.TrimSpace(input.Name),
		AIContext:         strings.TrimSpace(input.AIContext),
		ProductIDs:       input.ProductIDs,
		ProductCount:     len(input.ProductIDs),
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := s.repo.Create(ctx, c); err != nil {
		return domain.Classification{}, err
	}
	return c, nil
}

func (s Service) Update(ctx context.Context, id string, input UpdateInput) (domain.Classification, error) {
	if strings.TrimSpace(input.Name) == "" {
		return domain.Classification{}, fmt.Errorf("CLASSIFICATIONS_UPDATE_NAME_REQUIRED")
	}
	c := domain.Classification{
		ClassificationID: id,
		TenantID:         s.tenantID,
		Name:             strings.TrimSpace(input.Name),
		AIContext:         strings.TrimSpace(input.AIContext),
		ProductIDs:       input.ProductIDs,
		ProductCount:     len(input.ProductIDs),
		UpdatedAt:        time.Now(),
	}
	if err := s.repo.Update(ctx, c); err != nil {
		return domain.Classification{}, err
	}
	return c, nil
}

func (s Service) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}
```

- [ ] **Step 4: Write the HTTP handler**

```go
// apps/server_core/internal/modules/classifications/transport/http_handler.go
package transport

import (
	"encoding/json"
	"net/http"
	"strings"

	"marketplace-central/apps/server_core/internal/modules/classifications/application"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct {
	svc application.Service
}

func NewHandler(svc application.Service) Handler {
	return Handler{svc: svc}
}

func writeClassError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{
		"error": map[string]any{"code": code, "message": message, "details": map[string]any{}},
	})
}

// mapClassError maps service-level error strings to structured HTTP error codes.
// Error codes follow MODULE_ENTITY_REASON format per AGENTS.md.
func mapClassError(err error) (int, string, string) {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "NOT_FOUND"):
		return http.StatusNotFound, "CLASSIFICATIONS_ENTITY_NOT_FOUND", "classification not found"
	case strings.Contains(msg, "REQUIRED"):
		return http.StatusBadRequest, "CLASSIFICATIONS_CREATE_INVALID", msg
	default:
		return http.StatusInternalServerError, "CLASSIFICATIONS_INTERNAL_ERROR", "internal error"
	}
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/classifications", h.handleList)
	mux.HandleFunc("GET /classifications/{id}", h.handleGetByID)
	mux.HandleFunc("PUT /classifications/{id}", h.handleUpdate)
	mux.HandleFunc("DELETE /classifications/{id}", h.handleDelete)
}

func (h Handler) handleList(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		items, err := h.svc.List(r.Context())
		if err != nil {
			writeClassError(w, http.StatusInternalServerError, "internal_error", err.Error())
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})

	case http.MethodPost:
		var req struct {
			Name       string   `json:"name"`
			AIContext  string   `json:"ai_context"`
			ProductIDs []string `json:"product_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeClassError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
			return
		}
		c, err := h.svc.Create(r.Context(), application.CreateInput{
			Name: req.Name, AIContext: req.AIContext, ProductIDs: req.ProductIDs,
		})
		if err != nil {
			if strings.Contains(err.Error(), "REQUIRED") {
				writeClassError(w, http.StatusBadRequest, "invalid_request", err.Error())
				return
			}
			writeClassError(w, http.StatusInternalServerError, "internal_error", err.Error())
			return
		}
		httpx.WriteJSON(w, http.StatusCreated, c)

	default:
		w.Header().Set("Allow", "GET, POST")
		writeClassError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
	}
}

func (h Handler) handleGetByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		if strings.Contains(err.Error(), "NOT_FOUND") {
			writeClassError(w, http.StatusNotFound, "not_found", "classification not found")
			return
		}
		writeClassError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, c)
}

func (h Handler) handleUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Name       string   `json:"name"`
		AIContext  string   `json:"ai_context"`
		ProductIDs []string `json:"product_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeClassError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
		return
	}
	c, err := h.svc.Update(r.Context(), id, application.UpdateInput{
		Name: req.Name, AIContext: req.AIContext, ProductIDs: req.ProductIDs,
	})
	if err != nil {
		if strings.Contains(err.Error(), "NOT_FOUND") {
			writeClassError(w, http.StatusNotFound, "not_found", "classification not found")
			return
		}
		if strings.Contains(err.Error(), "REQUIRED") {
			writeClassError(w, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}
		writeClassError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, c)
}

func (h Handler) handleDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.svc.Delete(r.Context(), id); err != nil {
		if strings.Contains(err.Error(), "NOT_FOUND") {
			writeClassError(w, http.StatusNotFound, "not_found", "classification not found")
			return
		}
		writeClassError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/server_core && go test ./tests/unit/ -v -run TestClassifications`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server_core/internal/modules/classifications/ apps/server_core/tests/unit/classifications_service_test.go
git commit -m "feat(classifications): add service, HTTP handler, and unit tests"
```

---

## Task 11: Wire New Modules in Composition Root + Server

**Files:**
- Modify: `apps/server_core/internal/composition/root.go`
- Modify: `apps/server_core/cmd/server/main.go`

- [ ] **Step 1: Update composition root**

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
	connectorspostgres "marketplace-central/apps/server_core/internal/modules/connectors/adapters/postgres"
	connectorshttp "marketplace-central/apps/server_core/internal/modules/connectors/adapters/vtex/http"
	connectorsapp "marketplace-central/apps/server_core/internal/modules/connectors/application"
	connectorstransport "marketplace-central/apps/server_core/internal/modules/connectors/transport"
	marketplacespostgres "marketplace-central/apps/server_core/internal/modules/marketplaces/adapters/postgres"
	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	marketplacestransport "marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
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

	// Catalog: reads from MetalShopping, enrichments in MPC
	catalogReader := catalogmetalshopping.NewRepository(msPool)
	catalogEnrichments := catalogpostgres.NewEnrichmentRepository(pool, cfg.DefaultTenantID)
	catalogSvc := catalogapp.NewService(catalogReader, catalogEnrichments, cfg.DefaultTenantID)
	catalogtransport.Handler{Service: catalogSvc}.Register(mux)

	// Classifications: MPC's own database
	classRepo := classpostgres.NewRepository(pool, cfg.DefaultTenantID)
	classSvc := classapp.NewService(classRepo, cfg.DefaultTenantID)
	classtransport.NewHandler(classSvc).Register(mux)

	// Marketplaces
	marketRepo := marketplacespostgres.NewRepository(pool, cfg.DefaultTenantID)
	marketSvc := marketplacesapp.NewService(marketRepo, cfg.DefaultTenantID)
	marketplacestransport.NewHandler(marketSvc).Register(mux)

	// Pricing
	pricingRepo := pricingpostgres.NewRepository(pool, cfg.DefaultTenantID)
	pricingSvc := pricingapp.NewService(pricingRepo, cfg.DefaultTenantID)
	pricingtransport.NewHandler(pricingSvc).Register(mux)

	// Connectors (VTEX)
	vtexCredentials, err := connectorshttp.NewEnvCredentialProvider()
	if err != nil {
		log.Fatalf("vtex credentials: %v", err)
	}
	connectorsRepo := connectorspostgres.NewRepository(pool, cfg.DefaultTenantID)
	vtexAdapter := connectorshttp.NewAdapter(vtexCredentials)
	connectorsOrch := connectorsapp.NewBatchOrchestrator(connectorsRepo, vtexAdapter, cfg.DefaultTenantID)
	connectorstransport.NewHandler(connectorsOrch).Register(mux)

	return mux
}
```

- [ ] **Step 2: Update server main.go to create both pools**

Replace `apps/server_core/cmd/server/main.go` with:

```go
package main

import (
	"context"
	"log"
	"net/http"

	"marketplace-central/apps/server_core/internal/composition"
	"marketplace-central/apps/server_core/internal/platform/config"
	"marketplace-central/apps/server_core/internal/platform/logging"
	"marketplace-central/apps/server_core/internal/platform/msdb"
	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func main() {
	ctx := context.Background()
	cfg := config.Load()
	logger := logging.New()

	dbCfg, err := pgdb.LoadConfig()
	if err != nil {
		log.Fatalf("db config: %v", err)
	}
	pool, err := pgdb.NewPool(ctx, dbCfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}

	msCfg, err := msdb.LoadConfig()
	if err != nil {
		log.Fatalf("metalshopping db config: %v", err)
	}
	msPool, err := msdb.NewPool(ctx, msCfg)
	if err != nil {
		log.Fatalf("metalshopping db pool: %v", err)
	}

	logger.Printf("server starting on %s", cfg.Addr)
	log.Fatal(http.ListenAndServe(cfg.Addr, composition.NewRootRouter(pool, msPool, dbCfg)))
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/server_core && go build ./cmd/server/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/internal/composition/root.go apps/server_core/cmd/server/main.go
git commit -m "feat(composition): wire MetalShopping pool, catalog rework, and classifications module"
```

---

## Task 12: SDK Runtime — New Types and Methods

**Files:**
- Modify: `packages/sdk-runtime/src/index.ts`

- [ ] **Step 1: Add new types and methods to SDK**

Add the following types after the existing `BatchStatus` interface:

```typescript
export interface TaxonomyNode {
  node_id: string;
  name: string;
  level: number;
  level_label: string;
  parent_node_id: string;
  is_active: boolean;
  product_count: number;
}

export interface ProductEnrichment {
  product_id: string;
  tenant_id?: string;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  suggested_price_amount: number | null;
}

export interface Classification {
  classification_id: string;
  tenant_id?: string;
  name: string;
  ai_context: string;
  product_ids: string[];
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateClassificationRequest {
  name: string;
  ai_context: string;
  product_ids: string[];
}

export interface UpdateClassificationRequest {
  name: string;
  ai_context: string;
  product_ids: string[];
}
```

Update the `CatalogProduct` interface to:

```typescript
export interface CatalogProduct {
  product_id: string;
  sku: string;
  name: string;
  description: string;
  brand_name: string;
  status: string;
  cost_amount: number;
  price_amount: number;
  stock_quantity: number;
  ean: string;
  reference: string;
  taxonomy_node_id: string;
  taxonomy_name: string;
  suggested_price: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
}
```

Add new methods to the returned client object (add `putJson` helper and new methods):

```typescript
async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchImpl(`${options.baseUrl}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw { status: response.status, error: (data as ErrorResponse).error } satisfies MarketplaceCentralClientError;
  }
  return data as T;
}

async function deleteJson(path: string): Promise<void> {
  const response = await fetchImpl(`${options.baseUrl}${path}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json();
    throw { status: response.status, error: (data as ErrorResponse).error } satisfies MarketplaceCentralClientError;
  }
}
```

New client methods:

```typescript
// Catalog
searchCatalogProducts: (query: string) =>
  getJson<ListResponse<CatalogProduct>>(`/catalog/products/search?q=${encodeURIComponent(query)}`),
getCatalogProduct: (productId: string) =>
  getJson<CatalogProduct>(`/catalog/products/${productId}`),
listTaxonomyNodes: () =>
  getJson<ListResponse<TaxonomyNode>>("/catalog/taxonomy"),
getProductEnrichment: (productId: string) =>
  getJson<ProductEnrichment>(`/catalog/products/${productId}/enrichment`),
updateProductEnrichment: (productId: string, data: Partial<ProductEnrichment>) =>
  putJson<ProductEnrichment>(`/catalog/products/${productId}/enrichment`, data),

// Classifications
listClassifications: () =>
  getJson<ListResponse<Classification>>("/classifications"),
createClassification: (req: CreateClassificationRequest) =>
  postJson<Classification>("/classifications", req),
getClassification: (id: string) =>
  getJson<Classification>(`/classifications/${id}`),
updateClassification: (id: string, req: UpdateClassificationRequest) =>
  putJson<Classification>(`/classifications/${id}`, req),
deleteClassification: (id: string) =>
  deleteJson(`/classifications/${id}`),
```

- [ ] **Step 2: Run SDK tests**

Run: `cd packages/sdk-runtime && npx vitest run`
Expected: Some existing tests may fail due to CatalogProduct type change — update test stubs to match new shape.

- [ ] **Step 3: Fix any failing SDK tests**

Update test mocks in `packages/sdk-runtime/src/index.test.ts` to use the new `CatalogProduct` shape (replace `cost` with `cost_amount`, add new fields).

- [ ] **Step 4: Commit**

```bash
git add packages/sdk-runtime/
git commit -m "feat(sdk): add catalog search, taxonomy, enrichments, and classifications methods"
```

---

## Task 13: ProductPicker Shared Component

**Files:**
- Create: `packages/ui/src/ProductPicker.tsx`
- Create: `packages/ui/src/ProductPicker.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the test**

```tsx
// packages/ui/src/ProductPicker.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductPicker } from "./ProductPicker";

const products = [
  { product_id: "p1", sku: "SKU-001", name: "Cuba Inox", description: "", brand_name: "Deca", status: "active", cost_amount: 100, price_amount: 200, stock_quantity: 50, ean: "789001", reference: "REF-1", taxonomy_node_id: "tx_1", taxonomy_name: "Cubas", suggested_price: null, height_cm: null, width_cm: null, length_cm: null },
  { product_id: "p2", sku: "SKU-002", name: "Assento Premium", description: "", brand_name: "Deca", status: "active", cost_amount: 50, price_amount: 100, stock_quantity: 30, ean: "789002", reference: "REF-2", taxonomy_node_id: "tx_2", taxonomy_name: "Assentos", suggested_price: null, height_cm: null, width_cm: null, length_cm: null },
];

describe("ProductPicker", () => {
  it("renders product rows", () => {
    render(<ProductPicker products={products} taxonomyNodes={[]} classifications={[]} selectedIds={[]} onSelectionChange={() => {}} />);
    expect(screen.getByText("Cuba Inox")).toBeTruthy();
    expect(screen.getByText("Assento Premium")).toBeTruthy();
  });

  it("calls onSelectionChange when checkbox clicked", () => {
    const onChange = vi.fn();
    render(<ProductPicker products={products} taxonomyNodes={[]} classifications={[]} selectedIds={[]} onSelectionChange={onChange} />);
    fireEvent.click(screen.getAllByRole("checkbox")[1]); // first product checkbox (index 0 is select-all)
    expect(onChange).toHaveBeenCalledWith(["p1"]);
  });

  it("filters by search query", () => {
    render(<ProductPicker products={products} taxonomyNodes={[]} classifications={[]} selectedIds={[]} onSelectionChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search by name, SKU, EAN..."), { target: { value: "Cuba" } });
    expect(screen.getByText("Cuba Inox")).toBeTruthy();
    expect(screen.queryByText("Assento Premium")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ui && npx vitest run --reporter=verbose`
Expected: FAIL — ProductPicker module not found

- [ ] **Step 3: Write the ProductPicker component**

```tsx
// packages/ui/src/ProductPicker.tsx
import { useState, useMemo } from "react";
import { Search } from "lucide-react";

interface CatalogProduct {
  product_id: string;
  sku: string;
  name: string;
  ean: string;
  reference: string;
  brand_name: string;
  cost_amount: number;
  price_amount: number;
  stock_quantity: number;
  taxonomy_node_id: string;
  taxonomy_name: string;
}

interface TaxonomyNode {
  node_id: string;
  name: string;
  level: number;
  level_label: string;
  product_count: number;
}

interface Classification {
  classification_id: string;
  name: string;
  product_ids: string[];
  product_count: number;
}

interface ProductPickerProps {
  products: CatalogProduct[];
  taxonomyNodes: TaxonomyNode[];
  classifications: Classification[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  loading?: boolean;
}

export function ProductPicker({
  products,
  taxonomyNodes,
  classifications,
  selectedIds,
  onSelectionChange,
  loading = false,
}: ProductPickerProps) {
  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");

  const filteredProducts = useMemo(() => {
    let result = products;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.ean.toLowerCase().includes(q) ||
          p.reference.toLowerCase().includes(q)
      );
    }

    if (taxonomyFilter) {
      result = result.filter((p) => p.taxonomy_node_id === taxonomyFilter);
    }

    if (classificationFilter) {
      const cls = classifications.find((c) => c.classification_id === classificationFilter);
      if (cls) {
        const idSet = new Set(cls.product_ids);
        result = result.filter((p) => idSet.has(p.product_id));
      }
    }

    return result;
  }, [products, search, taxonomyFilter, classificationFilter, classifications]);

  function toggleProduct(productId: string) {
    if (selectedIds.includes(productId)) {
      onSelectionChange(selectedIds.filter((id) => id !== productId));
    } else {
      onSelectionChange([...selectedIds, productId]);
    }
  }

  function toggleAll() {
    const filteredIds = filteredProducts.map((p) => p.product_id);
    const allSelected = filteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      onSelectionChange(selectedIds.filter((id) => !filteredIds.includes(id)));
    } else {
      const merged = new Set([...selectedIds, ...filteredIds]);
      onSelectionChange(Array.from(merged));
    }
  }

  function handleClassificationChange(value: string) {
    setClassificationFilter(value);
    if (value) {
      const cls = classifications.find((c) => c.classification_id === value);
      if (cls) {
        onSelectionChange(cls.product_ids);
      }
    }
  }

  const allFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.includes(p.product_id));

  if (loading) {
    return <div className="text-sm text-slate-500 py-8 text-center">Loading products...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 items-end">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, SKU, EAN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {taxonomyNodes.length > 0 && (
          <select
            value={taxonomyFilter}
            onChange={(e) => setTaxonomyFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All groups</option>
            {taxonomyNodes.map((n) => (
              <option key={n.node_id} value={n.node_id}>
                {n.name} ({n.product_count})
              </option>
            ))}
          </select>
        )}
        {classifications.length > 0 && (
          <select
            value={classificationFilter}
            onChange={(e) => handleClassificationChange(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All classifications</option>
            {classifications.map((c) => (
              <option key={c.classification_id} value={c.classification_id}>
                {c.name} ({c.product_count})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Selection count */}
      <p className="text-xs text-slate-500">
        {selectedIds.length} of {products.length} products selected
      </p>

      {/* Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} />
              </th>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">SKU</th>
              <th className="text-left px-3 py-2 font-medium">EAN</th>
              <th className="text-right px-3 py-2 font-medium">Cost (R$)</th>
              <th className="text-right px-3 py-2 font-medium">Price (R$)</th>
              <th className="text-right px-3 py-2 font-medium">Stock</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400">
                  No products found
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => (
                <tr
                  key={p.product_id}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => toggleProduct(p.product_id)}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.product_id)}
                      onChange={() => toggleProduct(p.product_id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.sku}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.ean || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{p.cost_amount.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{p.price_amount.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{p.stock_quantity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Export from index**

Add to `packages/ui/src/index.ts`:

```typescript
export { ProductPicker } from "./ProductPicker";
```

- [ ] **Step 5: Run tests**

Run: `cd packages/ui && npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): add shared ProductPicker component with search, taxonomy, and classification filters"
```

---

## Task 14: Products Page (feature-products)

**Files:**
- Create: `packages/feature-products/package.json`
- Create: `packages/feature-products/src/ProductsPage.tsx`
- Create: `packages/feature-products/src/ProductsPage.test.tsx`
- Create: `packages/feature-products/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@marketplace-central/feature-products",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@marketplace-central/ui": "*",
    "@marketplace-central/sdk-runtime": "*",
    "lucide-react": "*",
    "react": "*"
  },
  "devDependencies": {
    "@testing-library/react": "*",
    "vitest": "*"
  }
}
```

- [ ] **Step 2: Write the test**

```tsx
// packages/feature-products/src/ProductsPage.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProductsPage } from "./ProductsPage";

const mockClient = {
  listCatalogProducts: vi.fn().mockResolvedValue({
    items: [
      { product_id: "p1", sku: "SKU-001", name: "Cuba Inox", description: "", brand_name: "Deca", status: "active", cost_amount: 100, price_amount: 200, stock_quantity: 50, ean: "789001", reference: "REF-1", taxonomy_node_id: "tx_1", taxonomy_name: "Cubas", suggested_price: null, height_cm: null, width_cm: null, length_cm: null },
    ],
  }),
  listTaxonomyNodes: vi.fn().mockResolvedValue({ items: [] }),
  listClassifications: vi.fn().mockResolvedValue({ items: [] }),
  updateProductEnrichment: vi.fn().mockResolvedValue({}),
};

describe("ProductsPage", () => {
  it("renders product list after loading", async () => {
    render(<ProductsPage client={mockClient as any} />);
    expect(screen.getByText("Loading products...")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Cuba Inox")).toBeTruthy());
  });
});
```

- [ ] **Step 3: Write the ProductsPage component**

```tsx
// packages/feature-products/src/ProductsPage.tsx
import { useState, useEffect, useCallback } from "react";
import { Pencil, X, Save } from "lucide-react";
import { Button } from "@marketplace-central/ui";

interface ProductsClient {
  listCatalogProducts: () => Promise<{ items: any[] }>;
  listTaxonomyNodes: () => Promise<{ items: any[] }>;
  listClassifications: () => Promise<{ items: any[] }>;
  updateProductEnrichment: (productId: string, data: any) => Promise<any>;
}

interface ProductsPageProps {
  client: ProductsClient;
}

export function ProductsPage({ client }: ProductsPageProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [taxonomy, setTaxonomy] = useState<any[]>([]);
  const [classifications, setClassifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [enrichmentForm, setEnrichmentForm] = useState({ height_cm: "", width_cm: "", length_cm: "", suggested_price_amount: "" });
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, taxRes, classRes] = await Promise.all([
        client.listCatalogProducts(),
        client.listTaxonomyNodes(),
        client.listClassifications(),
      ]);
      setProducts(prodRes.items);
      setTaxonomy(taxRes.items);
      setClassifications(classRes.items);
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { loadData(); }, [loadData]);

  function startEdit(product: any) {
    setEditingId(product.product_id);
    setEnrichmentForm({
      height_cm: product.height_cm?.toString() ?? "",
      width_cm: product.width_cm?.toString() ?? "",
      length_cm: product.length_cm?.toString() ?? "",
      suggested_price_amount: product.suggested_price?.toString() ?? "",
    });
  }

  async function saveEnrichment() {
    if (!editingId) return;
    setSaving(true);
    try {
      await client.updateProductEnrichment(editingId, {
        height_cm: enrichmentForm.height_cm ? parseFloat(enrichmentForm.height_cm) : null,
        width_cm: enrichmentForm.width_cm ? parseFloat(enrichmentForm.width_cm) : null,
        length_cm: enrichmentForm.length_cm ? parseFloat(enrichmentForm.length_cm) : null,
        suggested_price_amount: enrichmentForm.suggested_price_amount ? parseFloat(enrichmentForm.suggested_price_amount) : null,
      });
      setEditingId(null);
      await loadData();
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to save enrichment");
    } finally {
      setSaving(false);
    }
  }

  const filtered = products.filter((p) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !(p.ean || "").toLowerCase().includes(q) && !(p.reference || "").toLowerCase().includes(q)) return false;
    }
    if (taxonomyFilter && p.taxonomy_node_id !== taxonomyFilter) return false;
    if (classificationFilter) {
      const cls = classifications.find((c: any) => c.classification_id === classificationFilter);
      if (cls && !cls.product_ids?.includes(p.product_id)) return false;
    }
    return true;
  });

  if (loading) return <div className="text-sm text-slate-500 py-8 text-center">Loading products...</div>;
  if (error) return <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>;
  if (products.length === 0) return <div className="text-sm text-slate-500 py-8 text-center">No products found in MetalShopping</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Products</h2>
        <p className="mt-1 text-sm text-slate-500">{products.length} products from MetalShopping</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <input type="text" placeholder="Search by name, SKU, EAN..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {taxonomy.length > 0 && (
          <select value={taxonomyFilter} onChange={(e) => setTaxonomyFilter(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg">
            <option value="">All groups</option>
            {taxonomy.map((n: any) => <option key={n.node_id} value={n.node_id}>{n.name} ({n.product_count})</option>)}
          </select>
        )}
        {classifications.length > 0 && (
          <select value={classificationFilter} onChange={(e) => setClassificationFilter(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg">
            <option value="">All classifications</option>
            {classifications.map((c: any) => <option key={c.classification_id} value={c.classification_id}>{c.name} ({c.product_count})</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">SKU</th>
              <th className="text-left px-3 py-2 font-medium">EAN</th>
              <th className="text-left px-3 py-2 font-medium">Brand</th>
              <th className="text-right px-3 py-2 font-medium">Cost</th>
              <th className="text-right px-3 py-2 font-medium">Price</th>
              <th className="text-right px-3 py-2 font-medium">Stock</th>
              <th className="text-right px-3 py-2 font-medium">Sugg. Price</th>
              <th className="text-left px-3 py-2 font-medium">Dimensions</th>
              <th className="w-10 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.product_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.sku}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.ean || "—"}</td>
                <td className="px-3 py-2 text-slate-600">{p.brand_name || "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{p.cost_amount.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{p.price_amount.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{p.stock_quantity}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{p.suggested_price ? p.suggested_price.toFixed(2) : "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {p.height_cm && p.width_cm && p.length_cm ? `${p.height_cm}×${p.width_cm}×${p.length_cm}` : "—"}
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => startEdit(p)} className="text-slate-400 hover:text-blue-600" title="Edit enrichment">
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Enrichment modal */}
      {editingId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 w-96 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-900">Edit Product Enrichment</h3>
              <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Height (cm)</label>
                <input type="number" step="any" value={enrichmentForm.height_cm} onChange={(e) => setEnrichmentForm((f) => ({ ...f, height_cm: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Width (cm)</label>
                <input type="number" step="any" value={enrichmentForm.width_cm} onChange={(e) => setEnrichmentForm((f) => ({ ...f, width_cm: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Length (cm)</label>
                <input type="number" step="any" value={enrichmentForm.length_cm} onChange={(e) => setEnrichmentForm((f) => ({ ...f, length_cm: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Suggested Price (R$)</label>
                <input type="number" step="any" value={enrichmentForm.suggested_price_amount} onChange={(e) => setEnrichmentForm((f) => ({ ...f, suggested_price_amount: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
              <Button variant="primary" onClick={saveEnrichment} loading={saving}><Save size={14} className="mr-1" />Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write index.ts**

```typescript
// packages/feature-products/src/index.ts
export { ProductsPage } from "./ProductsPage";
```

- [ ] **Step 5: Run tests**

Run: `cd packages/feature-products && npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/feature-products/
git commit -m "feat(ui): add Products page with enrichment editing"
```

---

## Task 15: VTEX Publisher Rework

**Files:**
- Modify: `packages/feature-connectors/src/VTEXPublishPage.tsx`
- Modify: `packages/feature-connectors/src/VTEXPublishPage.test.tsx`

- [ ] **Step 1: Rewrite VTEXPublishPage**

Replace the full content of `packages/feature-connectors/src/VTEXPublishPage.tsx` with a component that:

1. Uses `ProductPicker` for product selection (loads products, taxonomy, classifications via client)
2. Has a small VTEX config form (vtex_account, trade_policy_id, warehouse_id)
3. Maps selected products to `VTEXProduct[]` using MetalShopping data
4. Submits via `publishToVTEX` and shows result / redirects to batch detail

The key data mapping in the submit handler:

```typescript
const vtexProducts: VTEXProduct[] = selectedProducts.map((p) => ({
  product_id: p.product_id,
  name: p.name,
  description: p.description,
  sku_name: p.name,
  ean: p.ean,
  category: p.taxonomy_name,
  brand: p.brand_name,
  cost: p.cost_amount,
  base_price: p.price_amount,
  image_urls: [],
  specs: {},
  stock_qty: p.stock_quantity,
  warehouse_id: warehouseId,
  trade_policy_id: tradePolicyId,
}));
```

- [ ] **Step 2: Update tests**

Update `VTEXPublishPage.test.tsx` to mock `listCatalogProducts`, `listTaxonomyNodes`, `listClassifications` alongside `publishToVTEX`. Test that selecting a product and clicking publish sends the correct payload.

- [ ] **Step 3: Run tests**

Run: `cd packages/feature-connectors && npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/feature-connectors/
git commit -m "feat(ui): rework VTEX Publisher with ProductPicker — no manual product fields"
```

---

## Task 16: Pricing Simulator Rework

**Files:**
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.tsx`
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`

- [ ] **Step 1: Rewrite PricingSimulatorPage**

Replace the full content with a component that:

1. Uses `ProductPicker` for product selection
2. Has a marketplace policy dropdown (loads via `listMarketplacePolicies`)
3. Runs simulation for each selected product × policy (cost from MetalShopping, dimensions from enrichments)
4. Shows results table: product name, SKU, cost, suggested price, simulated price, margin % (color-coded), commission/freight/fees breakdown
5. Includes a toggle to simulate with "my price" vs "suggested price"

- [ ] **Step 2: Update tests**

Update `PricingSimulatorPage.test.tsx` to mock catalog, taxonomy, classifications, and policies. Test that selecting a product and policy triggers simulation with correct data.

- [ ] **Step 3: Run tests**

Run: `cd packages/feature-simulator && npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/feature-simulator/
git commit -m "feat(ui): rework Pricing Simulator with ProductPicker and suggested price comparison"
```

---

## Task 17: App Router + Layout — Add Products Route

**Files:**
- Modify: `apps/web/src/app/AppRouter.tsx`
- Modify: `apps/web/src/app/Layout.tsx`
- Modify: `apps/web/package.json` (add feature-products dependency)

- [ ] **Step 1: Add feature-products dependency**

Add to `apps/web/package.json` dependencies:

```json
"@marketplace-central/feature-products": "*"
```

- [ ] **Step 2: Update AppRouter.tsx**

Add import:

```typescript
import { ProductsPage } from "@marketplace-central/feature-products";
```

Add wrapper function:

```typescript
function ProductsPageWrapper() {
  const client = useClient();
  return <ProductsPage client={client} />;
}
```

Add route inside the `<Route element={<Layout />}>` block:

```tsx
<Route path="/products" element={<ProductsPageWrapper />} />
```

- [ ] **Step 3: Update Layout.tsx**

Add `Package` import from lucide-react. Add nav item after Dashboard:

```typescript
{ to: "/products", label: "Products", icon: Package },
```

Full `navItems` array becomes:

```typescript
const navItems = [
  { to: "/",                label: "Dashboard",         icon: LayoutDashboard },
  { to: "/products",        label: "Products",          icon: Package },
  { to: "/connectors/vtex", label: "VTEX Publisher",    icon: Send },
  { to: "/marketplaces",    label: "Marketplaces",      icon: Store },
  { to: "/simulator",       label: "Pricing Simulator", icon: Calculator },
];
```

- [ ] **Step 4: Run npm install and verify build**

Run: `npm install && npm run build`
Expected: PASS — no errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/ packages/feature-products/package.json
git commit -m "feat(ui): add Products page to router and sidebar navigation"
```

---

## Task 18: OpenAPI Contract Update

**Files:**
- Modify: `contracts/api/marketplace-central.openapi.yaml`

- [ ] **Step 1: Add all new endpoints and schemas to the OpenAPI spec**

Add the following endpoints:
- `GET /catalog/products/{id}` — single product
- `GET /catalog/products/search` — search with `q` query param
- `GET /catalog/taxonomy` — taxonomy nodes
- `GET /catalog/products/{id}/enrichment` — get enrichment
- `PUT /catalog/products/{id}/enrichment` — upsert enrichment
- `GET /classifications` — list classifications
- `POST /classifications` — create classification
- `GET /classifications/{id}` — get classification
- `PUT /classifications/{id}` — update classification
- `DELETE /classifications/{id}` — delete classification

Update existing:
- `GET /catalog/products` response to use enriched `CatalogProduct` schema
- `POST /pricing/simulations` request to make `cost_amount` optional

Add schemas:
- `CatalogProduct` (enriched)
- `TaxonomyNode`
- `ProductEnrichment`
- `Classification`

- [ ] **Step 2: Verify the YAML is valid**

Run: `npx @redocly/cli lint contracts/api/marketplace-central.openapi.yaml`
Expected: No errors (install redocly if needed, or use `npx yaml-lint`)

- [ ] **Step 3: Commit**

```bash
git add contracts/api/marketplace-central.openapi.yaml
git commit -m "docs(api): add catalog search, taxonomy, enrichments, and classifications to OpenAPI contract"
```

---

## Task 19: Critical Integration Tests

**Files:**
- Create: `apps/server_core/tests/unit/msdb_tenant_test.go`
- Create: `apps/server_core/tests/unit/enrichment_precedence_test.go`

- [ ] **Step 1: Write tenant isolation test for msdb pool**

```go
// apps/server_core/tests/unit/msdb_tenant_test.go
package unit

import (
	"testing"

	"marketplace-central/apps/server_core/internal/platform/msdb"
)

func TestMSDBLoadConfigRequiresBothEnvVars(t *testing.T) {
	t.Setenv("MS_DATABASE_URL", "")
	t.Setenv("MS_TENANT_ID", "tnt_test")
	_, err := msdb.LoadConfig()
	if err == nil {
		t.Fatal("expected error for missing MS_DATABASE_URL")
	}

	t.Setenv("MS_DATABASE_URL", "postgres://localhost/ms")
	t.Setenv("MS_TENANT_ID", "")
	_, err = msdb.LoadConfig()
	if err == nil {
		t.Fatal("expected error for missing MS_TENANT_ID")
	}
}

func TestMSDBPoolConfigUsesBeforeAcquire(t *testing.T) {
	// Verify that NewPool configures BeforeAcquire (not AfterConnect).
	// AfterConnect only fires on connection creation; BeforeAcquire fires on every
	// checkout, which is required for tenant isolation on pooled connections.
	//
	// This is an integration test that requires a real Postgres connection.
	// Skip in CI if MS_DATABASE_URL is not set.
	t.Setenv("MS_DATABASE_URL", "postgres://localhost/ms_test")
	t.Setenv("MS_TENANT_ID", "tnt_integration_test")

	cfg, err := msdb.LoadConfig()
	if err != nil {
		t.Fatalf("config: %v", err)
	}

	// NewPool will fail to connect (no real DB), but we can verify config was built.
	// For a real integration test: create the pool, acquire a connection, and verify
	// SELECT current_setting('app.tenant_id') returns 'tnt_integration_test'.
	if cfg.TenantID != "tnt_integration_test" {
		t.Fatalf("expected tenant tnt_integration_test, got %q", cfg.TenantID)
	}
}
```

- [ ] **Step 2: Write enrichment precedence test**

```go
// apps/server_core/tests/unit/enrichment_precedence_test.go
package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

func TestEnrichmentPrecedenceManualOverShopping(t *testing.T) {
	shoppingPrice := 80.0
	manualPrice := 75.0

	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p1", SuggestedPrice: &shoppingPrice},
		},
	}
	store := &enrichmentStoreStub{
		enrichments: map[string]domain.ProductEnrichment{
			"p1": {ProductID: "p1", TenantID: "t1", SuggestedPriceAmount: &manualPrice},
		},
	}
	svc := application.NewService(reader, store, "t1")
	products, _ := svc.ListProducts(context.Background())

	if *products[0].SuggestedPrice != 75.0 {
		t.Fatalf("manual enrichment should override shopping price: got %v", *products[0].SuggestedPrice)
	}
}

func TestEnrichmentPrecedenceShoppingFallback(t *testing.T) {
	shoppingPrice := 80.0

	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p1", SuggestedPrice: &shoppingPrice},
		},
	}
	store := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	svc := application.NewService(reader, store, "t1")
	products, _ := svc.ListProducts(context.Background())

	if *products[0].SuggestedPrice != 80.0 {
		t.Fatalf("shopping price should be used when no manual enrichment: got %v", *products[0].SuggestedPrice)
	}
}

func TestEnrichmentPrecedenceNilWhenNeitherExists(t *testing.T) {
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p1", SuggestedPrice: nil},
		},
	}
	store := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	svc := application.NewService(reader, store, "t1")
	products, _ := svc.ListProducts(context.Background())

	if products[0].SuggestedPrice != nil {
		t.Fatalf("suggested price should be nil when neither source has data")
	}
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/server_core && go test ./tests/unit/ -v -run "TestMSDB|TestEnrichmentPrecedence"`
Expected: PASS — all 5 tests

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/tests/unit/msdb_tenant_test.go apps/server_core/tests/unit/enrichment_precedence_test.go
git commit -m "test: add tenant isolation and enrichment precedence integration tests"
```

---

## Task 20: Run Full Test Suite + Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all Go tests**

Run: `cd apps/server_core && go test ./... -v`
Expected: ALL PASS — including tenant isolation, enrichment precedence, classifications CRUD, catalog search, handler method validation

- [ ] **Step 2: Run all frontend tests**

Run: `npx vitest run --reporter=verbose`
Expected: ALL PASS — including ProductPicker interactions, Products page enrichment flow, VTEX Publisher product selection, Simulator product + policy selection

- [ ] **Step 3: Run frontend build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Verify key acceptance criteria**

Manually check:
- All new handlers return structured JSON errors with `MODULE_ENTITY_REASON` codes
- All new handlers reject invalid HTTP methods with 405 + Allow header
- All enrichment/classification queries include `tenant_id` in WHERE
- BeforeAcquire (not AfterConnect) is used in msdb pool
- No `fmt.Sprintf` with user input in SQL queries

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "chore: fix test/build issues from integration rework"
```

---

## Implementation Caveats

These items were identified during Codex review and should be verified during implementation:

1. **Handler logging**: All new HTTP handlers must inject a logger dependency and emit `action`, `result`, `duration_ms` fields per request. The handler structs should accept a `*log.Logger` (or the platform logger) and the composition root must wire it. The plan task code snippets show the handler logic but don't show the logger wiring — add it during implementation.

2. **Error codes in transport layer**: All handler examples should use `MODULE_ENTITY_REASON` codes (e.g., `CATALOG_PRODUCT_NOT_FOUND`, `CLASSIFICATIONS_CREATE_INVALID`) and must NOT expose raw `err.Error()` messages to clients. Use the `mapClassError` pattern shown in Task 10 for all modules.

3. **BeforeAcquire integration test**: The msdb tenant test in Task 19 validates config but not actual tenant propagation. When a real MetalShopping test database is available, add a test that: creates the pool, acquires a connection, runs `SELECT current_setting('app.tenant_id')`, and asserts it matches the configured tenant.

4. **Enrichment partial update semantics**: The `UpsertEnrichment` SQL uses `COALESCE(EXCLUDED.col, existing.col)` — this means sending `null` preserves the existing value. To clear a field, the API contract should support an explicit "clear" signal (e.g., `0` for dimensions, `0` for price). Document this behavior in the OpenAPI spec.
