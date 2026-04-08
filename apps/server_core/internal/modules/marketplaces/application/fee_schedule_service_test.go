package application_test

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

// stubFeeRepo satisfies ports.FeeScheduleRepository for unit testing.
type stubFeeRepo struct {
	schedules []domain.FeeSchedule
	defs      []domain.MarketplaceDefinition
}

func (s *stubFeeRepo) UpsertSchedules(_ context.Context, rows []domain.FeeSchedule) error {
	s.schedules = append(s.schedules, rows...)
	return nil
}
func (s *stubFeeRepo) LookupFee(_ context.Context, code, cat, lt string) (domain.FeeSchedule, bool, error) {
	for _, row := range s.schedules {
		if row.MarketplaceCode == code && row.CategoryID == cat {
			return row, true, nil
		}
	}
	for _, row := range s.schedules {
		if row.MarketplaceCode == code && row.CategoryID == "default" {
			return row, true, nil
		}
	}
	return domain.FeeSchedule{}, false, nil
}
func (s *stubFeeRepo) ListByMarketplace(_ context.Context, code string) ([]domain.FeeSchedule, error) {
	return s.schedules, nil
}
func (s *stubFeeRepo) UpsertDefinitions(_ context.Context, defs []domain.MarketplaceDefinition) error {
	s.defs = append(s.defs, defs...)
	return nil
}
func (s *stubFeeRepo) ListDefinitions(_ context.Context) ([]domain.MarketplaceDefinition, error) {
	return s.defs, nil
}
func (s *stubFeeRepo) HasSchedules(_ context.Context, code string) (bool, error) {
	for _, row := range s.schedules {
		if row.MarketplaceCode == code {
			return true, nil
		}
	}
	return false, nil
}

var _ ports.FeeScheduleRepository = (*stubFeeRepo)(nil)

func TestLookupFee_ExactCategoryMatch(t *testing.T) {
	repo := &stubFeeRepo{
		schedules: []domain.FeeSchedule{
			{MarketplaceCode: "shopee", CategoryID: "electronics", CommissionPercent: 0.12},
			{MarketplaceCode: "shopee", CategoryID: "default", CommissionPercent: 0.14},
		},
	}
	svc := application.NewFeeScheduleService(repo)
	fee, found, err := svc.LookupFee(context.Background(), "shopee", "electronics", "")
	if err != nil || !found {
		t.Fatalf("expected fee found, got found=%v err=%v", found, err)
	}
	if fee.CommissionPercent != 0.12 {
		t.Errorf("expected 0.12, got %v", fee.CommissionPercent)
	}
}

func TestLookupFee_FallsBackToDefault(t *testing.T) {
	repo := &stubFeeRepo{
		schedules: []domain.FeeSchedule{
			{MarketplaceCode: "shopee", CategoryID: "default", CommissionPercent: 0.14},
		},
	}
	svc := application.NewFeeScheduleService(repo)
	fee, found, err := svc.LookupFee(context.Background(), "shopee", "unknown_cat", "")
	if err != nil || !found {
		t.Fatalf("expected fallback to default, got found=%v err=%v", found, err)
	}
	if fee.CommissionPercent != 0.14 {
		t.Errorf("expected 0.14, got %v", fee.CommissionPercent)
	}
}

func TestLookupFee_NotFound(t *testing.T) {
	repo := &stubFeeRepo{}
	svc := application.NewFeeScheduleService(repo)
	_, found, err := svc.LookupFee(context.Background(), "magalu", "any", "")
	if err != nil {
		t.Fatal(err)
	}
	if found {
		t.Error("expected not found")
	}
}
