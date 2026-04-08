package feeschedule

import (
	"context"

	mktapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	"marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

var _ ports.FeeScheduleLookup = (*Adapter)(nil)

// Adapter bridges the pricing module's FeeScheduleLookup port to the marketplaces
// FeeScheduleService. It translates the marketplaces domain type to the local
// pricing ports.MarketplaceFees type (AMD-4: no cross-module domain coupling).
type Adapter struct {
	svc *mktapp.FeeScheduleService
}

func NewAdapter(svc *mktapp.FeeScheduleService) *Adapter {
	return &Adapter{svc: svc}
}

func (a *Adapter) LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (ports.MarketplaceFees, bool, error) {
	fee, found, err := a.svc.LookupFee(ctx, marketplaceCode, categoryID, listingType)
	if err != nil || !found {
		return ports.MarketplaceFees{}, found, err
	}
	return ports.MarketplaceFees{
		CommissionPercent: fee.CommissionPercent,
		FixedFeeAmount:    fee.FixedFeeAmount,
	}, true, nil
}
