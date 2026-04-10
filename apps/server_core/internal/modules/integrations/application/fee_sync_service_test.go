package application

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type feeSyncHarness struct {
	service       *FeeSyncService
	asyncCalls    int
	installations *stubFeeSyncInstallationStore
	providers     *stubFeeSyncProviderStore
	operations    *stubFeeSyncOperationService
	capabilities  *stubFeeSyncCapabilityService
	executor      *stubFeeSyncExecutor
}

func newFeeSyncHarness(t *testing.T) *feeSyncHarness {
	t.Helper()

	now := time.Unix(1_000, 0).UTC()
	installations := &stubFeeSyncInstallationStore{
		items: map[string]domain.Installation{
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
				ProviderCode:         "mercado_livre",
				DeclaredCapabilities: []string{feeSyncOperationType},
				Metadata:             map[string]any{"fee_source": "api_sync"},
			},
		},
	}
	operations := &stubFeeSyncOperationService{history: map[string][]domain.OperationRun{}}
	capabilities := &stubFeeSyncCapabilityService{}
	executor := &stubFeeSyncExecutor{}

	h := &feeSyncHarness{
		installations: installations,
		providers:     providers,
		operations:    operations,
		capabilities:  capabilities,
		executor:      executor,
	}
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
		Clock: fixedFeeSyncClock{now: now},
	})
	return h
}

func TestStartSyncQueuesRunAndExecutesAsync(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)

	accepted, err := h.service.StartSync(context.Background(), StartFeeSyncInput{
		InstallationID: "inst_001",
		ActorType:      "user",
		ActorID:        "user_123",
	})
	if err != nil {
		t.Fatalf("StartSync() error = %v", err)
	}
	if accepted.Status != domain.OperationRunStatusQueued {
		t.Fatalf("status = %q, want queued", accepted.Status)
	}
	if h.asyncCalls != 1 {
		t.Fatalf("async calls = %d, want 1", h.asyncCalls)
	}
	if len(h.operations.records) != 3 {
		t.Fatalf("operation records = %d, want queued+running+final", len(h.operations.records))
	}
	if got, want := h.operations.lastListedInstallationID, "inst_001"; got != want {
		t.Fatalf("listed installation id = %q, want %q", got, want)
	}
	if got, want := h.operations.records[0].Status, domain.OperationRunStatusQueued; got != want {
		t.Fatalf("first status = %q, want %q", got, want)
	}
	if got, want := h.operations.records[1].Status, domain.OperationRunStatusRunning; got != want {
		t.Fatalf("second status = %q, want %q", got, want)
	}
	if got, want := h.operations.records[2].Status, domain.OperationRunStatusSucceeded; got != want {
		t.Fatalf("third status = %q, want %q", got, want)
	}
	if len(h.capabilities.upserts) != 1 {
		t.Fatalf("capability updates = %d, want 1", len(h.capabilities.upserts))
	}
	if got, want := h.capabilities.upserts[0][0].Status, domain.CapabilityStatusEnabled; got != want {
		t.Fatalf("capability status = %q, want %q", got, want)
	}
	if got, want := h.operations.records[0].OperationRunID, accepted.OperationRunID; got != want {
		t.Fatalf("operation run id = %q, want %q", got, want)
	}
}

func TestExecuteSyncMarksCapabilityRequiresReauthOnAuthFailure(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.executor.result = ports.FeeSyncResult{
		ResultCode:     "INTEGRATIONS_FEE_SYNC_REQUIRES_REAUTH",
		FailureCode:    "INTEGRATIONS_FEE_SYNC_REQUIRES_REAUTH",
		RequiresReauth: true,
	}
	h.executor.err = domain.ErrReauthAccountMismatch

	err := h.service.ExecuteSync(context.Background(), domain.OperationRun{
		OperationRunID: "run_test",
		InstallationID: "inst_001",
		OperationType:  feeSyncOperationType,
		AttemptCount:   1,
	})
	if err != nil {
		t.Fatalf("ExecuteSync() error = %v", err)
	}
	if got, want := h.capabilities.upserts[0][0].Status, domain.CapabilityStatusRequiresReauth; got != want {
		t.Fatalf("capability status = %q, want %q", got, want)
	}
}

func TestExecuteSyncMarksCapabilityDegradedOnTransientFailure(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.executor.result = ports.FeeSyncResult{
		ResultCode:  "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR",
		FailureCode: "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR",
		Transient:   true,
	}
	h.executor.err = errors.New("temporary outage")

	err := h.service.ExecuteSync(context.Background(), domain.OperationRun{
		OperationRunID: "run_test",
		InstallationID: "inst_001",
		OperationType:  feeSyncOperationType,
		AttemptCount:   1,
	})
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

	err := h.service.ExecuteSync(context.Background(), domain.OperationRun{
		OperationRunID: "run_test",
		InstallationID: "inst_001",
		OperationType:  feeSyncOperationType,
		AttemptCount:   1,
	})
	if err != nil {
		t.Fatalf("ExecuteSync() error = %v", err)
	}
	if got, want := h.capabilities.upserts[0][0].Status, domain.CapabilityStatusEnabled; got != want {
		t.Fatalf("capability status = %q, want %q", got, want)
	}
}

func TestExecuteSyncMapsUnsupportedResultToUnsupportedCapability(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.executor.result = ports.FeeSyncResult{
		ResultCode:  "INTEGRATIONS_FEE_SYNC_UNSUPPORTED",
		FailureCode: "INTEGRATIONS_FEE_SYNC_UNSUPPORTED",
	}

	err := h.service.ExecuteSync(context.Background(), domain.OperationRun{
		OperationRunID: "run_test",
		InstallationID: "inst_001",
		OperationType:  feeSyncOperationType,
		AttemptCount:   1,
	})
	if err != nil {
		t.Fatalf("ExecuteSync() error = %v", err)
	}
	if got, want := h.capabilities.upserts[0][0].Status, domain.CapabilityStatusUnsupported; got != want {
		t.Fatalf("capability status = %q, want %q", got, want)
	}
}

func TestStartSyncRejectsMissingFeeSyncCapability(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.providers.items["mercado_livre"] = domain.ProviderDefinition{
		ProviderCode:         "mercado_livre",
		DeclaredCapabilities: []string{"inventory_sync"},
		Metadata:             map[string]any{"fee_source": "api_sync"},
	}

	_, err := h.service.StartSync(context.Background(), StartFeeSyncInput{
		InstallationID: "inst_001",
		ActorType:      "user",
		ActorID:        "user_123",
	})
	if err == nil {
		t.Fatal("StartSync() error = nil, want unsupported error")
	}
	if got, want := err.Error(), "INTEGRATIONS_FEE_SYNC_UNSUPPORTED"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestStartSyncRejectsRequiresReauthInstallationStatus(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.installations.items["inst_001"] = domain.Installation{
		InstallationID: "inst_001",
		ProviderCode:   "mercado_livre",
		Status:         domain.InstallationStatusRequiresReauth,
		HealthStatus:   domain.HealthStatusWarning,
	}

	_, err := h.service.StartSync(context.Background(), StartFeeSyncInput{
		InstallationID: "inst_001",
		ActorType:      "user",
		ActorID:        "user_123",
	})
	if !errors.Is(err, domain.ErrReauthCooldownActive) {
		t.Fatalf("error = %v, want %v", err, domain.ErrReauthCooldownActive)
	}
}

func TestStartSyncRejectsWrongInstallationStatus(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.installations.items["inst_001"] = domain.Installation{
		InstallationID: "inst_001",
		ProviderCode:   "mercado_livre",
		Status:         domain.InstallationStatusSuspended,
		HealthStatus:   domain.HealthStatusWarning,
	}

	_, err := h.service.StartSync(context.Background(), StartFeeSyncInput{
		InstallationID: "inst_001",
		ActorType:      "user",
		ActorID:        "user_123",
	})
	if !errors.Is(err, domain.ErrInstallationWrongStatus) {
		t.Fatalf("error = %v, want %v", err, domain.ErrInstallationWrongStatus)
	}
}

func TestStartSyncRejectsRetryCooldownFromOperationHistory(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.operations.history["inst_001"] = []domain.OperationRun{
		{
			OperationRunID: "run_old",
			InstallationID: "inst_001",
			OperationType:  feeSyncOperationType,
			Status:         domain.OperationRunStatusSucceeded,
			CompletedAt:    ptrTime(time.Unix(900, 0).UTC()),
		},
	}

	_, err := h.service.StartSync(context.Background(), StartFeeSyncInput{
		InstallationID: "inst_001",
		ActorType:      "user",
		ActorID:        "user_123",
	})
	if err == nil {
		t.Fatal("StartSync() error = nil, want retry cooldown error")
	}
	if got, want := err.Error(), "INTEGRATIONS_FEE_SYNC_RETRY_COOLDOWN"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestStartSyncRejectsInFlightOperation(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.operations.history["inst_001"] = []domain.OperationRun{
		{
			OperationRunID: "run_running",
			InstallationID: "inst_001",
			OperationType:  feeSyncOperationType,
			Status:         domain.OperationRunStatusRunning,
			StartedAt:      ptrTime(time.Unix(995, 0).UTC()),
		},
	}

	_, err := h.service.StartSync(context.Background(), StartFeeSyncInput{
		InstallationID: "inst_001",
		ActorType:      "user",
		ActorID:        "user_123",
	})
	if err == nil {
		t.Fatal("StartSync() error = nil, want retry cooldown error")
	}
	if got, want := err.Error(), "INTEGRATIONS_FEE_SYNC_RETRY_COOLDOWN"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestStartSyncGeneratesCollisionResistantRunIDs(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	ids := make(map[string]struct{}, 4)
	for i := 0; i < 4; i++ {
		accepted, err := h.service.StartSync(context.Background(), StartFeeSyncInput{
			InstallationID: "inst_001",
			ActorType:      "user",
			ActorID:        fmt.Sprintf("user_%d", i),
		})
		if err != nil {
			t.Fatalf("StartSync() error = %v", err)
		}
		if _, ok := ids[accepted.OperationRunID]; ok {
			t.Fatalf("duplicate run id %q", accepted.OperationRunID)
		}
		ids[accepted.OperationRunID] = struct{}{}
		if strings.HasPrefix(accepted.OperationRunID, "run_0") {
			t.Fatalf("run id = %q, want non-sequential id", accepted.OperationRunID)
		}
		h.operations.history["inst_001"] = nil
	}
}

func TestStartSyncReturnsConfigErrorInsteadOfPanicking(t *testing.T) {
	t.Parallel()

	svc := NewFeeSyncService(FeeSyncServiceConfig{})
	_, err := svc.StartSync(context.Background(), StartFeeSyncInput{InstallationID: "inst_001"})
	if err == nil {
		t.Fatal("StartSync() error = nil, want config error")
	}
}

func TestExecuteSyncPersistFailedRunOnAsyncError(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.capabilities.failUpsert = errors.New("write failed")

	_, err := h.service.StartSync(context.Background(), StartFeeSyncInput{
		InstallationID: "inst_001",
		ActorType:      "user",
		ActorID:        "user_123",
	})
	if err != nil {
		t.Fatalf("StartSync() error = %v", err)
	}
	if len(h.operations.records) < 3 {
		t.Fatalf("operation records = %d, want failure record persisted after async error", len(h.operations.records))
	}
	if got, want := h.operations.records[len(h.operations.records)-1].Status, domain.OperationRunStatusFailed; got != want {
		t.Fatalf("final status = %q, want %q", got, want)
	}
	if got, want := h.operations.records[len(h.operations.records)-1].FailureCode, feeSyncProviderErrorCode; got != want {
		t.Fatalf("final failure code = %q, want %q", got, want)
	}
}

type fixedFeeSyncClock struct {
	now time.Time
}

func (c fixedFeeSyncClock) Now() time.Time { return c.now }

type stubFeeSyncInstallationStore struct {
	items map[string]domain.Installation
}

func (s *stubFeeSyncInstallationStore) Get(_ context.Context, installationID string) (domain.Installation, bool, error) {
	inst, ok := s.items[installationID]
	return inst, ok, nil
}

type stubFeeSyncProviderStore struct {
	items map[string]domain.ProviderDefinition
}

func (s *stubFeeSyncProviderStore) GetProviderDefinition(_ context.Context, providerCode string) (domain.ProviderDefinition, bool, error) {
	item, ok := s.items[providerCode]
	return item, ok, nil
}

type stubFeeSyncOperationService struct {
	records                  []domain.OperationRun
	history                  map[string][]domain.OperationRun
	lastListedInstallationID string
}

func (s *stubFeeSyncOperationService) Record(_ context.Context, input RecordOperationInput) (domain.OperationRun, error) {
	now := time.Unix(int64(1000+len(s.records)), 0).UTC()
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
		StartedAt:      cloneTimePtr(input.StartedAt),
		CompletedAt:    cloneTimePtr(input.CompletedAt),
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	s.records = append(s.records, run)
	history := append([]domain.OperationRun(nil), s.history[input.InstallationID]...)
	history = append(history, run)
	s.history[input.InstallationID] = history
	return run, nil
}

func (s *stubFeeSyncOperationService) ListByInstallation(_ context.Context, installationID string) ([]domain.OperationRun, error) {
	s.lastListedInstallationID = installationID
	return append([]domain.OperationRun(nil), s.history[installationID]...), nil
}

type stubFeeSyncCapabilityService struct {
	upserts    [][]domain.CapabilityState
	failUpsert error
}

func (s *stubFeeSyncCapabilityService) Upsert(_ context.Context, states []domain.CapabilityState) error {
	if s.failUpsert != nil {
		return s.failUpsert
	}
	s.upserts = append(s.upserts, append([]domain.CapabilityState(nil), states...))
	return nil
}

func (s *stubFeeSyncCapabilityService) Resolve(context.Context, string, ports.MarketplaceCapabilities) ([]domain.CapabilityState, error) {
	return nil, nil
}

type stubFeeSyncExecutor struct {
	result ports.FeeSyncResult
	err    error
}

func (s *stubFeeSyncExecutor) Execute(context.Context, domain.Installation, domain.ProviderDefinition) (ports.FeeSyncResult, error) {
	return s.result, s.err
}
