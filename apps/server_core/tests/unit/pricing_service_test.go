package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/pricing/application"
	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
)

type pricingRepoStub struct {
	saved domain.Simulation
}

func (s *pricingRepoStub) SaveSimulation(_ context.Context, simulation domain.Simulation) error {
	s.saved = simulation
	return nil
}

func (s *pricingRepoStub) ListSimulations(context.Context) ([]domain.Simulation, error) { return nil, nil }

func TestRunSimulationCalculatesMarginAndStatus(t *testing.T) {
	repo := &pricingRepoStub{}
	service := application.NewService(repo, "tenant_default")

	simulation, err := service.RunSimulation(context.Background(), application.RunSimulationInput{
		SimulationID:      "sim-001",
		ProductID:         "SKU-001",
		AccountID:         "mercado-livre-main",
		BasePriceAmount:   250,
		CostAmount:        100,
		CommissionPercent: 0.16,
		FixedFeeAmount:    0,
		ShippingAmount:    20,
		MinMarginPercent:  0.12,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if simulation.MarginAmount != 90 {
		t.Fatalf("expected margin 90, got %v", simulation.MarginAmount)
	}

	if simulation.Status != "healthy" {
		t.Fatalf("expected healthy, got %q", simulation.Status)
	}
}
