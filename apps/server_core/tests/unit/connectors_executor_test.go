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

// --- In-memory stub implementations ---

type vtexCatalogStub struct {
	counter    atomic.Int64
	failOnStep string
	failError  error
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
	mappings   map[string]*domain.VTEXEntityMapping
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
func (s *connectorsRepoStub) GetBatch(_ context.Context, batchID string) (domain.PublicationBatch, error) {
	b, ok := s.batches[batchID]
	if !ok {
		return domain.PublicationBatch{}, fmt.Errorf("CONNECTORS_BATCH_NOT_FOUND: %w", domain.ErrBatchNotFound)
	}
	return b, nil
}
func (s *connectorsRepoStub) UpdateBatchStatus(_ context.Context, batchID, status string, succeeded, failed int) error {
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
func (s *connectorsRepoStub) ListOperationsByBatch(_ context.Context, batchID string) ([]domain.PublicationOperation, error) {
	var ops []domain.PublicationOperation
	for _, op := range s.operations {
		if op.BatchID == batchID {
			ops = append(ops, op)
		}
	}
	return ops, nil
}
func (s *connectorsRepoStub) UpdateOperationStatus(_ context.Context, opID, status, step, code, msg string) error {
	op := s.operations[opID]
	op.Status = status
	op.CurrentStep = step
	op.ErrorCode = code
	op.ErrorMessage = msg
	s.operations[opID] = op
	return nil
}
func (s *connectorsRepoStub) HasActiveOperation(_ context.Context, vtexAccount, productID string) (bool, error) {
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
func (s *connectorsRepoStub) UpdateStepResult(_ context.Context, stepResultID, status string, vtexEntityID *string, errorCode, errorMessage string) error {
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
func (s *connectorsRepoStub) ListStepResultsByOperation(_ context.Context, opID string) ([]domain.PipelineStepResult, error) {
	return s.steps[opID], nil
}
func (s *connectorsRepoStub) FindMapping(_ context.Context, vtexAccount, entityType, localID string) (*domain.VTEXEntityMapping, error) {
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
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	resolvedMappings := map[string]string{
		domain.EntityTypeCategory: "cat_vtex_1",
		domain.EntityTypeBrand:    "brand_vtex_1",
	}

	op := domain.PublicationOperation{
		OperationID: "op_1",
		BatchID:     "batch_1",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		ProductID:   "prod_local_1",
		Status:      domain.OperationStatusPending,
	}
	repo.operations["op_1"] = op

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

func TestPipelineExecutorHaltsOnFailure(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{
		failOnStep: domain.StepSKU,
		failError:  fmt.Errorf("SKU creation failed: %w", domain.ErrVTEXValidation),
	}

	resolvedMappings := map[string]string{
		domain.EntityTypeCategory: "cat_vtex_1",
		domain.EntityTypeBrand:    "brand_vtex_1",
	}

	op := domain.PublicationOperation{
		OperationID: "op_fail",
		BatchID:     "batch_1",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		ProductID:   "prod_local_1",
		Status:      domain.OperationStatusPending,
	}
	repo.operations["op_fail"] = op

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

	steps := repo.steps["op_fail"]
	if len(steps) != 2 {
		t.Fatalf("expected 2 step results (product + sku), got %d", len(steps))
	}
}

func TestPipelineExecutorReconciliationSkipsCreate(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	repo.mappings["mystore|product|prod_local_1"] = &domain.VTEXEntityMapping{
		MappingID:   "existing_map",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		EntityType:  domain.EntityTypeProduct,
		LocalID:     "prod_local_1",
		VTEXID:      "vtex_existing_prod",
	}

	resolvedMappings := map[string]string{
		domain.EntityTypeCategory: "cat_vtex_1",
		domain.EntityTypeBrand:    "brand_vtex_1",
	}

	op := domain.PublicationOperation{
		OperationID: "op_recon",
		BatchID:     "batch_1",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		ProductID:   "prod_local_1",
		Status:      domain.OperationStatusPending,
	}
	repo.operations["op_recon"] = op

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
