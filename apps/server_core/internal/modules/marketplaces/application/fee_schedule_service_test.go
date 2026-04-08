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
	type scored struct {
		row      domain.FeeSchedule
		catScore int // 2=exact, 1=default
		ltScore  int // 2=exact, 1=null
	}
	var best *scored
	for _, row := range s.schedules {
		if row.MarketplaceCode != code {
			continue
		}
		catScore := 0
		if row.CategoryID == cat {
			catScore = 2
		} else if row.CategoryID == "default" {
			catScore = 1
		} else {
			continue
		}
		ltScore := 0
		if lt != "" && row.ListingType == lt {
			ltScore = 2
		} else if row.ListingType == "" {
			ltScore = 1
		} else {
			continue // specific listing_type row when caller passed "" — skip
		}
		c := &scored{row: row, catScore: catScore, ltScore: ltScore}
		if best == nil || c.catScore > best.catScore || (c.catScore == best.catScore && c.ltScore > best.ltScore) {
			best = c
		}
	}
	if best != nil {
		return best.row, true, nil
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

func TestLookupFee_ExactListingTypeBeatsNullCatchAll(t *testing.T) {
	repo := &stubFeeRepo{
		schedules: []domain.FeeSchedule{
			{MarketplaceCode: "mercado_livre", CategoryID: "default", ListingType: "classico", CommissionPercent: 0.16},
			{MarketplaceCode: "mercado_livre", CategoryID: "default", ListingType: "", CommissionPercent: 0.99},
		},
	}
	svc := application.NewFeeScheduleService(repo)
	fee, found, err := svc.LookupFee(context.Background(), "mercado_livre", "electronics", "classico")
	if err != nil || !found {
		t.Fatalf("expected found, got found=%v err=%v", found, err)
	}
	if fee.CommissionPercent != 0.16 {
		t.Errorf("exact listing_type should win: expected 0.16, got %v", fee.CommissionPercent)
	}
}

func TestLookupFee_NullCatchAllUsedWhenNoExactListingType(t *testing.T) {
	repo := &stubFeeRepo{
		schedules: []domain.FeeSchedule{
			{MarketplaceCode: "mercado_livre", CategoryID: "default", ListingType: "", CommissionPercent: 0.16},
		},
	}
	svc := application.NewFeeScheduleService(repo)
	fee, found, err := svc.LookupFee(context.Background(), "mercado_livre", "electronics", "classico")
	if err != nil || !found {
		t.Fatalf("expected NULL catch-all to match, got found=%v err=%v", found, err)
	}
	if fee.CommissionPercent != 0.16 {
		t.Errorf("expected 0.16, got %v", fee.CommissionPercent)
	}
}

func TestLookupFee_ExactCategoryBeatsDefault(t *testing.T) {
	repo := &stubFeeRepo{
		schedules: []domain.FeeSchedule{
			{MarketplaceCode: "shopee", CategoryID: "electronics", ListingType: "", CommissionPercent: 0.12},
			{MarketplaceCode: "shopee", CategoryID: "default", ListingType: "", CommissionPercent: 0.14},
		},
	}
	svc := application.NewFeeScheduleService(repo)
	fee, found, err := svc.LookupFee(context.Background(), "shopee", "electronics", "")
	if err != nil || !found {
		t.Fatalf("expected found, got found=%v err=%v", found, err)
	}
	if fee.CommissionPercent != 0.12 {
		t.Errorf("exact category should win: expected 0.12, got %v", fee.CommissionPercent)
	}
}

func TestLookupFee_EmptyListingTypeSkipsSpecificRows(t *testing.T) {
	repo := &stubFeeRepo{
		schedules: []domain.FeeSchedule{
			{MarketplaceCode: "mercado_livre", CategoryID: "default", ListingType: "classico", CommissionPercent: 0.16},
			{MarketplaceCode: "mercado_livre", CategoryID: "default", ListingType: "premium", CommissionPercent: 0.22},
		},
	}
	svc := application.NewFeeScheduleService(repo)
	_, found, err := svc.LookupFee(context.Background(), "mercado_livre", "any_cat", "")
	if err != nil {
		t.Fatal(err)
	}
	if found {
		t.Error("expected not found — no NULL catch-all, caller passed empty listing type")
	}
}
