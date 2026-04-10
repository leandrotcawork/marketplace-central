package feesync

import (
	"context"
	"errors"
	"fmt"
	"testing"

	connectorsdomain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	integrationsdomain "marketplace-central/apps/server_core/internal/modules/integrations/domain"
	marketplacesdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	marketplacesports "marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

func TestMarketplaceExecutorExecutesLiveSyncerForAPISource(t *testing.T) {
	t.Parallel()

	repo := &stubFeeScheduleRepo{}
	syncer := &stubFeeScheduleSyncer{marketplaceCode: "mercado_livre", rows: 7}
	executor := NewMarketplaceExecutor(repo, []marketplacesports.FeeScheduleSyncer{syncer})

	result, err := executor.Execute(context.Background(), integrationsdomain.Installation{ProviderCode: "mercado_livre"}, integrationsdomain.ProviderDefinition{
		ProviderCode: "mercado_livre",
		Metadata:     map[string]any{"fee_source": "api_sync"},
	})
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

func TestMarketplaceExecutorExecutesSeedSyncerForSeedSource(t *testing.T) {
	t.Parallel()

	repo := &stubFeeScheduleRepo{}
	syncer := &stubFeeScheduleSyncer{marketplaceCode: "shopee", rows: 3}
	executor := NewMarketplaceExecutor(repo, []marketplacesports.FeeScheduleSyncer{syncer})

	result, err := executor.Execute(context.Background(), integrationsdomain.Installation{ProviderCode: "shopee"}, integrationsdomain.ProviderDefinition{
		ProviderCode: "shopee",
		Metadata:     map[string]any{"fee_source": "seed"},
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if got, want := result.ResultCode, "INTEGRATIONS_FEE_SYNC_OK"; got != want {
		t.Fatalf("ResultCode = %q, want %q", got, want)
	}
	if got, want := result.RowsSynced, 3; got != want {
		t.Fatalf("RowsSynced = %d, want %d", got, want)
	}
	if syncer.calls != 1 {
		t.Fatalf("Sync() calls = %d, want 1", syncer.calls)
	}
}

func TestMarketplaceExecutorFallsBackToInstallationProviderCode(t *testing.T) {
	t.Parallel()

	repo := &stubFeeScheduleRepo{}
	syncer := &stubFeeScheduleSyncer{marketplaceCode: "mercado_livre", rows: 5}
	executor := NewMarketplaceExecutor(repo, []marketplacesports.FeeScheduleSyncer{syncer})

	result, err := executor.Execute(context.Background(), integrationsdomain.Installation{ProviderCode: "mercado_livre"}, integrationsdomain.ProviderDefinition{})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if got, want := result.ResultCode, "INTEGRATIONS_FEE_SYNC_OK"; got != want {
		t.Fatalf("ResultCode = %q, want %q", got, want)
	}
	if got, want := result.RowsSynced, 5; got != want {
		t.Fatalf("RowsSynced = %d, want %d", got, want)
	}
	if syncer.calls != 1 {
		t.Fatalf("Sync() calls = %d, want 1", syncer.calls)
	}
}

func TestMarketplaceExecutorClassifiesProviderErrors(t *testing.T) {
	t.Parallel()

	t.Run("auth-like error requires reauth", func(t *testing.T) {
		repo := &stubFeeScheduleRepo{}
		syncer := &stubFeeScheduleSyncer{
			marketplaceCode: "mercado_livre",
			err:             fmt.Errorf("wrapped: %w", connectorsdomain.ErrVTEXAuth),
		}
		executor := NewMarketplaceExecutor(repo, []marketplacesports.FeeScheduleSyncer{syncer})

		result, err := executor.Execute(context.Background(), integrationsdomain.Installation{ProviderCode: "mercado_livre"}, integrationsdomain.ProviderDefinition{
			ProviderCode: "mercado_livre",
			Metadata:     map[string]any{"fee_source": "api_sync"},
		})
		if err == nil {
			t.Fatal("Execute() error = nil, want provider error")
		}
		if got, want := result.ResultCode, "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR"; got != want {
			t.Fatalf("ResultCode = %q, want %q", got, want)
		}
		if got, want := result.FailureCode, "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR"; got != want {
			t.Fatalf("FailureCode = %q, want %q", got, want)
		}
		if !result.RequiresReauth {
			t.Fatal("RequiresReauth = false, want true")
		}
		if result.Transient {
			t.Fatal("Transient = true, want false")
		}
		if !errors.Is(err, connectorsdomain.ErrVTEXAuth) {
			t.Fatalf("Execute() error = %v, want wrapped auth error", err)
		}
	})

	t.Run("non-auth error is transient", func(t *testing.T) {
		repo := &stubFeeScheduleRepo{}
		syncer := &stubFeeScheduleSyncer{
			marketplaceCode: "mercado_livre",
			err:             errors.New("db unavailable"),
		}
		executor := NewMarketplaceExecutor(repo, []marketplacesports.FeeScheduleSyncer{syncer})

		result, err := executor.Execute(context.Background(), integrationsdomain.Installation{ProviderCode: "mercado_livre"}, integrationsdomain.ProviderDefinition{
			ProviderCode: "mercado_livre",
			Metadata:     map[string]any{"fee_source": "api_sync"},
		})
		if err == nil {
			t.Fatal("Execute() error = nil, want provider error")
		}
		if got, want := result.ResultCode, "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR"; got != want {
			t.Fatalf("ResultCode = %q, want %q", got, want)
		}
		if got, want := result.FailureCode, "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR"; got != want {
			t.Fatalf("FailureCode = %q, want %q", got, want)
		}
		if !result.Transient {
			t.Fatal("Transient = false, want true")
		}
		if result.RequiresReauth {
			t.Fatal("RequiresReauth = true, want false")
		}
	})
}

func TestMarketplaceExecutorReturnsUnsupportedWithNilError(t *testing.T) {
	t.Parallel()

	t.Run("empty source and code", func(t *testing.T) {
		executor := NewMarketplaceExecutor(&stubFeeScheduleRepo{}, nil)

		result, err := executor.Execute(context.Background(), integrationsdomain.Installation{}, integrationsdomain.ProviderDefinition{})
		if err != nil {
			t.Fatalf("Execute() error = %v, want nil", err)
		}
		if got, want := result.ResultCode, "INTEGRATIONS_FEE_SYNC_UNSUPPORTED"; got != want {
			t.Fatalf("ResultCode = %q, want %q", got, want)
		}
		if got, want := result.FailureCode, "INTEGRATIONS_FEE_SYNC_UNSUPPORTED"; got != want {
			t.Fatalf("FailureCode = %q, want %q", got, want)
		}
	})

	t.Run("unknown source", func(t *testing.T) {
		executor := NewMarketplaceExecutor(&stubFeeScheduleRepo{}, nil)

		result, err := executor.Execute(context.Background(), integrationsdomain.Installation{ProviderCode: "unknown"}, integrationsdomain.ProviderDefinition{
			ProviderCode: "unknown",
			Metadata:     map[string]any{"fee_source": "future_mode"},
		})
		if err != nil {
			t.Fatalf("Execute() error = %v, want nil", err)
		}
		if got, want := result.ResultCode, "INTEGRATIONS_FEE_SYNC_UNSUPPORTED"; got != want {
			t.Fatalf("ResultCode = %q, want %q", got, want)
		}
		if got, want := result.FailureCode, "INTEGRATIONS_FEE_SYNC_UNSUPPORTED"; got != want {
			t.Fatalf("FailureCode = %q, want %q", got, want)
		}
	})
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
	err             error
	repo            marketplacesports.FeeScheduleRepository
}

func (s *stubFeeScheduleSyncer) MarketplaceCode() string { return s.marketplaceCode }

func (s *stubFeeScheduleSyncer) Sync(_ context.Context, repo marketplacesports.FeeScheduleRepository) (int, error) {
	s.calls++
	s.repo = repo
	if s.err != nil {
		return 0, s.err
	}
	return s.rows, nil
}

var _ marketplacesports.FeeScheduleSyncer = (*stubFeeScheduleSyncer)(nil)
