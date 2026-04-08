# Implementation Plan — Marketplace Registry & Fee Foundation
> Spec: `docs/superpowers/specs/2026-04-08-marketplace-registry-design.md`
> Date: 2026-04-08 | Phase 3

---

## File Map

```
apps/server_core/migrations/
  0010_marketplace_definitions.sql          NEW
  0011_marketplace_fee_schedules.sql        NEW
  0012_marketplace_accounts_v2.sql          NEW
  0013_pricing_policies_override.sql        NEW

apps/server_core/internal/modules/marketplaces/
  domain/
    marketplace_def.go                      NEW
    fee_schedule.go                         NEW
    policy.go                               MODIFIED (+MarketplaceCode field)
  ports/
    fee_schedule_repo.go                    NEW
    fee_syncer.go                           NEW
  adapters/postgres/
    fee_schedule_repo.go                    NEW
    repository.go                           MODIFIED (ListPolicies joins accounts)
  application/
    fee_schedule_service.go                 NEW
    fee_schedule_service_test.go            NEW
  registry/
    registry.go                             NEW
    mercado_livre.go                        NEW
    shopee.go                               NEW
    magalu.go                               NEW
  transport/
    http_handler.go                         MODIFIED (+definitions, +fee-schedules routes)

apps/server_core/internal/modules/connectors/
  adapters/
    mercado_livre/
      fee_sync.go                           NEW
    shopee/
      fee_seed.go                           NEW
    magalu/
      fee_seed.go                           NEW
  application/
    fee_sync_service.go                     NEW

apps/server_core/internal/modules/pricing/
  ports/
    fee_schedule.go                         NEW
  adapters/feeschedule/
    adapter.go                              NEW
  application/
    batch_orchestrator.go                   MODIFIED (+FeeScheduleLookup injection)

apps/server_core/internal/composition/
  root.go                                   MODIFIED

packages/sdk-runtime/src/index.ts          MODIFIED (+MarketplaceDefinition, +FeeSchedule types)
contracts/api/marketplace-central.openapi.yaml  MODIFIED (+2 endpoints)
```

---

## Group 1 — Migrations

### Task 1 — Create `0010_marketplace_definitions.sql`

File: `apps/server_core/migrations/0010_marketplace_definitions.sql`

```sql
CREATE TABLE IF NOT EXISTS marketplace_definitions (
    marketplace_code  text PRIMARY KEY,
    display_name      text NOT NULL,
    fee_source        text NOT NULL CHECK (fee_source IN ('api_sync', 'static_table')),
    capabilities      text[] NOT NULL DEFAULT '{}',
    credential_schema jsonb NOT NULL DEFAULT '[]',
    active            boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now()
);
```

---

### Task 2 — Create `0011_marketplace_fee_schedules.sql`

File: `apps/server_core/migrations/0011_marketplace_fee_schedules.sql`

```sql
CREATE TABLE IF NOT EXISTS marketplace_fee_schedules (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_code   text NOT NULL REFERENCES marketplace_definitions(marketplace_code),
    category_id        text NOT NULL,
    listing_type       text,
    commission_percent numeric(8,4) NOT NULL,
    fixed_fee_amount   numeric(14,2) NOT NULL DEFAULT 0,
    notes              text,
    source             text NOT NULL CHECK (source IN ('api_sync', 'seeded', 'manual')),
    synced_at          timestamptz NOT NULL DEFAULT now(),
    valid_from         date,
    valid_to           date,
    UNIQUE NULLS NOT DISTINCT (marketplace_code, category_id, listing_type)
);

CREATE INDEX IF NOT EXISTS idx_fee_schedules_lookup
    ON marketplace_fee_schedules (marketplace_code, category_id);
```

---

### Task 3 — Create `0012_marketplace_accounts_v2.sql`

File: `apps/server_core/migrations/0012_marketplace_accounts_v2.sql`

```sql
ALTER TABLE marketplace_accounts
    ADD COLUMN IF NOT EXISTS marketplace_code  text REFERENCES marketplace_definitions(marketplace_code),
    ADD COLUMN IF NOT EXISTS credentials_json  jsonb,
    ADD COLUMN IF NOT EXISTS last_fee_sync_at  timestamptz;

-- Backfill marketplace_code from channel_code for known mappings
UPDATE marketplace_accounts
SET marketplace_code = channel_code
WHERE channel_code IN ('mercado_livre', 'shopee', 'magalu', 'amazon', 'leroy_merlin', 'madeira_madeira')
  AND marketplace_code IS NULL;

-- Migrate existing credential data to new column
UPDATE marketplace_accounts
SET credentials_json = manual_credentials_json
WHERE manual_credentials_json IS NOT NULL
  AND credentials_json IS NULL;

-- Index for tenant-scoped account lookups by marketplace
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_marketplace_code
    ON marketplace_accounts (tenant_id, marketplace_code);

-- Note: manual_credentials_json is kept read-only for backward compatibility
-- during this release. It can be dropped in a follow-up migration once
-- all writes go through credentials_json.
```

---

### Task 4 — Create `0013_pricing_policies_override.sql`

File: `apps/server_core/migrations/0013_pricing_policies_override.sql`

```sql
ALTER TABLE marketplace_pricing_policies
    ADD COLUMN IF NOT EXISTS commission_override numeric(8,4);

COMMENT ON COLUMN marketplace_pricing_policies.commission_override IS
    'When set, overrides fee_schedules lookup. Use for tenants with non-standard contract rates.';
```

---

### Task 5 — Apply migrations

Run from repo root (adjust connection string for local env):

```bash
psql "$DATABASE_URL" -f apps/server_core/migrations/0010_marketplace_definitions.sql
psql "$DATABASE_URL" -f apps/server_core/migrations/0011_marketplace_fee_schedules.sql
psql "$DATABASE_URL" -f apps/server_core/migrations/0012_marketplace_accounts_v2.sql
psql "$DATABASE_URL" -f apps/server_core/migrations/0013_pricing_policies_override.sql
```

Expected: each returns `CREATE TABLE` or `ALTER TABLE` with no errors.

---

## Group 2 — Domain Types

### Task 6 — Add `MarketplaceDefinition` value object

File: `apps/server_core/internal/modules/marketplaces/domain/marketplace_def.go`

```go
package domain

// CredentialField describes one required credential for a marketplace account.
type CredentialField struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Secret bool   `json:"secret"`
}

// MarketplaceDefinition is the system-level description of a marketplace plugin.
// It is defined in code (registry package) and seeded to the DB at startup.
type MarketplaceDefinition struct {
	MarketplaceCode  string            `json:"marketplace_code"`
	DisplayName      string            `json:"display_name"`
	FeeSource        string            `json:"fee_source"` // "api_sync" | "static_table"
	Capabilities     []string          `json:"capabilities"`
	CredentialSchema []CredentialField `json:"credential_schema"`
	Active           bool              `json:"active"`
}
```

---

### Task 7 — Add `FeeSchedule` entity

File: `apps/server_core/internal/modules/marketplaces/domain/fee_schedule.go`

```go
package domain

import "time"

// FeeSchedule represents one commission rate row for a marketplace + category.
type FeeSchedule struct {
	ID                string
	MarketplaceCode   string
	CategoryID        string
	ListingType       string  // empty string = not applicable
	CommissionPercent float64
	FixedFeeAmount    float64
	Notes             string
	Source            string // "api_sync" | "seeded" | "manual"
	SyncedAt          time.Time
}
```

---

### Task 8 — Add `MarketplaceCode` to `domain.Policy`

File: `apps/server_core/internal/modules/marketplaces/domain/policy.go`

Add one field to the existing `Policy` struct:

```go
type Policy struct {
	PolicyID           string  `json:"policy_id"`
	TenantID           string  `json:"tenant_id"`
	AccountID          string  `json:"account_id"`
	MarketplaceCode    string  `json:"marketplace_code"` // ADD THIS
	CommissionPercent  float64 `json:"commission_percent"`
	CommissionOverride *float64 `json:"commission_override,omitempty"` // ADD THIS
	FixedFeeAmount     float64 `json:"fixed_fee_amount"`
	DefaultShipping    float64 `json:"default_shipping"`
	TaxPercent         float64 `json:"tax_percent"`
	MinMarginPercent   float64 `json:"min_margin_percent"`
	SLAQuestionMinutes int     `json:"sla_question_minutes"`
	SLADispatchHours   int     `json:"sla_dispatch_hours"`
	ShippingProvider   string  `json:"shipping_provider"`
}
```

---

## Group 3 — Ports

### Task 9 — Add `FeeScheduleRepository` port

File: `apps/server_core/internal/modules/marketplaces/ports/fee_schedule_repo.go`

```go
package ports

import (
	"context"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

// FeeScheduleRepository persists and queries marketplace fee schedules.
type FeeScheduleRepository interface {
	// UpsertSchedules inserts or replaces fee schedule rows.
	UpsertSchedules(ctx context.Context, schedules []domain.FeeSchedule) error

	// LookupFee returns the best matching fee schedule for the given parameters.
	// Returns (zero-value, false, nil) when no row is found.
	// categoryID "default" is the fallback catch-all row.
	LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (domain.FeeSchedule, bool, error)

	// ListByMarketplace returns all active fee schedules for one marketplace.
	ListByMarketplace(ctx context.Context, marketplaceCode string) ([]domain.FeeSchedule, error)

	// UpsertDefinitions seeds or updates marketplace_definitions rows.
	UpsertDefinitions(ctx context.Context, defs []domain.MarketplaceDefinition) error

	// ListDefinitions returns all active marketplace definitions.
	ListDefinitions(ctx context.Context) ([]domain.MarketplaceDefinition, error)

	// HasSchedules returns true if any fee schedule rows exist for marketplaceCode.
	HasSchedules(ctx context.Context, marketplaceCode string) (bool, error)
}
```

---

### Task 10 — Add `FeeScheduleSyncer` port

File: `apps/server_core/internal/modules/marketplaces/ports/fee_syncer.go`

```go
package ports

import "context"

// FeeScheduleSyncer is implemented by each marketplace connector adapter.
// For API-based marketplaces it calls the live fee API.
// For static-table marketplaces it returns curated seed rows.
type FeeScheduleSyncer interface {
	// MarketplaceCode returns the code this syncer is responsible for.
	MarketplaceCode() string

	// Sync fetches or generates the latest fee schedules and upserts them
	// via the provided repository. Returns the number of rows upserted.
	Sync(ctx context.Context, repo FeeScheduleRepository) (int, error)
}
```

---

### Note — System-Level Tables (no tenant_id intentional)

`marketplace_definitions` and `marketplace_fee_schedules` are **system-level** tables.
They store data that is the same for all tenants (commission rate 16% on ML Clássico is
global, not per-seller). This is an intentional architectural exception to the
`tenant_id` rule, which applies only to business data owned by a tenant.

Tenant-specific configuration (credentials, overrides, SLAs) lives in
`marketplace_accounts` and `marketplace_pricing_policies`, both of which carry `tenant_id`.

All queries that JOIN system-level tables with tenant-level tables must still filter
by `tenant_id` on the tenant-level side (see Task 16 for examples).

---

## Group 4 — Registry

### Task 11 — Write `registry.go`

File: `apps/server_core/internal/modules/marketplaces/registry/registry.go`

```go
// Package registry declares the set of marketplace plugins known to the system.
// Add a new marketplace here and in its own file, then register it in composition/root.go.
package registry

import "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"

// All returns every registered marketplace definition.
func All() []domain.MarketplaceDefinition {
	return []domain.MarketplaceDefinition{
		MercadoLivre(),
		Shopee(),
		Magalu(),
	}
}
```

---

### Task 12 — Write `mercado_livre.go`

File: `apps/server_core/internal/modules/marketplaces/registry/mercado_livre.go`

```go
package registry

import "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"

func MercadoLivre() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "mercado_livre",
		DisplayName:     "Mercado Livre",
		FeeSource:       "api_sync",
		Capabilities:    []string{"fee_api", "orders", "messages"},
		CredentialSchema: []domain.CredentialField{
			{Key: "client_id",     Label: "Client ID",     Secret: false},
			{Key: "client_secret", Label: "Client Secret", Secret: true},
			{Key: "redirect_uri",  Label: "Redirect URI",  Secret: false},
		},
		Active: true,
	}
}
```

---

### Task 13 — Write `shopee.go`

File: `apps/server_core/internal/modules/marketplaces/registry/shopee.go`

```go
package registry

import "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"

func Shopee() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "shopee",
		DisplayName:     "Shopee",
		FeeSource:       "static_table",
		Capabilities:    []string{"orders", "messages"},
		CredentialSchema: []domain.CredentialField{
			{Key: "partner_id",  Label: "Partner ID",  Secret: false},
			{Key: "secret_key",  Label: "Secret Key",  Secret: true},
			{Key: "shop_id",     Label: "Shop ID",     Secret: false},
		},
		Active: true,
	}
}
```

---

### Task 14 — Write `magalu.go`

File: `apps/server_core/internal/modules/marketplaces/registry/magalu.go`

```go
package registry

import "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"

func Magalu() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "magalu",
		DisplayName:     "Magalu",
		FeeSource:       "static_table",
		Capabilities:    []string{"orders", "messages"},
		CredentialSchema: []domain.CredentialField{
			{Key: "api_key",     Label: "API Key",     Secret: true},
			{Key: "seller_id",   Label: "Seller ID",   Secret: false},
		},
		Active: true,
	}
}
```

---

## Group 5 — Postgres Adapters

### Task 15 — Write `fee_schedule_repo.go` (postgres adapter)

File: `apps/server_core/internal/modules/marketplaces/adapters/postgres/fee_schedule_repo.go`

```go
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

var _ ports.FeeScheduleRepository = (*FeeScheduleRepository)(nil)

type FeeScheduleRepository struct {
	pool *pgxpool.Pool
}

func NewFeeScheduleRepository(pool *pgxpool.Pool) *FeeScheduleRepository {
	return &FeeScheduleRepository{pool: pool}
}

func (r *FeeScheduleRepository) UpsertDefinitions(ctx context.Context, defs []domain.MarketplaceDefinition) error {
	for _, d := range defs {
		caps := d.Capabilities
		if caps == nil {
			caps = []string{}
		}
		schema, err := marshalJSON(d.CredentialSchema)
		if err != nil {
			return err
		}
		_, err = r.pool.Exec(ctx, `
			INSERT INTO marketplace_definitions
				(marketplace_code, display_name, fee_source, capabilities, credential_schema, active)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (marketplace_code) DO UPDATE SET
				display_name      = EXCLUDED.display_name,
				fee_source        = EXCLUDED.fee_source,
				capabilities      = EXCLUDED.capabilities,
				credential_schema = EXCLUDED.credential_schema,
				active            = EXCLUDED.active
		`, d.MarketplaceCode, d.DisplayName, d.FeeSource, caps, schema, d.Active)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *FeeScheduleRepository) ListDefinitions(ctx context.Context) ([]domain.MarketplaceDefinition, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT marketplace_code, display_name, fee_source, capabilities, credential_schema, active
		FROM marketplace_definitions
		WHERE active = true
		ORDER BY marketplace_code
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var defs []domain.MarketplaceDefinition
	for rows.Next() {
		var d domain.MarketplaceDefinition
		var schemaRaw []byte
		if err := rows.Scan(&d.MarketplaceCode, &d.DisplayName, &d.FeeSource, &d.Capabilities, &schemaRaw, &d.Active); err != nil {
			return nil, err
		}
		if err := unmarshalJSON(schemaRaw, &d.CredentialSchema); err != nil {
			return nil, err
		}
		defs = append(defs, d)
	}
	return defs, rows.Err()
}

func (r *FeeScheduleRepository) UpsertSchedules(ctx context.Context, schedules []domain.FeeSchedule) error {
	for _, s := range schedules {
		listingType := &s.ListingType
		if s.ListingType == "" {
			listingType = nil
		}
		_, err := r.pool.Exec(ctx, `
			INSERT INTO marketplace_fee_schedules
				(marketplace_code, category_id, listing_type, commission_percent,
				 fixed_fee_amount, notes, source, synced_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, now())
			ON CONFLICT (marketplace_code, category_id, listing_type) DO UPDATE SET
				commission_percent = EXCLUDED.commission_percent,
				fixed_fee_amount   = EXCLUDED.fixed_fee_amount,
				notes              = EXCLUDED.notes,
				source             = EXCLUDED.source,
				synced_at          = now()
		`, s.MarketplaceCode, s.CategoryID, listingType,
			s.CommissionPercent, s.FixedFeeAmount, s.Notes, s.Source)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *FeeScheduleRepository) LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (domain.FeeSchedule, bool, error) {
	// Try exact match first, then fall back to "default" category.
	for _, cat := range []string{categoryID, "default"} {
		var s domain.FeeSchedule
		var lt *string
		var syncedAt time.Time
		err := r.pool.QueryRow(ctx, `
			SELECT id, marketplace_code, category_id, COALESCE(listing_type, ''),
			       commission_percent, fixed_fee_amount, COALESCE(notes, ''), source, synced_at
			FROM marketplace_fee_schedules
			WHERE marketplace_code = $1
			  AND category_id = $2
			  AND (listing_type = $3 OR ($3 = '' AND listing_type IS NULL))
			  AND (valid_to IS NULL OR valid_to >= current_date)
			LIMIT 1
		`, marketplaceCode, cat, listingType).Scan(
			&s.ID, &s.MarketplaceCode, &s.CategoryID, &lt,
			&s.CommissionPercent, &s.FixedFeeAmount, &s.Notes, &s.Source, &syncedAt,
		)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			return domain.FeeSchedule{}, false, err
		}
		if lt != nil {
			s.ListingType = *lt
		}
		s.SyncedAt = syncedAt
		return s, true, nil
	}
	return domain.FeeSchedule{}, false, nil
}

func (r *FeeScheduleRepository) ListByMarketplace(ctx context.Context, marketplaceCode string) ([]domain.FeeSchedule, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, marketplace_code, category_id, COALESCE(listing_type, ''),
		       commission_percent, fixed_fee_amount, COALESCE(notes, ''), source, synced_at
		FROM marketplace_fee_schedules
		WHERE marketplace_code = $1
		  AND (valid_to IS NULL OR valid_to >= current_date)
		ORDER BY category_id, listing_type
	`, marketplaceCode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var schedules []domain.FeeSchedule
	for rows.Next() {
		var s domain.FeeSchedule
		var lt *string
		var syncedAt time.Time
		if err := rows.Scan(&s.ID, &s.MarketplaceCode, &s.CategoryID, &lt,
			&s.CommissionPercent, &s.FixedFeeAmount, &s.Notes, &s.Source, &syncedAt); err != nil {
			return nil, err
		}
		if lt != nil {
			s.ListingType = *lt
		}
		s.SyncedAt = syncedAt
		schedules = append(schedules, s)
	}
	return schedules, rows.Err()
}

func (r *FeeScheduleRepository) HasSchedules(ctx context.Context, marketplaceCode string) (bool, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM marketplace_fee_schedules WHERE marketplace_code = $1
	`, marketplaceCode).Scan(&count)
	return count > 0, err
}

// marshalJSON and unmarshalJSON are package-level helpers.
func marshalJSON(v any) ([]byte, error) {
	return json.Marshal(v)
}

func unmarshalJSON(data []byte, v any) error {
	if len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, v)
}
```

---

### Task 16 — Update `repository.go` — `ListPolicies` joins accounts for `marketplace_code`

File: `apps/server_core/internal/modules/marketplaces/adapters/postgres/repository.go`

Replace the `ListPolicies` method body:

```go
func (r *Repository) ListPolicies(ctx context.Context) ([]domain.Policy, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			p.tenant_id, p.policy_id, p.account_id,
			COALESCE(a.marketplace_code, a.channel_code, ''),
			p.commission_percent, p.commission_override,
			p.fixed_fee_amount, p.default_shipping_amount,
			p.tax_percent, p.min_margin_percent,
			p.sla_question_minutes, p.sla_dispatch_hours,
			p.shipping_provider
		FROM marketplace_pricing_policies p
		LEFT JOIN marketplace_accounts a ON a.account_id = p.account_id
		WHERE p.tenant_id = $1
		ORDER BY p.policy_id
	`, r.tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	policies := make([]domain.Policy, 0)
	for rows.Next() {
		var p domain.Policy
		if err := rows.Scan(
			&p.TenantID, &p.PolicyID, &p.AccountID, &p.MarketplaceCode,
			&p.CommissionPercent, &p.CommissionOverride,
			&p.FixedFeeAmount, &p.DefaultShipping,
			&p.TaxPercent, &p.MinMarginPercent,
			&p.SLAQuestionMinutes, &p.SLADispatchHours,
			&p.ShippingProvider,
		); err != nil {
			return nil, err
		}
		policies = append(policies, p)
	}
	return policies, rows.Err()
}
```

Also update `ListPoliciesByIDs` with the same JOIN and `commission_override` column:

```go
func (r *Repository) ListPoliciesByIDs(ctx context.Context, policyIDs []string) ([]domain.Policy, error) {
	if len(policyIDs) == 0 {
		return []domain.Policy{}, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT
			p.tenant_id, p.policy_id, p.account_id,
			COALESCE(a.marketplace_code, a.channel_code, ''),
			p.commission_percent, p.commission_override,
			p.fixed_fee_amount, p.default_shipping_amount,
			p.tax_percent, p.min_margin_percent,
			p.sla_question_minutes, p.sla_dispatch_hours,
			p.shipping_provider
		FROM marketplace_pricing_policies p
		LEFT JOIN marketplace_accounts a ON a.account_id = p.account_id
		WHERE p.tenant_id = $1 AND p.policy_id = ANY($2)
		ORDER BY p.policy_id
	`, r.tenantID, policyIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	policies := make([]domain.Policy, 0, len(policyIDs))
	for rows.Next() {
		var p domain.Policy
		if err := rows.Scan(
			&p.TenantID, &p.PolicyID, &p.AccountID, &p.MarketplaceCode,
			&p.CommissionPercent, &p.CommissionOverride,
			&p.FixedFeeAmount, &p.DefaultShipping,
			&p.TaxPercent, &p.MinMarginPercent,
			&p.SLAQuestionMinutes, &p.SLADispatchHours,
			&p.ShippingProvider,
		); err != nil {
			return nil, err
		}
		policies = append(policies, p)
	}
	return policies, rows.Err()
}
```

---

## Group 5b — Write-Path Updates (Account + Policy)

### Task 16a — Update `CreateAccountInput` and `SaveAccount` to persist `marketplace_code` + `credentials_json`

File: `apps/server_core/internal/modules/marketplaces/application/service.go`

Update `CreateAccountInput`:

```go
type CreateAccountInput struct {
	AccountID       string
	MarketplaceCode string            // NEW — replaces ChannelCode as primary identifier
	ChannelCode     string            // kept for backward compat
	DisplayName     string
	ConnectionMode  string
	CredentialsJSON map[string]string // NEW — credential key-value pairs from credential_schema
}
```

Update `CreateAccount` to populate `MarketplaceCode` and `CredentialsJSON` on the domain entity.
The domain `Account` struct gets two new fields:

File: `apps/server_core/internal/modules/marketplaces/domain/account.go`

```go
type Account struct {
	AccountID       string            `json:"account_id"`
	TenantID        string            `json:"tenant_id"`
	MarketplaceCode string            `json:"marketplace_code"` // NEW
	ChannelCode     string            `json:"channel_code"`
	DisplayName     string            `json:"display_name"`
	Status          string            `json:"status"`
	ConnectionMode  string            `json:"connection_mode"`
	CredentialsJSON map[string]string `json:"credentials_json,omitempty"` // NEW — omitted in list responses
}
```

Update `SaveAccount` in `adapters/postgres/repository.go`:

```go
func (r *Repository) SaveAccount(ctx context.Context, account domain.Account) error {
	credsJSON, _ := json.Marshal(account.CredentialsJSON)
	_, err := r.pool.Exec(ctx, `
		INSERT INTO marketplace_accounts (
			tenant_id, account_id, channel_code, marketplace_code,
			display_name, status, connection_mode, credentials_json
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (account_id) DO UPDATE SET
			channel_code     = EXCLUDED.channel_code,
			marketplace_code = EXCLUDED.marketplace_code,
			display_name     = EXCLUDED.display_name,
			status           = EXCLUDED.status,
			connection_mode  = EXCLUDED.connection_mode,
			credentials_json = EXCLUDED.credentials_json,
			updated_at       = now()
	`, account.TenantID, account.AccountID, account.ChannelCode, account.MarketplaceCode,
		account.DisplayName, account.Status, account.ConnectionMode, credsJSON)
	return err
}
```

Add `"encoding/json"` to the import block in `repository.go`.

---

### Task 16b — Update POST `/marketplaces/accounts` handler to accept new fields

File: `apps/server_core/internal/modules/marketplaces/transport/http_handler.go`

Update the POST handler request struct:

```go
var req struct {
	AccountID       string            `json:"account_id"`
	MarketplaceCode string            `json:"marketplace_code"` // NEW
	ChannelCode     string            `json:"channel_code"`
	DisplayName     string            `json:"display_name"`
	ConnectionMode  string            `json:"connection_mode"`
	CredentialsJSON map[string]string `json:"credentials_json"` // NEW
}
```

Pass `MarketplaceCode` and `CredentialsJSON` through to `CreateAccountInput`.

---

### Task 16c — Update `CreatePolicyInput` and `SavePolicy` for `commission_override`

File: `apps/server_core/internal/modules/marketplaces/application/service.go`

```go
type CreatePolicyInput struct {
	PolicyID           string
	AccountID          string
	CommissionPercent  float64
	CommissionOverride *float64  // NEW — optional; nil means use fee_schedules
	FixedFeeAmount     float64
	DefaultShipping    float64
	MinMarginPercent   float64
	SLAQuestionMinutes int
	SLADispatchHours   int
	ShippingProvider   string
}
```

Update `CreatePolicy` to set `policy.CommissionOverride = input.CommissionOverride`.

Update `SavePolicy` in `adapters/postgres/repository.go` to write `commission_override`:

```go
_, err := r.pool.Exec(ctx, `
	INSERT INTO marketplace_pricing_policies (
		tenant_id, policy_id, account_id, commission_percent, commission_override,
		fixed_fee_amount, default_shipping_amount, tax_percent, min_margin_percent,
		sla_question_minutes, sla_dispatch_hours, shipping_provider
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	ON CONFLICT (policy_id) DO UPDATE SET
		commission_percent  = EXCLUDED.commission_percent,
		commission_override = EXCLUDED.commission_override,
		...
`, policy.TenantID, policy.PolicyID, policy.AccountID,
   policy.CommissionPercent, policy.CommissionOverride, ...)
```

---

### Task 16d — Update SDK create types and OpenAPI POST schemas

File: `packages/sdk-runtime/src/index.ts`

Add:

```typescript
export interface CreateMarketplaceAccountRequest {
  account_id: string;
  marketplace_code: string;
  display_name: string;
  connection_mode: string;
  credentials_json: Record<string, string>;
}

export interface CreateMarketplacePolicyRequest {
  policy_id: string;
  account_id: string;
  commission_percent: number;
  commission_override?: number;  // optional
  fixed_fee_amount: number;
  default_shipping: number;
  min_margin_percent: number;
  sla_question_minutes: number;
  sla_dispatch_hours: number;
  shipping_provider: string;
}
```

Update `createMarketplaceAccount` and `createMarketplacePolicy` SDK methods to use these types.

File: `contracts/api/marketplace-central.openapi.yaml`

Update `POST /marketplaces/accounts` request body schema to include `marketplace_code` and `credentials_json`.
Update `POST /marketplaces/policies` request body schema to include optional `commission_override`.

---

## Group 6 — Application Services

### Task 17 — Write `FeeScheduleService`

File: `apps/server_core/internal/modules/marketplaces/application/fee_schedule_service.go`

```go
package application

import (
	"context"
	"fmt"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/registry"
)

// FeeScheduleService manages the fee schedule lifecycle.
type FeeScheduleService struct {
	repo ports.FeeScheduleRepository
}

func NewFeeScheduleService(repo ports.FeeScheduleRepository) *FeeScheduleService {
	return &FeeScheduleService{repo: repo}
}

// SeedDefinitions upserts all registered marketplace definitions into the DB.
// Called once at startup from composition/root.go.
func (s *FeeScheduleService) SeedDefinitions(ctx context.Context) error {
	defs := registry.All()
	if err := s.repo.UpsertDefinitions(ctx, defs); err != nil {
		return fmt.Errorf("MARKETPLACES_DEFINITIONS_SEED: %w", err)
	}
	return nil
}

// ListDefinitions returns all active marketplace definitions.
func (s *FeeScheduleService) ListDefinitions(ctx context.Context) ([]domain.MarketplaceDefinition, error) {
	return s.repo.ListDefinitions(ctx)
}

// ListFeeSchedules returns all active fee schedules for a marketplace.
func (s *FeeScheduleService) ListFeeSchedules(ctx context.Context, marketplaceCode string) ([]domain.FeeSchedule, error) {
	return s.repo.ListByMarketplace(ctx, marketplaceCode)
}

// LookupFee returns the effective commission rate using the three-level fallback:
//  1. If a fee_schedules row exists for (code, categoryID) → use it
//  2. If a fee_schedules row exists for (code, "default") → use it
//  3. Returns (zero, false, nil) — caller falls back to policy.CommissionPercent
func (s *FeeScheduleService) LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (domain.FeeSchedule, bool, error) {
	return s.repo.LookupFee(ctx, marketplaceCode, categoryID, listingType)
}

// HasSchedules reports whether any fee rows exist for marketplaceCode.
func (s *FeeScheduleService) HasSchedules(ctx context.Context, marketplaceCode string) (bool, error) {
	return s.repo.HasSchedules(ctx, marketplaceCode)
}

// UpsertSchedules writes fee schedule rows (used by sync/seed adapters).
func (s *FeeScheduleService) UpsertSchedules(ctx context.Context, schedules []domain.FeeSchedule) error {
	return s.repo.UpsertSchedules(ctx, schedules)
}
```

---

### Task 18 — Write `fee_schedule_service_test.go`

File: `apps/server_core/internal/modules/marketplaces/application/fee_schedule_service_test.go`

```go
package application_test

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

// stubFeeRepo satisfies ports.FeeScheduleRepository for unit testing.
type stubFeeRepo struct {
	schedules []domain.FeeSchedule
	defs      []domain.MarketplaceDefinition
}

func (s *stubFeeRepo) UpsertSchedules(_ context.Context, rows []domain.FeeSchedule) error {
	s.schedules = append(s.schedules, rows...)
	return nil
}
func (s *stubFeeRepo) LookupFee(_ context.Context, code, cat, lt string) (domain.FeeSchedule, bool, error) {
	for _, row := range s.schedules {
		if row.MarketplaceCode == code && row.CategoryID == cat {
			return row, true, nil
		}
	}
	// fallback to "default"
	for _, row := range s.schedules {
		if row.MarketplaceCode == code && row.CategoryID == "default" {
			return row, true, nil
		}
	}
	return domain.FeeSchedule{}, false, nil
}
func (s *stubFeeRepo) ListByMarketplace(_ context.Context, code string) ([]domain.FeeSchedule, error) {
	return s.schedules, nil
}
func (s *stubFeeRepo) UpsertDefinitions(_ context.Context, defs []domain.MarketplaceDefinition) error {
	s.defs = append(s.defs, defs...)
	return nil
}
func (s *stubFeeRepo) ListDefinitions(_ context.Context) ([]domain.MarketplaceDefinition, error) {
	return s.defs, nil
}
func (s *stubFeeRepo) HasSchedules(_ context.Context, code string) (bool, error) {
	for _, row := range s.schedules {
		if row.MarketplaceCode == code {
			return true, nil
		}
	}
	return false, nil
}

var _ ports.FeeScheduleRepository = (*stubFeeRepo)(nil)

func TestLookupFee_ExactCategoryMatch(t *testing.T) {
	repo := &stubFeeRepo{
		schedules: []domain.FeeSchedule{
			{MarketplaceCode: "shopee", CategoryID: "electronics", CommissionPercent: 0.12},
			{MarketplaceCode: "shopee", CategoryID: "default",     CommissionPercent: 0.14},
		},
	}
	svc := application.NewFeeScheduleService(repo)
	fee, found, err := svc.LookupFee(context.Background(), "shopee", "electronics", "")
	if err != nil || !found {
		t.Fatalf("expected fee found, got found=%v err=%v", found, err)
	}
	if fee.CommissionPercent != 0.12 {
		t.Errorf("expected 0.12, got %v", fee.CommissionPercent)
	}
}

func TestLookupFee_FallsBackToDefault(t *testing.T) {
	repo := &stubFeeRepo{
		schedules: []domain.FeeSchedule{
			{MarketplaceCode: "shopee", CategoryID: "default", CommissionPercent: 0.14},
		},
	}
	svc := application.NewFeeScheduleService(repo)
	fee, found, err := svc.LookupFee(context.Background(), "shopee", "unknown_cat", "")
	if err != nil || !found {
		t.Fatalf("expected fallback to default, got found=%v err=%v", found, err)
	}
	if fee.CommissionPercent != 0.14 {
		t.Errorf("expected 0.14, got %v", fee.CommissionPercent)
	}
}

func TestLookupFee_NotFound(t *testing.T) {
	repo := &stubFeeRepo{}
	svc := application.NewFeeScheduleService(repo)
	_, found, err := svc.LookupFee(context.Background(), "magalu", "any", "")
	if err != nil {
		t.Fatal(err)
	}
	if found {
		t.Error("expected not found")
	}
}
```

Run: `cd apps/server_core && go test ./internal/modules/marketplaces/application/...`
Expected: `ok  marketplace-central/apps/server_core/internal/modules/marketplaces/application`

---

## Group 7 — Connector Sync / Seed Adapters

### Task 19 — Write `connectors/adapters/mercado_livre/fee_sync.go`

File: `apps/server_core/internal/modules/connectors/adapters/mercado_livre/fee_sync.go`

```go
// Package mercadolivre provides a FeeScheduleSyncer for Mercado Livre.
// Commission rates are fetched from the ML Fees API:
//   GET https://api.mercadolibre.com/sites/MLB/listing_types/{listing_type}/categories/{category_id}
// Auth: Bearer token from connected tenant account.
package mercadolivre

import (
	"context"
	"fmt"
	"log/slog"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

// FeeSyncer fetches live fee schedules from the Mercado Livre API.
// When no API client is configured it logs a warning and returns 0 rows
// (the seeded "default" row from the static seed is used as fallback).
type FeeSyncer struct{}

func NewFeeSyncer() *FeeSyncer { return &FeeSyncer{} }

func (f *FeeSyncer) MarketplaceCode() string { return "mercado_livre" }

// Sync seeds a static default commission rate (16%) while live API integration
// is not yet available. Replace with actual ML API calls once OAuth is wired.
//
// ML standard commission rates (source: docs/marketplaces/mercado-livre.md):
//   Clássico listing: 16%
//   Premium listing:  +6% over Clássico for most categories
func (f *FeeSyncer) Sync(ctx context.Context, repo ports.FeeScheduleRepository) (int, error) {
	schedules := []domain.FeeSchedule{
		{
			MarketplaceCode:   "mercado_livre",
			CategoryID:        "default",
			ListingType:       "classico",
			CommissionPercent: 0.16,
			FixedFeeAmount:    0,
			Notes:             "Standard Clássico rate — update per category via ML Fees API",
			Source:            "seeded",
		},
		{
			MarketplaceCode:   "mercado_livre",
			CategoryID:        "default",
			ListingType:       "premium",
			CommissionPercent: 0.22,
			FixedFeeAmount:    0,
			Notes:             "Standard Premium rate (Clássico + 6%)",
			Source:            "seeded",
		},
	}

	if err := repo.UpsertSchedules(ctx, schedules); err != nil {
		return 0, fmt.Errorf("mercado_livre fee seed: %w", err)
	}
	slog.Info("mercado_livre fee schedules seeded", "count", len(schedules))
	return len(schedules), nil
}
```

---

### Task 20 — Write `connectors/adapters/shopee/fee_seed.go`

File: `apps/server_core/internal/modules/connectors/adapters/shopee/fee_seed.go`

```go
// Package shopee provides static fee schedule seeding for Shopee Brazil.
// Rates sourced from docs/marketplaces/shopee.md (update when Shopee publishes new tables).
package shopee

import (
	"context"
	"fmt"
	"log/slog"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

type FeeSyncer struct{}

func NewFeeSyncer() *FeeSyncer { return &FeeSyncer{} }

func (f *FeeSyncer) MarketplaceCode() string { return "shopee" }

// Sync seeds the Shopee standard commission table.
// Shopee Brazil charges a flat commission per category with no listing-type modifier.
// Source: docs/marketplaces/shopee.md — update this map when Shopee revises rates.
func (f *FeeSyncer) Sync(ctx context.Context, repo ports.FeeScheduleRepository) (int, error) {
	// categoryID → commission_percent (source: shopee.md)
	// Use "default" as the catch-all when product category is unmapped.
	rates := map[string]float64{
		"default":     0.14, // general / unmapped
		"electronics": 0.12,
		"fashion":     0.14,
		"home":        0.13,
		"beauty":      0.14,
		"sports":      0.13,
		"toys":        0.14,
		"food":        0.12,
	}

	schedules := make([]domain.FeeSchedule, 0, len(rates))
	for cat, pct := range rates {
		schedules = append(schedules, domain.FeeSchedule{
			MarketplaceCode:   "shopee",
			CategoryID:        cat,
			CommissionPercent: pct,
			FixedFeeAmount:    0,
			Source:            "seeded",
		})
	}

	if err := repo.UpsertSchedules(ctx, schedules); err != nil {
		return 0, fmt.Errorf("shopee fee seed: %w", err)
	}
	slog.Info("shopee fee schedules seeded", "count", len(schedules))
	return len(schedules), nil
}
```

---

### Task 21 — Write `connectors/adapters/magalu/fee_seed.go`

File: `apps/server_core/internal/modules/connectors/adapters/magalu/fee_seed.go`

```go
// Package magalu provides static fee schedule seeding for Magalu (Magazine Luiza).
// Rates sourced from docs/marketplaces/magalu.md (update when Magalu publishes new tables).
package magalu

import (
	"context"
	"fmt"
	"log/slog"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

type FeeSyncer struct{}

func NewFeeSyncer() *FeeSyncer { return &FeeSyncer{} }

func (f *FeeSyncer) MarketplaceCode() string { return "magalu" }

// Sync seeds the Magalu standard commission table.
// Source: docs/marketplaces/magalu.md — update this map when Magalu revises rates.
func (f *FeeSyncer) Sync(ctx context.Context, repo ports.FeeScheduleRepository) (int, error) {
	rates := map[string]float64{
		"default":     0.16,
		"electronics": 0.14,
		"appliances":  0.12,
		"fashion":     0.18,
		"furniture":   0.16,
		"sports":      0.16,
		"beauty":      0.16,
	}

	schedules := make([]domain.FeeSchedule, 0, len(rates))
	for cat, pct := range rates {
		schedules = append(schedules, domain.FeeSchedule{
			MarketplaceCode:   "magalu",
			CategoryID:        cat,
			CommissionPercent: pct,
			FixedFeeAmount:    0,
			Source:            "seeded",
		})
	}

	if err := repo.UpsertSchedules(ctx, schedules); err != nil {
		return 0, fmt.Errorf("magalu fee seed: %w", err)
	}
	slog.Info("magalu fee schedules seeded", "count", len(schedules))
	return len(schedules), nil
}
```

---

### Task 22 — Write `connectors/application/fee_sync_service.go`

File: `apps/server_core/internal/modules/connectors/application/fee_sync_service.go`

```go
package application

import (
	"context"
	"log/slog"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

// FeeSyncService orchestrates fee schedule seeding and syncing at startup.
type FeeSyncService struct {
	syncers []ports.FeeScheduleSyncer
	repo    ports.FeeScheduleRepository
}

func NewFeeSyncService(repo ports.FeeScheduleRepository, syncers ...ports.FeeScheduleSyncer) *FeeSyncService {
	return &FeeSyncService{syncers: syncers, repo: repo}
}

// SeedAll runs each syncer. For static-table marketplaces it runs only if
// no rows exist yet. For api_sync marketplaces it always runs (idempotent upsert).
func (s *FeeSyncService) SeedAll(ctx context.Context) {
	for _, syncer := range s.syncers {
		code := syncer.MarketplaceCode()
		has, err := s.repo.HasSchedules(ctx, code)
		if err != nil {
			slog.Error("fee sync check failed", "marketplace", code, "err", err)
			continue
		}
		if has {
			slog.Info("fee schedules already seeded, skipping", "marketplace", code)
			continue
		}
		n, err := syncer.Sync(ctx, s.repo)
		if err != nil {
			slog.Error("fee sync failed", "marketplace", code, "err", err)
			continue
		}
		slog.Info("fee sync complete", "marketplace", code, "rows", n)
	}
}
```

---

## Group 8 — Transport

### Task 23 — Add `/marketplaces/definitions` route to `http_handler.go`

File: `apps/server_core/internal/modules/marketplaces/transport/http_handler.go`

The `Handler` struct needs access to `FeeScheduleService`. Update the struct and constructor:

```go
type Handler struct {
	svc    application.Service
	feeSvc *application.FeeScheduleService
}

func NewHandler(svc application.Service, feeSvc *application.FeeScheduleService) Handler {
	return Handler{svc: svc, feeSvc: feeSvc}
}
```

Add inside `Register(mux *http.ServeMux)`:

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
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": defs})
})
```

---

### Task 24 — Add `/marketplaces/fee-schedules` route

Inside `Register(mux *http.ServeMux)`, add:

```go
mux.HandleFunc("/marketplaces/fee-schedules", func(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeMarketplacesError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}
	code := r.URL.Query().Get("marketplace_code")
	if code == "" {
		writeMarketplacesError(w, http.StatusBadRequest, "invalid_request", "marketplace_code query param required")
		return
	}
	schedules, err := h.feeSvc.ListFeeSchedules(r.Context(), code)
	if err != nil {
		writeMarketplacesError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": schedules})
})
```

---

## Group 8b — Admin Endpoints

### Task 22b — Add `SeedMarketplace(force)` to `FeeSyncService`

File: `apps/server_core/internal/modules/connectors/application/fee_sync_service.go`

Add method:

```go
// SeedMarketplace runs the syncer for one marketplace.
// If force=false it skips when HasSchedules=true (startup behavior).
// If force=true it always runs (admin reseed/resync behavior).
func (s *FeeSyncService) SeedMarketplace(ctx context.Context, marketplaceCode string, force bool) (int, error) {
	for _, syncer := range s.syncers {
		if syncer.MarketplaceCode() != marketplaceCode {
			continue
		}
		if !force {
			has, err := s.repo.HasSchedules(ctx, marketplaceCode)
			if err != nil {
				return 0, err
			}
			if has {
				return 0, nil
			}
		}
		return syncer.Sync(ctx, s.repo)
	}
	return 0, fmt.Errorf("CONNECTORS_FEE_SYNC_UNKNOWN_MARKETPLACE: %s", marketplaceCode)
}
```

Add `"fmt"` to imports.

---

### Task 24a — Add `POST /admin/fee-schedules/seed` and `POST /admin/fee-schedules/sync`

These endpoints are called by operators to manually refresh fee data without a restart.

File: `apps/server_core/internal/modules/marketplaces/transport/http_handler.go`

The `Handler` struct also receives the `FeeSyncService`. Update:

```go
type Handler struct {
	svc        application.Service
	feeSvc     *application.FeeScheduleService
	feeSyncSvc *connapp.FeeSyncService  // NEW — import connectors/application as connapp
}

func NewHandler(svc application.Service, feeSvc *application.FeeScheduleService, feeSyncSvc *connapp.FeeSyncService) Handler {
	return Handler{svc: svc, feeSvc: feeSvc, feeSyncSvc: feeSyncSvc}
}
```

> Note: To avoid import cycles, pass `feeSyncSvc` as an interface defined in the marketplaces/ports or use an adapter. Define the interface inline in transport:

```go
// FeeSeedTrigger is the subset of FeeSyncService used by admin endpoints.
type FeeSeedTrigger interface {
	SeedMarketplace(ctx context.Context, marketplaceCode string, force bool) (int, error)
}
```

Then `Handler.feeSyncSvc` is `FeeSeedTrigger`.

Add routes inside `Register`:

```go
mux.HandleFunc("/admin/fee-schedules/seed", func(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeMarketplacesError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}
	code := r.URL.Query().Get("marketplace_code")
	if code == "" {
		writeMarketplacesError(w, http.StatusBadRequest, "invalid_request", "marketplace_code query param required")
		return
	}
	n, err := h.feeSyncSvc.SeedMarketplace(r.Context(), code, true)
	if err != nil {
		writeMarketplacesError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"seeded": n, "marketplace_code": code})
})

// /admin/fee-schedules/sync uses the same handler — both trigger a forced seed/sync
mux.HandleFunc("/admin/fee-schedules/sync", func(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeMarketplacesError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}
	code := r.URL.Query().Get("marketplace_code")
	if code == "" {
		writeMarketplacesError(w, http.StatusBadRequest, "invalid_request", "marketplace_code query param required")
		return
	}
	n, err := h.feeSyncSvc.SeedMarketplace(r.Context(), code, true)
	if err != nil {
		writeMarketplacesError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"synced": n, "marketplace_code": code})
})
```

Update `NewHandler` call in `composition/root.go` to pass `feeSyncSvc`.

Add both endpoints to OpenAPI spec and SDK (POST methods, `marketplace_code` query param, response `{seeded: int}`).

---

## Group 9 — Pricing Module Update

### Task 25 — Add `FeeScheduleLookup` port to pricing

File: `apps/server_core/internal/modules/pricing/ports/fee_schedule.go`

```go
package ports

import (
	"context"
	mktdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

// FeeScheduleLookup allows the pricing engine to query marketplace fee rates
// without importing the marketplaces module's application layer directly.
type FeeScheduleLookup interface {
	LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (mktdomain.FeeSchedule, bool, error)
}
```

---

### Task 26 — Write `pricing/adapters/feeschedule/adapter.go`

File: `apps/server_core/internal/modules/pricing/adapters/feeschedule/adapter.go`

```go
package feeschedule

import (
	"context"
	mktapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	mktdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

var _ ports.FeeScheduleLookup = (*Adapter)(nil)

type Adapter struct {
	svc *mktapp.FeeScheduleService
}

func NewAdapter(svc *mktapp.FeeScheduleService) *Adapter {
	return &Adapter{svc: svc}
}

func (a *Adapter) LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (mktdomain.FeeSchedule, bool, error) {
	return a.svc.LookupFee(ctx, marketplaceCode, categoryID, listingType)
}
```

---

### Task 27 — Update `BatchOrchestrator` to use fee schedule lookup

File: `apps/server_core/internal/modules/pricing/application/batch_orchestrator.go`

**Add field to `BatchOrchestrator` struct:**

```go
type BatchOrchestrator struct {
	products  ports.ProductProvider
	policies  ports.PolicyProvider
	freight   ports.FreightQuoter
	feeLookup ports.FeeScheduleLookup // NEW — nil-safe, falls back to policy rate
	tenantID  string
}

func NewBatchOrchestrator(
	products ports.ProductProvider,
	policies ports.PolicyProvider,
	freight ports.FreightQuoter,
	feeLookup ports.FeeScheduleLookup, // NEW
	tenantID string,
) *BatchOrchestrator {
	return &BatchOrchestrator{
		products:  products,
		policies:  policies,
		freight:   freight,
		feeLookup: feeLookup,
		tenantID:  tenantID,
	}
}
```

**Replace the commission calculation inside `RunBatch` inner loop:**

```go
// Before:
commissionAmt := sellingPrice * pol.CommissionPercent

// After — three-level fallback:
commissionPct := pol.CommissionPercent
if pol.CommissionOverride != nil {
	commissionPct = *pol.CommissionOverride
} else if o.feeLookup != nil && pol.MarketplaceCode != "" {
	if fee, found, err := o.feeLookup.LookupFee(ctx, pol.MarketplaceCode, prod.TaxonomyNodeID, ""); err == nil && found {
		commissionPct = fee.CommissionPercent
	}
}
commissionAmt := sellingPrice * commissionPct
```

> `prod.TaxonomyNodeID` is used as the category proxy until a dedicated ML category mapping is built.

---

## Group 10 — Composition Root

### Task 28 — Update `composition/root.go`

File: `apps/server_core/internal/composition/root.go`

Add new imports:

```go
mktregistry  "marketplace-central/apps/server_core/internal/modules/marketplaces/registry"
mktfeepostgres "marketplace-central/apps/server_core/internal/modules/marketplaces/adapters/postgres"
mktfeeapp    "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
connml       "marketplace-central/apps/server_core/internal/modules/connectors/adapters/mercado_livre"
connshopee   "marketplace-central/apps/server_core/internal/modules/connectors/adapters/shopee"
connmagalu   "marketplace-central/apps/server_core/internal/modules/connectors/adapters/magalu"
connfeeapp   "marketplace-central/apps/server_core/internal/modules/connectors/application"
pricingfee   "marketplace-central/apps/server_core/internal/modules/pricing/adapters/feeschedule"
```

Replace marketplace + pricing wiring block:

```go
// Marketplaces
marketRepo     := marketplacespostgres.NewRepository(pool, cfg.DefaultTenantID)
marketSvc      := marketplacesapp.NewService(marketRepo, cfg.DefaultTenantID)
feeRepo        := mktfeepostgres.NewFeeScheduleRepository(pool)
feeSvc         := mktfeeapp.NewFeeScheduleService(feeRepo)

// Seed marketplace definitions into DB
if err := feeSvc.SeedDefinitions(context.Background()); err != nil {
	log.Printf("warn: marketplace definitions seed: %v", err)
}

// Seed / sync fee schedules
feeSyncSvc := connfeeapp.NewFeeSyncService(feeRepo,
	connml.NewFeeSyncer(),
	connshopee.NewFeeSyncer(),
	connmagalu.NewFeeSyncer(),
)
feeSyncSvc.SeedAll(context.Background())

marketplacestransport.NewHandler(marketSvc, feeSvc).Register(mux)

// Pricing
pricingRepo    := pricingpostgres.NewRepository(pool, cfg.DefaultTenantID)
pricingSvc     := pricingapp.NewService(pricingRepo, cfg.DefaultTenantID)
feeAdapter     := pricingfee.NewAdapter(feeSvc)
prodReader     := pricingcatalog.NewReader(catalogSvc)
polReader      := pricingmarket.NewReader(marketSvc)
batchOrch      := pricingapp.NewBatchOrchestrator(prodReader, polReader, meClient, feeAdapter, cfg.DefaultTenantID)
pricingtransport.NewHandler(pricingSvc, batchOrch).Register(mux)
```

> Add `"context"` to imports if not already present.

---

## Group 11 — SDK Runtime

### Task 29 — Add types and methods to `sdk-runtime/src/index.ts`

File: `packages/sdk-runtime/src/index.ts`

Add new interfaces after the existing `MarketplacePolicy` interface:

```typescript
export interface CredentialField {
  key: string;
  label: string;
  secret: boolean;
}

export interface MarketplaceDefinition {
  marketplace_code: string;
  display_name: string;
  fee_source: 'api_sync' | 'static_table';
  capabilities: string[];
  credential_schema: CredentialField[];
  active: boolean;
}

export interface MarketplaceFeeSchedule {
  id: string;
  marketplace_code: string;
  category_id: string;
  listing_type: string;
  commission_percent: number;
  fixed_fee_amount: number;
  notes: string;
  source: 'api_sync' | 'seeded' | 'manual';
  synced_at: string;
}
```

Add two SDK methods (following the existing fetch pattern in the file):

```typescript
async listMarketplaceDefinitions(): Promise<{ items: MarketplaceDefinition[] }> {
  const res = await fetch(`${this.baseURL}/marketplaces/definitions`);
  if (!res.ok) throw new Error(`listMarketplaceDefinitions: ${res.status}`);
  return res.json();
}

async listMarketplaceFeeSchedules(marketplaceCode: string): Promise<{ items: MarketplaceFeeSchedule[] }> {
  const res = await fetch(`${this.baseURL}/marketplaces/fee-schedules?marketplace_code=${encodeURIComponent(marketplaceCode)}`);
  if (!res.ok) throw new Error(`listMarketplaceFeeSchedules: ${res.status}`);
  return res.json();
}
```

---

## Group 12 — OpenAPI Spec

### Task 30 — Add endpoints to `contracts/api/marketplace-central.openapi.yaml`

File: `contracts/api/marketplace-central.openapi.yaml`

Add under `paths:`:

```yaml
  /marketplaces/definitions:
    get:
      operationId: listMarketplaceDefinitions
      summary: List all registered marketplace types
      tags: [marketplaces]
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items:
                      $ref: '#/components/schemas/MarketplaceDefinition'

  /marketplaces/fee-schedules:
    get:
      operationId: listMarketplaceFeeSchedules
      summary: List fee schedules for a marketplace
      tags: [marketplaces]
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
                  items:
                    type: array
                    items:
                      $ref: '#/components/schemas/MarketplaceFeeSchedule'
        "400":
          description: marketplace_code query param missing
```

Add under `components.schemas:`:

```yaml
    MarketplaceDefinition:
      type: object
      properties:
        marketplace_code: { type: string }
        display_name:     { type: string }
        fee_source:       { type: string, enum: [api_sync, static_table] }
        capabilities:     { type: array, items: { type: string } }
        credential_schema:
          type: array
          items:
            type: object
            properties:
              key:    { type: string }
              label:  { type: string }
              secret: { type: boolean }
        active: { type: boolean }

    MarketplaceFeeSchedule:
      type: object
      properties:
        id:                 { type: string, format: uuid }
        marketplace_code:   { type: string }
        category_id:        { type: string }
        listing_type:       { type: string }
        commission_percent: { type: number }
        fixed_fee_amount:   { type: number }
        notes:              { type: string }
        source:             { type: string, enum: [api_sync, seeded, manual] }
        synced_at:          { type: string, format: date-time }
```

---

## Group 12a — Expanded Test Coverage

### Task 30c — Add startup idempotency test to `fee_schedule_service_test.go`

```go
func TestSeedAll_Idempotent(t *testing.T) {
	repo := &stubFeeRepo{}
	svc := application.NewFeeScheduleService(repo)

	// Simulate syncer that seeds 2 rows
	syncer := &stubSyncer{code: "shopee", rows: []domain.FeeSchedule{
		{MarketplaceCode: "shopee", CategoryID: "default", CommissionPercent: 0.14, Source: "seeded"},
	}}

	// First seed
	err := syncer.Sync(context.Background(), repo)  // indirect via FeeSyncService pattern
	if err != nil { t.Fatal(err) }

	// Second call: HasSchedules returns true → syncer should NOT be called again
	has, _ := svc.HasSchedules(context.Background(), "shopee")
	if !has {
		t.Error("expected HasSchedules=true after first seed")
	}
}
```

### Task 30d — Add handler tests for new endpoints

File: `apps/server_core/internal/modules/marketplaces/transport/http_handler_test.go` (new or existing)

Test `GET /marketplaces/definitions` returns 200 with `items` array.
Test `GET /marketplaces/fee-schedules` without `marketplace_code` returns 400.
Test `GET /marketplaces/fee-schedules?marketplace_code=shopee` returns 200.
Test `POST /admin/fee-schedules/seed` without `marketplace_code` returns 400.
Test `POST /admin/fee-schedules/seed?marketplace_code=shopee` returns 200 with `seeded` count.

Pattern (matching existing transport test style if any, or using `httptest.NewRecorder`):

```go
func TestDefinitionsHandler_GET(t *testing.T) {
	feeSvc := &stubFeeScheduleService{defs: []domain.MarketplaceDefinition{
		{MarketplaceCode: "shopee", DisplayName: "Shopee", Active: true},
	}}
	h := transport.NewHandler(stubSvc{}, feeSvc, stubSeedTrigger{})
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/marketplaces/definitions", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
}
```

### Task 30e — Validate tenant isolation in ListPolicies JOIN

Add a test that confirms `ListPolicies` only returns policies for the configured `tenantID` even after the JOIN with `marketplace_accounts`:

```go
func TestListPolicies_TenantIsolation(t *testing.T) {
	// Uses stubRepo; verify that MarketplaceCode is populated from JOIN
	// and that a policy belonging to a different tenant is not returned.
	// This is a unit test on the stub — integration test is done in smoke (Task 31).
}
```

---

## Group 12b — Frontend (Marketplace Account Form)

### Task 30b — Render credential fields from `credential_schema`

The marketplace accounts form (in `packages/feature-connectors/` or wherever accounts are created) currently uses hardcoded fields. Update it to fetch `listMarketplaceDefinitions()` and render the credential fields dynamically.

File to update: find the component that renders the marketplace account creation/edit form.
```bash
grep -r "channel_code\|ConnectionMode\|CreateAccount" packages/ --include="*.tsx" -l
```

In the form component:
1. On mount, call `client.listMarketplaceDefinitions()` to get `items: MarketplaceDefinition[]`
2. Render a `<select>` for `marketplace_code` populated from `items.map(d => d.marketplace_code)`
3. When a marketplace is selected, render its `credential_schema` fields:
   ```tsx
   {selectedDef?.credential_schema.map(field => (
     <input
       key={field.key}
       type={field.secret ? 'password' : 'text'}
       placeholder={field.label}
       aria-label={field.label}
       onChange={e => setCredentials(prev => ({ ...prev, [field.key]: e.target.value }))}
     />
   ))}
   ```
4. On submit, send `marketplace_code` and `credentials` (as the JSONB `credentials_json` field) alongside the existing account fields.

This task is a UI-only change — no backend changes required. The `/marketplaces/definitions` endpoint added in Task 23 provides the data.

---

### Task 31 — Build and test

```bash
cd apps/server_core
go build ./...
```
Expected: no errors.

```bash
go test ./internal/modules/marketplaces/application/... -v
```
Expected: 3 tests pass (TestLookupFee_ExactCategoryMatch, TestLookupFee_FallsBackToDefault, TestLookupFee_NotFound).

```bash
go test ./... 2>&1 | tail -20
```
Expected: all existing tests pass, no regressions.

### Task 32 — Smoke test

Start server, then verify:

```bash
curl -s http://localhost:8082/marketplaces/definitions | jq '.items | length'
# Expected: 3 (mercado_livre, shopee, magalu)

curl -s "http://localhost:8082/marketplaces/fee-schedules?marketplace_code=shopee" | jq '.items | length'
# Expected: 8 (one per category seeded)

curl -s "http://localhost:8082/marketplaces/fee-schedules?marketplace_code=mercado_livre" | jq '.items | length'
# Expected: 2 (classico + premium default rows)
```

### Task 33 — Commit

```bash
git add apps/server_core/migrations/001{0,1,2,3}_*.sql \
        apps/server_core/internal/modules/marketplaces/ \
        apps/server_core/internal/modules/connectors/ \
        apps/server_core/internal/modules/pricing/ \
        apps/server_core/internal/composition/root.go \
        packages/sdk-runtime/src/index.ts \
        contracts/api/marketplace-central.openapi.yaml

git commit -m "feat(marketplaces): registry + fee foundation — plugin pattern, fee schedules, simulator wired"
```

---

## Execution Order

```
T1–T5      Migrations (run first — DB schema must exist before Go code)
T6–T8      Domain types (including Account fields)
T9–T10     Ports
T11–T14    Registry
T15–T16    Postgres adapters (read path)
T16a–T16d  Write-path updates (account + policy + SDK create types)
T17–T18    Application service + unit tests  ← run tests here
T19–T22    Connector sync/seed adapters
T22b       SeedMarketplace(force) method
T23–T24    Transport handlers (read)
T24a       Admin endpoints + FeeSeedTrigger interface
T25–T27    Pricing update
T28        Composition root (final wiring — pass feeSyncSvc to NewHandler)
T29–T30    SDK + OpenAPI (read types + admin endpoints)
T30b       Frontend credential form
T30c–T30e  Expanded tests
T31–T33    Build, test, smoke, commit
```
