package application

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
	"marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type RunSimulationInput struct {
	SimulationID      string
	ProductID         string
	AccountID         string
	BasePriceAmount   float64
	CostAmount        float64
	CommissionPercent float64
	FixedFeeAmount    float64
	ShippingAmount    float64
	MinMarginPercent  float64
}

type Service struct {
	repo     ports.Repository
	tenantID string
}

func NewService(repo ports.Repository, tenantID string) Service {
	return Service{repo: repo, tenantID: tenantID}
}

func (s Service) RunSimulation(ctx context.Context, input RunSimulationInput) (domain.Simulation, error) {
	commissionAmount := input.BasePriceAmount * input.CommissionPercent
	marginAmount := input.BasePriceAmount - input.CostAmount - commissionAmount - input.FixedFeeAmount - input.ShippingAmount
	marginPercent := marginAmount / input.BasePriceAmount
	status := simulationStatus(marginPercent, true)

	simulation := domain.Simulation{
		SimulationID:  input.SimulationID,
		TenantID:      s.tenantID,
		ProductID:     input.ProductID,
		AccountID:     input.AccountID,
		MarginAmount:  marginAmount,
		MarginPercent: marginPercent,
		Status:        status,
	}

	return simulation, s.repo.SaveSimulation(ctx, simulation)
}

func (s Service) ListSimulations(ctx context.Context) ([]domain.Simulation, error) {
	return s.repo.ListSimulations(ctx)
}
