package catalog

import (
	"context"

	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

// Reader wraps catalog.Service and implements pricing/ports.ProductProvider.
type Reader struct {
	svc catalogapp.Service
}

func NewReader(svc catalogapp.Service) *Reader { return &Reader{svc: svc} }

func (r *Reader) GetProductsForBatch(ctx context.Context, productIDs []string) ([]pricingports.BatchProduct, error) {
	all, err := r.svc.ListProducts(ctx)
	if err != nil {
		return nil, err
	}
	idSet := make(map[string]struct{}, len(productIDs))
	for _, id := range productIDs {
		idSet[id] = struct{}{}
	}
	result := make([]pricingports.BatchProduct, 0, len(productIDs))
	for _, p := range all {
		if _, ok := idSet[p.ProductID]; ok {
			result = append(result, pricingports.BatchProduct{
				ProductID:      p.ProductID,
				SKU:            p.SKU,
				CostAmount:     p.CostAmount,
				PriceAmount:    p.PriceAmount,
				SuggestedPrice: p.SuggestedPrice,
				HeightCM:       p.HeightCM,
				WidthCM:        p.WidthCM,
				LengthCM:       p.LengthCM,
				WeightG:        p.WeightG,
			})
		}
	}
	return result, nil
}
