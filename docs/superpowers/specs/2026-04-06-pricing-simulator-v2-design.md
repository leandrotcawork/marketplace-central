# Pricing Simulator v2 — Design Spec

## Purpose

Replace the current single-policy, per-product-at-a-time simulator with a full batch simulation engine. Users select products (individually or by classification), enter CEP inputs, and run a simulation across **all registered marketplace policies simultaneously**. Results show as a cross-marketplace grid with collapsible column groups per marketplace, inline price editing, and Melhor Envio freight quotes.

---

## Route & Navigation

- **Route:** `/simulator` (same as today — replaces current page)
- No new nav item needed

---

## Layout

Single scrollable page. Sticky command bar at top. Below: scope selector, then product table.

```
┌───────────────────────────────────────────────────────────────┐
│  STICKY COMMAND BAR                                           │
│  Origin CEP [_______]  Dest CEP [_______]                     │
│  [My price ⇄ Suggested price]  [▶ Run Simulation]             │
│  (after run): Avg 18.2% · Healthy 14 · Warning 8 · Critical 3│
├───────────────────────────────────────────────────────────────┤
│  SCOPE SELECTOR                                               │
│  [Ativos ×27] [Descontinuados ×23] [Encomenda ×19]           │
│  42 products selected                                         │
├───────────────────────────────────────────────────────────────┤
│  [🔍 Search]  [Taxonomy ▼]  [Health ▼]                        │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ☑ Name  SKU  Cost  Price │ VTEX 12.3% ▶ │ ML 8.1% ▶   │ │
│  └──────────────────────────────────────────────────────────┘ │
│  Showing 1–25 of 42   Prev  Next                              │
└───────────────────────────────────────────────────────────────┘
```

---

## Interactions

### Scope Selector

- Classification pills displayed horizontally above the table
- Each pill shows: `{name} ×{count}`
- Clicking a pill toggles **all its product_ids** into/out of `selectedIds`
- Pill turns blue when all its products are selected; grey when none or partial
- Products can also be checked individually via checkboxes in the table
- Total selected count shown below the pills: `{N} products selected`

### Product Table (pre-run)

Columns: Checkbox, Name, SKU, Cost (R$), Price (R$), Stock

Filter bar above: search (name/SKU), taxonomy dropdown, health filter (All / Healthy / Warning / Critical — health filter only appears after a run).

### Run Simulation

- **Disabled** until: `selectedIds.size > 0` AND `originCep.length >= 8` AND `destinationCep.length >= 8`
- On click: sends `POST /pricing/simulations/batch` with selected product IDs, all active policy IDs, CEPs, price source, and any price overrides
- Loading state on button while running
- On success: results appended as new columns to the existing table rows
- On failure: red banner below command bar

### Results Grid (post-run)

The same product table gains additional column groups — one per marketplace policy. Default: **all groups collapsed**.

**Collapsed state** (one column per policy):
```
VTEX
12.3% ▶
```
Margin pill (green/yellow/red) + expand arrow.

**Expanded state** (5 columns per policy):
| Column | Notes |
|--------|-------|
| Selling Price | Editable inline. Click → input → Enter commits, Escape cancels |
| Commission | R$ amount + rate% |
| Freight | R$ amount + source badge (ME / fixed / no_dimensions / me_error) |
| Fixed Fee | R$ amount |
| **Margin** | R$ + % pill (color-coded) |

Inline price edit: recalculates margin **client-side immediately** using `selling_price - cost - commission - fixed_fee - freight`. Committing stores the override in `priceOverrides["productId::policyId"]` and re-runs affected cells.

Products with no dimensions: freight = R$0, badge "sem dim." with tooltip.

---

## Backend: Batch Simulation Endpoint

### `POST /pricing/simulations/batch`

**Request:**
```json
{
  "product_ids": ["prd_abc", "prd_def"],
  "policy_ids": ["vtex_standard", "ml_gold"],
  "origin_cep": "01310-100",
  "destination_cep": "30140-071",
  "price_source": "my_price",
  "price_overrides": {
    "prd_abc::vtex_standard": 149.90
  }
}
```

**Response:**
```json
{
  "items": [
    {
      "product_id": "prd_abc",
      "policy_id": "vtex_standard",
      "selling_price": 149.90,
      "cost_amount": 80.00,
      "commission_amount": 22.49,
      "freight_amount": 18.50,
      "fixed_fee_amount": 0.00,
      "margin_amount": 28.91,
      "margin_percent": 0.1930,
      "status": "warning",
      "freight_source": "melhor_envio"
    }
  ]
}
```

**Margin formula:**
```
commission_amount = selling_price × commission_percent
margin_amount = selling_price - cost_amount - commission_amount - fixed_fee_amount - freight_amount
margin_percent = margin_amount / selling_price
status = "healthy" if margin_percent >= min_margin_percent, else "warning"
```

**freight_source values:**
- `"melhor_envio"` — quoted from ME API
- `"fixed"` — policy's `default_shipping`
- `"no_dimensions"` — product missing height/width/length/weight → freight = 0
- `"me_error"` — ME API returned error → freight = 0
- `"me_not_connected"` — no ME OAuth token → freight = 0

**Price resolution:**
- `price_source = "my_price"` → use `catalog_products.price_amount`
- `price_source = "suggested_price"` → use `product_enrichments.suggested_price_amount`, fallback to `price_amount` if null
- `price_overrides` applied last — override wins for that product×policy pair

---

## Backend: Melhor Envio Integration

### OAuth2 Flow

Scopes required: `shipping-calculate`

New routes:
- `GET /connectors/melhor-envio/auth/start` — redirects to `https://melhorenvio.com.br/oauth/authorize` with `client_id`, `redirect_uri`, `response_type=code`, `scope=shipping-calculate`
- `GET /connectors/melhor-envio/auth/callback?code=xxx` — exchanges code for token, stores in `connector_accounts` table

Token storage: new row in existing `connector_accounts` table:
```
channel_code = "melhor_envio"
credentials_json = {"access_token": "...", "refresh_token": "...", "expires_at": "..."}
```

Connection status endpoint: `GET /connectors/melhor-envio/status` — validates token via `GET /api/v2/me/shipment/services`, returns `{ connected: bool }`.

### Freight Calculation

ME API: `POST https://melhorenvio.com.br/api/v2/me/shipment/calculate`

- Products without all 4 dimensions (height_cm, width_cm, length_cm, weight_g) → skip ME, return `freight_source = "no_dimensions"`, `freight_amount = 0`
- ME request sends `weight` in kg (weight_g ÷ 1000), dimensions in cm
- Uses `custom_price` field from response (negotiated rate), falls back to `price`
- Picks **lowest custom_price** among returned options without errors
- User-Agent header: `MarketplaceCentral (contact@empresa.com.br)`
- ME error on a product → `freight_source = "me_error"`, `freight_amount = 0`

### MarketplacePolicy: shipping_provider field

Policies have a `shipping_provider` field (new column, migration `0008`):
- `"melhor_envio"` — use ME API
- `"fixed"` — use `default_shipping` from policy
- `"marketplace"` — use `default_shipping` (placeholder for future marketplace-specific integrations)

---

## Database Changes

### Migration `0008_simulator_v2.sql`

```sql
-- Add weight to product enrichments
ALTER TABLE product_enrichments ADD COLUMN IF NOT EXISTS weight_g NUMERIC(10,3);

-- Add shipping provider to marketplace policies
ALTER TABLE marketplace_policies
  ADD COLUMN IF NOT EXISTS shipping_provider TEXT NOT NULL DEFAULT 'fixed';
```

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/server_core/migrations/0008_simulator_v2.sql` | weight_g + shipping_provider columns |
| Create | `apps/server_core/internal/modules/connectors/adapters/melhorenvio/client.go` | ME HTTP client (freight quote + token validation) |
| Create | `apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth.go` | OAuth2 flow (start + callback + token storage) |
| Modify | `apps/server_core/internal/modules/pricing/application/service.go` | Add `RunBatchSimulation` method |
| Modify | `apps/server_core/internal/modules/pricing/domain/simulation.go` | Add `BatchSimulationResult` type |
| Modify | `apps/server_core/internal/modules/pricing/transport/http_handler.go` | Add `POST /pricing/simulations/batch` route |
| Modify | `apps/server_core/internal/modules/connectors/transport/` | Add ME auth routes |
| Modify | `apps/server_core/internal/composition/root.go` | Wire ME client into pricing service |
| Modify | `apps/server_core/internal/modules/marketplaces/domain/policy.go` | Add `ShippingProvider` field |
| Modify | `packages/sdk-runtime/src/index.ts` | Add `BatchSimulationRequest/Response`, `weight_g` to `ProductEnrichment`, `shipping_provider` to `MarketplacePolicy`, `runBatchSimulation` + ME status methods |
| Modify | `packages/feature-simulator/src/PricingSimulatorPage.tsx` | Full rewrite |
| Modify | `packages/feature-simulator/src/PricingSimulatorPage.test.tsx` | Full rewrite |

---

## State (Frontend)

```typescript
products: CatalogProduct[]
classifications: Classification[]
policies: MarketplacePolicy[]
taxonomyNodes: TaxonomyNode[]

selectedIds: Set<string>
originCep: string
destinationCep: string
priceSource: "my_price" | "suggested_price"
priceOverrides: Record<string, number>     // "productId::policyId" → price
expandedPolicies: Set<string>              // policy_ids with expanded columns

running: boolean
results: BatchSimulationItem[]             // flat list, indexed by productId::policyId
runError: string | null

search: string
taxonomyFilter: string
healthFilter: "all" | "healthy" | "warning" | "critical"
```

Product membership (for classification pills) derived from `classifications[].product_ids`. No separate state.

---

## Client Interface

```typescript
interface SimulatorClient {
  listCatalogProducts: () => Promise<{ items: CatalogProduct[] }>;
  listClassifications: () => Promise<{ items: Classification[] }>;
  listMarketplacePolicies: () => Promise<{ items: MarketplacePolicy[] }>;
  listTaxonomyNodes: () => Promise<{ items: TaxonomyNode[] }>;
  runBatchSimulation: (req: BatchSimulationRequest) => Promise<{ items: BatchSimulationItem[] }>;
  getMelhorEnvioStatus: () => Promise<{ connected: boolean }>;
}
```

All methods exist in or will be added to `createMarketplaceCentralClient()` from `packages/sdk-runtime`.

---

## Error Handling

- ME not connected → simulation runs with `freight_source = "me_not_connected"` for ME policies, no blocking
- ME API error per product → `freight_source = "me_error"`, `freight_amount = 0`, simulation continues
- Full batch request failure → red banner below command bar, results not shown
- Invalid CEP format → validate client-side before enabling Run button (must be 8 digits after stripping non-numeric)
- Inline price edit: reject non-positive numbers, restore previous value on invalid input

---

## Environment Variables (new)

```
ME_CLIENT_ID=...
ME_CLIENT_SECRET=...
ME_REDIRECT_URI=http://localhost:8080/connectors/melhor-envio/auth/callback
```

---

## Tech Stack

Go 1.25, pgx/v5, React 19, TypeScript, Tailwind CSS v4, Vitest + Testing Library, lucide-react. Uses `PaginatedTable` and `Button` from `@marketplace-central/ui`.
