package ports

import (
	"context"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
)

type Repository interface {
	// Batch operations
	SaveBatch(ctx context.Context, batch domain.PublicationBatch) error
	GetBatch(ctx context.Context, batchID string) (domain.PublicationBatch, error)
	UpdateBatchStatus(ctx context.Context, batchID, status string, succeededCount, failedCount int) error

	// Operation operations
	SaveOperation(ctx context.Context, op domain.PublicationOperation) error
	ListOperationsByBatch(ctx context.Context, batchID string) ([]domain.PublicationOperation, error)
	UpdateOperationStatus(ctx context.Context, operationID, status, currentStep, errorCode, errorMessage string) error
	HasActiveOperation(ctx context.Context, vtexAccount, productID string) (bool, error)

	// Step result operations
	SaveStepResult(ctx context.Context, result domain.PipelineStepResult) error
	UpdateStepResult(ctx context.Context, stepResultID, status string, vtexEntityID *string, errorCode, errorMessage string) error
	ListStepResultsByOperation(ctx context.Context, operationID string) ([]domain.PipelineStepResult, error)

	// Entity mapping operations
	FindMapping(ctx context.Context, vtexAccount, entityType, localID string) (*domain.VTEXEntityMapping, error)
	SaveMapping(ctx context.Context, mapping domain.VTEXEntityMapping) error
}
