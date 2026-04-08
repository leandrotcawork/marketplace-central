# Marketplace Data Foundation — Design Spec

**Date:** 2026-04-08
**Phase:** 3b.2
**Status:** Approved
**Scope:** Extend `marketplace_definitions` schema, define `MarketplacePlugin` interface, seed all 6 channel definitions (ML, Amazon, Magalu, Leroy, Madeira, Shopee), expose `GET /marketplaces/definitions` endpoint.

---

## Context

MPC currently seeds 3 marketplace definitions (ML, Shopee, Magalu) at startup with minimal schema: `code`, `display_name`, `fee_source`, `credential_schema`. The legacy frontend has 6 fully-specified channels with capabilities, auth strategies, commission profiles, and rollout metadata. Phase 3b.2 brings the backend up to that level using a professional plugin architecture informed by Medusa, Saleor, and commercetools patterns.

---

## Architecture Decision

Each marketplace is a **self-contained plugin** implementing a common Go interface. Plugins self-register via `init()`. At startup the registry upserts each plugin's manifest into `marketplace_definitions` and seeds its fee rules into `marketplace_fee_schedules`. New marketplace = one new `.go` file. No migrations, no config changes.

**Three-layer separation (industry standard):**
- `marketplace_definitions` — channel identity, capabilities, display metadata (what it is, how to connect)
- `marketplace_fee_schedules` — pricing rules by category (what it costs)
- `marketplace_accounts` — tenant-channel link with credentials (who is connected)

---

## Section 1 — Schema

**Migration:** `0014_marketplace_definitions_v2.sql`

```sql
ALTER TABLE marketplace_definitions
  ADD COLUMN auth_strategy  text    NOT NULL DEFAULT 'unknown',
  ADD COLUMN capabilities   jsonb   NOT NULL DEFAULT '{}',
  ADD COLUMN metadata       jsonb   NOT NULL DEFAULT '{}',
  ADD COLUMN is_active      boolean NOT NULL DEFAULT true;
```

No new tables. Existing 3 rows (ML, Shopee, Magalu) backfilled by the startup upsert on first boot.

**`capabilities` JSONB shape:**
```json
{
  "publish": "supported",
  "price_sync": "partial",
  "stock_sync": "supported",
  "orders": "supported",
  "messages": "partial",
  "questions": "supported",
  "freight_quotes": "partial",
  "webhooks": "supported",
  "sandbox": "blocked"
}
```
Valid values: `supported` | `partial` | `planned` | `blocked`

**`metadata` JSONB shape:**
```json
{
  "icon_url": "",
  "color": "",
  "docs_url": "",
  "rollout_stage": "v1",
  "execution_mode": "live"
}
```
Extensible without migrations. `rollout_stage` values: `v1` | `wave_2` | `blocked`. `execution_mode` values: `live` | `blocked`.

---

## Section 2 — Plugin Interface

**Location:** `apps/server_core/internal/modules/marketplaces/registry/plugin.go`

```go
type CapabilityStatus string

const (
    CapabilitySupported CapabilityStatus = "supported"
    CapabilityPartial   CapabilityStatus = "partial"
    CapabilityPlanned   CapabilityStatus = "planned"
    CapabilityBlocked   CapabilityStatus = "blocked"
)

type CapabilityProfile struct {
    Publish       CapabilityStatus `json:"publish"`
    PriceSync     CapabilityStatus `json:"price_sync"`
    StockSync     CapabilityStatus `json:"stock_sync"`
    Orders        CapabilityStatus `json:"orders"`
    Messages      CapabilityStatus `json:"messages"`
    Questions     CapabilityStatus `json:"questions"`
    FreightQuotes CapabilityStatus `json:"freight_quotes"`
    Webhooks      CapabilityStatus `json:"webhooks"`
    Sandbox       CapabilityStatus `json:"sandbox"`
}

type PluginMetadata struct {
    IconURL       string `json:"icon_url,omitempty"`
    Color         string `json:"color,omitempty"`
    DocsURL       string `json:"docs_url,omitempty"`
    RolloutStage  string `json:"rollout_stage"`
    ExecutionMode string `json:"execution_mode"`
}

type PluginDefinition struct {
    Code             string
    DisplayName      string
    AuthStrategy     string // oauth2 | lwa | api_key | token | unknown
    CredentialSchema map[string]any
    Capabilities     CapabilityProfile
    Metadata         PluginMetadata
}

// MarketplacePlugin is the interface every channel adapter implements.
// Definition() and SeedFees() are called at startup.
// NewConnector() is the Phase 4 boundary — all stubs return ErrNotImplemented.
type MarketplacePlugin interface {
    Code() string
    Definition() PluginDefinition
    SeedFees(ctx context.Context, pool *pgxpool.Pool) error
    NewConnector(credentials map[string]string) (MarketplaceConnector, error)
}

// MarketplaceConnector is the Phase 4 runtime interface.
// Defined now so the contract is stable; implemented per-plugin in Phase 4.
type MarketplaceConnector interface {
    FetchMessages(ctx context.Context) ([]Message, error)
    FetchOrders(ctx context.Context) ([]Order, error)
    ReplyToMessage(ctx context.Context, messageID string, body string) error
}

var ErrNotImplemented = errors.New("connector not yet implemented for this marketplace")
```

**Registry** (`registry/registry.go`):
- `var plugins = map[string]MarketplacePlugin{}`
- `Register(p MarketplacePlugin)` — called from each plugin's `init()`
- `All() []MarketplacePlugin`
- `Get(code string) (MarketplacePlugin, bool)`
- `SeedDefinitions(ctx, pool) error` — upserts all registered plugin manifests into `marketplace_definitions`
- `SeedAll(ctx, pool) error` — calls `SeedFees()` on each plugin (already exists, extended)

**Registration pattern** (each plugin file):
```go
func init() { registry.Register(&MercadoLivrePlugin{}) }
```

---

## Section 3 — The 6 Plugin Files

**Location:** `apps/server_core/internal/modules/marketplaces/registry/plugins/`

| File | Code | Auth | Base Commission | Fixed Fee | Rollout | Mode |
|---|---|---|---|---|---|---|
| `mercado_livre.go` | `mercado_livre` | `oauth2` | 14.8% | R$5.00 | `v1` | `live` |
| `amazon.go` | `amazon` | `lwa` | 12.0% | R$0.00 | `v1` | `live` |
| `magalu.go` | `magalu` | `oauth2` | 16.0% | R$0.00 | `v1` | `live` |
| `leroy.go` | `leroy_merlin` | `api_key` | 18.0% | R$0.00 | `wave_2` | `live` |
| `madeira.go` | `madeira_madeira` | `token` | 15.0% | R$0.00 | `wave_2` | `live` |
| `shopee.go` | `shopee` | `unknown` | 0% (tiered) | R$0.00 | `blocked` | `blocked` |

**`SeedFees()` strategy:**
- `mercado_livre`, `magalu`, `shopee` — already have per-category rows in `marketplace_fee_schedules`; upsert skips existing rows (idempotent via `ON CONFLICT DO NOTHING`)
- `amazon`, `leroy_merlin`, `madeira_madeira` — seed one `default` category row with base commission; `notes` = `"stub — to be filled with official per-category rates"`

**`NewConnector()` on all 6:**
```go
func (p *AmazonPlugin) NewConnector(_ map[string]string) (registry.MarketplaceConnector, error) {
    return nil, registry.ErrNotImplemented
}
```

**Startup wiring** (`composition/root.go`) — extends existing `if pool != nil` guard:
```go
if pool != nil {
    registry.SeedDefinitions(ctx, pool)  // new — upserts marketplace_definitions
    go registry.SeedAll(ctx, pool)       // existing — upserts fee_schedules
}
```

---

## Section 4 — API Endpoint

**`GET /marketplaces/definitions`**

- No `tenant_id` filter — definitions are global
- No auth beyond standard session check
- No pagination at 6 channels

Response shape:
```json
{
  "definitions": [
    {
      "code": "mercado_livre",
      "display_name": "Mercado Livre",
      "auth_strategy": "oauth2",
      "is_active": true,
      "capabilities": { "publish": "supported", "orders": "supported", ... },
      "metadata": { "rollout_stage": "v1", "execution_mode": "live", ... }
    }
  ]
}
```

**Contracts:**
- Added to `contracts/api/marketplace-central.openapi.yaml` as `GET /marketplaces/definitions` with `MarketplaceDefinition` schema component
- Added to `packages/sdk-runtime/src/index.ts` as `getMarketplaceDefinitions(): Promise<{ definitions: MarketplaceDefinition[] }>`

---

## Section 5 — Testing

**Unit tests** (`registry/registry_test.go`):
- All 6 plugins register without duplicate codes
- Each `Definition()` returns non-empty `Code`, `DisplayName`, `AuthStrategy`
- Each `NewConnector()` returns `ErrNotImplemented` (not nil error, not panic)
- `CapabilityProfile` JSON round-trips correctly

**Integration tests** (`adapters/postgres/marketplace_definition_repo_test.go`):
- `SeedDefinitions()` upserts all 6 rows idempotently (run twice, still 6 rows)
- Re-seeding with updated capabilities JSONB updates the existing row
- `GET /marketplaces/definitions` returns all `is_active = true` definitions

Fee accuracy for stub plugins (Amazon, Leroy, Madeira) is a data concern tracked separately, not a test concern.

---

## Out of Scope

- Per-category fee rules for Amazon, Leroy, Madeira (stub only — filled when official data is available)
- UI redesign (Spec 2: Marketplace Page UI/UX)
- Phase 4 connector implementations (`NewConnector()` stubs only)
- Tenant-level capability overrides

---

## Files Created / Modified

| Action | Path |
|---|---|
| New migration | `apps/server_core/migrations/0014_marketplace_definitions_v2.sql` |
| Rewrite | `apps/server_core/internal/modules/marketplaces/registry/plugin.go` |
| New | `apps/server_core/internal/modules/marketplaces/registry/registry.go` |
| New (×6) | `apps/server_core/internal/modules/marketplaces/registry/plugins/*.go` |
| Modify | `apps/server_core/internal/composition/root.go` |
| Modify | `apps/server_core/internal/modules/marketplaces/transport/http_handler.go` |
| Modify | `contracts/api/marketplace-central.openapi.yaml` |
| Modify | `packages/sdk-runtime/src/index.ts` |
| New tests | `apps/server_core/internal/modules/marketplaces/registry/registry_test.go` |
