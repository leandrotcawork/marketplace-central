package application

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

const feeSyncOperationType = "pricing_fee_sync"

type StartFeeSyncInput struct {
	InstallationID string
	ActorType      string
	ActorID        string
}

type FeeSyncAccepted struct {
	InstallationID string                    `json:"installation_id"`
	OperationRunID string                    `json:"operation_run_id"`
	Status         domain.OperationRunStatus `json:"status"`
}

type FeeSyncServiceConfig struct {
	Installations feeSyncInstallationReader
	Providers     feeSyncProviderReader
	Operations    feeSyncOperationRecorder
	Capabilities  feeSyncCapabilityWriter
	Executor      ports.FeeSyncExecutor
	AsyncRunner   func(func())
	Clock         feeSyncClock
}

type FeeSyncService struct {
	installations feeSyncInstallationReader
	providers     feeSyncProviderReader
	operations    feeSyncOperationRecorder
	capabilities  feeSyncCapabilityWriter
	executor      ports.FeeSyncExecutor
	asyncRunner   func(func())
	clock         feeSyncClock
	nextRunNumber int
}

type feeSyncClock interface {
	Now() time.Time
}

type systemFeeSyncClock struct{}

func (systemFeeSyncClock) Now() time.Time { return time.Now().UTC() }

type feeSyncInstallationReader interface {
	Get(ctx context.Context, installationID string) (domain.Installation, bool, error)
}

type feeSyncProviderReader interface {
	GetProviderDefinition(ctx context.Context, providerCode string) (domain.ProviderDefinition, bool, error)
}

type feeSyncOperationRecorder interface {
	Record(ctx context.Context, input RecordOperationInput) (domain.OperationRun, error)
}

type feeSyncCapabilityWriter interface {
	Upsert(ctx context.Context, states []domain.CapabilityState) error
}

func NewFeeSyncService(cfg FeeSyncServiceConfig) *FeeSyncService {
	asyncRunner := cfg.AsyncRunner
	if asyncRunner == nil {
		asyncRunner = func(fn func()) { fn() }
	}

	clock := cfg.Clock
	if clock == nil {
		clock = systemFeeSyncClock{}
	}

	return &FeeSyncService{
		installations: cfg.Installations,
		providers:     cfg.Providers,
		operations:    cfg.Operations,
		capabilities:  cfg.Capabilities,
		executor:      cfg.Executor,
		asyncRunner:   asyncRunner,
		clock:         clock,
	}
}

func (s *FeeSyncService) StartSync(ctx context.Context, input StartFeeSyncInput) (FeeSyncAccepted, error) {
	installationID := strings.TrimSpace(input.InstallationID)
	if installationID == "" {
		return FeeSyncAccepted{}, errors.New("INTEGRATIONS_INSTALLATION_INVALID")
	}

	inst, found, err := s.installations.Get(ctx, installationID)
	if err != nil {
		return FeeSyncAccepted{}, err
	}
	if !found {
		return FeeSyncAccepted{}, domain.ErrInstallationNotFound
	}
	if inst.Status == domain.InstallationStatusRequiresReauth {
		return FeeSyncAccepted{}, domain.ErrReauthCooldownActive
	}
	if inst.Status != domain.InstallationStatusConnected && inst.Status != domain.InstallationStatusDegraded {
		return FeeSyncAccepted{}, domain.ErrInstallationWrongStatus
	}

	provider, found, err := s.providers.GetProviderDefinition(ctx, inst.ProviderCode)
	if err != nil {
		return FeeSyncAccepted{}, err
	}
	if !found {
		return FeeSyncAccepted{}, errors.New("INTEGRATIONS_PROVIDER_INVALID")
	}
	_ = provider

	runID := s.nextOperationRunID()
	run, err := s.operations.Record(ctx, RecordOperationInput{
		OperationRunID: runID,
		InstallationID: inst.InstallationID,
		OperationType:  feeSyncOperationType,
		Status:         domain.OperationRunStatusQueued,
		ResultCode:     "INTEGRATIONS_FEE_SYNC_QUEUED",
		AttemptCount:   1,
		ActorType:      strings.TrimSpace(input.ActorType),
		ActorID:        strings.TrimSpace(input.ActorID),
	})
	if err != nil {
		return FeeSyncAccepted{}, err
	}

	s.asyncRunner(func() {
		_ = s.ExecuteSync(context.Background(), run)
	})

	return FeeSyncAccepted{
		InstallationID: inst.InstallationID,
		OperationRunID: run.OperationRunID,
		Status:         domain.OperationRunStatusQueued,
	}, nil
}

func (s *FeeSyncService) ExecuteSync(ctx context.Context, run domain.OperationRun) error {
	installationID := strings.TrimSpace(run.InstallationID)
	if installationID == "" {
		return errors.New("INTEGRATIONS_OPERATION_INVALID")
	}

	inst, found, err := s.installations.Get(ctx, installationID)
	if err != nil {
		return err
	}
	if !found {
		return domain.ErrInstallationNotFound
	}

	provider, found, err := s.providers.GetProviderDefinition(ctx, inst.ProviderCode)
	if err != nil {
		return err
	}
	if !found {
		return errors.New("INTEGRATIONS_PROVIDER_INVALID")
	}

	result, execErr := s.executor.Execute(ctx, inst, provider)
	finalState := capabilityStateFromFeeSync(result, execErr)
	finalState.TenantID = ""
	finalState.InstallationID = run.InstallationID
	if err := s.capabilities.Upsert(ctx, []domain.CapabilityState{finalState}); err != nil {
		return err
	}

	finalRunStatus := domain.OperationRunStatusSucceeded
	if finalState.Status != domain.CapabilityStatusEnabled {
		finalRunStatus = domain.OperationRunStatusFailed
	}

	_, recordErr := s.operations.Record(ctx, RecordOperationInput{
		OperationRunID: run.OperationRunID,
		InstallationID: run.InstallationID,
		OperationType:  feeSyncOperationType,
		Status:         finalRunStatus,
		ResultCode:     result.ResultCode,
		FailureCode:    result.FailureCode,
		AttemptCount:   run.AttemptCount,
		ActorType:      run.ActorType,
		ActorID:        run.ActorID,
		StartedAt:      ptrTime(s.clock.Now().UTC()),
		CompletedAt:    ptrTime(s.clock.Now().UTC()),
	})
	if recordErr != nil {
		return recordErr
	}

	return nil
}

func capabilityStateFromFeeSync(result ports.FeeSyncResult, execErr error) domain.CapabilityState {
	state := domain.CapabilityState{
		CapabilityCode: feeSyncOperationType,
		Status:         domain.CapabilityStatusEnabled,
		ReasonCode:     "INTEGRATIONS_FEE_SYNC_OK",
	}

	switch {
	case result.RequiresReauth || errors.Is(execErr, domain.ErrReauthAccountMismatch):
		state.Status = domain.CapabilityStatusRequiresReauth
		state.ReasonCode = "INTEGRATIONS_FEE_SYNC_REQUIRES_REAUTH"
	case result.Transient || execErr != nil:
		state.Status = domain.CapabilityStatusDegraded
		state.ReasonCode = firstNonEmpty(result.FailureCode, "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR")
	default:
		state.Status = domain.CapabilityStatusEnabled
		state.ReasonCode = firstNonEmpty(result.ResultCode, "INTEGRATIONS_FEE_SYNC_OK")
	}

	return state
}

func (s *FeeSyncService) nextOperationRunID() string {
	s.nextRunNumber++
	return fmt.Sprintf("run_%03d", s.nextRunNumber)
}
