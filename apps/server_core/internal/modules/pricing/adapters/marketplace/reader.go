package marketplace

import (
	"context"

	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	marketplacesdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type policyLister interface {
	ListPoliciesByIDs(ctx context.Context, policyIDs []string) ([]marketplacesdomain.Policy, error)
}

// Reader wraps marketplaces.Service and implements pricing/ports.PolicyProvider.
type Reader struct {
	svc policyLister
}

func NewReader(svc policyLister) *Reader { return &Reader{svc: svc} }

var _ policyLister = (marketplacesapp.Service{})

func (r *Reader) GetPoliciesForBatch(ctx context.Context, policyIDs []string) ([]pricingports.BatchPolicy, error) {
	if len(policyIDs) == 0 {
		return []pricingports.BatchPolicy{}, nil
	}
	policies, err := r.svc.ListPoliciesByIDs(ctx, policyIDs)
	if err != nil {
		return nil, err
	}
	result := make([]pricingports.BatchPolicy, 0, len(policies))
	for _, p := range policies {
		result = append(result, fromDomain(p))
	}
	return result, nil
}

func fromDomain(p marketplacesdomain.Policy) pricingports.BatchPolicy {
	return pricingports.BatchPolicy{
		PolicyID:           p.PolicyID,
		AccountID:          p.AccountID,
		MarketplaceCode:    p.MarketplaceCode,   // required for fee schedule lookup
		CommissionPercent:  p.CommissionPercent,
		CommissionOverride: p.CommissionOverride, // nil = use fee schedule / policy rate
		FixedFeeAmount:     p.FixedFeeAmount,
		DefaultShipping:    p.DefaultShipping,
		MinMarginPercent:   p.MinMarginPercent,
		ShippingProvider:   p.ShippingProvider,
	}
}
