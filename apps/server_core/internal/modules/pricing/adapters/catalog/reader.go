package catalog

import (
	"context"

	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type productLister interface {
	ListProductsByIDs(ctx context.Context, productIDs []string) ([]domain.Product, error)
}

// Reader wraps catalog.Service and implements pricing/ports.ProductProvider.
type Reader struct {
	svc productLister
}

func NewReader(svc productLister) *Reader { return &Reader{svc: svc} }

var _ productLister = (catalogapp.Service{})

func (r *Reader) GetProductsForBatch(ctx context.Context, productIDs []string) ([]pricingports.BatchProduct, error) {
	if len(productIDs) == 0 {
		return []pricingports.BatchProduct{}, nil
	}
	products, err := r.svc.ListProductsByIDs(ctx, productIDs)
	if err != nil {
		return nil, err
	}
	result := make([]pricingports.BatchProduct, 0, len(products))
	for _, p := range products {
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
	return result, nil
}
