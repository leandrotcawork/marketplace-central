package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type feeSyncHarness struct {
	service         *FeeSyncService
	asyncCalls      int
	executor        *stubFeeSyncExecutor
	installations   *stubFeeSyncInstallationStore
	providers       *stubFeeSyncProviderStore
	operations      *stubFeeSyncOperationService
	capabilities    *stubFeeSyncCapabilityService
	clock           fixedFeeSyncClock
}

func newFeeSyncHarness(t *testing.T) *feeSyncHarness {
	t.Helper()

	now := time.Unix(1000, 0).UTC()
	installations := &stubFeeSyncInstallationStore{
		installations: map[string]domain.Installation{
			"inst_001": {
				InstallationID: "inst_001",
				ProviderCode:   "mercado_livre",
				Status:         domain.InstallationStatusConnected,
				HealthStatus:   domain.HealthStatusHealthy,
			},
		},
	}
	providers := &stubFeeSyncProviderStore{
		items: map[string]domain.ProviderDefinition{
			"mercado_livre": {
				ProviderCode: "mercado_livre",
				Metadata:     map[string]any{"fee_source": "api_sync"},
			},
		},
	}
	executor := &stubFeeSyncExecutor{}
	operations := &stubFeeSyncOperationService{}
	capabilities := &stubFeeSyncCapabilityService{}

	h := &feeSyncHarness{executor: executor, installations: installations, providers: providers, operations: operations, capabilities: capabilities, clock: fixedFeeSyncClock{now: now}}
	h.service = NewFeeSyncService(FeeSyncServiceConfig{
		Installations: installations,
		Providers:     providers,
		Operations:    operations,
		Capabilities:  capabilities,
		Executor:      executor,
		AsyncRunner: func(fn func()) {
			h.asyncCalls++
			fn()
		},
		Clock: h.clock,
	})
	return h
}

func TestStartSyncQueuesRunAndExecutesAsync(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	accepted, err := h.service.StartSync(context.Background(), StartFeeSyncInput{InstallationID: "inst_001", ActorType: "user", ActorID: "user_123"})
	if err != nil || accepted.Status != domain.OperationRunStatusQueued || h.asyncCalls != 1 {
		t.Fatalf("accepted=%#v async=%d err=%v", accepted, h.asyncCalls, err)
	}
	if got, want := accepted.InstallationID, "inst_001"; got != want {
		t.Fatalf("InstallationID = %q, want %q", got, want)
	}
	if got, want := accepted.OperationRunID, "run_001"; got != want {
		t.Fatalf("OperationRunID = %q, want %q", got, want)
	}
	if len(h.operations.saved) == 0 {
		t.Fatal("saved runs = 0, want at least 1")
	}
	saved := h.operations.saved[0]
	if saved.ActorType != "user" || saved.ActorID != "user_123" {
		t.Fatalf("saved run actor fields = %#v, want user/user_123", saved)
	}
}

func TestExecuteSyncMarksCapabilityRequiresReauthOnAuthFailure(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.executor.result = ports.FeeSyncResult{ResultCode: "INTEGRATIONS_FEE_SYNC_REQUIRES_REAUTH", FailureCode: "INTEGRATIONS_FEE_SYNC_REQUIRES_REAUTH", RequiresReauth: true}
	h.executor.err = domain.ErrReauthAccountMismatch
	err := h.service.ExecuteSync(context.Background(), domain.OperationRun{OperationRunID: "run_001", InstallationID: "inst_001", OperationType: feeSyncOperationType, AttemptCount: 1})
	if err != nil || h.capabilities.upserts[0][0].Status != domain.CapabilityStatusRequiresReauth {
		t.Fatalf("states=%#v err=%v", h.capabilities.upserts, err)
	}
}

func TestExecuteSyncMarksCapabilityDegradedOnTransientFailure(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.executor.result = ports.FeeSyncResult{ResultCode: "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR", FailureCode: "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR", Transient: true}
	h.executor.err = errors.New("temporary outage")

	err := h.service.ExecuteSync(context.Background(), domain.OperationRun{OperationRunID: "run_001", InstallationID: "inst_001", OperationType: feeSyncOperationType, AttemptCount: 1})
	if err != nil {
		t.Fatalf("ExecuteSync() error = %v", err)
	}
	if got, want := h.capabilities.upserts[0][0].Status, domain.CapabilityStatusDegraded; got != want {
		t.Fatalf("capability status = %q, want %q", got, want)
	}
}

func TestExecuteSyncMarksCapabilityEnabledOnSuccess(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.executor.result = ports.FeeSyncResult{ResultCode: "INTEGRATIONS_FEE_SYNC_OK", RowsSynced: 1}

	err := h.service.ExecuteSync(context.Background(), domain.OperationRun{OperationRunID: "run_001", InstallationID: "inst_001", OperationType: feeSyncOperationType, AttemptCount: 1})
	if err != nil {
		t.Fatalf("ExecuteSync() error = %v", err)
	}
	if got, want := h.capabilities.upserts[0][0].Status, domain.CapabilityStatusEnabled; got != want {
		t.Fatalf("capability status = %q, want %q", got, want)
	}
}

func TestStartSyncRejectsRetryCooldown(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.installations.installations["inst_001"] = domain.Installation{
		InstallationID: "inst_001",
		ProviderCode:   "mercado_livre",
		Status:         domain.InstallationStatusRequiresReauth,
		HealthStatus:   domain.HealthStatusWarning,
	}

	_, err := h.service.StartSync(context.Background(), StartFeeSyncInput{InstallationID: "inst_001", ActorType: "user", ActorID: "user_123"})
	if err == nil {
		t.Fatal("StartSync() error = nil, want retry cooldown error")
	}
	if got, want := err.Error(), "INTEGRATIONS_REAUTH_COOLDOWN_ACTIVE"; got != want {
		t.Fatalf("StartSync() error = %q, want %q", got, want)
	}
}

type fixedFeeSyncClock struct {
	now time.Time
}

func (c fixedFeeSyncClock) Now() time.Time { return c.now }

type stubFeeSyncInstallationStore struct {
	installations map[string]domain.Installation
}

func (s *stubFeeSyncInstallationStore) Get(ctx context.Context, installationID string) (domain.Installation, bool, error) {
	inst, ok := s.installations[installationID]
	return inst, ok, nil
}

func (s *stubFeeSyncInstallationStore) List(ctx context.Context) ([]domain.Installation, error) {
	items := make([]domain.Installation, 0, len(s.installations))
	for _, inst := range s.installations {
		items = append(items, inst)
	}
	return items, nil
}

func (s *stubFeeSyncInstallationStore) UpdateStatus(context.Context, string, domain.InstallationStatus, domain.HealthStatus) error {
	return nil
}

func (s *stubFeeSyncInstallationStore) UpdateActiveCredentialID(context.Context, string, string) error {
	return nil
}

func (s *stubFeeSyncInstallationStore) GetProviderDefinition(context.Context, string) (domain.ProviderDefinition, bool, error) {
	return domain.ProviderDefinition{}, false, nil
}

type stubFeeSyncProviderStore struct {
	items map[string]domain.ProviderDefinition
}

func (s *stubFeeSyncProviderStore) Get(ctx context.Context, providerCode string) (domain.ProviderDefinition, bool, error) {
	item, ok := s.items[providerCode]
	return item, ok, nil
}

func (s *stubFeeSyncProviderStore) GetProviderDefinition(ctx context.Context, providerCode string) (domain.ProviderDefinition, bool, error) {
	return s.Get(ctx, providerCode)
}

type stubFeeSyncOperationService struct {
	nextID int
	saved  []domain.OperationRun
}

func (s *stubFeeSyncOperationService) Record(ctx context.Context, input RecordOperationInput) (domain.OperationRun, error) {
	s.nextID++
	run := domain.OperationRun{
		OperationRunID: input.OperationRunID,
		InstallationID: input.InstallationID,
		OperationType:  input.OperationType,
		Status:         input.Status,
		ResultCode:     input.ResultCode,
		FailureCode:    input.FailureCode,
		AttemptCount:   input.AttemptCount,
		ActorType:      input.ActorType,
		ActorID:        input.ActorID,
		StartedAt:      input.StartedAt,
		CompletedAt:    input.CompletedAt,
	}
	s.saved = append(s.saved, run)
	return run, nil
}

func (s *stubFeeSyncOperationService) ListByInstallation(context.Context, string) ([]domain.OperationRun, error) {
	return nil, nil
}

type stubFeeSyncCapabilityService struct {
	upserts [][]domain.CapabilityState
}

func (s *stubFeeSyncCapabilityService) Upsert(ctx context.Context, states []domain.CapabilityState) error {
	copied := append([]domain.CapabilityState(nil), states...)
	s.upserts = append(s.upserts, copied)
	return nil
}

func (s *stubFeeSyncCapabilityService) Resolve(ctx context.Context, installationID string, declared ports.MarketplaceCapabilities) ([]domain.CapabilityState, error) {
	return nil, nil
}

type stubFeeSyncExecutor struct {
	result ports.FeeSyncResult
	err    error
}

func (s *stubFeeSyncExecutor) Execute(ctx context.Context, installation domain.Installation, provider domain.ProviderDefinition) (ports.FeeSyncResult, error) {
	return s.result, s.err
}
