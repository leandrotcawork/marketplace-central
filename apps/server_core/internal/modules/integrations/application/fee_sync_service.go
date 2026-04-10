package application

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

const (
	feeSyncOperationType             = "pricing_fee_sync"
	feeSyncUnsupportedErrorCode      = "INTEGRATIONS_FEE_SYNC_UNSUPPORTED"
	feeSyncRetryCooldownErrorCode    = "INTEGRATIONS_FEE_SYNC_RETRY_COOLDOWN"
	feeSyncRetryCooldown             = time.Hour
	feeSyncMaxAutomaticAttempts      = 3
	feeSyncInvalidConfigErrorCode    = "INTEGRATIONS_FEE_SYNC_INVALID_CONFIG"
	feeSyncRunIDGenerationErrorCode  = "INTEGRATIONS_FEE_SYNC_RUN_ID_GENERATION_FAILED"
	feeSyncOperationInvalidErrorCode = "INTEGRATIONS_OPERATION_INVALID"
	feeSyncProviderInvalidErrorCode  = "INTEGRATIONS_PROVIDER_INVALID"
	feeSyncProviderErrorCode         = "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR"
	feeSyncQueuedResultCode          = "INTEGRATIONS_FEE_SYNC_QUEUED"
	feeSyncRunningResultCode         = "INTEGRATIONS_FEE_SYNC_RUNNING"
	feeSyncSucceededResultCode       = "INTEGRATIONS_FEE_SYNC_OK"
)

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
	configErr     error
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
	ListByInstallation(ctx context.Context, installationID string) ([]domain.OperationRun, error)
}

type feeSyncCapabilityWriter interface {
	Upsert(ctx context.Context, states []domain.CapabilityState) error
}

func NewFeeSyncService(cfg FeeSyncServiceConfig) *FeeSyncService {
	svc := &FeeSyncService{
		installations: cfg.Installations,
		providers:     cfg.Providers,
		operations:    cfg.Operations,
		capabilities:  cfg.Capabilities,
		executor:      cfg.Executor,
		asyncRunner:   cfg.AsyncRunner,
		clock:         cfg.Clock,
	}

	switch {
	case cfg.Installations == nil,
		cfg.Providers == nil,
		cfg.Operations == nil,
		cfg.Capabilities == nil,
		cfg.Executor == nil:
		svc.configErr = errors.New(feeSyncInvalidConfigErrorCode)
	}

	if svc.asyncRunner == nil {
		svc.asyncRunner = func(fn func()) { fn() }
	}
	if svc.clock == nil {
		svc.clock = systemFeeSyncClock{}
	}

	return svc
}

func (s *FeeSyncService) StartSync(ctx context.Context, input StartFeeSyncInput) (FeeSyncAccepted, error) {
	if err := s.configError(); err != nil {
		return FeeSyncAccepted{}, err
	}

	installationID := strings.TrimSpace(input.InstallationID)
	if installationID == "" {
		return FeeSyncAccepted{}, errors.New(feeSyncOperationInvalidErrorCode)
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
		return FeeSyncAccepted{}, errors.New(feeSyncProviderInvalidErrorCode)
	}
	if !providerDeclaresFeeSync(provider) {
		return FeeSyncAccepted{}, errors.New(feeSyncUnsupportedErrorCode)
	}

	actorType := strings.TrimSpace(input.ActorType)
	attemptCount, err := s.nextAttemptCount(ctx, inst.InstallationID, actorType)
	if err != nil {
		return FeeSyncAccepted{}, err
	}

	runID, err := newFeeSyncRunID()
	if err != nil {
		return FeeSyncAccepted{}, err
	}

	queuedRun, err := s.operations.Record(ctx, RecordOperationInput{
		OperationRunID: runID,
		InstallationID: inst.InstallationID,
		OperationType:  feeSyncOperationType,
		Status:         domain.OperationRunStatusQueued,
		ResultCode:     feeSyncQueuedResultCode,
		AttemptCount:   attemptCount,
		ActorType:      actorType,
		ActorID:        strings.TrimSpace(input.ActorID),
	})
	if err != nil {
		return FeeSyncAccepted{}, err
	}

	s.asyncRunner(func() {
		bg := context.Background()
		if execErr := s.ExecuteSync(bg, queuedRun); execErr != nil {
			_ = s.persistFailedOperationRun(bg, queuedRun, execErr)
		}
	})

	return FeeSyncAccepted{
		InstallationID: inst.InstallationID,
		OperationRunID: queuedRun.OperationRunID,
		Status:         domain.OperationRunStatusQueued,
	}, nil
}

func (s *FeeSyncService) ExecuteSync(ctx context.Context, run domain.OperationRun) error {
	if err := s.configError(); err != nil {
		return err
	}

	installationID := strings.TrimSpace(run.InstallationID)
	if installationID == "" {
		return errors.New(feeSyncOperationInvalidErrorCode)
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
		return errors.New(feeSyncProviderInvalidErrorCode)
	}
	if !providerDeclaresFeeSync(provider) {
		return errors.New(feeSyncUnsupportedErrorCode)
	}

	now := s.clock.Now().UTC()
	runningRun, err := s.operations.Record(ctx, RecordOperationInput{
		OperationRunID: run.OperationRunID,
		InstallationID: run.InstallationID,
		OperationType:  feeSyncOperationType,
		Status:         domain.OperationRunStatusRunning,
		ResultCode:     feeSyncRunningResultCode,
		AttemptCount:   run.AttemptCount,
		ActorType:      run.ActorType,
		ActorID:        run.ActorID,
		StartedAt:      ptrTime(now),
	})
	if err != nil {
		return err
	}

	result, execErr := s.executor.Execute(ctx, inst, provider)
	finalState := capabilityStateFromFeeSync(inst.InstallationID, result, execErr)
	if err := s.capabilities.Upsert(ctx, []domain.CapabilityState{finalState}); err != nil {
		return err
	}

	finalStatus := domain.OperationRunStatusSucceeded
	if finalState.Status != domain.CapabilityStatusEnabled {
		finalStatus = domain.OperationRunStatusFailed
	}

	_, err = s.operations.Record(ctx, RecordOperationInput{
		OperationRunID: runningRun.OperationRunID,
		InstallationID: runningRun.InstallationID,
		OperationType:  feeSyncOperationType,
		Status:         finalStatus,
		ResultCode:     firstNonEmpty(result.ResultCode, feeSyncSucceededResultCode),
		FailureCode:    result.FailureCode,
		AttemptCount:   runningRun.AttemptCount,
		ActorType:      runningRun.ActorType,
		ActorID:        runningRun.ActorID,
		StartedAt:      runningRun.StartedAt,
		CompletedAt:    ptrTime(s.clock.Now().UTC()),
	})
	if err != nil {
		return err
	}

	return nil
}

func (s *FeeSyncService) nextAttemptCount(ctx context.Context, installationID, actorType string) (int, error) {
	runs, err := s.operations.ListByInstallation(ctx, installationID)
	if err != nil {
		return 0, err
	}

	now := s.clock.Now().UTC()
	lastAttemptCount := 0
	for _, run := range runs {
		if strings.TrimSpace(run.OperationType) != feeSyncOperationType {
			continue
		}
		switch run.Status {
		case domain.OperationRunStatusQueued, domain.OperationRunStatusRunning:
			return 0, errors.New(feeSyncRetryCooldownErrorCode)
		case domain.OperationRunStatusFailed:
			if strings.TrimSpace(run.FailureCode) != feeSyncProviderErrorCode {
				continue
			}
			if !recentOperationRun(run, now, feeSyncRetryCooldown) {
				continue
			}
			if run.AttemptCount > lastAttemptCount {
				lastAttemptCount = run.AttemptCount
			}
		}
	}

	if lastAttemptCount >= feeSyncMaxAutomaticAttempts && strings.TrimSpace(actorType) != "user" {
		return 0, errors.New(feeSyncRetryCooldownErrorCode)
	}

	nextAttempt := lastAttemptCount + 1
	if nextAttempt < 1 {
		nextAttempt = 1
	}

	return nextAttempt, nil
}

func recentOperationRun(run domain.OperationRun, now time.Time, cooldown time.Duration) bool {
	if cooldown <= 0 {
		return false
	}

	base := run.CompletedAt
	if base == nil {
		base = run.StartedAt
	}
	if base == nil {
		return false
	}

	return now.Sub(base.UTC()) < cooldown
}

func providerDeclaresFeeSync(provider domain.ProviderDefinition) bool {
	for _, capability := range provider.DeclaredCapabilities {
		if strings.TrimSpace(capability) == feeSyncOperationType {
			return true
		}
	}
	return false
}

func capabilityStateFromFeeSync(installationID string, result ports.FeeSyncResult, execErr error) domain.CapabilityState {
	state := domain.CapabilityState{
		InstallationID: installationID,
		CapabilityCode: feeSyncOperationType,
		Status:         domain.CapabilityStatusEnabled,
		ReasonCode:     feeSyncSucceededResultCode,
	}

	switch {
	case result.RequiresReauth || errors.Is(execErr, domain.ErrReauthAccountMismatch):
		state.Status = domain.CapabilityStatusRequiresReauth
		state.ReasonCode = "INTEGRATIONS_FEE_SYNC_REQUIRES_REAUTH"
	case result.ResultCode == feeSyncUnsupportedErrorCode:
		state.Status = domain.CapabilityStatusUnsupported
		state.ReasonCode = feeSyncUnsupportedErrorCode
	case result.Transient || execErr != nil:
		state.Status = domain.CapabilityStatusDegraded
		state.ReasonCode = firstNonEmpty(result.FailureCode, feeSyncProviderErrorCode)
	default:
		state.Status = domain.CapabilityStatusEnabled
		state.ReasonCode = firstNonEmpty(result.ResultCode, feeSyncSucceededResultCode)
	}

	return state
}

func (s *FeeSyncService) persistFailedOperationRun(ctx context.Context, run domain.OperationRun, err error) error {
	_, recErr := s.operations.Record(ctx, RecordOperationInput{
		OperationRunID: run.OperationRunID,
		InstallationID: run.InstallationID,
		OperationType:  feeSyncOperationType,
		Status:         domain.OperationRunStatusFailed,
		ResultCode:     feeSyncProviderErrorCode,
		FailureCode:    failureCodeForError(err),
		AttemptCount:   run.AttemptCount,
		ActorType:      run.ActorType,
		ActorID:        run.ActorID,
		StartedAt:      run.StartedAt,
		CompletedAt:    ptrTime(s.clock.Now().UTC()),
	})
	return recErr
}

func failureCodeForError(err error) string {
	if err == nil {
		return feeSyncProviderErrorCode
	}
	switch {
	case strings.Contains(err.Error(), feeSyncUnsupportedErrorCode):
		return feeSyncUnsupportedErrorCode
	case strings.Contains(err.Error(), feeSyncRetryCooldownErrorCode):
		return feeSyncRetryCooldownErrorCode
	case errors.Is(err, domain.ErrReauthAccountMismatch):
		return "INTEGRATIONS_FEE_SYNC_REQUIRES_REAUTH"
	default:
		return feeSyncProviderErrorCode
	}
}

func newFeeSyncRunID() (string, error) {
	var raw [12]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", errors.New(feeSyncRunIDGenerationErrorCode)
	}
	return "fs_" + hex.EncodeToString(raw[:]), nil
}

func (s *FeeSyncService) configError() error {
	if s == nil {
		return errors.New(feeSyncInvalidConfigErrorCode)
	}
	if s.configErr != nil {
		return s.configErr
	}
	return nil
}
