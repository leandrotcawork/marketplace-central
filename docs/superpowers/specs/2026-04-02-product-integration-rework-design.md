# Product Integration Rework — Design Spec

## Goal

Replace manual data entry across the UI with real product data from MetalShopping's database. Add a Products page, classifications (user-defined product groups), product enrichments (dimensions, suggested price), and rework the VTEX Publisher and Pricing Simulator to use product selection instead of manual forms.

## Scope

1. MetalShopping data bridge (read-only second Postgres pool)
2. Product enrichments table (dimensions, manual suggested price)
3. Classifications module (Classificações — persistent product groups with AI context)
4. Products page (new)
5. VTEX Publisher rework (product picker replaces manual form)
6. Pricing Simulator rework (product picker replaces manual input)

## Out of Scope

- Writing to MetalShopping's database
- AI analysis / GPT-4o pricing (future — AI context field is included but unused)
- Authentication / RBAC
- Multi-tenant MPC (single tenant, but tenant_id carried everywhere)
- Competitor price monitoring UI (shopping data is read-only from MetalShopping)

---

## 1. MetalShopping Data Bridge

### Platform package

New package: `apps/server_core/internal/platform/msdb/`

Responsibilities:
- Create a second `pgxpool.Pool` from env var `MS_DATABASE_URL`
- Provide a helper that sets `app.tenant_id` via `set_config()` on each connection before queries, sourced from env var `MS_TENANT_ID`
- Read-only — no writes, no migrations against MetalShopping

### MetalShopping tables accessed (read-only)

| Table | Fields used |
|---|---|
| `catalog_products` | product_id, tenant_id, sku, name, description, brand_name, status, primary_taxonomy_node_id |
| `catalog_product_identifiers` | product_id, identifier_type, identifier_value, is_primary |
| `pricing_product_prices` | product_id, replacement_cost_amount, price_amount (WHERE pricing_status = 'active' AND effective_to IS NULL) |
| `inventory_product_positions` | product_id, on_hand_quantity (WHERE position_status = 'active' AND effective_to IS NULL) |
| `catalog_taxonomy_nodes` | taxonomy_node_id, name, level, parent_taxonomy_node_id, is_active |
| `catalog_taxonomy_level_defs` | tenant_id, level, label |
| `shopping_price_latest_snapshot` | product_id (by SKU match), observed_price, observed_at |

### Catalog module rework

The catalog module's adapter switches from reading MPC's own `catalog_products` table to reading MetalShopping's database via the `msdb` pool. The module structure stays the same (domain, application, ports, adapters, transport) but the adapter implementation changes.

The `0002_catalog_products.sql` migration exists only in a git worktree and was never merged to main. It is abandoned — MPC does not own a catalog table. No removal action needed.

### Catalog domain model (enriched)

```go
type Product struct {
    ProductID        string
    SKU              string
    Name             string
    Description      string
    BrandName        string
    Status           string
    CostAmount       float64  // from pricing_product_prices.replacement_cost_amount
    PriceAmount      float64  // from pricing_product_prices.price_amount
    StockQuantity    float64  // from inventory_product_positions.on_hand_quantity
    EAN              string   // from catalog_product_identifiers (type='ean')
    Reference        string   // from catalog_product_identifiers (type='reference')
    TaxonomyNodeID   string   // from catalog_products.primary_taxonomy_node_id
    TaxonomyName     string   // from catalog_taxonomy_nodes.name
    SuggestedPrice   *float64 // resolved: manual enrichment > shopping snapshot > nil
    HeightCM         *float64 // from product_enrichments
    WidthCM          *float64 // from product_enrichments
    LengthCM         *float64 // from product_enrichments
}

type TaxonomyNode struct {
    NodeID       string
    Name         string
    Level        int
    LevelLabel   string
    ParentNodeID string
    IsActive     bool
    ProductCount int
}
```

### New API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/catalog/products` | List all active products with pricing, stock, identifiers, enrichments, suggested price |
| GET | `/catalog/products/:id` | Single product with full detail |
| GET | `/catalog/products/search?q=` | Search by name, SKU, EAN, or reference |
| GET | `/catalog/taxonomy` | Taxonomy tree with product counts per node |

### Product response shape

```json
{
  "product_id": "prd_123",
  "sku": "ABC-001",
  "name": "Assento Sanitário Premium",
  "description": "Assento sanitário com fechamento suave",
  "brand_name": "Deca",
  "status": "active",
  "cost_amount": 45.50,
  "price_amount": 89.90,
  "stock_quantity": 120,
  "ean": "7890000000001",
  "reference": "REF-001",
  "taxonomy_node_id": "tx_11",
  "taxonomy_name": "Assento Plástico",
  "suggested_price": 79.90,
  "height_cm": 12.5,
  "width_cm": 40.0,
  "length_cm": 45.0
}
```

### Suggested price resolution order

1. MPC's `product_enrichments.suggested_price_amount` if not null
2. MetalShopping's `shopping_price_latest_snapshot.observed_price` if available
3. Null (no suggested price)

---

## 2. Product Enrichments

### Migration: `0006_product_enrichments.sql`

```sql
CREATE TABLE product_enrichments (
    product_id          TEXT NOT NULL,
    tenant_id           TEXT NOT NULL,
    height_cm           NUMERIC(10,2),
    width_cm            NUMERIC(10,2),
    length_cm           NUMERIC(10,2),
    suggested_price_amount NUMERIC(14,2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, product_id)
);
```

`product_id` is not a foreign key — it references MetalShopping products in a separate database. Integrity is validated at the application layer.

### API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/catalog/products/:id/enrichment` | Get enrichment data for a product |
| PUT | `/catalog/products/:id/enrichment` | Create or update enrichment (upsert) |

### Enrichment request shape

```json
{
  "height_cm": 12.5,
  "width_cm": 40.0,
  "length_cm": 45.0,
  "suggested_price_amount": 79.90
}
```

All fields nullable — partial updates are allowed (only provided fields are updated).

### Where enrichments live in module structure

Enrichments are part of the catalog module since they extend product data. The adapter reads/writes to MPC's own database (not MetalShopping).

The catalog module therefore has two adapters:
- `adapters/metalshopping/` — reads from MetalShopping via msdb pool
- `adapters/postgres/` — reads/writes enrichments to MPC's own database

---

## 3. Classifications (Classificações)

### Module

New module: `apps/server_core/internal/modules/classifications/`

Standard structure: domain, application, ports, adapters/postgres, transport.

### Domain entity

```go
type Classification struct {
    ClassificationID string
    TenantID         string
    Name             string
    AIContext         string
    ProductIDs       []string
    CreatedAt        time.Time
    UpdatedAt        time.Time
}
```

### Migration: `0007_classifications.sql`

```sql
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
    product_id          TEXT NOT NULL,
    added_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (classification_id, product_id)
);
```

`product_id` in `classification_products` is not a foreign key — references MetalShopping products. Validated at application layer.

### API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/classifications` | List all classifications with product counts |
| POST | `/classifications` | Create classification (name, ai_context, product_ids) |
| GET | `/classifications/:id` | Single classification with full product_ids |
| PUT | `/classifications/:id` | Update name, ai_context, and/or product_ids |
| DELETE | `/classifications/:id` | Delete classification and its product associations |

### SDK methods

- `listClassifications()` → `{ items: Classification[] }`
- `createClassification(req)` → `Classification`
- `getClassification(id)` → `Classification`
- `updateClassification(id, req)` → `Classification`
- `deleteClassification(id)` → `void`

### Classification list response

```json
{
  "items": [
    {
      "classification_id": "cls_1712000000",
      "name": "Premium Banheiro",
      "ai_context": "Produtos premium de acabamento para banheiros de alto padrão...",
      "product_count": 24,
      "created_at": "2026-04-02T10:00:00Z",
      "updated_at": "2026-04-02T10:00:00Z"
    }
  ]
}
```

---

## 4. Products Page (New)

### Route

`/products` — new sidebar navigation item.

### Package

New package: `packages/feature-products/`

### Layout

- **Header:** "Products" title + product count
- **Filters bar:** Search input + Taxonomy group dropdown + Classification dropdown
- **Product table:** Columns: Name, SKU, EAN, Brand, Cost (R$), Price (R$), Stock, Suggested Price (R$), Dimensions, Actions
- **Actions column:** "Edit" button opens enrichment form
- **Enrichment form:** Modal or slide-over with fields: Height (cm), Width (cm), Length (cm), Suggested Price (R$). Saves via PUT to `/catalog/products/:id/enrichment`.
- **Loading + error + empty states** on every data-fetching component (per AGENTS.md)

### Data flow

Products page calls `listCatalogProducts()` which hits `GET /catalog/products`. The backend joins MetalShopping product data with MPC enrichments and resolved suggested price, returns the full Product response.

Filters:
- Search: `GET /catalog/products/search?q=term`
- Taxonomy: client-side filter on `taxonomy_node_id` (taxonomy list from `GET /catalog/taxonomy`)
- Classification: client-side filter on product_ids from selected classification

---

## 5. VTEX Publisher Rework

### Route

`/connectors/vtex` — unchanged.

### New flow

**Step 1 — Product selection:**
Shared `ProductPicker` component with search, taxonomy filter, classification filter, checkbox table showing: Name, SKU, EAN, Cost, Price, Stock.

**Step 2 — VTEX configuration:**
Small form with:
- VTEX Account (required, text input)
- Trade Policy ID (default "1")
- Warehouse ID (default "1_1")

**Step 3 — Review & publish:**
Summary: "{N} products selected · VTEX account: {account}" + "Publish to VTEX" button.

### Data mapping

Each selected product maps to `VTEXProduct` automatically:

| VTEXProduct field | Source |
|---|---|
| product_id | MetalShopping product_id |
| name | MetalShopping name |
| description | MetalShopping description |
| sku_name | MetalShopping name (default) |
| ean | MetalShopping identifiers |
| category | MetalShopping taxonomy_name |
| brand | MetalShopping brand_name |
| cost | MetalShopping cost_amount |
| base_price | MetalShopping price_amount |
| stock_qty | MetalShopping stock_quantity |
| warehouse_id | From VTEX config form |
| trade_policy_id | From VTEX config form |

### What's removed

All 13 manual product fields. The user selects products — data comes from MetalShopping.

### What stays unchanged

Batch result display, redirect to BatchDetailPage, BatchDetailPage itself.

---

## 6. Pricing Simulator Rework

### Route

`/simulator` — unchanged.

### New flow

**Step 1 — Product selection:**
Same shared `ProductPicker` component. User selects one or more products.

**Step 2 — Marketplace policy selection:**
Dropdown listing existing marketplace policies from `listMarketplacePolicies()`. Each policy carries: commission_percent, fixed_fee_amount, default_shipping_amount, tax_percent, min_margin_percent.

**Step 3 — Run simulation:**
Hits `POST /pricing/simulations` for each product × policy combination. Product cost comes from MetalShopping; dimensions from enrichments (for freight calculation).

**Step 4 — Results table:**

| Column | Source |
|---|---|
| Product name, SKU | MetalShopping |
| Cost (R$) | MetalShopping cost_amount |
| Suggested Price (R$) | Resolved (manual > shopping > null) |
| Simulated Price (R$) | Simulation result |
| Margin % | Simulation result, color-coded: green ≥20%, amber ≥10%, red <10% |
| Commission, freight, fees | Simulation result breakdown |
| Dimensions | From enrichments (shown if present) |

### Backend change

`POST /pricing/simulations` updated to:
- Accept `product_id` as required
- `cost_amount` remains required in the API request. The frontend resolves cost from MetalShopping product data and sends it explicitly. Backend cost resolution is deferred to a future phase.
- Dimensions (height_cm, width_cm, length_cm) are not yet used in the simulation engine. When freight calculation is added in a future phase, the simulator will accept dimensions from product enrichments.

### Suggested price in simulator

The simulator shows the suggested price alongside cost so the user can compare. A toggle or button allows simulating with "my price" (price_amount) vs "suggested price" (suggested_price) as the target, enabling what-if comparison.

---

## 7. Shared ProductPicker Component

Lives in `packages/ui/` as a reusable component.

### Props

```typescript
interface ProductPickerProps {
  products: CatalogProduct[]
  taxonomyNodes: TaxonomyNode[]
  classifications: Classification[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  loading?: boolean
}
```

### Features

- Search bar: filters by name, SKU, EAN, reference (client-side)
- Taxonomy group dropdown: filters by taxonomy_node_id
- Classification dropdown: pre-selects all product_ids in the classification
- Checkbox table: Name, SKU, EAN, Cost (R$), Price (R$), Stock
- Select all / deselect all in header
- Shows selection count: "{N} of {total} products selected"

### Used by

- VTEX Publisher (step 1)
- Pricing Simulator (step 1)
- Classification form (product selector)

---

## 8. SDK Runtime Changes

### New types

```typescript
interface TaxonomyNode {
  node_id: string
  name: string
  level: number
  level_label: string
  parent_node_id: string
  is_active: boolean
  product_count: number
}

interface ProductEnrichment {
  product_id: string
  height_cm: number | null
  width_cm: number | null
  length_cm: number | null
  suggested_price_amount: number | null
}

interface Classification {
  classification_id: string
  name: string
  ai_context: string
  product_ids: string[]
  product_count: number
  created_at: string
  updated_at: string
}
```

### Updated types

`CatalogProduct` gains: description, brand_name, ean, reference, taxonomy_node_id, taxonomy_name, suggested_price, height_cm, width_cm, length_cm, stock_quantity.

### New methods

- `searchCatalogProducts(query: string)`
- `listTaxonomyNodes()`
- `getProductEnrichment(productId: string)`
- `updateProductEnrichment(productId: string, data: ProductEnrichment)`
- `listClassifications()`
- `createClassification(req)`
- `getClassification(id)`
- `updateClassification(id, req)`
- `deleteClassification(id)`

### Updated methods

- `runPricingSimulation(req)` — `cost_amount` remains required (frontend sends it from MetalShopping data)

---

## 9. Navigation

Sidebar gains one new entry:

| Label | Route | Position |
|---|---|---|
| Products | `/products` | After Dashboard, before VTEX Publisher |

Full sidebar order: Dashboard → Products → VTEX Publisher → Marketplace Settings → Pricing Simulator

---

## 10. Environment Variables

| Variable | Purpose | Example |
|---|---|---|
| `MS_DATABASE_URL` | MetalShopping Postgres connection string | `postgres://user:pass@host:5432/metalshopping` |
| `MS_TENANT_ID` | Tenant ID for MetalShopping RLS context | `tnt_metalshop_01` |
| `MC_DATABASE_URL` | MPC's own Postgres (existing) | `postgres://user:pass@host:5432/marketplace_central` |

---

## 11. OpenAPI Contract Updates

The OpenAPI spec at `contracts/api/marketplace-central.openapi.yaml` must be updated to include:

- Reworked `GET /catalog/products` response with enriched product shape
- New `GET /catalog/products/{id}` endpoint
- New `GET /catalog/products/search` endpoint
- New `GET /catalog/taxonomy` endpoint
- New `GET/PUT /catalog/products/{id}/enrichment` endpoints
- All 5 classification endpoints
- `POST /pricing/simulations` request unchanged (cost_amount required, frontend sends it)
- All request/response schemas for new types
