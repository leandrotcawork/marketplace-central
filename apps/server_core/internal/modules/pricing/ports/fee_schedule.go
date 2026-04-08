package ports

import "context"

// MarketplaceFees holds the fee data the pricing module needs.
// This is a local type — adapters translate from marketplaces/domain.FeeSchedule.
type MarketplaceFees struct {
	CommissionPercent float64
	FixedFeeAmount    float64
}

// FeeScheduleLookup is the port the pricing module uses to query fee schedules.
// Implemented by an adapter in pricing/adapters/feeschedule/.
type FeeScheduleLookup interface {
	LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (MarketplaceFees, bool, error)
}
