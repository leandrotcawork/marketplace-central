# VTEX Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `connectors` module that lets users batch-publish products to VTEX through a 9-step catalog pipeline with per-product state tracking.

**Architecture:** Hexagonal module under `apps/server_core/internal/modules/connectors/` following the same pattern as `catalog`, `marketplaces`, and `pricing`. A `VTEXCatalogPort` interface decouples the pipeline from the actual VTEX API — initially stubbed, swapped for a real HTTP adapter when credentials arrive. Batch orchestration resolves shared resources (categories, brands) once per batch, then fans out per-product pipelines sequentially.

**Tech Stack:** Go, PostgreSQL (pgxpool), net/http, standard library only (no frameworks)

**Spec:** `docs/superpowers/specs/2026-04-01-vtex-connector-design.md`

---

## File Structure

```
apps/server_core/internal/modules/connectors/
  domain/
    batch.go              — PublicationBatch, PublicationOperation structs
    pipeline.go           — PipelineStepResult struct, StepName constants, ordered step list
    mapping.go            — VTEXEntityMapping struct
    errors.go             — typed VTEX error types (ErrVTEXValidation, etc.)
  application/
    executor.go           — PipelineExecutor: runs steps 3-9 for a single product
    orchestrator.go       — BatchOrchestrator: preflight, shared resolution, fan-out, completion
  ports/
    repository.go         — ConnectorsRepository interface (DB operations)
    vtex_catalog.go       — VTEXCatalogPort interface + param/response structs
  adapters/
    postgres/
      repository.go       — ConnectorsRepository implementation
    vtex/
      stub/
        adapter.go        — Stubbed VTEXCatalogPort returning fake IDs
  transport/
    http_handler.go       — POST publish, GET batch status, POST retry
  events/
    doc.go
  readmodel/
    doc.go

apps/server_core/migrations/
  0005_connectors.sql     — publication_batches, publication_operations,
                            pipeline_step_results, vtex_entity_mappings tables

apps/server_core/tests/unit/
  connectors_domain_test.go   — domain entity construction tests
  connectors_executor_test.go — PipelineExecutor tests with stub port
  connectors_orchestrator_test.go — BatchOrchestrator tests
  connectors_handler_test.go  — HTTP handler contract tests

contracts/api/
  marketplace-central.openapi.yaml — add 3 new endpoints

apps/server_core/internal/composition/
  root.go — register connectors module
```

---

## Task 1: Domain Entities

**Files:**
- Create: `apps/server_core/internal/modules/connectors/domain/batch.go`
- Create: `apps/server_core/internal/modules/connectors/domain/pipeline.go`
- Create: `apps/server_core/internal/modules/connectors/domain/mapping.go`
- Create: `apps/server_core/internal/modules/connectors/domain/errors.go`
- Create: `apps/server_core/internal/modules/connectors/events/doc.go`
- Create: `apps/server_core/internal/modules/connectors/readmodel/doc.go`
- Test: `apps/server_core/tests/unit/connectors_domain_test.go`

- [ ] **Step 1: Create domain entity files**

Create `apps/server_core/internal/modules/connectors/domain/batch.go`:

```go
package domain

import "time"

type PublicationBatch struct {
	BatchID        string     `json:"batch_id"`
	TenantID       string     `json:"tenant_id"`
	VTEXAccount    string     `json:"vtex_account"`
	Status         string     `json:"status"`
	TotalProducts  int        `json:"total_products"`
	SucceededCount int        `json:"succeeded_count"`
	FailedCount    int        `json:"failed_count"`
	CreatedAt      time.Time  `json:"created_at"`
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
}

type PublicationOperation struct {
	OperationID  string    `json:"operation_id"`
	BatchID      string    `json:"batch_id"`
	TenantID     string    `json:"tenant_id"`
	VTEXAccount  string    `json:"vtex_account"`
	ProductID    string    `json:"product_id"`
	CurrentStep  string    `json:"current_step"`
	Status       string    `json:"status"`
	ErrorCode    string    `json:"error_code,omitempty"`
	ErrorMessage string    `json:"error_message,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

const (
	BatchStatusPending    = "pending"
	BatchStatusInProgress = "in_progress"
	BatchStatusCompleted  = "completed"
	BatchStatusFailed     = "failed"
)

const (
	OperationStatusPending    = "pending"
	OperationStatusInProgress = "in_progress"
	OperationStatusSucceeded  = "succeeded"
	OperationStatusFailed     = "failed"
)
```

Create `apps/server_core/internal/modules/connectors/domain/pipeline.go`:

```go
package domain

import "time"

type PipelineStepResult struct {
	StepResultID string     `json:"step_result_id"`
	OperationID  string     `json:"operation_id"`
	TenantID     string     `json:"tenant_id"`
	StepName     string     `json:"step_name"`
	Status       string     `json:"status"`
	VTEXEntityID *string    `json:"vtex_entity_id,omitempty"`
	AttemptCount int        `json:"attempt_count"`
	ErrorCode    string     `json:"error_code,omitempty"`
	ErrorMessage string     `json:"error_message,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}

const (
	StepCategory    = "category"
	StepBrand       = "brand"
	StepProduct     = "product"
	StepSKU         = "sku"
	StepSpecsImages = "specs_images"
	StepTradePolicy = "trade_policy"
	StepPrice       = "price"
	StepStock       = "stock"
	StepActivate    = "activate"
)

// OrderedSteps defines the 9-step pipeline in execution order.
var OrderedSteps = []string{
	StepCategory,
	StepBrand,
	StepProduct,
	StepSKU,
	StepSpecsImages,
	StepTradePolicy,
	StepPrice,
	StepStock,
	StepActivate,
}

// SharedSteps are resolved once per batch, not per product.
var SharedSteps = []string{
	StepCategory,
	StepBrand,
}

// PerProductSteps run sequentially for each product after shared resolution.
var PerProductSteps = []string{
	StepProduct,
	StepSKU,
	StepSpecsImages,
	StepTradePolicy,
	StepPrice,
	StepStock,
	StepActivate,
}

const (
	StepStatusPending    = "pending"
	StepStatusInProgress = "in_progress"
	StepStatusSucceeded  = "succeeded"
	StepStatusFailed     = "failed"
	StepStatusSkipped    = "skipped"
)
```

Create `apps/server_core/internal/modules/connectors/domain/mapping.go`:

```go
package domain

import "time"

type VTEXEntityMapping struct {
	MappingID   string    `json:"mapping_id"`
	TenantID    string    `json:"tenant_id"`
	VTEXAccount string    `json:"vtex_account"`
	EntityType  string    `json:"entity_type"`
	LocalID     string    `json:"local_id"`
	VTEXID      string    `json:"vtex_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

const (
	EntityTypeCategory = "category"
	EntityTypeBrand    = "brand"
	EntityTypeProduct  = "product"
	EntityTypeSKU      = "sku"
)
```

Create `apps/server_core/internal/modules/connectors/domain/errors.go`:

```go
package domain

import "errors"

var (
	ErrVTEXValidation = errors.New("VTEX rejected the payload")
	ErrVTEXNotFound   = errors.New("VTEX resource not found")
	ErrVTEXTransient  = errors.New("VTEX transient error")
	ErrVTEXAuth       = errors.New("VTEX authentication failed")
)
```

Create `apps/server_core/internal/modules/connectors/events/doc.go`:

```go
package events
```

Create `apps/server_core/internal/modules/connectors/readmodel/doc.go`:

```go
package readmodel
```

- [ ] **Step 2: Write domain tests**

Create `apps/server_core/tests/unit/connectors_domain_test.go`:

```go
package unit

import (
	"testing"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
)

func TestOrderedStepsHasNineEntries(t *testing.T) {
	if len(domain.OrderedSteps) != 9 {
		t.Fatalf("expected 9 ordered steps, got %d", len(domain.OrderedSteps))
	}
}

func TestSharedStepsAreFirstTwoOrderedSteps(t *testing.T) {
	if len(domain.SharedSteps) != 2 {
		t.Fatalf("expected 2 shared steps, got %d", len(domain.SharedSteps))
	}
	if domain.SharedSteps[0] != domain.StepCategory {
		t.Fatalf("expected first shared step to be %q, got %q", domain.StepCategory, domain.SharedSteps[0])
	}
	if domain.SharedSteps[1] != domain.StepBrand {
		t.Fatalf("expected second shared step to be %q, got %q", domain.StepBrand, domain.SharedSteps[1])
	}
}

func TestPerProductStepsAreRemainingSevenSteps(t *testing.T) {
	if len(domain.PerProductSteps) != 7 {
		t.Fatalf("expected 7 per-product steps, got %d", len(domain.PerProductSteps))
	}
	if domain.PerProductSteps[0] != domain.StepProduct {
		t.Fatalf("expected first per-product step to be %q, got %q", domain.StepProduct, domain.PerProductSteps[0])
	}
	if domain.PerProductSteps[6] != domain.StepActivate {
		t.Fatalf("expected last per-product step to be %q, got %q", domain.StepActivate, domain.PerProductSteps[6])
	}
}

func TestPublicationBatchDefaults(t *testing.T) {
	b := domain.PublicationBatch{
		BatchID:     "batch_1",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		Status:      domain.BatchStatusPending,
	}
	if b.Status != "pending" {
		t.Fatalf("expected status pending, got %q", b.Status)
	}
	if b.CompletedAt != nil {
		t.Fatalf("expected completed_at to be nil for pending batch")
	}
}

func TestVTEXEntityMappingEntityTypes(t *testing.T) {
	types := []string{
		domain.EntityTypeCategory,
		domain.EntityTypeBrand,
		domain.EntityTypeProduct,
		domain.EntityTypeSKU,
	}
	if len(types) != 4 {
		t.Fatalf("expected 4 entity types, got %d", len(types))
	}
}

func TestVTEXErrorTypesAreDefined(t *testing.T) {
	if domain.ErrVTEXValidation == nil {
		t.Fatal("ErrVTEXValidation must not be nil")
	}
	if domain.ErrVTEXNotFound == nil {
		t.Fatal("ErrVTEXNotFound must not be nil")
	}
	if domain.ErrVTEXTransient == nil {
		t.Fatal("ErrVTEXTransient must not be nil")
	}
	if domain.ErrVTEXAuth == nil {
		t.Fatal("ErrVTEXAuth must not be nil")
	}
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/server_core && go test ./tests/unit/ -run TestOrderedSteps -v && go test ./tests/unit/ -run TestSharedSteps -v && go test ./tests/unit/ -run TestPerProductSteps -v && go test ./tests/unit/ -run TestPublicationBatch -v && go test ./tests/unit/ -run TestVTEXEntityMapping -v && go test ./tests/unit/ -run TestVTEXErrorTypes -v`

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/internal/modules/connectors/domain/ apps/server_core/internal/modules/connectors/events/ apps/server_core/internal/modules/connectors/readmodel/ apps/server_core/tests/unit/connectors_domain_test.go
git commit -m "feat(connectors): add domain entities for VTEX publication pipeline"
```

---

## Task 2: Port Interfaces

**Files:**
- Create: `apps/server_core/internal/modules/connectors/ports/repository.go`
- Create: `apps/server_core/internal/modules/connectors/ports/vtex_catalog.go`

- [ ] **Step 1: Create ConnectorsRepository port**

Create `apps/server_core/internal/modules/connectors/ports/repository.go`:

```go
package ports

import (
	"context"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
)

type Repository interface {
	// Batch operations
	SaveBatch(ctx context.Context, batch domain.PublicationBatch) error
	GetBatch(ctx context.Context, tenantID, batchID string) (domain.PublicationBatch, error)
	UpdateBatchStatus(ctx context.Context, tenantID, batchID, status string, succeededCount, failedCount int) error

	// Operation operations
	SaveOperation(ctx context.Context, op domain.PublicationOperation) error
	ListOperationsByBatch(ctx context.Context, tenantID, batchID string) ([]domain.PublicationOperation, error)
	UpdateOperationStatus(ctx context.Context, tenantID, operationID, status, currentStep, errorCode, errorMessage string) error
	HasActiveOperation(ctx context.Context, tenantID, vtexAccount, productID string) (bool, error)

	// Step result operations
	SaveStepResult(ctx context.Context, result domain.PipelineStepResult) error
	UpdateStepResult(ctx context.Context, tenantID, stepResultID, status string, vtexEntityID *string, errorCode, errorMessage string) error
	ListStepResultsByOperation(ctx context.Context, tenantID, operationID string) ([]domain.PipelineStepResult, error)

	// Entity mapping operations
	FindMapping(ctx context.Context, tenantID, vtexAccount, entityType, localID string) (*domain.VTEXEntityMapping, error)
	SaveMapping(ctx context.Context, mapping domain.VTEXEntityMapping) error
}
```

- [ ] **Step 2: Create VTEXCatalogPort**

Create `apps/server_core/internal/modules/connectors/ports/vtex_catalog.go`:

```go
package ports

import "context"

type CategoryParams struct {
	VTEXAccount  string
	CategoryName string
	LocalID      string
}

type BrandParams struct {
	VTEXAccount string
	BrandName   string
	LocalID     string
}

type ProductParams struct {
	VTEXAccount    string
	VTEXCategoryID string
	VTEXBrandID    string
	Name           string
	Description    string
	LocalID        string
}

type SKUParams struct {
	VTEXAccount   string
	VTEXProductID string
	Name          string
	EAN           string
	LocalID       string
}

type SpecsImagesParams struct {
	VTEXAccount string
	VTEXSKUID   string
	ImageURLs   []string
	Specs       map[string]string
}

type TradePolicyParams struct {
	VTEXAccount   string
	VTEXProductID string
	TradePolicyID string
}

type PriceParams struct {
	VTEXAccount   string
	VTEXSKUID     string
	BasePrice     float64
	TradePolicyID string
}

type StockParams struct {
	VTEXAccount string
	VTEXSKUID   string
	WarehouseID string
	Quantity    int
}

type ActivateParams struct {
	VTEXAccount   string
	VTEXProductID string
	VTEXSKUID     string
}

type ProductData struct {
	VTEXID string
	Name   string
	Active bool
}

type SKUData struct {
	VTEXID    string
	Name      string
	EAN       string
	Active    bool
	ProductID string
}

type CategoryData struct {
	VTEXID string
	Name   string
}

type BrandData struct {
	VTEXID string
	Name   string
}

type VTEXCatalogPort interface {
	FindOrCreateCategory(ctx context.Context, params CategoryParams) (vtexID string, err error)
	FindOrCreateBrand(ctx context.Context, params BrandParams) (vtexID string, err error)

	CreateProduct(ctx context.Context, params ProductParams) (vtexID string, err error)
	CreateSKU(ctx context.Context, params SKUParams) (vtexID string, err error)
	AttachSpecsAndImages(ctx context.Context, params SpecsImagesParams) error
	AssociateTradePolicy(ctx context.Context, params TradePolicyParams) error
	SetPrice(ctx context.Context, params PriceParams) error
	SetStock(ctx context.Context, params StockParams) error
	ActivateProduct(ctx context.Context, params ActivateParams) error

	GetProduct(ctx context.Context, vtexAccount, vtexID string) (ProductData, error)
	GetSKU(ctx context.Context, vtexAccount, vtexID string) (SKUData, error)
	GetCategory(ctx context.Context, vtexAccount, vtexID string) (CategoryData, error)
	GetBrand(ctx context.Context, vtexAccount, vtexID string) (BrandData, error)
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/server_core && go build ./internal/modules/connectors/...`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/internal/modules/connectors/ports/
git commit -m "feat(connectors): add port interfaces for repository and VTEX catalog"
```

---

## Task 3: Database Migration

**Files:**
- Create: `apps/server_core/migrations/0005_connectors.sql`

- [ ] **Step 1: Write migration SQL**

Create `apps/server_core/migrations/0005_connectors.sql`:

```sql
-- Publication batches: one per user-triggered publish action
CREATE TABLE IF NOT EXISTS publication_batches (
  batch_id         text PRIMARY KEY,
  tenant_id        text NOT NULL,
  vtex_account     text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  total_products   integer NOT NULL DEFAULT 0,
  succeeded_count  integer NOT NULL DEFAULT 0,
  failed_count     integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

-- Publication operations: one per product in a batch
CREATE TABLE IF NOT EXISTS publication_operations (
  operation_id  text PRIMARY KEY,
  batch_id      text NOT NULL REFERENCES publication_batches(batch_id),
  tenant_id     text NOT NULL,
  vtex_account  text NOT NULL,
  product_id    text NOT NULL,
  current_step  text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'pending',
  error_code    text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate active operations for the same product+account
CREATE UNIQUE INDEX IF NOT EXISTS idx_publication_operations_active
  ON publication_operations (tenant_id, vtex_account, product_id)
  WHERE status IN ('pending', 'in_progress');

-- Pipeline step results: one per step per operation
CREATE TABLE IF NOT EXISTS pipeline_step_results (
  step_result_id text PRIMARY KEY,
  operation_id   text NOT NULL REFERENCES publication_operations(operation_id),
  tenant_id      text NOT NULL,
  step_name      text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  vtex_entity_id text,
  attempt_count  integer NOT NULL DEFAULT 0,
  error_code     text NOT NULL DEFAULT '',
  error_message  text NOT NULL DEFAULT '',
  started_at     timestamptz,
  completed_at   timestamptz
);

-- VTEX entity mappings: durable local_id <-> vtex_id per account
CREATE TABLE IF NOT EXISTS vtex_entity_mappings (
  mapping_id   text PRIMARY KEY,
  tenant_id    text NOT NULL,
  vtex_account text NOT NULL,
  entity_type  text NOT NULL,
  local_id     text NOT NULL,
  vtex_id      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vtex_account, entity_type, local_id)
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/server_core/migrations/0005_connectors.sql
git commit -m "feat(connectors): add migration for publication pipeline tables"
```

---

## Task 4: Postgres Repository Adapter

**Files:**
- Create: `apps/server_core/internal/modules/connectors/adapters/postgres/repository.go`

- [ ] **Step 1: Write the postgres repository**

Create `apps/server_core/internal/modules/connectors/adapters/postgres/repository.go`:

```go
package postgres

import (
	"context"
	"errors"
	"time"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	"marketplace-central/apps/server_core/internal/modules/connectors/ports"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var _ ports.Repository = (*Repository)(nil)

type Repository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewRepository(pool *pgxpool.Pool, tenantID string) *Repository {
	return &Repository{pool: pool, tenantID: tenantID}
}

func (r *Repository) SaveBatch(ctx context.Context, batch domain.PublicationBatch) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO publication_batches
		 (batch_id, tenant_id, vtex_account, status, total_products, succeeded_count, failed_count, created_at, completed_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (batch_id) DO NOTHING`,
		batch.BatchID, r.tenantID, batch.VTEXAccount, batch.Status,
		batch.TotalProducts, batch.SucceededCount, batch.FailedCount,
		batch.CreatedAt, batch.CompletedAt,
	)
	return err
}

func (r *Repository) GetBatch(ctx context.Context, tenantID, batchID string) (domain.PublicationBatch, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT batch_id, tenant_id, vtex_account, status, total_products,
		        succeeded_count, failed_count, created_at, completed_at
		 FROM publication_batches
		 WHERE tenant_id = $1 AND batch_id = $2`,
		r.tenantID, batchID,
	)
	var b domain.PublicationBatch
	err := row.Scan(
		&b.BatchID, &b.TenantID, &b.VTEXAccount, &b.Status,
		&b.TotalProducts, &b.SucceededCount, &b.FailedCount,
		&b.CreatedAt, &b.CompletedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.PublicationBatch{}, errors.New("CONNECTORS_BATCH_NOT_FOUND")
	}
	return b, err
}

func (r *Repository) UpdateBatchStatus(ctx context.Context, tenantID, batchID, status string, succeededCount, failedCount int) error {
	now := time.Now()
	var completedAt *time.Time
	if status == domain.BatchStatusCompleted || status == domain.BatchStatusFailed {
		completedAt = &now
	}
	_, err := r.pool.Exec(ctx,
		`UPDATE publication_batches
		 SET status = $3, succeeded_count = $4, failed_count = $5, completed_at = $6
		 WHERE tenant_id = $1 AND batch_id = $2`,
		r.tenantID, batchID, status, succeededCount, failedCount, completedAt,
	)
	return err
}

func (r *Repository) SaveOperation(ctx context.Context, op domain.PublicationOperation) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO publication_operations
		 (operation_id, batch_id, tenant_id, vtex_account, product_id, current_step, status, error_code, error_message, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 ON CONFLICT (operation_id) DO NOTHING`,
		op.OperationID, op.BatchID, r.tenantID, op.VTEXAccount,
		op.ProductID, op.CurrentStep, op.Status,
		op.ErrorCode, op.ErrorMessage, op.CreatedAt, op.UpdatedAt,
	)
	return err
}

func (r *Repository) ListOperationsByBatch(ctx context.Context, tenantID, batchID string) ([]domain.PublicationOperation, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT operation_id, batch_id, tenant_id, vtex_account, product_id,
		        current_step, status, error_code, error_message, created_at, updated_at
		 FROM publication_operations
		 WHERE tenant_id = $1 AND batch_id = $2
		 ORDER BY created_at`,
		r.tenantID, batchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ops []domain.PublicationOperation
	for rows.Next() {
		var op domain.PublicationOperation
		if err := rows.Scan(
			&op.OperationID, &op.BatchID, &op.TenantID, &op.VTEXAccount,
			&op.ProductID, &op.CurrentStep, &op.Status,
			&op.ErrorCode, &op.ErrorMessage, &op.CreatedAt, &op.UpdatedAt,
		); err != nil {
			return nil, err
		}
		ops = append(ops, op)
	}
	return ops, rows.Err()
}

func (r *Repository) UpdateOperationStatus(ctx context.Context, tenantID, operationID, status, currentStep, errorCode, errorMessage string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE publication_operations
		 SET status = $3, current_step = $4, error_code = $5, error_message = $6, updated_at = now()
		 WHERE tenant_id = $1 AND operation_id = $2`,
		r.tenantID, operationID, status, currentStep, errorCode, errorMessage,
	)
	return err
}

func (r *Repository) HasActiveOperation(ctx context.Context, tenantID, vtexAccount, productID string) (bool, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT EXISTS(
		   SELECT 1 FROM publication_operations
		   WHERE tenant_id = $1 AND vtex_account = $2 AND product_id = $3
		   AND status IN ('pending', 'in_progress')
		 )`,
		r.tenantID, vtexAccount, productID,
	)
	var exists bool
	err := row.Scan(&exists)
	return exists, err
}

func (r *Repository) SaveStepResult(ctx context.Context, result domain.PipelineStepResult) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO pipeline_step_results
		 (step_result_id, operation_id, tenant_id, step_name, status,
		  vtex_entity_id, attempt_count, error_code, error_message, started_at, completed_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 ON CONFLICT (step_result_id) DO NOTHING`,
		result.StepResultID, result.OperationID, r.tenantID,
		result.StepName, result.Status, result.VTEXEntityID,
		result.AttemptCount, result.ErrorCode, result.ErrorMessage,
		result.StartedAt, result.CompletedAt,
	)
	return err
}

func (r *Repository) UpdateStepResult(ctx context.Context, tenantID, stepResultID, status string, vtexEntityID *string, errorCode, errorMessage string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE pipeline_step_results
		 SET status = $3, vtex_entity_id = $4, error_code = $5, error_message = $6,
		     attempt_count = attempt_count + 1, completed_at = now()
		 WHERE tenant_id = $1 AND step_result_id = $2`,
		r.tenantID, stepResultID, status, vtexEntityID, errorCode, errorMessage,
	)
	return err
}

func (r *Repository) ListStepResultsByOperation(ctx context.Context, tenantID, operationID string) ([]domain.PipelineStepResult, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT step_result_id, operation_id, tenant_id, step_name, status,
		        vtex_entity_id, attempt_count, error_code, error_message, started_at, completed_at
		 FROM pipeline_step_results
		 WHERE tenant_id = $1 AND operation_id = $2
		 ORDER BY started_at`,
		r.tenantID, operationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []domain.PipelineStepResult
	for rows.Next() {
		var r domain.PipelineStepResult
		if err := rows.Scan(
			&r.StepResultID, &r.OperationID, &r.TenantID, &r.StepName, &r.Status,
			&r.VTEXEntityID, &r.AttemptCount, &r.ErrorCode, &r.ErrorMessage,
			&r.StartedAt, &r.CompletedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

func (r *Repository) FindMapping(ctx context.Context, tenantID, vtexAccount, entityType, localID string) (*domain.VTEXEntityMapping, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT mapping_id, tenant_id, vtex_account, entity_type, local_id, vtex_id, created_at, updated_at
		 FROM vtex_entity_mappings
		 WHERE tenant_id = $1 AND vtex_account = $2 AND entity_type = $3 AND local_id = $4`,
		r.tenantID, vtexAccount, entityType, localID,
	)
	var m domain.VTEXEntityMapping
	err := row.Scan(
		&m.MappingID, &m.TenantID, &m.VTEXAccount, &m.EntityType,
		&m.LocalID, &m.VTEXID, &m.CreatedAt, &m.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) SaveMapping(ctx context.Context, mapping domain.VTEXEntityMapping) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO vtex_entity_mappings
		 (mapping_id, tenant_id, vtex_account, entity_type, local_id, vtex_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (tenant_id, vtex_account, entity_type, local_id)
		 DO UPDATE SET vtex_id = EXCLUDED.vtex_id, updated_at = EXCLUDED.updated_at`,
		mapping.MappingID, r.tenantID, mapping.VTEXAccount,
		mapping.EntityType, mapping.LocalID, mapping.VTEXID,
		mapping.CreatedAt, mapping.UpdatedAt,
	)
	return err
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/server_core && go build ./internal/modules/connectors/...`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/modules/connectors/adapters/postgres/
git commit -m "feat(connectors): add postgres repository adapter"
```

---

## Task 5: Stub VTEX Adapter

**Files:**
- Create: `apps/server_core/internal/modules/connectors/adapters/vtex/stub/adapter.go`

- [ ] **Step 1: Write the stub adapter**

Create `apps/server_core/internal/modules/connectors/adapters/vtex/stub/adapter.go`:

```go
package stub

import (
	"context"
	"fmt"
	"sync/atomic"

	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

var _ ports.VTEXCatalogPort = (*Adapter)(nil)

type Adapter struct {
	counter atomic.Int64
}

func NewAdapter() *Adapter {
	return &Adapter{}
}

func (a *Adapter) nextID(prefix string) string {
	n := a.counter.Add(1)
	return fmt.Sprintf("%s_stub_%d", prefix, n)
}

func (a *Adapter) FindOrCreateCategory(_ context.Context, params ports.CategoryParams) (string, error) {
	return a.nextID("cat"), nil
}

func (a *Adapter) FindOrCreateBrand(_ context.Context, params ports.BrandParams) (string, error) {
	return a.nextID("brand"), nil
}

func (a *Adapter) CreateProduct(_ context.Context, params ports.ProductParams) (string, error) {
	return a.nextID("prod"), nil
}

func (a *Adapter) CreateSKU(_ context.Context, params ports.SKUParams) (string, error) {
	return a.nextID("sku"), nil
}

func (a *Adapter) AttachSpecsAndImages(_ context.Context, params ports.SpecsImagesParams) error {
	return nil
}

func (a *Adapter) AssociateTradePolicy(_ context.Context, params ports.TradePolicyParams) error {
	return nil
}

func (a *Adapter) SetPrice(_ context.Context, params ports.PriceParams) error {
	return nil
}

func (a *Adapter) SetStock(_ context.Context, params ports.StockParams) error {
	return nil
}

func (a *Adapter) ActivateProduct(_ context.Context, params ports.ActivateParams) error {
	return nil
}

func (a *Adapter) GetProduct(_ context.Context, vtexAccount, vtexID string) (ports.ProductData, error) {
	return ports.ProductData{VTEXID: vtexID, Name: "Stub Product", Active: true}, nil
}

func (a *Adapter) GetSKU(_ context.Context, vtexAccount, vtexID string) (ports.SKUData, error) {
	return ports.SKUData{VTEXID: vtexID, Name: "Stub SKU", EAN: "7891234567890", Active: true}, nil
}

func (a *Adapter) GetCategory(_ context.Context, vtexAccount, vtexID string) (ports.CategoryData, error) {
	return ports.CategoryData{VTEXID: vtexID, Name: "Stub Category"}, nil
}

func (a *Adapter) GetBrand(_ context.Context, vtexAccount, vtexID string) (ports.BrandData, error) {
	return ports.BrandData{VTEXID: vtexID, Name: "Stub Brand"}, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/server_core && go build ./internal/modules/connectors/...`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/modules/connectors/adapters/vtex/
git commit -m "feat(connectors): add stubbed VTEX catalog adapter"
```

---

## Task 6: PipelineExecutor

**Files:**
- Create: `apps/server_core/internal/modules/connectors/application/executor.go`
- Test: `apps/server_core/tests/unit/connectors_executor_test.go`

- [ ] **Step 1: Write the failing test for happy-path execution**

Create `apps/server_core/tests/unit/connectors_executor_test.go`:

```go
package unit

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

// --- Test stubs ---

type vtexCatalogStub struct {
	counter    atomic.Int64
	failOnStep string // step name to fail on, empty = no failure
	failError  error  // error to return on failure
}

func (s *vtexCatalogStub) nextID(prefix string) string {
	n := s.counter.Add(1)
	return fmt.Sprintf("%s_test_%d", prefix, n)
}
func (s *vtexCatalogStub) FindOrCreateCategory(_ context.Context, p ports.CategoryParams) (string, error) {
	return s.nextID("cat"), nil
}
func (s *vtexCatalogStub) FindOrCreateBrand(_ context.Context, p ports.BrandParams) (string, error) {
	return s.nextID("brand"), nil
}
func (s *vtexCatalogStub) CreateProduct(_ context.Context, p ports.ProductParams) (string, error) {
	if s.failOnStep == domain.StepProduct {
		return "", s.failError
	}
	return s.nextID("prod"), nil
}
func (s *vtexCatalogStub) CreateSKU(_ context.Context, p ports.SKUParams) (string, error) {
	if s.failOnStep == domain.StepSKU {
		return "", s.failError
	}
	return s.nextID("sku"), nil
}
func (s *vtexCatalogStub) AttachSpecsAndImages(_ context.Context, p ports.SpecsImagesParams) error {
	if s.failOnStep == domain.StepSpecsImages {
		return s.failError
	}
	return nil
}
func (s *vtexCatalogStub) AssociateTradePolicy(_ context.Context, p ports.TradePolicyParams) error {
	if s.failOnStep == domain.StepTradePolicy {
		return s.failError
	}
	return nil
}
func (s *vtexCatalogStub) SetPrice(_ context.Context, p ports.PriceParams) error {
	if s.failOnStep == domain.StepPrice {
		return s.failError
	}
	return nil
}
func (s *vtexCatalogStub) SetStock(_ context.Context, p ports.StockParams) error {
	if s.failOnStep == domain.StepStock {
		return s.failError
	}
	return nil
}
func (s *vtexCatalogStub) ActivateProduct(_ context.Context, p ports.ActivateParams) error {
	if s.failOnStep == domain.StepActivate {
		return s.failError
	}
	return nil
}
func (s *vtexCatalogStub) GetProduct(_ context.Context, a, id string) (ports.ProductData, error) {
	return ports.ProductData{}, nil
}
func (s *vtexCatalogStub) GetSKU(_ context.Context, a, id string) (ports.SKUData, error) {
	return ports.SKUData{}, nil
}
func (s *vtexCatalogStub) GetCategory(_ context.Context, a, id string) (ports.CategoryData, error) {
	return ports.CategoryData{}, nil
}
func (s *vtexCatalogStub) GetBrand(_ context.Context, a, id string) (ports.BrandData, error) {
	return ports.BrandData{}, nil
}

type connectorsRepoStub struct {
	operations map[string]domain.PublicationOperation
	steps      map[string][]domain.PipelineStepResult
	mappings   map[string]*domain.VTEXEntityMapping // key: "account|type|localID"
	batches    map[string]domain.PublicationBatch
}

func newConnectorsRepoStub() *connectorsRepoStub {
	return &connectorsRepoStub{
		operations: make(map[string]domain.PublicationOperation),
		steps:      make(map[string][]domain.PipelineStepResult),
		mappings:   make(map[string]*domain.VTEXEntityMapping),
		batches:    make(map[string]domain.PublicationBatch),
	}
}

func (s *connectorsRepoStub) SaveBatch(_ context.Context, b domain.PublicationBatch) error {
	s.batches[b.BatchID] = b
	return nil
}
func (s *connectorsRepoStub) GetBatch(_ context.Context, tenantID, batchID string) (domain.PublicationBatch, error) {
	b, ok := s.batches[batchID]
	if !ok {
		return domain.PublicationBatch{}, fmt.Errorf("CONNECTORS_BATCH_NOT_FOUND")
	}
	return b, nil
}
func (s *connectorsRepoStub) UpdateBatchStatus(_ context.Context, tenantID, batchID, status string, succeeded, failed int) error {
	b := s.batches[batchID]
	b.Status = status
	b.SucceededCount = succeeded
	b.FailedCount = failed
	if status == domain.BatchStatusCompleted || status == domain.BatchStatusFailed {
		now := time.Now()
		b.CompletedAt = &now
	}
	s.batches[batchID] = b
	return nil
}
func (s *connectorsRepoStub) SaveOperation(_ context.Context, op domain.PublicationOperation) error {
	s.operations[op.OperationID] = op
	return nil
}
func (s *connectorsRepoStub) ListOperationsByBatch(_ context.Context, tenantID, batchID string) ([]domain.PublicationOperation, error) {
	var ops []domain.PublicationOperation
	for _, op := range s.operations {
		if op.BatchID == batchID {
			ops = append(ops, op)
		}
	}
	return ops, nil
}
func (s *connectorsRepoStub) UpdateOperationStatus(_ context.Context, tenantID, opID, status, step, code, msg string) error {
	op := s.operations[opID]
	op.Status = status
	op.CurrentStep = step
	op.ErrorCode = code
	op.ErrorMessage = msg
	s.operations[opID] = op
	return nil
}
func (s *connectorsRepoStub) HasActiveOperation(_ context.Context, tenantID, vtexAccount, productID string) (bool, error) {
	for _, op := range s.operations {
		if op.VTEXAccount == vtexAccount && op.ProductID == productID &&
			(op.Status == domain.OperationStatusPending || op.Status == domain.OperationStatusInProgress) {
			return true, nil
		}
	}
	return false, nil
}
func (s *connectorsRepoStub) SaveStepResult(_ context.Context, r domain.PipelineStepResult) error {
	s.steps[r.OperationID] = append(s.steps[r.OperationID], r)
	return nil
}
func (s *connectorsRepoStub) UpdateStepResult(_ context.Context, tenantID, stepResultID, status string, vtexEntityID *string, errorCode, errorMessage string) error {
	for opID, results := range s.steps {
		for i, r := range results {
			if r.StepResultID == stepResultID {
				results[i].Status = status
				results[i].VTEXEntityID = vtexEntityID
				results[i].ErrorCode = errorCode
				results[i].ErrorMessage = errorMessage
				results[i].AttemptCount++
				now := time.Now()
				results[i].CompletedAt = &now
				s.steps[opID] = results
				return nil
			}
		}
	}
	return nil
}
func (s *connectorsRepoStub) ListStepResultsByOperation(_ context.Context, tenantID, opID string) ([]domain.PipelineStepResult, error) {
	return s.steps[opID], nil
}
func (s *connectorsRepoStub) FindMapping(_ context.Context, tenantID, vtexAccount, entityType, localID string) (*domain.VTEXEntityMapping, error) {
	key := vtexAccount + "|" + entityType + "|" + localID
	return s.mappings[key], nil
}
func (s *connectorsRepoStub) SaveMapping(_ context.Context, m domain.VTEXEntityMapping) error {
	key := m.VTEXAccount + "|" + m.EntityType + "|" + m.LocalID
	s.mappings[key] = &m
	return nil
}

// --- Tests ---

func TestPipelineExecutorHappyPath(t *testing.T) {
	// This test will fail until PipelineExecutor is implemented
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	// Pre-resolve shared resources (category + brand mappings)
	resolvedMappings := map[string]string{
		"category": "cat_vtex_1",
		"brand":    "brand_vtex_1",
	}

	op := domain.PublicationOperation{
		OperationID: "op_1",
		BatchID:     "batch_1",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		ProductID:   "prod_local_1",
		Status:      domain.OperationStatusPending,
	}

	productData := ProductPublishData{
		Name:          "Test Product",
		Description:   "A test product",
		SKUName:       "Test SKU",
		EAN:           "7891234567890",
		ImageURLs:     []string{"https://example.com/img.jpg"},
		Specs:         map[string]string{"color": "red"},
		TradePolicyID: "1",
		BasePrice:     99.90,
		WarehouseID:   "warehouse_1",
		StockQuantity: 10,
		CategoryID:    "cat_local_1",
		BrandID:       "brand_local_1",
	}

	executor := NewPipelineExecutor(repo, vtex)
	err := executor.Execute(context.Background(), op, productData, resolvedMappings)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	// Verify operation ended as succeeded
	finalOp := repo.operations["op_1"]
	if finalOp.Status != domain.OperationStatusSucceeded {
		t.Fatalf("expected operation status %q, got %q", domain.OperationStatusSucceeded, finalOp.Status)
	}
	if finalOp.CurrentStep != domain.StepActivate {
		t.Fatalf("expected current step %q, got %q", domain.StepActivate, finalOp.CurrentStep)
	}

	// Verify all 7 per-product step results were created
	steps := repo.steps["op_1"]
	if len(steps) != 7 {
		t.Fatalf("expected 7 step results, got %d", len(steps))
	}

	// Verify product and SKU mappings were saved
	prodMapping := repo.mappings["mystore|product|prod_local_1"]
	if prodMapping == nil {
		t.Fatal("expected product mapping to be saved")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server_core && go test ./tests/unit/ -run TestPipelineExecutorHappyPath -v`

Expected: FAIL — `NewPipelineExecutor` and `ProductPublishData` not defined.

- [ ] **Step 3: Write PipelineExecutor implementation**

Create `apps/server_core/internal/modules/connectors/application/executor.go`:

```go
package application

import (
	"context"
	"errors"
	"fmt"
	"time"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

type ProductPublishData struct {
	Name          string
	Description   string
	SKUName       string
	EAN           string
	ImageURLs     []string
	Specs         map[string]string
	TradePolicyID string
	BasePrice     float64
	WarehouseID   string
	StockQuantity int
	CategoryID    string
	BrandID       string
}

type PipelineExecutor struct {
	repo ports.Repository
	vtex ports.VTEXCatalogPort
}

func NewPipelineExecutor(repo ports.Repository, vtex ports.VTEXCatalogPort) *PipelineExecutor {
	return &PipelineExecutor{repo: repo, vtex: vtex}
}

// Execute runs per-product steps 3-9. resolvedMappings contains VTEX IDs
// for shared resources keyed by entity type ("category" -> vtexID, "brand" -> vtexID).
func (e *PipelineExecutor) Execute(
	ctx context.Context,
	op domain.PublicationOperation,
	data ProductPublishData,
	resolvedMappings map[string]string,
) error {
	if err := e.repo.UpdateOperationStatus(ctx, op.TenantID, op.OperationID,
		domain.OperationStatusInProgress, domain.StepProduct, "", ""); err != nil {
		return err
	}

	vtexCategoryID := resolvedMappings[domain.EntityTypeCategory]
	vtexBrandID := resolvedMappings[domain.EntityTypeBrand]
	var vtexProductID, vtexSKUID string

	for _, step := range domain.PerProductSteps {
		stepResultID := fmt.Sprintf("%s_%s", op.OperationID, step)
		now := time.Now()
		result := domain.PipelineStepResult{
			StepResultID: stepResultID,
			OperationID:  op.OperationID,
			TenantID:     op.TenantID,
			StepName:     step,
			Status:       domain.StepStatusInProgress,
			AttemptCount: 1,
			StartedAt:    &now,
		}
		if err := e.repo.SaveStepResult(ctx, result); err != nil {
			return err
		}

		if err := e.repo.UpdateOperationStatus(ctx, op.TenantID, op.OperationID,
			domain.OperationStatusInProgress, step, "", ""); err != nil {
			return err
		}

		vtexID, stepErr := e.executeStep(ctx, step, op, data, vtexCategoryID, vtexBrandID, vtexProductID, vtexSKUID)

		if stepErr != nil {
			errCode := classifyError(stepErr)
			completedAt := time.Now()
			result.Status = domain.StepStatusFailed
			result.ErrorCode = errCode
			result.ErrorMessage = stepErr.Error()
			result.CompletedAt = &completedAt

			_ = e.repo.UpdateStepResult(ctx, op.TenantID, stepResultID,
				domain.StepStatusFailed, nil, errCode, stepErr.Error())
			_ = e.repo.UpdateOperationStatus(ctx, op.TenantID, op.OperationID,
				domain.OperationStatusFailed, step, errCode, stepErr.Error())
			return nil // pipeline halted, not a system error
		}

		completedAt := time.Now()
		_ = e.repo.UpdateStepResult(ctx, op.TenantID, stepResultID,
			domain.StepStatusSucceeded, vtexID, "", "")
		_ = &completedAt

		// Track VTEX IDs for subsequent steps
		switch step {
		case domain.StepProduct:
			if vtexID != nil {
				vtexProductID = *vtexID
				_ = e.repo.SaveMapping(ctx, domain.VTEXEntityMapping{
					MappingID:   fmt.Sprintf("map_%s_%s", op.OperationID, step),
					TenantID:    op.TenantID,
					VTEXAccount: op.VTEXAccount,
					EntityType:  domain.EntityTypeProduct,
					LocalID:     op.ProductID,
					VTEXID:      vtexProductID,
					CreatedAt:   time.Now(),
					UpdatedAt:   time.Now(),
				})
			}
		case domain.StepSKU:
			if vtexID != nil {
				vtexSKUID = *vtexID
				_ = e.repo.SaveMapping(ctx, domain.VTEXEntityMapping{
					MappingID:   fmt.Sprintf("map_%s_%s", op.OperationID, step),
					TenantID:    op.TenantID,
					VTEXAccount: op.VTEXAccount,
					EntityType:  domain.EntityTypeSKU,
					LocalID:     data.EAN,
					VTEXID:      vtexSKUID,
					CreatedAt:   time.Now(),
					UpdatedAt:   time.Now(),
				})
			}
		}
	}

	_ = e.repo.UpdateOperationStatus(ctx, op.TenantID, op.OperationID,
		domain.OperationStatusSucceeded, domain.StepActivate, "", "")
	return nil
}

func (e *PipelineExecutor) executeStep(
	ctx context.Context,
	step string,
	op domain.PublicationOperation,
	data ProductPublishData,
	vtexCategoryID, vtexBrandID, vtexProductID, vtexSKUID string,
) (*string, error) {
	switch step {
	case domain.StepProduct:
		// Check existing mapping first (reconciliation)
		existing, err := e.repo.FindMapping(ctx, op.TenantID, op.VTEXAccount, domain.EntityTypeProduct, op.ProductID)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			return &existing.VTEXID, nil
		}
		id, err := e.vtex.CreateProduct(ctx, ports.ProductParams{
			VTEXAccount:    op.VTEXAccount,
			VTEXCategoryID: vtexCategoryID,
			VTEXBrandID:    vtexBrandID,
			Name:           data.Name,
			Description:    data.Description,
			LocalID:        op.ProductID,
		})
		if err != nil {
			return nil, err
		}
		return &id, nil

	case domain.StepSKU:
		existing, err := e.repo.FindMapping(ctx, op.TenantID, op.VTEXAccount, domain.EntityTypeSKU, data.EAN)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			return &existing.VTEXID, nil
		}
		id, err := e.vtex.CreateSKU(ctx, ports.SKUParams{
			VTEXAccount:   op.VTEXAccount,
			VTEXProductID: vtexProductID,
			Name:          data.SKUName,
			EAN:           data.EAN,
			LocalID:       data.EAN,
		})
		if err != nil {
			return nil, err
		}
		return &id, nil

	case domain.StepSpecsImages:
		err := e.vtex.AttachSpecsAndImages(ctx, ports.SpecsImagesParams{
			VTEXAccount: op.VTEXAccount,
			VTEXSKUID:   vtexSKUID,
			ImageURLs:   data.ImageURLs,
			Specs:       data.Specs,
		})
		return nil, err

	case domain.StepTradePolicy:
		err := e.vtex.AssociateTradePolicy(ctx, ports.TradePolicyParams{
			VTEXAccount:   op.VTEXAccount,
			VTEXProductID: vtexProductID,
			TradePolicyID: data.TradePolicyID,
		})
		return nil, err

	case domain.StepPrice:
		err := e.vtex.SetPrice(ctx, ports.PriceParams{
			VTEXAccount:   op.VTEXAccount,
			VTEXSKUID:     vtexSKUID,
			BasePrice:     data.BasePrice,
			TradePolicyID: data.TradePolicyID,
		})
		return nil, err

	case domain.StepStock:
		err := e.vtex.SetStock(ctx, ports.StockParams{
			VTEXAccount: op.VTEXAccount,
			VTEXSKUID:   vtexSKUID,
			WarehouseID: data.WarehouseID,
			Quantity:    data.StockQuantity,
		})
		return nil, err

	case domain.StepActivate:
		err := e.vtex.ActivateProduct(ctx, ports.ActivateParams{
			VTEXAccount:   op.VTEXAccount,
			VTEXProductID: vtexProductID,
			VTEXSKUID:     vtexSKUID,
		})
		return nil, err

	default:
		return nil, fmt.Errorf("CONNECTORS_EXECUTOR_UNKNOWN_STEP: %s", step)
	}
}

func classifyError(err error) string {
	switch {
	case errors.Is(err, domain.ErrVTEXValidation):
		return "CONNECTORS_VTEX_VALIDATION"
	case errors.Is(err, domain.ErrVTEXNotFound):
		return "CONNECTORS_VTEX_NOT_FOUND"
	case errors.Is(err, domain.ErrVTEXTransient):
		return "CONNECTORS_VTEX_TRANSIENT"
	case errors.Is(err, domain.ErrVTEXAuth):
		return "CONNECTORS_VTEX_AUTH"
	default:
		return "CONNECTORS_EXECUTOR_INTERNAL"
	}
}
```

- [ ] **Step 4: Update the test file imports**

Update `apps/server_core/tests/unit/connectors_executor_test.go` — add the import for the application package and use its types:

Replace the import block and type references at the top of the test:

```go
package unit

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	app "marketplace-central/apps/server_core/internal/modules/connectors/application"
	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)
```

And update the test function to use the application types:

```go
func TestPipelineExecutorHappyPath(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	resolvedMappings := map[string]string{
		"category": "cat_vtex_1",
		"brand":    "brand_vtex_1",
	}

	op := domain.PublicationOperation{
		OperationID: "op_1",
		BatchID:     "batch_1",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		ProductID:   "prod_local_1",
		Status:      domain.OperationStatusPending,
	}

	productData := app.ProductPublishData{
		Name:          "Test Product",
		Description:   "A test product",
		SKUName:       "Test SKU",
		EAN:           "7891234567890",
		ImageURLs:     []string{"https://example.com/img.jpg"},
		Specs:         map[string]string{"color": "red"},
		TradePolicyID: "1",
		BasePrice:     99.90,
		WarehouseID:   "warehouse_1",
		StockQuantity: 10,
		CategoryID:    "cat_local_1",
		BrandID:       "brand_local_1",
	}

	executor := app.NewPipelineExecutor(repo, vtex)
	err := executor.Execute(context.Background(), op, productData, resolvedMappings)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	finalOp := repo.operations["op_1"]
	if finalOp.Status != domain.OperationStatusSucceeded {
		t.Fatalf("expected operation status %q, got %q", domain.OperationStatusSucceeded, finalOp.Status)
	}
	if finalOp.CurrentStep != domain.StepActivate {
		t.Fatalf("expected current step %q, got %q", domain.StepActivate, finalOp.CurrentStep)
	}

	steps := repo.steps["op_1"]
	if len(steps) != 7 {
		t.Fatalf("expected 7 step results, got %d", len(steps))
	}

	prodMapping := repo.mappings["mystore|product|prod_local_1"]
	if prodMapping == nil {
		t.Fatal("expected product mapping to be saved")
	}
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/server_core && go test ./tests/unit/ -run TestPipelineExecutorHappyPath -v`

Expected: PASS.

- [ ] **Step 6: Write test for pipeline halt on failure**

Add to `apps/server_core/tests/unit/connectors_executor_test.go`:

```go
func TestPipelineExecutorHaltsOnFailure(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{
		failOnStep: domain.StepSKU,
		failError:  fmt.Errorf("SKU creation failed: %w", domain.ErrVTEXValidation),
	}

	resolvedMappings := map[string]string{
		"category": "cat_vtex_1",
		"brand":    "brand_vtex_1",
	}

	op := domain.PublicationOperation{
		OperationID: "op_fail",
		BatchID:     "batch_1",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		ProductID:   "prod_local_1",
		Status:      domain.OperationStatusPending,
	}

	productData := app.ProductPublishData{
		Name:          "Test Product",
		Description:   "A test product",
		SKUName:       "Test SKU",
		EAN:           "7891234567890",
		ImageURLs:     []string{},
		Specs:         map[string]string{},
		TradePolicyID: "1",
		BasePrice:     99.90,
		WarehouseID:   "warehouse_1",
		StockQuantity: 10,
		CategoryID:    "cat_local_1",
		BrandID:       "brand_local_1",
	}

	executor := app.NewPipelineExecutor(repo, vtex)
	err := executor.Execute(context.Background(), op, productData, resolvedMappings)
	if err != nil {
		t.Fatalf("Execute should not return system error on step failure, got %v", err)
	}

	finalOp := repo.operations["op_fail"]
	if finalOp.Status != domain.OperationStatusFailed {
		t.Fatalf("expected operation status %q, got %q", domain.OperationStatusFailed, finalOp.Status)
	}
	if finalOp.CurrentStep != domain.StepSKU {
		t.Fatalf("expected current step %q, got %q", domain.StepSKU, finalOp.CurrentStep)
	}
	if finalOp.ErrorCode != "CONNECTORS_VTEX_VALIDATION" {
		t.Fatalf("expected error code CONNECTORS_VTEX_VALIDATION, got %q", finalOp.ErrorCode)
	}

	// Should have only 2 step results: product (succeeded) + sku (failed)
	steps := repo.steps["op_fail"]
	if len(steps) != 2 {
		t.Fatalf("expected 2 step results (pipeline halted), got %d", len(steps))
	}
}

func TestPipelineExecutorReconciliationSkipsCreate(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	// Pre-populate a product mapping (simulates previous successful sync)
	repo.mappings["mystore|product|prod_local_1"] = &domain.VTEXEntityMapping{
		MappingID:   "existing_map",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		EntityType:  domain.EntityTypeProduct,
		LocalID:     "prod_local_1",
		VTEXID:      "vtex_existing_prod",
	}

	resolvedMappings := map[string]string{
		"category": "cat_vtex_1",
		"brand":    "brand_vtex_1",
	}

	op := domain.PublicationOperation{
		OperationID: "op_recon",
		BatchID:     "batch_1",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		ProductID:   "prod_local_1",
		Status:      domain.OperationStatusPending,
	}

	productData := app.ProductPublishData{
		Name:          "Test Product",
		Description:   "A test product",
		SKUName:       "Test SKU",
		EAN:           "7891234567890",
		ImageURLs:     []string{},
		Specs:         map[string]string{},
		TradePolicyID: "1",
		BasePrice:     99.90,
		WarehouseID:   "warehouse_1",
		StockQuantity: 10,
		CategoryID:    "cat_local_1",
		BrandID:       "brand_local_1",
	}

	executor := app.NewPipelineExecutor(repo, vtex)
	err := executor.Execute(context.Background(), op, productData, resolvedMappings)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	finalOp := repo.operations["op_recon"]
	if finalOp.Status != domain.OperationStatusSucceeded {
		t.Fatalf("expected status succeeded, got %q", finalOp.Status)
	}
}
```

- [ ] **Step 7: Run all executor tests**

Run: `cd apps/server_core && go test ./tests/unit/ -run TestPipelineExecutor -v`

Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server_core/internal/modules/connectors/application/executor.go apps/server_core/tests/unit/connectors_executor_test.go
git commit -m "feat(connectors): add PipelineExecutor with reconciliation and halt-on-failure"
```

---

## Task 7: BatchOrchestrator — Preflight and Concurrency

**Files:**
- Create: `apps/server_core/internal/modules/connectors/application/orchestrator.go`
- Test: `apps/server_core/tests/unit/connectors_orchestrator_test.go`

- [ ] **Step 1: Write the failing test for preflight validation**

Create `apps/server_core/tests/unit/connectors_orchestrator_test.go`:

```go
package unit

import (
	"context"
	"testing"

	app "marketplace-central/apps/server_core/internal/modules/connectors/application"
	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
)

func TestBatchOrchestratorPreflightRejectsMissingFields(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		{
			ProductID:   "prod_1",
			Name:        "Valid Product",
			SKUName:     "Valid SKU",
			EAN:         "7891234567890",
			Category:    "Ferramentas",
			Brand:       "Bosch",
			Cost:        50.0,
			BasePrice:   99.90,
			StockQty:    10,
			WarehouseID: "wh_1",
			TradePolicyID: "1",
		},
		{
			ProductID: "prod_2",
			Name:      "",  // missing name
			SKUName:   "SKU",
			EAN:       "111",
			Category:  "Ferramentas",
			Brand:     "Bosch",
			Cost:      50.0,
			BasePrice: 99.90,
			StockQty:  10,
			WarehouseID: "wh_1",
			TradePolicyID: "1",
		},
		{
			ProductID: "prod_3",
			Name:      "No SKU Product",
			SKUName:   "", // missing SKU
			EAN:       "",
			Category:  "Ferramentas",
			Brand:     "Bosch",
			Cost:      50.0,
			BasePrice: 99.90,
			StockQty:  10,
			WarehouseID: "wh_1",
			TradePolicyID: "1",
		},
	}

	result, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("expected no system error, got %v", err)
	}

	if result.TotalProducts != 3 {
		t.Fatalf("expected total 3, got %d", result.TotalProducts)
	}
	if result.Validated != 1 {
		t.Fatalf("expected 1 validated, got %d", result.Validated)
	}
	if len(result.Rejections) != 2 {
		t.Fatalf("expected 2 rejections, got %d", len(result.Rejections))
	}
	if result.Rejections[0].ProductID != "prod_2" {
		t.Fatalf("expected first rejection for prod_2, got %q", result.Rejections[0].ProductID)
	}
}

func TestBatchOrchestratorRejectsActiveOperation(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	// Pre-populate an active operation
	repo.operations["existing_op"] = domain.PublicationOperation{
		OperationID: "existing_op",
		BatchID:     "old_batch",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		ProductID:   "prod_1",
		Status:      domain.OperationStatusInProgress,
	}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		{
			ProductID:   "prod_1",
			Name:        "Valid Product",
			SKUName:     "Valid SKU",
			EAN:         "7891234567890",
			Category:    "Ferramentas",
			Brand:       "Bosch",
			Cost:        50.0,
			BasePrice:   99.90,
			StockQty:    10,
			WarehouseID: "wh_1",
			TradePolicyID: "1",
		},
	}

	result, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("expected no system error, got %v", err)
	}

	if result.Validated != 0 {
		t.Fatalf("expected 0 validated (product already in progress), got %d", result.Validated)
	}
	if len(result.Rejections) != 1 {
		t.Fatalf("expected 1 rejection, got %d", len(result.Rejections))
	}
	if result.Rejections[0].ErrorCode != "CONNECTORS_PUBLISH_ALREADY_IN_PROGRESS" {
		t.Fatalf("expected CONNECTORS_PUBLISH_ALREADY_IN_PROGRESS, got %q", result.Rejections[0].ErrorCode)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server_core && go test ./tests/unit/ -run TestBatchOrchestrator -v`

Expected: FAIL — `NewBatchOrchestrator`, `ProductForPublish`, `CreateBatch` not defined.

- [ ] **Step 3: Write BatchOrchestrator implementation**

Create `apps/server_core/internal/modules/connectors/application/orchestrator.go`:

```go
package application

import (
	"context"
	"fmt"
	"time"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

type ProductForPublish struct {
	ProductID     string
	Name          string
	Description   string
	SKUName       string
	EAN           string
	Category      string
	Brand         string
	Cost          float64
	BasePrice     float64
	ImageURLs     []string
	Specs         map[string]string
	StockQty      int
	WarehouseID   string
	TradePolicyID string
}

type BatchCreateResult struct {
	BatchID       string
	TotalProducts int
	Validated     int
	Rejections    []Rejection
}

type Rejection struct {
	ProductID string
	ErrorCode string
}

type BatchOrchestrator struct {
	repo     ports.Repository
	vtex     ports.VTEXCatalogPort
	tenantID string
}

func NewBatchOrchestrator(repo ports.Repository, vtex ports.VTEXCatalogPort, tenantID string) *BatchOrchestrator {
	return &BatchOrchestrator{repo: repo, vtex: vtex, tenantID: tenantID}
}

func (o *BatchOrchestrator) CreateBatch(ctx context.Context, vtexAccount string, products []ProductForPublish) (BatchCreateResult, error) {
	batchID := fmt.Sprintf("batch_%d", time.Now().UnixNano())
	now := time.Now()

	var validProducts []ProductForPublish
	var rejections []Rejection

	// Phase 1: Preflight validation
	for _, p := range products {
		if reason := validateProduct(p); reason != "" {
			rejections = append(rejections, Rejection{ProductID: p.ProductID, ErrorCode: reason})
			continue
		}
		// Phase 2: Concurrency check
		active, err := o.repo.HasActiveOperation(ctx, o.tenantID, vtexAccount, p.ProductID)
		if err != nil {
			return BatchCreateResult{}, err
		}
		if active {
			rejections = append(rejections, Rejection{
				ProductID: p.ProductID,
				ErrorCode: "CONNECTORS_PUBLISH_ALREADY_IN_PROGRESS",
			})
			continue
		}
		validProducts = append(validProducts, p)
	}

	batch := domain.PublicationBatch{
		BatchID:       batchID,
		TenantID:      o.tenantID,
		VTEXAccount:   vtexAccount,
		Status:        domain.BatchStatusPending,
		TotalProducts: len(products),
		CreatedAt:     now,
	}

	if err := o.repo.SaveBatch(ctx, batch); err != nil {
		return BatchCreateResult{}, err
	}

	// Create failed operations for rejected products
	for _, rej := range rejections {
		op := domain.PublicationOperation{
			OperationID:  fmt.Sprintf("%s_%s", batchID, rej.ProductID),
			BatchID:      batchID,
			TenantID:     o.tenantID,
			VTEXAccount:  vtexAccount,
			ProductID:    rej.ProductID,
			Status:       domain.OperationStatusFailed,
			ErrorCode:    rej.ErrorCode,
			ErrorMessage: rej.ErrorCode,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if err := o.repo.SaveOperation(ctx, op); err != nil {
			return BatchCreateResult{}, err
		}
	}

	// Create pending operations for valid products
	for _, p := range validProducts {
		op := domain.PublicationOperation{
			OperationID: fmt.Sprintf("%s_%s", batchID, p.ProductID),
			BatchID:     batchID,
			TenantID:    o.tenantID,
			VTEXAccount: vtexAccount,
			ProductID:   p.ProductID,
			Status:      domain.OperationStatusPending,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if err := o.repo.SaveOperation(ctx, op); err != nil {
			return BatchCreateResult{}, err
		}
	}

	return BatchCreateResult{
		BatchID:       batchID,
		TotalProducts: len(products),
		Validated:     len(validProducts),
		Rejections:    rejections,
	}, nil
}

func validateProduct(p ProductForPublish) string {
	if p.ProductID == "" {
		return "CONNECTORS_PUBLISH_MISSING_PRODUCT_ID"
	}
	if p.Name == "" {
		return "CONNECTORS_PUBLISH_MISSING_NAME"
	}
	if p.SKUName == "" {
		return "CONNECTORS_PUBLISH_MISSING_SKU"
	}
	if p.EAN == "" {
		return "CONNECTORS_PUBLISH_MISSING_EAN"
	}
	if p.Category == "" {
		return "CONNECTORS_PUBLISH_MISSING_CATEGORY"
	}
	if p.Brand == "" {
		return "CONNECTORS_PUBLISH_MISSING_BRAND"
	}
	if p.BasePrice <= 0 {
		return "CONNECTORS_PUBLISH_INVALID_PRICE"
	}
	if p.StockQty < 0 {
		return "CONNECTORS_PUBLISH_INVALID_STOCK"
	}
	return ""
}

// ExecuteBatch runs the full pipeline for all valid products in the batch.
// Called in a background goroutine by the transport layer.
func (o *BatchOrchestrator) ExecuteBatch(ctx context.Context, batchID, vtexAccount string, products []ProductForPublish) error {
	if err := o.repo.UpdateBatchStatus(ctx, o.tenantID, batchID,
		domain.BatchStatusInProgress, 0, 0); err != nil {
		return err
	}

	// Phase 2: Shared resource resolution
	resolvedMappings, sharedFailures, err := o.resolveSharedResources(ctx, vtexAccount, products)
	if err != nil {
		return err
	}

	executor := NewPipelineExecutor(o.repo, o.vtex)
	succeeded := 0
	failed := 0

	for _, p := range products {
		opID := fmt.Sprintf("%s_%s", batchID, p.ProductID)

		// Check if product's shared resources failed
		if reason, isFailed := sharedFailures[p.Category]; isFailed {
			_ = o.repo.UpdateOperationStatus(ctx, o.tenantID, opID,
				domain.OperationStatusFailed, domain.StepCategory,
				"CONNECTORS_PUBLISH_DEPENDENCY_FAILED", reason)
			failed++
			continue
		}
		if reason, isFailed := sharedFailures[p.Brand]; isFailed {
			_ = o.repo.UpdateOperationStatus(ctx, o.tenantID, opID,
				domain.OperationStatusFailed, domain.StepBrand,
				"CONNECTORS_PUBLISH_DEPENDENCY_FAILED", reason)
			failed++
			continue
		}

		op := domain.PublicationOperation{
			OperationID: opID,
			BatchID:     batchID,
			TenantID:    o.tenantID,
			VTEXAccount: vtexAccount,
			ProductID:   p.ProductID,
			Status:      domain.OperationStatusPending,
		}

		productMappings := map[string]string{
			domain.EntityTypeCategory: resolvedMappings[domain.EntityTypeCategory+"|"+p.Category],
			domain.EntityTypeBrand:    resolvedMappings[domain.EntityTypeBrand+"|"+p.Brand],
		}

		data := ProductPublishData{
			Name:          p.Name,
			Description:   p.Description,
			SKUName:       p.SKUName,
			EAN:           p.EAN,
			ImageURLs:     p.ImageURLs,
			Specs:         p.Specs,
			TradePolicyID: p.TradePolicyID,
			BasePrice:     p.BasePrice,
			WarehouseID:   p.WarehouseID,
			StockQuantity: p.StockQty,
			CategoryID:    p.Category,
			BrandID:       p.Brand,
		}

		_ = executor.Execute(ctx, op, data, productMappings)

		// Check final status
		ops, _ := o.repo.ListOperationsByBatch(ctx, o.tenantID, batchID)
		for _, finalOp := range ops {
			if finalOp.OperationID == opID {
				if finalOp.Status == domain.OperationStatusSucceeded {
					succeeded++
				} else {
					failed++
				}
				break
			}
		}
	}

	finalStatus := domain.BatchStatusCompleted
	if failed > 0 && succeeded == 0 {
		finalStatus = domain.BatchStatusFailed
	} else if failed > 0 {
		finalStatus = domain.BatchStatusFailed
	}

	return o.repo.UpdateBatchStatus(ctx, o.tenantID, batchID, finalStatus, succeeded, failed)
}

func (o *BatchOrchestrator) resolveSharedResources(
	ctx context.Context,
	vtexAccount string,
	products []ProductForPublish,
) (map[string]string, map[string]string, error) {
	resolved := make(map[string]string)   // "category|Ferramentas" -> vtex_id
	failures := make(map[string]string)   // "Ferramentas" -> error message

	// Collect unique categories
	categories := make(map[string]bool)
	brands := make(map[string]bool)
	for _, p := range products {
		categories[p.Category] = true
		brands[p.Brand] = true
	}

	// Resolve categories
	for cat := range categories {
		key := domain.EntityTypeCategory + "|" + cat

		// Check existing mapping
		mapping, err := o.repo.FindMapping(ctx, o.tenantID, vtexAccount, domain.EntityTypeCategory, cat)
		if err != nil {
			return nil, nil, err
		}
		if mapping != nil {
			resolved[key] = mapping.VTEXID
			continue
		}

		vtexID, err := o.vtex.FindOrCreateCategory(ctx, ports.CategoryParams{
			VTEXAccount:  vtexAccount,
			CategoryName: cat,
			LocalID:      cat,
		})
		if err != nil {
			failures[cat] = fmt.Sprintf("category resolution failed: %s", err.Error())
			continue
		}

		_ = o.repo.SaveMapping(ctx, domain.VTEXEntityMapping{
			MappingID:   fmt.Sprintf("map_cat_%s_%d", cat, time.Now().UnixNano()),
			TenantID:    o.tenantID,
			VTEXAccount: vtexAccount,
			EntityType:  domain.EntityTypeCategory,
			LocalID:     cat,
			VTEXID:      vtexID,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		})
		resolved[key] = vtexID
	}

	// Resolve brands
	for brand := range brands {
		key := domain.EntityTypeBrand + "|" + brand

		mapping, err := o.repo.FindMapping(ctx, o.tenantID, vtexAccount, domain.EntityTypeBrand, brand)
		if err != nil {
			return nil, nil, err
		}
		if mapping != nil {
			resolved[key] = mapping.VTEXID
			continue
		}

		vtexID, err := o.vtex.FindOrCreateBrand(ctx, ports.BrandParams{
			VTEXAccount: vtexAccount,
			BrandName:   brand,
			LocalID:     brand,
		})
		if err != nil {
			failures[brand] = fmt.Sprintf("brand resolution failed: %s", err.Error())
			continue
		}

		_ = o.repo.SaveMapping(ctx, domain.VTEXEntityMapping{
			MappingID:   fmt.Sprintf("map_brand_%s_%d", brand, time.Now().UnixNano()),
			TenantID:    o.tenantID,
			VTEXAccount: vtexAccount,
			EntityType:  domain.EntityTypeBrand,
			LocalID:     brand,
			VTEXID:      vtexID,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		})
		resolved[key] = vtexID
	}

	return resolved, failures, nil
}

// GetBatchStatus returns the batch and its operations for the status endpoint.
func (o *BatchOrchestrator) GetBatchStatus(ctx context.Context, batchID string) (domain.PublicationBatch, []domain.PublicationOperation, error) {
	batch, err := o.repo.GetBatch(ctx, o.tenantID, batchID)
	if err != nil {
		return domain.PublicationBatch{}, nil, err
	}
	ops, err := o.repo.ListOperationsByBatch(ctx, o.tenantID, batchID)
	if err != nil {
		return domain.PublicationBatch{}, nil, err
	}
	return batch, ops, nil
}

// RetryBatch re-runs all failed operations in a batch from their current step.
func (o *BatchOrchestrator) RetryBatch(ctx context.Context, batchID, vtexAccount string, products []ProductForPublish) (BatchCreateResult, error) {
	ops, err := o.repo.ListOperationsByBatch(ctx, o.tenantID, batchID)
	if err != nil {
		return BatchCreateResult{}, err
	}

	var failedProducts []ProductForPublish
	for _, op := range ops {
		if op.Status != domain.OperationStatusFailed {
			continue
		}
		// Reset operation to pending
		_ = o.repo.UpdateOperationStatus(ctx, o.tenantID, op.OperationID,
			domain.OperationStatusPending, "", "", "")
		for _, p := range products {
			if p.ProductID == op.ProductID {
				failedProducts = append(failedProducts, p)
				break
			}
		}
	}

	if len(failedProducts) == 0 {
		return BatchCreateResult{
			BatchID:       batchID,
			TotalProducts: len(ops),
			Validated:     0,
			Rejections:    nil,
		}, nil
	}

	err = o.ExecuteBatch(ctx, batchID, vtexAccount, failedProducts)
	if err != nil {
		return BatchCreateResult{}, err
	}

	return BatchCreateResult{
		BatchID:       batchID,
		TotalProducts: len(ops),
		Validated:     len(failedProducts),
		Rejections:    nil,
	}, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server_core && go test ./tests/unit/ -run TestBatchOrchestrator -v`

Expected: All PASS.

- [ ] **Step 5: Write test for full batch execution flow**

Add to `apps/server_core/tests/unit/connectors_orchestrator_test.go`:

```go
func TestBatchOrchestratorExecutesBatchSuccessfully(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		{
			ProductID:     "prod_1",
			Name:          "Product A",
			SKUName:       "SKU A",
			EAN:           "1111111111111",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          50.0,
			BasePrice:     99.90,
			StockQty:      10,
			WarehouseID:   "wh_1",
			TradePolicyID: "1",
		},
		{
			ProductID:     "prod_2",
			Name:          "Product B",
			SKUName:       "SKU B",
			EAN:           "2222222222222",
			Category:      "Ferramentas", // same category as prod_1
			Brand:         "DeWalt",       // different brand
			Cost:          80.0,
			BasePrice:     149.90,
			StockQty:      5,
			WarehouseID:   "wh_1",
			TradePolicyID: "1",
		},
	}

	result, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("CreateBatch error: %v", err)
	}
	if result.Validated != 2 {
		t.Fatalf("expected 2 validated, got %d", result.Validated)
	}

	// Execute the batch
	err = orch.ExecuteBatch(context.Background(), result.BatchID, "mystore", products)
	if err != nil {
		t.Fatalf("ExecuteBatch error: %v", err)
	}

	// Verify batch completed
	batch := repo.batches[result.BatchID]
	if batch.SucceededCount != 2 {
		t.Fatalf("expected 2 succeeded, got %d", batch.SucceededCount)
	}
	if batch.FailedCount != 0 {
		t.Fatalf("expected 0 failed, got %d", batch.FailedCount)
	}

	// Verify shared resources resolved only once
	// "Ferramentas" category should have one mapping (not two)
	catMapping := repo.mappings["mystore|category|Ferramentas"]
	if catMapping == nil {
		t.Fatal("expected category mapping to be saved")
	}

	// Both brands should be mapped
	boschMapping := repo.mappings["mystore|brand|Bosch"]
	if boschMapping == nil {
		t.Fatal("expected Bosch brand mapping to be saved")
	}
	dewaltMapping := repo.mappings["mystore|brand|DeWalt"]
	if dewaltMapping == nil {
		t.Fatal("expected DeWalt brand mapping to be saved")
	}
}
```

- [ ] **Step 6: Run all orchestrator tests**

Run: `cd apps/server_core && go test ./tests/unit/ -run TestBatchOrchestrator -v`

Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server_core/internal/modules/connectors/application/orchestrator.go apps/server_core/tests/unit/connectors_orchestrator_test.go
git commit -m "feat(connectors): add BatchOrchestrator with preflight, shared resolution, and execution"
```

---

## Task 8: Transport Layer

**Files:**
- Create: `apps/server_core/internal/modules/connectors/transport/http_handler.go`
- Test: `apps/server_core/tests/unit/connectors_handler_test.go`

- [ ] **Step 1: Write the failing test for POST /connectors/vtex/publish**

Create `apps/server_core/tests/unit/connectors_handler_test.go`:

```go
package unit

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	app "marketplace-central/apps/server_core/internal/modules/connectors/application"
	connectorstransport "marketplace-central/apps/server_core/internal/modules/connectors/transport"
)

func TestConnectorsPublishHandler(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}
	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	handler := connectorstransport.NewHandler(orch)
	mux := http.NewServeMux()
	handler.Register(mux)

	body := map[string]any{
		"product_ids":  []string{"prod_1"},
		"vtex_account": "mystore",
		"products": []map[string]any{
			{
				"product_id":      "prod_1",
				"name":            "Test Product",
				"sku_name":        "Test SKU",
				"ean":             "7891234567890",
				"category":        "Ferramentas",
				"brand":           "Bosch",
				"base_price":      99.90,
				"stock_qty":       10,
				"warehouse_id":    "wh_1",
				"trade_policy_id": "1",
			},
		},
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/connectors/vtex/publish", bytes.NewReader(b))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var result map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["batch_id"] == nil {
		t.Fatal("expected batch_id in response")
	}
	if result["validated"].(float64) != 1 {
		t.Fatalf("expected 1 validated, got %v", result["validated"])
	}
}

func TestConnectorsPublishHandlerRejectsInvalidMethod(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}
	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	handler := connectorstransport.NewHandler(orch)
	mux := http.NewServeMux()
	handler.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/connectors/vtex/publish", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestConnectorsBatchStatusHandler(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}
	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	handler := connectorstransport.NewHandler(orch)
	mux := http.NewServeMux()
	handler.Register(mux)

	// Create a batch first
	products := []app.ProductForPublish{
		{
			ProductID:     "prod_1",
			Name:          "Test",
			SKUName:       "SKU",
			EAN:           "111",
			Category:      "Cat",
			Brand:         "Brand",
			BasePrice:     99.90,
			StockQty:      10,
			WarehouseID:   "wh_1",
			TradePolicyID: "1",
		},
	}
	result, _ := orch.CreateBatch(ctx(), "mystore", products)

	req := httptest.NewRequest(http.MethodGet, "/connectors/vtex/publish/batch/"+result.BatchID, nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var status map[string]any
	json.NewDecoder(rec.Body).Decode(&status)
	if status["batch_id"] != result.BatchID {
		t.Fatalf("expected batch_id %q, got %v", result.BatchID, status["batch_id"])
	}
}

func ctx() context.Context {
	return context.Background()
}
```

Add the missing `context` import at the top:

```go
package unit

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	app "marketplace-central/apps/server_core/internal/modules/connectors/application"
	connectorstransport "marketplace-central/apps/server_core/internal/modules/connectors/transport"
)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server_core && go test ./tests/unit/ -run TestConnectors -v`

Expected: FAIL — `connectorstransport.NewHandler` not defined.

- [ ] **Step 3: Write the transport handler**

Create `apps/server_core/internal/modules/connectors/transport/http_handler.go`:

```go
package transport

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	app "marketplace-central/apps/server_core/internal/modules/connectors/application"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct {
	orchestrator *app.BatchOrchestrator
}

func NewHandler(orchestrator *app.BatchOrchestrator) *Handler {
	return &Handler{orchestrator: orchestrator}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/connectors/vtex/publish", h.handlePublish)
	mux.HandleFunc("/connectors/vtex/publish/batch/", h.handleBatchRoutes)
}

type publishRequest struct {
	ProductIDs  []string         `json:"product_ids"`
	VTEXAccount string           `json:"vtex_account"`
	Products    []productRequest `json:"products"`
}

type productRequest struct {
	ProductID     string            `json:"product_id"`
	Name          string            `json:"name"`
	Description   string            `json:"description"`
	SKUName       string            `json:"sku_name"`
	EAN           string            `json:"ean"`
	Category      string            `json:"category"`
	Brand         string            `json:"brand"`
	Cost          float64           `json:"cost"`
	BasePrice     float64           `json:"base_price"`
	ImageURLs     []string          `json:"image_urls"`
	Specs         map[string]string `json:"specs"`
	StockQty      int               `json:"stock_qty"`
	WarehouseID   string            `json:"warehouse_id"`
	TradePolicyID string            `json:"trade_policy_id"`
}

type apiError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

func (h *Handler) handlePublish(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]any{
			"error": apiError{Code: "method_not_allowed", Message: "use POST"},
		})
		return
	}

	var req publishRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"error": apiError{Code: "invalid_request", Message: "invalid JSON body"},
		})
		return
	}

	if req.VTEXAccount == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"error": apiError{Code: "invalid_request", Message: "vtex_account is required"},
		})
		return
	}
	if len(req.Products) == 0 {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"error": apiError{Code: "invalid_request", Message: "products array is required"},
		})
		return
	}

	products := make([]app.ProductForPublish, len(req.Products))
	for i, p := range req.Products {
		products[i] = app.ProductForPublish{
			ProductID:     p.ProductID,
			Name:          p.Name,
			Description:   p.Description,
			SKUName:       p.SKUName,
			EAN:           p.EAN,
			Category:      p.Category,
			Brand:         p.Brand,
			Cost:          p.Cost,
			BasePrice:     p.BasePrice,
			ImageURLs:     p.ImageURLs,
			Specs:         p.Specs,
			StockQty:      p.StockQty,
			WarehouseID:   p.WarehouseID,
			TradePolicyID: p.TradePolicyID,
		}
	}

	result, err := h.orchestrator.CreateBatch(r.Context(), req.VTEXAccount, products)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"error": apiError{Code: "internal_error", Message: err.Error()},
		})
		return
	}

	// Start batch execution in background goroutine.
	// Per architecture rule: "synchronous HTTP requests from web never depend
	// on connector availability." The handler returns 201 immediately;
	// the user polls GET /batch/{id} for status.
	if result.Validated > 0 {
		validProducts := make([]app.ProductForPublish, 0, result.Validated)
		for _, p := range products {
			rejected := false
			for _, rej := range result.Rejections {
				if rej.ProductID == p.ProductID {
					rejected = true
					break
				}
			}
			if !rejected {
				validProducts = append(validProducts, p)
			}
		}
		go func() {
			bgCtx := context.Background()
			_ = h.orchestrator.ExecuteBatch(
				bgCtx, result.BatchID, req.VTEXAccount, validProducts,
			)
		}()
	}

	rejections := make([]map[string]string, len(result.Rejections))
	for i, rej := range result.Rejections {
		rejections[i] = map[string]string{
			"product_id": rej.ProductID,
			"error_code": rej.ErrorCode,
		}
	}

	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"batch_id":       result.BatchID,
		"total_products": result.TotalProducts,
		"validated":      result.Validated,
		"rejected":       len(result.Rejections),
		"rejections":     rejections,
	})
}

func (h *Handler) handleBatchRoutes(w http.ResponseWriter, r *http.Request) {
	// Parse: /connectors/vtex/publish/batch/{batch_id} or .../batch/{batch_id}/retry
	path := strings.TrimPrefix(r.URL.Path, "/connectors/vtex/publish/batch/")
	parts := strings.SplitN(path, "/", 2)
	batchID := parts[0]

	if batchID == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"error": apiError{Code: "invalid_request", Message: "batch_id is required"},
		})
		return
	}

	if len(parts) == 2 && parts[1] == "retry" {
		h.handleRetry(w, r, batchID)
		return
	}

	h.handleBatchStatus(w, r, batchID)
}

func (h *Handler) handleBatchStatus(w http.ResponseWriter, r *http.Request, batchID string) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]any{
			"error": apiError{Code: "method_not_allowed", Message: "use GET"},
		})
		return
	}

	batch, ops, err := h.orchestrator.GetBatchStatus(r.Context(), batchID)
	if err != nil {
		if strings.Contains(err.Error(), "NOT_FOUND") {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{
				"error": apiError{Code: "not_found", Message: "batch not found"},
			})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"error": apiError{Code: "internal_error", Message: err.Error()},
		})
		return
	}

	inProgress := 0
	succeeded := 0
	failed := 0
	operations := make([]map[string]any, len(ops))
	for i, op := range ops {
		switch op.Status {
		case "succeeded":
			succeeded++
		case "failed":
			failed++
		case "pending", "in_progress":
			inProgress++
		}
		operations[i] = map[string]any{
			"product_id":   op.ProductID,
			"status":       op.Status,
			"current_step": op.CurrentStep,
			"error_code":   nilIfEmpty(op.ErrorCode),
		}
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"batch_id":     batch.BatchID,
		"vtex_account": batch.VTEXAccount,
		"status":       batch.Status,
		"total":        batch.TotalProducts,
		"succeeded":    succeeded,
		"failed":       failed,
		"in_progress":  inProgress,
		"operations":   operations,
	})
}

func (h *Handler) handleRetry(w http.ResponseWriter, r *http.Request, batchID string) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]any{
			"error": apiError{Code: "method_not_allowed", Message: "use POST"},
		})
		return
	}

	var req publishRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"error": apiError{Code: "invalid_request", Message: "invalid JSON body"},
		})
		return
	}

	products := make([]app.ProductForPublish, len(req.Products))
	for i, p := range req.Products {
		products[i] = app.ProductForPublish{
			ProductID:     p.ProductID,
			Name:          p.Name,
			Description:   p.Description,
			SKUName:       p.SKUName,
			EAN:           p.EAN,
			Category:      p.Category,
			Brand:         p.Brand,
			Cost:          p.Cost,
			BasePrice:     p.BasePrice,
			ImageURLs:     p.ImageURLs,
			Specs:         p.Specs,
			StockQty:      p.StockQty,
			WarehouseID:   p.WarehouseID,
			TradePolicyID: p.TradePolicyID,
		}
	}

	result, err := h.orchestrator.RetryBatch(r.Context(), batchID, req.VTEXAccount, products)
	if err != nil {
		if strings.Contains(err.Error(), "NOT_FOUND") {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{
				"error": apiError{Code: "not_found", Message: "batch not found"},
			})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"error": apiError{Code: "internal_error", Message: err.Error()},
		})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"batch_id":       result.BatchID,
		"total_products": result.TotalProducts,
		"validated":      result.Validated,
		"rejected":       0,
		"rejections":     []any{},
	})
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
```

- [ ] **Step 4: Run handler tests**

Run: `cd apps/server_core && go test ./tests/unit/ -run TestConnectors -v`

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/connectors/transport/ apps/server_core/tests/unit/connectors_handler_test.go
git commit -m "feat(connectors): add HTTP transport for publish, status, and retry"
```

---

## Task 9: Composition Root Wiring

**Files:**
- Modify: `apps/server_core/internal/composition/root.go`

- [ ] **Step 1: Wire the connectors module into the composition root**

Add to `apps/server_core/internal/composition/root.go`:

New imports:
```go
connectorsstub "marketplace-central/apps/server_core/internal/modules/connectors/adapters/vtex/stub"
connectorspostgres "marketplace-central/apps/server_core/internal/modules/connectors/adapters/postgres"
connectorsapp "marketplace-central/apps/server_core/internal/modules/connectors/application"
connectorstransport "marketplace-central/apps/server_core/internal/modules/connectors/transport"
```

After the pricing module registration, add:
```go
connectorsRepo := connectorspostgres.NewRepository(pool, cfg.DefaultTenantID)
vtexAdapter := connectorsstub.NewAdapter()
connectorsOrch := connectorsapp.NewBatchOrchestrator(connectorsRepo, vtexAdapter, cfg.DefaultTenantID)
connectorstransport.NewHandler(connectorsOrch).Register(mux)
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/server_core && go build ./...`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/composition/root.go
git commit -m "feat(connectors): wire connectors module into composition root"
```

---

## Task 10: Router Registration Test

**Files:**
- Modify: `apps/server_core/tests/unit/router_registration_test.go`

- [ ] **Step 1: Add connector routes to the registration test**

Add the new connector endpoints to the route list in the existing router registration test. The new routes to add:

```go
"/connectors/vtex/publish",
```

Note: `/connectors/vtex/publish/batch/{id}` uses a prefix pattern, so test with a concrete batch ID:

```go
"/connectors/vtex/publish/batch/test_batch_123",
```

The test should verify these return non-404 when the handler is registered.

- [ ] **Step 2: Run the registration test**

Run: `cd apps/server_core && go test ./tests/unit/ -run TestRouterRegisters -v`

Expected: PASS — all routes registered.

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/tests/unit/router_registration_test.go
git commit -m "test(connectors): add connector routes to router registration test"
```

---

## Task 11: OpenAPI Spec Update

**Files:**
- Modify: `contracts/api/marketplace-central.openapi.yaml`

- [ ] **Step 1: Add the three new endpoints to the OpenAPI spec**

Add under `paths`:

```yaml
  /connectors/vtex/publish:
    post:
      operationId: publishToVTEX
      summary: Trigger batch publication to VTEX
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PublishToVTEXRequest'
      responses:
        '201':
          description: Batch created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PublishToVTEXResponse'
        '400':
          description: Invalid request
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /connectors/vtex/publish/batch/{batch_id}:
    get:
      operationId: getVTEXBatchStatus
      summary: Get batch publication status
      parameters:
        - name: batch_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Batch status
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BatchStatusResponse'
        '404':
          description: Batch not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /connectors/vtex/publish/batch/{batch_id}/retry:
    post:
      operationId: retryVTEXBatch
      summary: Retry failed operations in a batch
      parameters:
        - name: batch_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PublishToVTEXRequest'
      responses:
        '200':
          description: Retry initiated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PublishToVTEXResponse'
        '404':
          description: Batch not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
```

Add under `components/schemas`:

```yaml
    PublishToVTEXRequest:
      type: object
      required:
        - vtex_account
        - products
      properties:
        vtex_account:
          type: string
        products:
          type: array
          items:
            $ref: '#/components/schemas/ProductForPublish'

    ProductForPublish:
      type: object
      required:
        - product_id
        - name
        - sku_name
        - ean
        - category
        - brand
        - base_price
      properties:
        product_id:
          type: string
        name:
          type: string
        description:
          type: string
        sku_name:
          type: string
        ean:
          type: string
        category:
          type: string
        brand:
          type: string
        cost:
          type: number
          format: double
        base_price:
          type: number
          format: double
        image_urls:
          type: array
          items:
            type: string
        specs:
          type: object
          additionalProperties:
            type: string
        stock_qty:
          type: integer
        warehouse_id:
          type: string
        trade_policy_id:
          type: string

    PublishToVTEXResponse:
      type: object
      properties:
        batch_id:
          type: string
        total_products:
          type: integer
        validated:
          type: integer
        rejected:
          type: integer
        rejections:
          type: array
          items:
            type: object
            properties:
              product_id:
                type: string
              error_code:
                type: string

    BatchStatusResponse:
      type: object
      properties:
        batch_id:
          type: string
        vtex_account:
          type: string
        status:
          type: string
          enum: [pending, in_progress, completed, failed]
        total:
          type: integer
        succeeded:
          type: integer
        failed:
          type: integer
        in_progress:
          type: integer
        operations:
          type: array
          items:
            type: object
            properties:
              product_id:
                type: string
              status:
                type: string
              current_step:
                type: string
              error_code:
                type: string
                nullable: true
```

- [ ] **Step 2: Commit**

```bash
git add contracts/api/marketplace-central.openapi.yaml
git commit -m "docs(connectors): add VTEX publish endpoints to OpenAPI spec"
```

---

## Task 12: Run All Tests

- [ ] **Step 1: Run the full test suite**

Run: `cd apps/server_core && go test ./... -v`

Expected: All tests PASS. No compilation errors.

- [ ] **Step 2: Final commit if any fixes were needed**

If any test fixes were needed, commit them:

```bash
git add -A
git commit -m "fix(connectors): address test issues from full suite run"
```

---

## Appendix A: Idempotency and Retry Rules

Every step in the pipeline must be safe to re-execute. The rules:

| Step | Idempotency mechanism | On timeout/unknown result |
|---|---|---|
| FindOrCreateCategory | Lookup by name first, create only if not found. Mapping table caches result. | Re-run is safe — lookup-first pattern returns existing. |
| FindOrCreateBrand | Same as category. | Same as category. |
| CreateProduct | Check `VTEXEntityMapping` for `(tenant_id, vtex_account, product, local_id)` before calling VTEX. If mapping exists, adopt. | If mapping was saved, re-run adopts. If not, re-run creates — VTEX may return existing ID or create duplicate. Reconciliation handles both. |
| CreateSKU | Same as product — mapping check before create. | Same as product. |
| AttachSpecsAndImages | Overwrite semantics — re-running replaces specs/images. | Safe to re-run (overwrite). |
| AssociateTradePolicy | Additive — associating an already-associated policy is a no-op in VTEX. | Safe to re-run. |
| SetPrice | Last-write-wins — re-running sets the same price. | Safe to re-run. |
| SetStock | Last-write-wins — re-running sets the same quantity. | Safe to re-run. |
| ActivateProduct | Activating an already-active product is a no-op. | Safe to re-run. |

**Error classification for retry decisions:**

| Error type | Retry safe? | Action |
|---|---|---|
| `ErrVTEXValidation` (400) | No — terminal | Halt, surface to user, require data fix |
| `ErrVTEXNotFound` (404) | No — terminal | Halt, surface to user, missing dependency |
| `ErrVTEXTransient` (5xx, timeout) | Yes — retryable | User clicks retry, resumes from failed step |
| `ErrVTEXAuth` (401/403) | No — terminal | Halt entire batch, surface credentials issue |

## Appendix B: Shared Resource Step Tracking

Shared resource resolution (categories and brands) is tracked at the batch level, not per product. The `resolveSharedResources` method in `BatchOrchestrator` persists `VTEXEntityMapping` records for each resolved resource. If a shared resource fails, all dependent products are marked failed with `CONNECTORS_PUBLISH_DEPENDENCY_FAILED`.

The batch status endpoint reports shared resource resolution implicitly through the per-product operation status: if all products failed on step "category" with "DEPENDENCY_FAILED", it's clear the category resolution failed. Dedicated batch-level step results can be added later if audit requirements demand it.

## Appendix C: Execution Model

The handler returns `201 Created` immediately with the batch ID and preflight results, then spawns a background goroutine to execute the pipeline. This respects the architecture rule: "synchronous HTTP requests from web never depend on connector availability." The user polls `GET /connectors/vtex/publish/batch/{batch_id}` for live status.

**Limitation:** A goroutine is not a durable job — if the process crashes mid-batch, in-progress operations are orphaned. For the initial stub-driven implementation this is acceptable. When real credentials arrive and VTEX latency matters, upgrade to a durable worker model: persist batch as `pending`, use a polling worker loop to pick up pending batches. The `BatchOrchestrator.ExecuteBatch` method already handles all state transitions — only the call site changes.

## Appendix D: Known Caveats

These items were raised during plan review and intentionally deferred:

1. **Product data from request, not canonical DB.** The publish request currently sends full product details (name, EAN, price, etc.) in the request body. The catalog module only exposes `ListProducts` (read-only) and lacks the enriched fields needed for VTEX publication. When the catalog module is extended with SKU details, images, and specs, refactor the publish endpoint to accept only `product_ids` and load data server-side from canonical storage.

2. **Account validation.** The `vtex_account` is accepted as a raw string without validating it against the `marketplace_accounts` table. When real VTEX credentials are added, add a preflight step that resolves `vtex_account` to a tenant-scoped marketplace account row, verifies the channel is VTEX, and checks connection status before proceeding.

3. **Handler logging.** The plan does not include explicit structured logging (`action`, `result`, `duration_ms`) in handler code. This should be added during implementation following the existing handler patterns.

4. **Scope.** This plan covers VTEX catalog publication only (publish, status, retry). It does not cover scheduler-driven sync, VTEX-to-MPC catalog import, OMS order sync, or messaging. Those are separate phases per the VTEX integration reference doc.
