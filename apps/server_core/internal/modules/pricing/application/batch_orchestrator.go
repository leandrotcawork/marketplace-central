package application

import (
	"context"
	"fmt"

	"marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

// BatchRunRequest is the input for RunBatch.
type BatchRunRequest struct {
	ProductIDs     []string
	PolicyIDs      []string
	OriginCEP      string
	DestCEP        string
	PriceSource    string
	PriceOverrides map[string]float64
}

// BatchSimulationItem is one product x policy result row.
type BatchSimulationItem struct {
	ProductID        string  `json:"product_id"`
	PolicyID         string  `json:"policy_id"`
	SellingPrice     float64 `json:"selling_price"`
	CostAmount       float64 `json:"cost_amount"`
	CommissionAmount float64 `json:"commission_amount"`
	FreightAmount    float64 `json:"freight_amount"`
	FixedFeeAmount   float64 `json:"fixed_fee_amount"`
	MarginAmount     float64 `json:"margin_amount"`
	MarginPercent    float64 `json:"margin_percent"`
	Status           string  `json:"status"`
	FreightSource    string  `json:"freight_source"`
}

// BatchRunResult holds all simulation rows.
type BatchRunResult struct {
	Items []BatchSimulationItem
}

// BatchOrchestrator runs batch simulations across all products x policies.
type BatchOrchestrator struct {
	products ports.ProductProvider
	policies ports.PolicyProvider
	freight  ports.FreightQuoter
	tenantID string
}

// NewBatchOrchestrator creates a BatchOrchestrator with its dependencies.
func NewBatchOrchestrator(
	products ports.ProductProvider,
	policies ports.PolicyProvider,
	freight ports.FreightQuoter,
	tenantID string,
) *BatchOrchestrator {
	return &BatchOrchestrator{products: products, policies: policies, freight: freight, tenantID: tenantID}
}

// RunBatch calculates margins for every product x policy combination.
func (o *BatchOrchestrator) RunBatch(ctx context.Context, req BatchRunRequest) (BatchRunResult, error) {
	prods, err := o.products.GetProductsForBatch(ctx, req.ProductIDs)
	if err != nil {
		return BatchRunResult{}, fmt.Errorf("PRICING_BATCH_LOAD_PRODUCTS: %w", err)
	}

	pols, err := o.policies.GetPoliciesForBatch(ctx, req.PolicyIDs)
	if err != nil {
		return BatchRunResult{}, fmt.Errorf("PRICING_BATCH_LOAD_POLICIES: %w", err)
	}

	meConnected, connErr := o.freight.IsConnected(ctx)
	if connErr != nil {
		meConnected = false
	}

	freightResults := make(map[string]ports.FreightResult)
	quoteErr := error(nil)
	if meConnected {
		needsME := false
		for _, pol := range pols {
			if pol.ShippingProvider == "melhor_envio" {
				needsME = true
				break
			}
		}
		if needsME {
			freightReq := ports.FreightRequest{OriginCEP: req.OriginCEP, DestCEP: req.DestCEP}
			for _, p := range prods {
				if p.HeightCM == nil || p.WidthCM == nil || p.LengthCM == nil || p.WeightG == nil {
					continue
				}
				freightReq.Products = append(freightReq.Products, ports.FreightProduct{
					ProductID: p.ProductID,
					HeightCM:  *p.HeightCM,
					WidthCM:   *p.WidthCM,
					LengthCM:  *p.LengthCM,
					WeightKg:  *p.WeightG / 1000,
					Value:     p.PriceAmount,
				})
			}
			if len(freightReq.Products) > 0 {
				quoted, err := o.freight.QuoteFreight(ctx, freightReq)
				if err != nil {
					quoteErr = err
				} else {
					for k, v := range quoted {
						freightResults[k] = v
					}
				}
			}
		}
	}

	items := make([]BatchSimulationItem, 0, len(prods)*len(pols))
	for _, pol := range pols {
		for _, prod := range prods {
			sellingPrice := prod.PriceAmount
			if req.PriceSource == "suggested_price" && prod.SuggestedPrice != nil {
				sellingPrice = *prod.SuggestedPrice
			}
			if req.PriceOverrides != nil {
				if override, ok := req.PriceOverrides[prod.ProductID+"::"+pol.PolicyID]; ok && override > 0 {
					sellingPrice = override
				}
			}

			freightAmt := pol.DefaultShipping
			freightSource := "fixed"
			switch pol.ShippingProvider {
			case "melhor_envio":
				freightAmt = 0
				if prod.HeightCM == nil || prod.WidthCM == nil || prod.LengthCM == nil || prod.WeightG == nil {
					freightSource = "no_dimensions"
				} else if !meConnected {
					freightSource = "me_not_connected"
				} else if quoteErr != nil {
					freightSource = "me_error"
				} else if fr, ok := freightResults[prod.ProductID]; ok {
					freightAmt = fr.Amount
					freightSource = fr.Source
				} else {
					freightSource = "me_error"
				}
			case "marketplace":
				freightAmt = pol.DefaultShipping
				freightSource = "marketplace"
			default:
				freightAmt = pol.DefaultShipping
				freightSource = "fixed"
			}

			commissionAmt := sellingPrice * pol.CommissionPercent
			marginAmt := sellingPrice - prod.CostAmount - commissionAmt - pol.FixedFeeAmount - freightAmt
			marginPct := 0.0
			if sellingPrice > 0 {
				marginPct = marginAmt / sellingPrice
			}
			status := "healthy"
			if marginPct < pol.MinMarginPercent {
				status = "warning"
			}

			items = append(items, BatchSimulationItem{
				ProductID:        prod.ProductID,
				PolicyID:         pol.PolicyID,
				SellingPrice:     sellingPrice,
				CostAmount:       prod.CostAmount,
				CommissionAmount: commissionAmt,
				FreightAmount:    freightAmt,
				FixedFeeAmount:   pol.FixedFeeAmount,
				MarginAmount:     marginAmt,
				MarginPercent:    marginPct,
				Status:           status,
				FreightSource:    freightSource,
			})
		}
	}

	return BatchRunResult{Items: items}, nil
}
