# Implementation Plan: Marketplace Data Foundation

**Spec:** `docs/superpowers/specs/2026-04-08-marketplace-data-foundation-design.md`
**Date:** 2026-04-08
**Phase:** 3b.2
**Scope:** Extend domain + schema, introduce MarketplacePlugin interface, add 3 new plugins (Amazon, Leroy, Madeira), expose GET /marketplaces/definitions.

---

## Architecture Decisions (ADR)

**marketplace_definitions and marketplace_fee_schedules are global system catalogs — not tenant-scoped.**
The AGENTS rule "every business table carries tenant_id" applies to tenant-owned data.
These two tables are read-only system metadata (which channels exist, what fees apply system-wide).
The tenant boundary is enforced in `marketplace_accounts` (already has `tenant_id`).
All runtime queries that price or gate features in a tenant context JOIN through `marketplace_accounts`.
This decision must be documented if ever questioned in code review.

**Canonical active flag is `is_active`.** The old `active` column is kept for backward compat and deprecated in 0014. Removal scheduled for migration 0015.

---

## File Map

```
MODIFY  apps/server_core/internal/modules/marketplaces/domain/marketplace_def.go
NEW     apps/server_core/migrations/0014_marketplace_definitions_v2.sql
MODIFY  apps/server_core/internal/modules/marketplaces/adapters/postgres/fee_schedule_repo.go
NEW     apps/server_core/internal/modules/marketplaces/registry/plugin.go
MODIFY  apps/server_core/internal/modules/marketplaces/registry/registry.go
MODIFY  apps/server_core/internal/modules/marketplaces/registry/mercado_livre.go
MODIFY  apps/server_core/internal/modules/marketplaces/registry/shopee.go
MODIFY  apps/server_core/internal/modules/marketplaces/registry/magalu.go
NEW     apps/server_core/internal/modules/marketplaces/registry/amazon.go
NEW     apps/server_core/internal/modules/marketplaces/registry/leroy.go
NEW     apps/server_core/internal/modules/marketplaces/registry/madeira.go
NEW     apps/server_core/internal/modules/marketplaces/registry/registry_test.go
MODIFY  apps/server_core/internal/composition/root.go
MODIFY  apps/server_core/internal/modules/marketplaces/transport/http_handler.go
MODIFY  contracts/api/marketplace-central.openapi.yaml
MODIFY  packages/sdk-runtime/src/index.ts
```

---

## Tasks

### T01 — Extend domain: CapabilityStatus, CapabilityProfile, PluginMetadata, MarketplaceDefinition

**File:** `apps/server_core/internal/modules/marketplaces/domain/marketplace_def.go`

Replace entire file:

```go
package domain

// CapabilityStatus represents integration maturity for a feature.
type CapabilityStatus string

const (
	CapabilitySupported CapabilityStatus = "supported"
	CapabilityPartial   CapabilityStatus = "partial"
	CapabilityPlanned   CapabilityStatus = "planned"
	CapabilityBlocked   CapabilityStatus = "blocked"
)

// CapabilityProfile declares what a marketplace API supports.
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

// PluginMetadata carries display and rollout config — extensible without migrations.
type PluginMetadata struct {
	IconURL       string `json:"icon_url,omitempty"`
	Color         string `json:"color,omitempty"`
	DocsURL       string `json:"docs_url,omitempty"`
	RolloutStage  string `json:"rollout_stage"`  // v1 | wave_2 | blocked
	ExecutionMode string `json:"execution_mode"` // live | blocked
}

// CredentialField describes one required credential for a marketplace account.
type CredentialField struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Secret bool   `json:"secret"`
}

// MarketplaceDefinition is the system-level description of a marketplace plugin.
// Defined in code (registry package) and synced to the DB at startup.
type MarketplaceDefinition struct {
	MarketplaceCode   string            `json:"marketplace_code"`
	DisplayName       string            `json:"display_name"`
	FeeSource         string            `json:"fee_source"` // "api_sync" | "seed"
	AuthStrategy      string            `json:"auth_strategy"` // oauth2 | lwa | api_key | token | unknown
	CapabilityProfile CapabilityProfile `json:"capability_profile"`
	Metadata          PluginMetadata    `json:"metadata"`
	CredentialSchema  []CredentialField `json:"credential_schema"`
	Active            bool              `json:"active"`
}
```

**Verify:** `go build ./apps/server_core/...` — expect compile errors only in registry files (they reference the old struct shape). Fix in subsequent tasks.

---

### T02 — Write migration 0014

**File:** `apps/server_core/migrations/0014_marketplace_definitions_v2.sql`

```sql
-- Add auth_strategy, capability_profile, metadata, is_active to marketplace_definitions.
-- capability_profile replaces the old capabilities text[] (now computed from plugin code).
-- is_active is the canonical active flag going forward; old `active` is deprecated (drop in 0015).

ALTER TABLE marketplace_definitions
  ADD COLUMN IF NOT EXISTS auth_strategy      text    NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS capability_profile jsonb   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata           jsonb   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active          boolean NOT NULL DEFAULT true;

-- Backfill is_active from the old active column so existing rows are consistent.
UPDATE marketplace_definitions SET is_active = active;

COMMENT ON COLUMN marketplace_definitions.active IS 'Deprecated: use is_active. Will be dropped in migration 0015.';
```

**Apply:** `psql $DATABASE_URL -f apps/server_core/migrations/0014_marketplace_definitions_v2.sql`

**Verify:** `psql $DATABASE_URL -c "\d marketplace_definitions"` — expect 4 new columns.

---

### T03 — Update UpsertDefinitions and ListDefinitions SQL

**File:** `apps/server_core/internal/modules/marketplaces/adapters/postgres/fee_schedule_repo.go`

Replace `UpsertDefinitions` (lines 25–51) with:

```go
func (r *FeeScheduleRepository) UpsertDefinitions(ctx context.Context, defs []domain.MarketplaceDefinition) error {
	for _, d := range defs {
		schema, err := json.Marshal(d.CredentialSchema)
		if err != nil {
			return err
		}
		capJSON, err := json.Marshal(d.CapabilityProfile)
		if err != nil {
			return err
		}
		metaJSON, err := json.Marshal(d.Metadata)
		if err != nil {
			return err
		}
		_, err = r.pool.Exec(ctx, `
			INSERT INTO marketplace_definitions
				(marketplace_code, display_name, fee_source, credential_schema,
				 auth_strategy, capability_profile, metadata, active, is_active)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
			ON CONFLICT (marketplace_code) DO UPDATE SET
				display_name       = EXCLUDED.display_name,
				fee_source         = EXCLUDED.fee_source,
				credential_schema  = EXCLUDED.credential_schema,
				auth_strategy      = EXCLUDED.auth_strategy,
				capability_profile = EXCLUDED.capability_profile,
				metadata           = EXCLUDED.metadata,
				active             = EXCLUDED.active,
				is_active          = EXCLUDED.is_active
		`, d.MarketplaceCode, d.DisplayName, d.FeeSource,
			schema, d.AuthStrategy, capJSON, metaJSON, d.Active)
		if err != nil {
			return err
		}
	}
	return nil
}
```

Replace `ListDefinitions` (lines 53–80) with:

```go
func (r *FeeScheduleRepository) ListDefinitions(ctx context.Context) ([]domain.MarketplaceDefinition, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT marketplace_code, display_name, fee_source, credential_schema,
		       auth_strategy, capability_profile, metadata, active
		FROM marketplace_definitions
		WHERE is_active = true
		ORDER BY marketplace_code
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var defs []domain.MarketplaceDefinition
	for rows.Next() {
		var d domain.MarketplaceDefinition
		var schemaRaw, capRaw, metaRaw []byte
		if err := rows.Scan(
			&d.MarketplaceCode, &d.DisplayName, &d.FeeSource, &schemaRaw,
			&d.AuthStrategy, &capRaw, &metaRaw, &d.Active,
		); err != nil {
			return nil, err
		}
		if len(schemaRaw) > 0 {
			if err := json.Unmarshal(schemaRaw, &d.CredentialSchema); err != nil {
				return nil, err
			}
		}
		if len(capRaw) > 0 {
			if err := json.Unmarshal(capRaw, &d.CapabilityProfile); err != nil {
				return nil, err
			}
		}
		if len(metaRaw) > 0 {
			if err := json.Unmarshal(metaRaw, &d.Metadata); err != nil {
				return nil, err
			}
		}
		defs = append(defs, d)
	}
	return defs, rows.Err()
}
```

**Verify:** `go build ./apps/server_core/internal/modules/marketplaces/...` — no errors.

---

### T04 — Write registry/plugin.go

**File:** `apps/server_core/internal/modules/marketplaces/registry/plugin.go`

```go
package registry

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

// ErrNotImplemented is returned by NewConnector on plugins that have not
// yet implemented their Phase 4 runtime connector.
var ErrNotImplemented = errors.New("connector not yet implemented for this marketplace")

// MarketplaceConnector is the Phase 4 runtime interface.
// Defined now so the contract is stable; implemented per-plugin in Phase 4.
type MarketplaceConnector interface {
	FetchMessages(ctx context.Context) ([]map[string]any, error)
	FetchOrders(ctx context.Context) ([]map[string]any, error)
	ReplyToMessage(ctx context.Context, messageID string, body string) error
}

// MarketplacePlugin is the interface every channel adapter must implement.
//
//   - Definition() — called at startup to upsert the plugin manifest into marketplace_definitions.
//   - SeedFees()   — called at startup to seed stub fee rows for channels without a dedicated syncer.
//   - NewConnector() — Phase 4 boundary: return ErrNotImplemented until the connector is built.
type MarketplacePlugin interface {
	Code() string
	Definition() domain.MarketplaceDefinition
	SeedFees(ctx context.Context, pool *pgxpool.Pool) error
	NewConnector(credentials map[string]string) (MarketplaceConnector, error)
}
```

**Verify:** `go build ./apps/server_core/internal/modules/marketplaces/registry/` — no errors.

---

### T05 — Rewrite registry/registry.go

**File:** `apps/server_core/internal/modules/marketplaces/registry/registry.go`

Replace entire file:

```go
// Package registry declares the set of marketplace plugins known to the system.
// To add a new marketplace: create a new file in this package implementing
// MarketplacePlugin, then call register(&YourPlugin{}) in its init() function.
package registry

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

var plugins []MarketplacePlugin

// register is called from each plugin's init() function.
func register(p MarketplacePlugin) {
	plugins = append(plugins, p)
}

// All returns every registered marketplace definition.
func All() []domain.MarketplaceDefinition {
	defs := make([]domain.MarketplaceDefinition, 0, len(plugins))
	for _, p := range plugins {
		defs = append(defs, p.Definition())
	}
	return defs
}

// Get returns the plugin for the given marketplace code, if registered.
func Get(code string) (MarketplacePlugin, bool) {
	for _, p := range plugins {
		if p.Code() == code {
			return p, true
		}
	}
	return nil, false
}

// SeedAll seeds stub fee rows for plugins that do not have a dedicated FeeScheduleSyncer.
// Safe to run concurrently with feeSyncSvc.SeedAll — each plugin guards with ON CONFLICT DO NOTHING.
func SeedAll(ctx context.Context, pool *pgxpool.Pool) {
	for _, p := range plugins {
		if err := p.SeedFees(ctx, pool); err != nil {
			slog.Error("registry fee seed failed", "marketplace", p.Code(), "err", err)
		}
	}
}
```

**Verify:** `go build ./apps/server_core/internal/modules/marketplaces/registry/` — no errors.

---

### T06 — Refactor registry/mercado_livre.go to MarketplacePlugin

**File:** `apps/server_core/internal/modules/marketplaces/registry/mercado_livre.go`

Replace entire file:

```go
package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&MercadoLivrePlugin{}) }

type MercadoLivrePlugin struct{}

func (p *MercadoLivrePlugin) Code() string { return "mercado_livre" }

func (p *MercadoLivrePlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "mercado_livre",
		DisplayName:     "Mercado Livre",
		FeeSource:       "api_sync",
		AuthStrategy:    "oauth2",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilitySupported,
			PriceSync:     domain.CapabilityPartial,
			StockSync:     domain.CapabilitySupported,
			Orders:        domain.CapabilitySupported,
			Messages:      domain.CapabilityPartial,
			Questions:     domain.CapabilitySupported,
			FreightQuotes: domain.CapabilityPartial,
			Webhooks:      domain.CapabilitySupported,
			Sandbox:       domain.CapabilityBlocked,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "v1",
			ExecutionMode: "live",
		},
		CredentialSchema: []domain.CredentialField{
			{Key: "client_id", Label: "Client ID", Secret: false},
			{Key: "client_secret", Label: "Client Secret", Secret: true},
			{Key: "redirect_uri", Label: "Redirect URI", Secret: false},
		},
		Active: true,
	}
}

// SeedFees is a no-op — ML fees are seeded by connectors/adapters/mercado_livre.FeeSyncer.
func (p *MercadoLivrePlugin) SeedFees(_ context.Context, _ *pgxpool.Pool) error { return nil }

func (p *MercadoLivrePlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
```

---

### T07 — Refactor registry/shopee.go

**File:** `apps/server_core/internal/modules/marketplaces/registry/shopee.go`

Replace entire file:

```go
package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&ShopeePlugin{}) }

type ShopeePlugin struct{}

func (p *ShopeePlugin) Code() string { return "shopee" }

func (p *ShopeePlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "shopee",
		DisplayName:     "Shopee",
		FeeSource:       "seed",
		AuthStrategy:    "unknown",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilityBlocked,
			PriceSync:     domain.CapabilityBlocked,
			StockSync:     domain.CapabilityBlocked,
			Orders:        domain.CapabilityBlocked,
			Messages:      domain.CapabilityBlocked,
			Questions:     domain.CapabilityBlocked,
			FreightQuotes: domain.CapabilityBlocked,
			Webhooks:      domain.CapabilityBlocked,
			Sandbox:       domain.CapabilityBlocked,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "blocked",
			ExecutionMode: "blocked",
		},
		CredentialSchema: []domain.CredentialField{},
		Active:           true,
	}
}

// SeedFees is a no-op — Shopee fees are seeded by connectors/adapters/shopee.FeeSyncer.
func (p *ShopeePlugin) SeedFees(_ context.Context, _ *pgxpool.Pool) error { return nil }

func (p *ShopeePlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
```

---

### T08 — Refactor registry/magalu.go

**File:** `apps/server_core/internal/modules/marketplaces/registry/magalu.go`

Replace entire file:

```go
package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&MagaluPlugin{}) }

type MagaluPlugin struct{}

func (p *MagaluPlugin) Code() string { return "magalu" }

func (p *MagaluPlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "magalu",
		DisplayName:     "Magalu",
		FeeSource:       "seed",
		AuthStrategy:    "oauth2",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilitySupported,
			PriceSync:     domain.CapabilitySupported,
			StockSync:     domain.CapabilitySupported,
			Orders:        domain.CapabilitySupported,
			Messages:      domain.CapabilitySupported,
			Questions:     domain.CapabilitySupported,
			FreightQuotes: domain.CapabilityPlanned,
			Webhooks:      domain.CapabilitySupported,
			Sandbox:       domain.CapabilitySupported,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "v1",
			ExecutionMode: "live",
		},
		CredentialSchema: []domain.CredentialField{
			{Key: "client_id", Label: "Client ID", Secret: false},
			{Key: "client_secret", Label: "Client Secret", Secret: true},
		},
		Active: true,
	}
}

// SeedFees is a no-op — Magalu fees are seeded by connectors/adapters/magalu.FeeSyncer.
func (p *MagaluPlugin) SeedFees(_ context.Context, _ *pgxpool.Pool) error { return nil }

func (p *MagaluPlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
```

---

### T09 — Write registry/amazon.go

**File:** `apps/server_core/internal/modules/marketplaces/registry/amazon.go`

```go
package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&AmazonPlugin{}) }

type AmazonPlugin struct{}

func (p *AmazonPlugin) Code() string { return "amazon" }

func (p *AmazonPlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "amazon",
		DisplayName:     "Amazon Brasil",
		FeeSource:       "seed",
		AuthStrategy:    "lwa",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilitySupported,
			PriceSync:     domain.CapabilitySupported,
			StockSync:     domain.CapabilitySupported,
			Orders:        domain.CapabilitySupported,
			Messages:      domain.CapabilityPartial,
			Questions:     domain.CapabilityBlocked,
			FreightQuotes: domain.CapabilityBlocked,
			Webhooks:      domain.CapabilitySupported,
			Sandbox:       domain.CapabilitySupported,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "v1",
			ExecutionMode: "live",
		},
		CredentialSchema: []domain.CredentialField{
			{Key: "seller_id", Label: "Seller ID", Secret: false},
			{Key: "lwa_app_id", Label: "LWA App ID", Secret: false},
			{Key: "lwa_client_secret", Label: "LWA Client Secret", Secret: true},
			{Key: "refresh_token", Label: "Refresh Token", Secret: true},
		},
		Active: true,
	}
}

// SeedFees inserts a stub default fee row for Amazon.
// Per-category rates must be filled from official Amazon Brasil pricing table.
func (p *AmazonPlugin) SeedFees(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO marketplace_fee_schedules
			(marketplace_code, category_id, listing_type, commission_percent, fixed_fee_amount, notes, source, synced_at)
		VALUES ('amazon', 'default', NULL, 0.12, 0, 'stub — to be filled with official per-category rates', 'seed', NOW())
		ON CONFLICT DO NOTHING
	`)
	return err
}

func (p *AmazonPlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
```

---

### T10 — Write registry/leroy.go

**File:** `apps/server_core/internal/modules/marketplaces/registry/leroy.go`

```go
package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&LeroyPlugin{}) }

type LeroyPlugin struct{}

func (p *LeroyPlugin) Code() string { return "leroy_merlin" }

func (p *LeroyPlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "leroy_merlin",
		DisplayName:     "Leroy Merlin",
		FeeSource:       "seed",
		AuthStrategy:    "api_key",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilitySupported,
			PriceSync:     domain.CapabilitySupported,
			StockSync:     domain.CapabilitySupported,
			Orders:        domain.CapabilitySupported,
			Messages:      domain.CapabilityPartial,
			Questions:     domain.CapabilityPartial,
			FreightQuotes: domain.CapabilityPlanned,
			Webhooks:      domain.CapabilityBlocked,
			Sandbox:       domain.CapabilityPlanned,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "wave_2",
			ExecutionMode: "live",
		},
		CredentialSchema: []domain.CredentialField{
			{Key: "api_key", Label: "API Key", Secret: true},
			{Key: "shop_id", Label: "Shop ID", Secret: false},
		},
		Active: true,
	}
}

// SeedFees inserts a stub default fee row for Leroy Merlin (Mirakl Seller API).
func (p *LeroyPlugin) SeedFees(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO marketplace_fee_schedules
			(marketplace_code, category_id, listing_type, commission_percent, fixed_fee_amount, notes, source, synced_at)
		VALUES ('leroy_merlin', 'default', NULL, 0.18, 0, 'stub — to be filled with official per-category rates', 'seed', NOW())
		ON CONFLICT DO NOTHING
	`)
	return err
}

func (p *LeroyPlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
```

---

### T11 — Write registry/madeira.go

**File:** `apps/server_core/internal/modules/marketplaces/registry/madeira.go`

```go
package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&MadeiraPlugin{}) }

type MadeiraPlugin struct{}

func (p *MadeiraPlugin) Code() string { return "madeira_madeira" }

func (p *MadeiraPlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "madeira_madeira",
		DisplayName:     "Madeira Madeira",
		FeeSource:       "seed",
		AuthStrategy:    "token",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilityPlanned,
			PriceSync:     domain.CapabilityPlanned,
			StockSync:     domain.CapabilityPlanned,
			Orders:        domain.CapabilityPlanned,
			Messages:      domain.CapabilityBlocked,
			Questions:     domain.CapabilityBlocked,
			FreightQuotes: domain.CapabilitySupported,
			Webhooks:      domain.CapabilityPartial,
			Sandbox:       domain.CapabilityPlanned,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "wave_2",
			ExecutionMode: "live",
		},
		CredentialSchema: []domain.CredentialField{
			{Key: "api_token", Label: "API Token", Secret: true},
		},
		Active: true,
	}
}

// SeedFees inserts a stub default fee row for Madeira Madeira.
func (p *MadeiraPlugin) SeedFees(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO marketplace_fee_schedules
			(marketplace_code, category_id, listing_type, commission_percent, fixed_fee_amount, notes, source, synced_at)
		VALUES ('madeira_madeira', 'default', NULL, 0.15, 0, 'stub — to be filled with official per-category rates', 'seed', NOW())
		ON CONFLICT DO NOTHING
	`)
	return err
}

func (p *MadeiraPlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
```

---

### T12 — Write registry_test.go

**File:** `apps/server_core/internal/modules/marketplaces/registry/registry_test.go`

```go
package registry_test

import (
	"context"
	"errors"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/registry"
)

func TestRegistry_NoDuplicateCodes(t *testing.T) {
	seen := map[string]bool{}
	for _, p := range registry.All() {
		if seen[p.MarketplaceCode] {
			t.Errorf("duplicate marketplace code: %s", p.MarketplaceCode)
		}
		seen[p.MarketplaceCode] = true
	}
}

func TestRegistry_AllPluginsHaveRequiredFields(t *testing.T) {
	for _, d := range registry.All() {
		if d.MarketplaceCode == "" {
			t.Errorf("plugin has empty MarketplaceCode")
		}
		if d.DisplayName == "" {
			t.Errorf("plugin %q has empty DisplayName", d.MarketplaceCode)
		}
		if d.AuthStrategy == "" {
			t.Errorf("plugin %q has empty AuthStrategy", d.MarketplaceCode)
		}
	}
}

func TestRegistry_AllPluginsNewConnectorReturnsErrNotImplemented(t *testing.T) {
	codes := []string{"mercado_livre", "shopee", "magalu", "amazon", "leroy_merlin", "madeira_madeira"}
	for _, code := range codes {
		p, ok := registry.Get(code)
		if !ok {
			t.Errorf("plugin %q not registered", code)
			continue
		}
		conn, err := p.NewConnector(nil)
		if conn != nil {
			t.Errorf("plugin %q NewConnector returned non-nil connector", code)
		}
		if !errors.Is(err, registry.ErrNotImplemented) {
			t.Errorf("plugin %q NewConnector returned %v, want ErrNotImplemented", code, err)
		}
	}
}

func TestRegistry_SeedFees_NoopForLegacyPlugins(t *testing.T) {
	// ML, Shopee, Magalu SeedFees must return nil without hitting DB (no pool).
	for _, code := range []string{"mercado_livre", "shopee", "magalu"} {
		p, ok := registry.Get(code)
		if !ok {
			t.Fatalf("plugin %q not registered", code)
		}
		if err := p.SeedFees(context.Background(), nil); err != nil {
			t.Errorf("plugin %q SeedFees(nil pool) returned error: %v", code, err)
		}
	}
}
```

**Run:** `go test ./apps/server_core/internal/modules/marketplaces/registry/...`

**Expected output:**
```
ok  	marketplace-central/apps/server_core/internal/modules/marketplaces/registry	0.XXXs
```

All 4 tests pass.

---

### T12b — Handler test for GET /marketplaces/definitions

**File:** `apps/server_core/internal/modules/marketplaces/transport/http_handler_test.go` (new or existing)

Write a table-driven HTTP test using `httptest.NewRecorder()`:
- 405 on POST, DELETE
- 200 on GET with empty definitions list → `{"items":[]}`
- 200 on GET with seeded definitions → response contains `capability_profile` and `metadata` fields
- Response body `items[0].auth_strategy` matches plugin definition

Use a stub `FeeService` (implement the port interface inline) returning fixed `[]domain.MarketplaceDefinition`.

**Run:** `go test ./apps/server_core/internal/modules/marketplaces/transport/...`

---

### T13 — Update composition/root.go: add registry.SeedAll

**File:** `apps/server_core/internal/composition/root.go`

After the existing `feeSyncSvc.SeedAll` goroutine (around line 73–79), add:

```go
	// Seed stub fee rows for channels without a dedicated FeeSyncer (Amazon, Leroy, Madeira).
	if pool != nil {
		go func() {
			start := time.Now()
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			slog.Info("registry.SeedAll started", "action", "seed_stub_fees")
			marketplacesregistry.SeedAll(ctx, pool)
			slog.Info("registry.SeedAll completed", "action", "seed_stub_fees", "result", "ok", "duration_ms", time.Since(start).Milliseconds())
		}()
	}
```

Add import at top of imports block:
```go
marketplacesregistry "marketplace-central/apps/server_core/internal/modules/marketplaces/registry"
```

**Verify:** `go build ./apps/server_core/...` — clean build.

---

### T14 — Update existing GET /marketplaces/definitions handler

**File:** `apps/server_core/internal/modules/marketplaces/transport/http_handler.go`

The route `/marketplaces/definitions` already exists (line ~147). The handler returns `{"items": defs}` where `defs` is `[]domain.MarketplaceDefinition`. After T01/T03, the domain struct has the new fields — the JSON response automatically includes them because `ListDefinitions` returns the updated struct.

**No key rename**: keep `{"items": ...}` — changing to `{"definitions": ...}` is a breaking contract change. The existing key is correct.

**What changes:** The response payload automatically gains `auth_strategy`, `capability_profile`, and `metadata` fields once T01+T03 are done. No handler rewrite needed unless you want to project a subset.

**Optional projection** (only if you want to hide internal fields like `fee_source`):

```go
type defResponse struct {
    Code              string                   `json:"code"`
    DisplayName       string                   `json:"display_name"`
    AuthStrategy      string                   `json:"auth_strategy"`
    IsActive          bool                     `json:"is_active"`
    CapabilityProfile domain.CapabilityProfile `json:"capability_profile"`
    Metadata          domain.PluginMetadata    `json:"metadata"`
}
// map defs → []defResponse, then WriteJSON(w, 200, {"items": out})
```

**Decision:** Implement projection to avoid leaking `fee_source` and `credential_schema` to public callers.

Replace the existing `/marketplaces/definitions` handler body with:

```go
mux.HandleFunc("/marketplaces/definitions", func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        w.Header().Set("Allow", "GET")
        writeMarketplacesError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
        return
    }
    defs, err := h.feeSvc.ListDefinitions(r.Context())
    if err != nil {
        writeMarketplacesError(w, http.StatusInternalServerError, "internal_error", err.Error())
        return
    }
    type defItem struct {
        Code              string                   `json:"code"`
        DisplayName       string                   `json:"display_name"`
        AuthStrategy      string                   `json:"auth_strategy"`
        IsActive          bool                     `json:"is_active"`
        CapabilityProfile domain.CapabilityProfile `json:"capability_profile"`
        Metadata          domain.PluginMetadata    `json:"metadata"`
    }
    out := make([]defItem, 0, len(defs))
    for _, d := range defs {
        out = append(out, defItem{
            Code:              d.MarketplaceCode,
            DisplayName:       d.DisplayName,
            AuthStrategy:      d.AuthStrategy,
            IsActive:          d.Active,
            CapabilityProfile: d.CapabilityProfile,
            Metadata:          d.Metadata,
        })
    }
    httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
})
```

Add import if not already present: `"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"`

**Verify:** `go build ./apps/server_core/...` — clean build.

---

### T15 — (No route registration needed)

Route `/marketplaces/definitions` is already registered. T14 updates the handler body in-place. No new `mux.HandleFunc` needed.

---

### T16 — Update OpenAPI contract

**File:** `contracts/api/marketplace-central.openapi.yaml`

Add path:
```yaml
  /marketplaces/definitions:
    get:
      summary: List all registered marketplace definitions
      operationId: listMarketplaceDefinitions
      tags: [Marketplaces]
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  definitions:
                    type: array
                    items:
                      $ref: '#/components/schemas/MarketplaceDefinition'
```

Add schema component:
```yaml
    MarketplaceDefinition:
      type: object
      required: [code, display_name, auth_strategy, is_active, capability_profile, metadata]
      properties:
        code:
          type: string
          example: mercado_livre
        display_name:
          type: string
          example: Mercado Livre
        auth_strategy:
          type: string
          enum: [oauth2, lwa, api_key, token, unknown]
        is_active:
          type: boolean
        capability_profile:
          $ref: '#/components/schemas/CapabilityProfile'
        metadata:
          $ref: '#/components/schemas/PluginMetadata'

    CapabilityProfile:
      type: object
      properties:
        publish:
          type: string
          enum: [supported, partial, planned, blocked]
        price_sync:
          type: string
          enum: [supported, partial, planned, blocked]
        stock_sync:
          type: string
          enum: [supported, partial, planned, blocked]
        orders:
          type: string
          enum: [supported, partial, planned, blocked]
        messages:
          type: string
          enum: [supported, partial, planned, blocked]
        questions:
          type: string
          enum: [supported, partial, planned, blocked]
        freight_quotes:
          type: string
          enum: [supported, partial, planned, blocked]
        webhooks:
          type: string
          enum: [supported, partial, planned, blocked]
        sandbox:
          type: string
          enum: [supported, partial, planned, blocked]

    PluginMetadata:
      type: object
      properties:
        icon_url:
          type: string
        color:
          type: string
        docs_url:
          type: string
        rollout_stage:
          type: string
          enum: [v1, wave_2, blocked]
        execution_mode:
          type: string
          enum: [live, blocked]
```

---

### T17 — Update SDK types

**File:** `packages/sdk-runtime/src/index.ts`

Add types and method:

```typescript
export interface CapabilityProfile {
  publish: 'supported' | 'partial' | 'planned' | 'blocked'
  price_sync: 'supported' | 'partial' | 'planned' | 'blocked'
  stock_sync: 'supported' | 'partial' | 'planned' | 'blocked'
  orders: 'supported' | 'partial' | 'planned' | 'blocked'
  messages: 'supported' | 'partial' | 'planned' | 'blocked'
  questions: 'supported' | 'partial' | 'planned' | 'blocked'
  freight_quotes: 'supported' | 'partial' | 'planned' | 'blocked'
  webhooks: 'supported' | 'partial' | 'planned' | 'blocked'
  sandbox: 'supported' | 'partial' | 'planned' | 'blocked'
}

export interface PluginMetadata {
  icon_url?: string
  color?: string
  docs_url?: string
  rollout_stage: 'v1' | 'wave_2' | 'blocked'
  execution_mode: 'live' | 'blocked'
}

export interface MarketplaceDefinition {
  code: string
  display_name: string
  auth_strategy: 'oauth2' | 'lwa' | 'api_key' | 'token' | 'unknown'
  is_active: boolean
  capability_profile: CapabilityProfile
  metadata: PluginMetadata
}

// Add to the SDK client object:
export async function getMarketplaceDefinitions(): Promise<{ definitions: MarketplaceDefinition[] }> {
  const res = await fetch(`${API_BASE}/marketplaces/definitions`)
  if (!res.ok) throw new Error(`getMarketplaceDefinitions failed: ${res.status}`)
  return res.json()
}
```

---

### T18 — Final verification

```bash
cd apps/server_core && go test ./...
```

**Expected output:**
```
ok  marketplace-central/apps/server_core/internal/modules/marketplaces/registry  0.XXXs
ok  marketplace-central/apps/server_core/internal/modules/marketplaces/application 0.XXXs
ok  marketplace-central/apps/server_core/internal/modules/pricing/application    0.XXXs
... (all packages green)
```

```bash
cd apps/server_core && go build ./...
```

**Expected:** no output (clean build).

---

## Execution Order

```
T01 (domain) → T02 (migration) → T03 (repo SQL) → T04 (plugin.go) →
T05 (registry.go) → T06-T08 (refactor 3 existing) → T09-T11 (3 new) →
T12 (tests) → T13 (composition) → T14-T15 (transport) → T16 (openapi) →
T17 (sdk) → T18 (final verify)
```

No task can be skipped — each unlocks the next compile step.
