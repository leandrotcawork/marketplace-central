package feesync

import (
	"context"
	"testing"

	integrationsdomain "marketplace-central/apps/server_core/internal/modules/integrations/domain"
	marketplacesdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	marketplacesports "marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

func TestMarketplaceExecutorExecutesLiveSyncerForAPISource(t *testing.T) {
	t.Parallel()

	repo := &stubFeeScheduleRepo{}
	syncer := &stubFeeScheduleSyncer{marketplaceCode: "mercado_livre", rows: 7}
	executor := NewMarketplaceExecutor(repo, []marketplacesports.FeeScheduleSyncer{syncer})

	result, err := executor.Execute(context.Background(), integrationsdomain.Installation{ProviderCode: "mercado_livre"}, integrationsdomain.ProviderDefinition{ProviderCode: "mercado_livre"})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if result.RowsSynced != 7 {
		t.Fatalf("RowsSynced = %d, want 7", result.RowsSynced)
	}
	if got, want := result.ResultCode, "INTEGRATIONS_FEE_SYNC_OK"; got != want {
		t.Fatalf("ResultCode = %q, want %q", got, want)
	}
	if syncer.calls != 1 {
		t.Fatalf("Sync() calls = %d, want 1", syncer.calls)
	}
	if syncer.repo != repo {
		t.Fatalf("Sync() repo = %#v, want %#v", syncer.repo, repo)
	}
}

func TestMarketplaceExecutorReturnsUnsupportedWhenNoSyncerMatches(t *testing.T) {
	t.Parallel()

	executor := NewMarketplaceExecutor(&stubFeeScheduleRepo{}, nil)

	result, err := executor.Execute(context.Background(), integrationsdomain.Installation{ProviderCode: "unknown"}, integrationsdomain.ProviderDefinition{ProviderCode: "unknown"})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if got, want := result.ResultCode, "INTEGRATIONS_FEE_SYNC_UNSUPPORTED"; got != want {
		t.Fatalf("ResultCode = %q, want %q", got, want)
	}
	if got, want := result.FailureCode, "INTEGRATIONS_FEE_SYNC_UNSUPPORTED"; got != want {
		t.Fatalf("FailureCode = %q, want %q", got, want)
	}
}

type stubFeeScheduleRepo struct{}

func (s *stubFeeScheduleRepo) UpsertSchedules(context.Context, []marketplacesdomain.FeeSchedule) error {
	return nil
}
func (s *stubFeeScheduleRepo) LookupFee(context.Context, string, string, string) (marketplacesdomain.FeeSchedule, bool, error) {
	return marketplacesdomain.FeeSchedule{}, false, nil
}
func (s *stubFeeScheduleRepo) ListByMarketplace(context.Context, string) ([]marketplacesdomain.FeeSchedule, error) {
	return nil, nil
}
func (s *stubFeeScheduleRepo) UpsertDefinitions(context.Context, []marketplacesdomain.MarketplaceDefinition) error {
	return nil
}
func (s *stubFeeScheduleRepo) ListDefinitions(context.Context) ([]marketplacesdomain.MarketplaceDefinition, error) {
	return nil, nil
}
func (s *stubFeeScheduleRepo) HasSchedules(context.Context, string) (bool, error) { return false, nil }

var _ marketplacesports.FeeScheduleRepository = (*stubFeeScheduleRepo)(nil)

type stubFeeScheduleSyncer struct {
	marketplaceCode string
	rows            int
	calls           int
	repo            marketplacesports.FeeScheduleRepository
}

func (s *stubFeeScheduleSyncer) MarketplaceCode() string { return s.marketplaceCode }

func (s *stubFeeScheduleSyncer) Sync(_ context.Context, repo marketplacesports.FeeScheduleRepository) (int, error) {
	s.calls++
	s.repo = repo
	return s.rows, nil
}

var _ marketplacesports.FeeScheduleSyncer = (*stubFeeScheduleSyncer)(nil)
