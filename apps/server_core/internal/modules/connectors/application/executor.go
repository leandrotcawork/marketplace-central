package application

import (
	"context"
	"errors"
	"fmt"
	"time"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

// ProductPublishData holds the product-specific data needed for the pipeline.
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

// PipelineExecutor runs steps 3-9 for a single product operation.
type PipelineExecutor struct {
	repo ports.Repository
	vtex ports.VTEXCatalogPort
}

func NewPipelineExecutor(repo ports.Repository, vtex ports.VTEXCatalogPort) *PipelineExecutor {
	return &PipelineExecutor{repo: repo, vtex: vtex}
}

// Execute runs per-product steps 3-9. resolvedMappings contains VTEX IDs
// for shared resources: "category" -> vtexID, "brand" -> vtexID.
// Returns a system error only if a DB operation fails. A step failure
// (VTEX rejected) is persisted to DB and returns nil.
func (e *PipelineExecutor) Execute(
	ctx context.Context,
	op domain.PublicationOperation,
	data ProductPublishData,
	resolvedMappings map[string]string,
) error {
	if err := e.repo.UpdateOperationStatus(ctx, op.OperationID,
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

		if err := e.repo.UpdateOperationStatus(ctx, op.OperationID,
			domain.OperationStatusInProgress, step, "", ""); err != nil {
			return err
		}

		vtexID, stepErr := e.executeStep(ctx, step, op, data, vtexCategoryID, vtexBrandID, vtexProductID, vtexSKUID)

		if stepErr != nil {
			errCode := classifyError(stepErr)
			_ = e.repo.UpdateStepResult(ctx, stepResultID,
				domain.StepStatusFailed, nil, errCode, stepErr.Error())
			_ = e.repo.UpdateOperationStatus(ctx, op.OperationID,
				domain.OperationStatusFailed, step, errCode, stepErr.Error())
			return nil // pipeline halted for this product, not a system error
		}

		_ = e.repo.UpdateStepResult(ctx, stepResultID,
			domain.StepStatusSucceeded, vtexID, "", "")

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

	_ = e.repo.UpdateOperationStatus(ctx, op.OperationID,
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
		// Reconciliation-first: check existing mapping before creating
		existing, err := e.repo.FindMapping(ctx, op.VTEXAccount, domain.EntityTypeProduct, op.ProductID)
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
		existing, err := e.repo.FindMapping(ctx, op.VTEXAccount, domain.EntityTypeSKU, data.EAN)
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
