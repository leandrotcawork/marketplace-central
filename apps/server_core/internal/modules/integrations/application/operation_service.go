package application

import (
	"context"
	"errors"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type RecordOperationInput struct {
	OperationRunID string
	InstallationID string
	OperationType  string
	Status         domain.OperationRunStatus
	ResultCode     string
	AttemptCount   int
}

type OperationService struct {
	store    ports.OperationRunStore
	tenantID string
}

func NewOperationService(store ports.OperationRunStore, tenantID string) *OperationService {
	return &OperationService{store: store, tenantID: tenantID}
}

func (s *OperationService) Record(ctx context.Context, input RecordOperationInput) (domain.OperationRun, error) {
	if input.OperationRunID == "" || input.InstallationID == "" || input.OperationType == "" || !isValidOperationRunStatus(input.Status) || input.AttemptCount < 0 {
		return domain.OperationRun{}, errors.New("INTEGRATIONS_OPERATION_INVALID")
	}

	now := time.Now().UTC()
	run := domain.OperationRun{
		OperationRunID: input.OperationRunID,
		TenantID:       s.tenantID,
		InstallationID: input.InstallationID,
		OperationType:  input.OperationType,
		Status:         input.Status,
		ResultCode:     input.ResultCode,
		AttemptCount:   input.AttemptCount,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	return run, s.store.SaveOperationRun(ctx, run)
}

func isValidOperationRunStatus(status domain.OperationRunStatus) bool {
	switch status {
	case domain.OperationRunStatusQueued,
		domain.OperationRunStatusRunning,
		domain.OperationRunStatusSucceeded,
		domain.OperationRunStatusFailed,
		domain.OperationRunStatusCancelled:
		return true
	default:
		return false
	}
}
