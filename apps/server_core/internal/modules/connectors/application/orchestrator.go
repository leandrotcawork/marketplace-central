package application

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

// newID generates a random prefixed ID with 64 bits of entropy to avoid collisions under concurrency.
func newID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + "_" + hex.EncodeToString(b)
}

// ProductForPublish holds all data needed to publish a product to VTEX.
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

// BatchCreateResult is returned by CreateBatch.
type BatchCreateResult struct {
	BatchID       string
	TotalProducts int
	Validated     int
	Rejections    []Rejection
}

// Rejection carries the product ID and the structured error code explaining why it was rejected.
type Rejection struct {
	ProductID string
	ErrorCode string
}

// BatchOrchestrator manages the full publication lifecycle for a batch of products.
type BatchOrchestrator struct {
	repo     ports.Repository
	vtex     ports.VTEXCatalogPort
	tenantID string
}

// NewBatchOrchestrator constructs a BatchOrchestrator.
func NewBatchOrchestrator(repo ports.Repository, vtex ports.VTEXCatalogPort, tenantID string) *BatchOrchestrator {
	return &BatchOrchestrator{
		repo:     repo,
		vtex:     vtex,
		tenantID: tenantID,
	}
}

// CreateBatch validates products, checks for concurrency conflicts, persists the batch and
// initial operations, and returns a summary of accepted and rejected products.
func (o *BatchOrchestrator) CreateBatch(
	ctx context.Context,
	vtexAccount string,
	products []ProductForPublish,
) (BatchCreateResult, error) {
	batchID := newID("batch")
	now := time.Now()

	var rejections []Rejection
	rejectedIDs := make(map[string]bool)

	// Step 1: Preflight validation.
	for _, p := range products {
		if code := validateProduct(p); code != "" {
			rejections = append(rejections, Rejection{ProductID: p.ProductID, ErrorCode: code})
			rejectedIDs[p.ProductID] = true
		}
	}

	// Step 2: Concurrency check for non-rejected products.
	for _, p := range products {
		if rejectedIDs[p.ProductID] {
			continue
		}
		active, err := o.repo.HasActiveOperation(ctx, vtexAccount, p.ProductID)
		if err != nil {
			return BatchCreateResult{}, fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
		}
		if active {
			rejections = append(rejections, Rejection{
				ProductID: p.ProductID,
				ErrorCode: "CONNECTORS_PUBLISH_ALREADY_IN_PROGRESS",
			})
			rejectedIDs[p.ProductID] = true
		}
	}

	validated := len(products) - len(rejections)

	// Step 3: Persist the batch record.
	batch := domain.PublicationBatch{
		BatchID:       batchID,
		TenantID:      o.tenantID,
		VTEXAccount:   vtexAccount,
		Status:        domain.BatchStatusPending,
		TotalProducts: len(products),
		CreatedAt:     now,
	}
	if err := o.repo.SaveBatch(ctx, batch); err != nil {
		return BatchCreateResult{}, fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
	}

	// Step 4: Save failed operations for rejected products.
	for _, r := range rejections {
		opID := fmt.Sprintf("op_%s_%s", batchID, r.ProductID)
		op := domain.PublicationOperation{
			OperationID:  opID,
			BatchID:      batchID,
			TenantID:     o.tenantID,
			VTEXAccount:  vtexAccount,
			ProductID:    r.ProductID,
			Status:       domain.OperationStatusFailed,
			ErrorCode:    r.ErrorCode,
			ErrorMessage: r.ErrorCode,
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		if err := o.repo.SaveOperation(ctx, op); err != nil {
			return BatchCreateResult{}, fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
		}
	}

	// Step 5: Save pending operations for valid products.
	for _, p := range products {
		if rejectedIDs[p.ProductID] {
			continue
		}
		opID := fmt.Sprintf("op_%s_%s", batchID, p.ProductID)
		op := domain.PublicationOperation{
			OperationID: opID,
			BatchID:     batchID,
			TenantID:    o.tenantID,
			VTEXAccount: vtexAccount,
			ProductID:   p.ProductID,
			Status:      domain.OperationStatusPending,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		if err := o.repo.SaveOperation(ctx, op); err != nil {
			return BatchCreateResult{}, fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
		}
	}

	return BatchCreateResult{
		BatchID:       batchID,
		TotalProducts: len(products),
		Validated:     validated,
		Rejections:    rejections,
	}, nil
}

// ExecuteBatch runs the full pipeline for every pending operation in a batch.
func (o *BatchOrchestrator) ExecuteBatch(
	ctx context.Context,
	batchID string,
	vtexAccount string,
	products []ProductForPublish,
) error {
	// Mark batch in progress.
	if err := o.repo.UpdateBatchStatus(ctx, batchID, domain.BatchStatusInProgress, 0, 0); err != nil {
		return fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
	}

	// Resolve shared resources (categories and brands) once for the entire batch.
	resolved, failures, err := o.resolveSharedResources(ctx, vtexAccount, products)
	if err != nil {
		return fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
	}

	// Fetch all operations for this batch to find the pending ones.
	ops, err := o.repo.ListOperationsByBatch(ctx, batchID)
	if err != nil {
		return fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
	}

	// Index operations by product ID for lookup.
	opByProduct := make(map[string]domain.PublicationOperation)
	for _, op := range ops {
		if op.Status == domain.OperationStatusPending {
			opByProduct[op.ProductID] = op
		}
	}

	// Build a product lookup by product ID.
	productByID := make(map[string]ProductForPublish)
	for _, p := range products {
		productByID[p.ProductID] = p
	}

	executor := NewPipelineExecutor(o.repo, o.vtex)

	for _, p := range products {
		op, hasPendingOp := opByProduct[p.ProductID]
		if !hasPendingOp {
			continue
		}

		// Check if category resolution failed for this product.
		if reason, bad := failures["category|"+p.Category]; bad {
			_ = o.repo.UpdateOperationStatus(ctx, op.OperationID,
				domain.OperationStatusFailed,
				domain.StepCategory,
				"CONNECTORS_PUBLISH_DEPENDENCY_FAILED",
				reason,
			)
			continue
		}

		// Check if brand resolution failed for this product.
		if reason, bad := failures["brand|"+p.Brand]; bad {
			_ = o.repo.UpdateOperationStatus(ctx, op.OperationID,
				domain.OperationStatusFailed,
				domain.StepBrand,
				"CONNECTORS_PUBLISH_DEPENDENCY_FAILED",
				reason,
			)
			continue
		}

		productMappings := map[string]string{
			domain.EntityTypeCategory: resolved["category|"+p.Category],
			domain.EntityTypeBrand:    resolved["brand|"+p.Brand],
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
		}

		// Execute the pipeline. Executor handles its own state — errors here are system errors.
		_ = executor.Execute(ctx, op, data, productMappings)
	}

	// Count final statuses with a single DB read after all operations complete.
	finalOps, err := o.repo.ListOperationsByBatch(ctx, batchID)
	if err != nil {
		return fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
	}
	succeededCount := 0
	failedCount := 0
	for _, op := range finalOps {
		switch op.Status {
		case domain.OperationStatusSucceeded:
			succeededCount++
		case domain.OperationStatusFailed:
			failedCount++
		}
	}

	// Determine final batch status.
	finalStatus := domain.BatchStatusCompleted
	if failedCount > 0 {
		finalStatus = domain.BatchStatusFailed
	}

	if err := o.repo.UpdateBatchStatus(ctx, batchID, finalStatus, succeededCount, failedCount); err != nil {
		return fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
	}

	return nil
}

// resolveSharedResources resolves (or creates) VTEX category and brand IDs for all unique
// categories and brands referenced in the product list. It returns two maps:
//
//   - resolved: "category|<name>" -> vtexID, "brand|<name>" -> vtexID
//   - failures: "category|<name>" -> reason, "brand|<name>" -> reason
func (o *BatchOrchestrator) resolveSharedResources(
	ctx context.Context,
	vtexAccount string,
	products []ProductForPublish,
) (resolved map[string]string, failures map[string]string, err error) {
	resolved = make(map[string]string)
	failures = make(map[string]string)

	// Collect unique categories and brands.
	categories := make(map[string]struct{})
	brands := make(map[string]struct{})
	for _, p := range products {
		if p.Category != "" {
			categories[p.Category] = struct{}{}
		}
		if p.Brand != "" {
			brands[p.Brand] = struct{}{}
		}
	}

	// Resolve categories.
	for cat := range categories {
		key := "category|" + cat
		existing, findErr := o.repo.FindMapping(ctx, vtexAccount, domain.EntityTypeCategory, cat)
		if findErr != nil {
			return nil, nil, findErr
		}
		if existing != nil {
			resolved[key] = existing.VTEXID
			continue
		}
		vtexID, createErr := o.vtex.FindOrCreateCategory(ctx, ports.CategoryParams{
			VTEXAccount:  vtexAccount,
			CategoryName: cat,
			LocalID:      cat,
		})
		if createErr != nil {
			failures[key] = createErr.Error()
			continue
		}
		if err := o.repo.SaveMapping(ctx, domain.VTEXEntityMapping{
			MappingID:   fmt.Sprintf("map_%s_category_%s", vtexAccount, cat),
			TenantID:    o.tenantID,
			VTEXAccount: vtexAccount,
			EntityType:  domain.EntityTypeCategory,
			LocalID:     cat,
			VTEXID:      vtexID,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}); err != nil {
			return nil, nil, err
		}
		resolved[key] = vtexID
	}

	// Resolve brands.
	for brand := range brands {
		key := "brand|" + brand
		existing, findErr := o.repo.FindMapping(ctx, vtexAccount, domain.EntityTypeBrand, brand)
		if findErr != nil {
			return nil, nil, findErr
		}
		if existing != nil {
			resolved[key] = existing.VTEXID
			continue
		}
		vtexID, createErr := o.vtex.FindOrCreateBrand(ctx, ports.BrandParams{
			VTEXAccount: vtexAccount,
			BrandName:   brand,
			LocalID:     brand,
		})
		if createErr != nil {
			failures[key] = createErr.Error()
			continue
		}
		if err := o.repo.SaveMapping(ctx, domain.VTEXEntityMapping{
			MappingID:   fmt.Sprintf("map_%s_brand_%s", vtexAccount, brand),
			TenantID:    o.tenantID,
			VTEXAccount: vtexAccount,
			EntityType:  domain.EntityTypeBrand,
			LocalID:     brand,
			VTEXID:      vtexID,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}); err != nil {
			return nil, nil, err
		}
		resolved[key] = vtexID
	}

	return resolved, failures, nil
}

// GetBatchStatus returns the batch record and all its operations.
func (o *BatchOrchestrator) GetBatchStatus(
	ctx context.Context,
	batchID string,
) (domain.PublicationBatch, []domain.PublicationOperation, error) {
	batch, err := o.repo.GetBatch(ctx, batchID)
	if err != nil {
		return domain.PublicationBatch{}, nil, fmt.Errorf("CONNECTORS_BATCH_NOT_FOUND: %w", err)
	}
	ops, err := o.repo.ListOperationsByBatch(ctx, batchID)
	if err != nil {
		return domain.PublicationBatch{}, nil, fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
	}
	return batch, ops, nil
}

// RetryBatch resets failed operations to pending and re-executes only those products.
func (o *BatchOrchestrator) RetryBatch(
	ctx context.Context,
	batchID string,
	vtexAccount string,
	products []ProductForPublish,
) (BatchCreateResult, error) {
	ops, err := o.repo.ListOperationsByBatch(ctx, batchID)
	if err != nil {
		return BatchCreateResult{}, fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
	}

	// Build a product lookup by ID.
	productByID := make(map[string]ProductForPublish)
	for _, p := range products {
		productByID[p.ProductID] = p
	}

	var failedProducts []ProductForPublish
	for _, op := range ops {
		if op.Status != domain.OperationStatusFailed {
			continue
		}
		p, ok := productByID[op.ProductID]
		if !ok {
			// No product data supplied for this failed op — skip it, don't reset.
			continue
		}
		if err := o.repo.UpdateOperationStatus(ctx, op.OperationID,
			domain.OperationStatusPending, "", "", ""); err != nil {
			return BatchCreateResult{}, fmt.Errorf("CONNECTORS_PUBLISH_INTERNAL: %w", err)
		}
		failedProducts = append(failedProducts, p)
	}

	if len(failedProducts) == 0 {
		return BatchCreateResult{
			BatchID:       batchID,
			TotalProducts: len(ops),
		}, nil
	}

	if err := o.ExecuteBatch(ctx, batchID, vtexAccount, failedProducts); err != nil {
		return BatchCreateResult{}, err
	}

	return BatchCreateResult{
		BatchID:       batchID,
		TotalProducts: len(ops),
		Validated:     len(failedProducts),
	}, nil
}

// validateProduct returns a structured error code if the product fails preflight checks,
// or an empty string if the product is valid.
func validateProduct(p ProductForPublish) string {
	switch {
	case p.ProductID == "":
		return "CONNECTORS_PUBLISH_MISSING_PRODUCT_ID"
	case p.Name == "":
		return "CONNECTORS_PUBLISH_MISSING_NAME"
	case p.SKUName == "":
		return "CONNECTORS_PUBLISH_MISSING_SKU"
	case p.EAN == "":
		return "CONNECTORS_PUBLISH_MISSING_EAN"
	case p.Category == "":
		return "CONNECTORS_PUBLISH_MISSING_CATEGORY"
	case p.Brand == "":
		return "CONNECTORS_PUBLISH_MISSING_BRAND"
	case p.BasePrice <= 0:
		return "CONNECTORS_PUBLISH_INVALID_PRICE"
	case p.StockQty < 0:
		return "CONNECTORS_PUBLISH_INVALID_STOCK"
	}
	return ""
}
