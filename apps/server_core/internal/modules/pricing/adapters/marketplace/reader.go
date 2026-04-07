package marketplace

import (
	"context"

	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	marketplacesdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

// Reader wraps marketplaces.Service and implements pricing/ports.PolicyProvider.
type Reader struct {
	svc marketplacesapp.Service
}

func NewReader(svc marketplacesapp.Service) *Reader { return &Reader{svc: svc} }

func (r *Reader) GetPoliciesForBatch(ctx context.Context, policyIDs []string) ([]pricingports.BatchPolicy, error) {
	all, err := r.svc.ListPolicies(ctx)
	if err != nil {
		return nil, err
	}
	if len(policyIDs) == 0 {
		result := make([]pricingports.BatchPolicy, len(all))
		for i, p := range all {
			result[i] = fromDomain(p)
		}
		return result, nil
	}
	idSet := make(map[string]struct{}, len(policyIDs))
	for _, id := range policyIDs {
		idSet[id] = struct{}{}
	}
	result := make([]pricingports.BatchPolicy, 0, len(policyIDs))
	for _, p := range all {
		if _, ok := idSet[p.PolicyID]; ok {
			result = append(result, fromDomain(p))
		}
	}
	return result, nil
}

func fromDomain(p marketplacesdomain.Policy) pricingports.BatchPolicy {
	return pricingports.BatchPolicy{
		PolicyID:          p.PolicyID,
		AccountID:         p.AccountID,
		CommissionPercent: p.CommissionPercent,
		FixedFeeAmount:    p.FixedFeeAmount,
		DefaultShipping:   p.DefaultShipping,
		MinMarginPercent:  p.MinMarginPercent,
		ShippingProvider:  p.ShippingProvider,
	}
}
