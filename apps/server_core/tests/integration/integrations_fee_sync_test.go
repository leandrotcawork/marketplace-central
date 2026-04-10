package integration

import (
	"context"
	"testing"
	"time"

	integrationsfeesync "marketplace-central/apps/server_core/internal/modules/integrations/adapters/feesync"
	integrationsapp "marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	marketplacesdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	marketplacesports "marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

func TestFeeSyncManualTriggerReturnsQueuedOperationAndCompletes(t *testing.T) {
	t.Parallel()

	h := newIntegrationFeeSyncHarness(t)
	accepted, err := h.service.StartSync(context.Background(), integrationsapp.StartFeeSyncInput{InstallationID: "inst_ml_001", ActorType: "user", ActorID: "user_001"})
	if err != nil || accepted.Status != domain.OperationRunStatusQueued {
		t.Fatalf("accepted=%#v err=%v", accepted, err)
	}

	if len(h.operationRecords) < 3 {
		t.Fatalf("operation records=%d, want queued+running+final", len(h.operationRecords))
	}
	if got, want := h.capabilityStates[len(h.capabilityStates)-1].Status, domain.CapabilityStatusEnabled; got != want {
		t.Fatalf("capability status=%q want=%q", got, want)
	}
}

func TestFeeSyncSeedProviderReseedsAndEnablesCapability(t *testing.T) {
	t.Parallel()

	h := newIntegrationFeeSyncHarness(t)
	_, err := h.service.StartSync(context.Background(), integrationsapp.StartFeeSyncInput{InstallationID: "inst_shopee_001", ActorType: "system", ActorID: "test"})
	if err != nil {
		t.Fatalf("StartSync() error=%v", err)
	}
	if len(h.upsertedSchedules) == 0 {
		t.Fatal("expected fee schedules to be upserted")
	}
	if got, want := h.upsertedSchedules[len(h.upsertedSchedules)-1].MarketplaceCode, "shopee"; got != want {
		t.Fatalf("marketplace code=%q want=%q", got, want)
	}
	if got, want := h.capabilityStates[len(h.capabilityStates)-1].Status, domain.CapabilityStatusEnabled; got != want {
		t.Fatalf("capability status=%q want=%q", got, want)
	}
}

type integrationFeeSyncHarness struct {
	service         *integrationsapp.FeeSyncService
	installations   map[string]domain.Installation
	providers       map[string]domain.ProviderDefinition
	operationRecords []domain.OperationRun
	operationByInst map[string][]domain.OperationRun
	capabilityStates []domain.CapabilityState
	upsertedSchedules []marketplacesdomain.FeeSchedule
	clock           fixedIntegrationClock
}

func newIntegrationFeeSyncHarness(t *testing.T) *integrationFeeSyncHarness {
	t.Helper()

	h := &integrationFeeSyncHarness{
		installations: map[string]domain.Installation{
			"inst_ml_001": {
				InstallationID: "inst_ml_001",
				ProviderCode:   "mercado_livre",
				Status:         domain.InstallationStatusConnected,
			},
			"inst_shopee_001": {
				InstallationID: "inst_shopee_001",
				ProviderCode:   "shopee",
				Status:         domain.InstallationStatusConnected,
			},
		},
		providers: map[string]domain.ProviderDefinition{
			"mercado_livre": {
				ProviderCode:         "mercado_livre",
				DeclaredCapabilities: []string{"pricing_fee_sync"},
				Metadata:             map[string]any{"fee_source": "api_sync"},
			},
			"shopee": {
				ProviderCode:         "shopee",
				DeclaredCapabilities: []string{"pricing_fee_sync"},
				Metadata:             map[string]any{"fee_source": "seed"},
			},
		},
		operationByInst: make(map[string][]domain.OperationRun),
		clock:           fixedIntegrationClock{now: time.Unix(1_000, 0).UTC()},
	}

	repo := &integrationFeeRepo{h: h}
	mlSyncer := &integrationSyncer{code: "mercado_livre", rows: []marketplacesdomain.FeeSchedule{{MarketplaceCode: "mercado_livre", CategoryID: "default", CommissionPercent: 0.16, Source: "seeded"}}}
	shopeeSyncer := &integrationSyncer{code: "shopee", rows: []marketplacesdomain.FeeSchedule{{MarketplaceCode: "shopee", CategoryID: "default", CommissionPercent: 0.14, Source: "seeded"}}}
	executor := integrationsfeesync.NewMarketplaceExecutor(repo, []marketplacesports.FeeScheduleSyncer{mlSyncer, shopeeSyncer})

	h.service = integrationsapp.NewFeeSyncService(integrationsapp.FeeSyncServiceConfig{
		Installations: integrationInstallationStore{h: h},
		Providers:     integrationProviderStore{h: h},
		Operations:    integrationOperationStore{h: h},
		Capabilities:  integrationCapabilityStore{h: h},
		Executor:      executor,
		AsyncRunner:   func(fn func()) { fn() },
		Clock:         h.clock,
	})

	return h
}

type fixedIntegrationClock struct{ now time.Time }

func (c fixedIntegrationClock) Now() time.Time { return c.now }

type integrationInstallationStore struct{ h *integrationFeeSyncHarness }

func (s integrationInstallationStore) Get(_ context.Context, installationID string) (domain.Installation, bool, error) {
	inst, ok := s.h.installations[installationID]
	return inst, ok, nil
}

type integrationProviderStore struct{ h *integrationFeeSyncHarness }

func (s integrationProviderStore) GetProviderDefinition(_ context.Context, providerCode string) (domain.ProviderDefinition, bool, error) {
	def, ok := s.h.providers[providerCode]
	return def, ok, nil
}

type integrationOperationStore struct{ h *integrationFeeSyncHarness }

func (s integrationOperationStore) Record(_ context.Context, input integrationsapp.RecordOperationInput) (domain.OperationRun, error) {
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
	s.h.operationRecords = append(s.h.operationRecords, run)
	s.h.operationByInst[input.InstallationID] = append(s.h.operationByInst[input.InstallationID], run)
	return run, nil
}

func (s integrationOperationStore) ListByInstallation(_ context.Context, installationID string) ([]domain.OperationRun, error) {
	return append([]domain.OperationRun(nil), s.h.operationByInst[installationID]...), nil
}

type integrationCapabilityStore struct{ h *integrationFeeSyncHarness }

func (s integrationCapabilityStore) Upsert(_ context.Context, states []domain.CapabilityState) error {
	s.h.capabilityStates = append(s.h.capabilityStates, states...)
	return nil
}

type integrationFeeRepo struct{ h *integrationFeeSyncHarness }

func (r *integrationFeeRepo) UpsertSchedules(_ context.Context, schedules []marketplacesdomain.FeeSchedule) error {
	r.h.upsertedSchedules = append(r.h.upsertedSchedules, schedules...)
	return nil
}

func (r *integrationFeeRepo) LookupFee(context.Context, string, string, string) (marketplacesdomain.FeeSchedule, bool, error) {
	return marketplacesdomain.FeeSchedule{}, false, nil
}

func (r *integrationFeeRepo) ListByMarketplace(context.Context, string) ([]marketplacesdomain.FeeSchedule, error) {
	return nil, nil
}

func (r *integrationFeeRepo) UpsertDefinitions(context.Context, []marketplacesdomain.MarketplaceDefinition) error {
	return nil
}

func (r *integrationFeeRepo) ListDefinitions(context.Context) ([]marketplacesdomain.MarketplaceDefinition, error) {
	return nil, nil
}

func (r *integrationFeeRepo) HasSchedules(context.Context, string) (bool, error) { return false, nil }

type integrationSyncer struct {
	code string
	rows []marketplacesdomain.FeeSchedule
}

func (s *integrationSyncer) MarketplaceCode() string { return s.code }

func (s *integrationSyncer) Sync(ctx context.Context, repo marketplacesports.FeeScheduleRepository) (int, error) {
	if err := repo.UpsertSchedules(ctx, s.rows); err != nil {
		return 0, err
	}
	return len(s.rows), nil
}
