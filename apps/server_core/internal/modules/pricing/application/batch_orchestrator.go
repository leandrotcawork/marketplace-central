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
	products  ports.ProductProvider
	policies  ports.PolicyProvider
	freight   ports.FreightQuoter
	feeLookup ports.FeeScheduleLookup // nil-safe: skipped when not wired
	tenantID  string
}

// NewBatchOrchestrator creates a BatchOrchestrator with its dependencies.
// feeLookup may be nil; when nil the orchestrator falls back to pol.CommissionPercent.
func NewBatchOrchestrator(
	products ports.ProductProvider,
	policies ports.PolicyProvider,
	freight ports.FreightQuoter,
	feeLookup ports.FeeScheduleLookup,
	tenantID string,
) *BatchOrchestrator {
	return &BatchOrchestrator{products: products, policies: policies, freight: freight, feeLookup: feeLookup, tenantID: tenantID}
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

	needsME := false
	for _, pol := range pols {
		if pol.ShippingProvider == "melhor_envio" {
			needsME = true
			break
		}
	}

	meConnected := false
	if needsME {
		connConnected, connErr := o.freight.IsConnected(ctx)
		if connErr == nil {
			meConnected = connConnected
		}
	}

	type freightState struct {
		amount    float64
		source    string
		available bool
	}

	freightResults := make(map[string]freightState)
	if needsME && meConnected {
		for _, p := range prods {
			if p.HeightCM == nil || p.WidthCM == nil || p.LengthCM == nil || p.WeightG == nil {
				continue
			}

			quoted, err := o.freight.QuoteFreight(ctx, ports.FreightRequest{
				OriginCEP: req.OriginCEP,
				DestCEP:   req.DestCEP,
				Products: []ports.FreightProduct{
					{
						ProductID: p.ProductID,
						HeightCM:  *p.HeightCM,
						WidthCM:   *p.WidthCM,
						LengthCM:  *p.LengthCM,
						WeightKg:  *p.WeightG / 1000,
						Value:     p.PriceAmount,
					},
				},
			})
			if err != nil {
				freightResults[p.ProductID] = freightState{source: "me_error"}
				continue
			}

			result, ok := quoted[p.ProductID]
			if !ok {
				freightResults[p.ProductID] = freightState{source: "me_error"}
				continue
			}

			source := result.Source
			if source == "" {
				source = "me_error"
			}
			freightResults[p.ProductID] = freightState{
				amount:    result.Amount,
				source:    source,
				available: source == "melhor_envio",
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
			freightAvailable := true
			switch pol.ShippingProvider {
			case "melhor_envio":
				freightAmt = 0
				freightAvailable = false
				if prod.HeightCM == nil || prod.WidthCM == nil || prod.LengthCM == nil || prod.WeightG == nil {
					freightSource = "no_dimensions"
				} else if !meConnected {
					freightSource = "me_not_connected"
				} else if fr, ok := freightResults[prod.ProductID]; ok {
					freightAmt = fr.amount
					freightSource = fr.source
					freightAvailable = fr.available
				} else {
					freightSource = "me_error"
				}
			case "marketplace":
				freightAmt = pol.DefaultShipping
				freightSource = "marketplace"
				freightAvailable = true
			default:
				freightAmt = pol.DefaultShipping
				freightSource = "fixed"
				freightAvailable = true
			}

			commissionPct := pol.CommissionPercent
			if pol.CommissionOverride != nil {
				commissionPct = *pol.CommissionOverride
			} else if o.feeLookup != nil && pol.MarketplaceCode != "" {
				if fee, found, err := o.feeLookup.LookupFee(ctx, pol.MarketplaceCode, "default", ""); err == nil && found {
					commissionPct = fee.CommissionPercent
				}
			}
			commissionAmt := sellingPrice * commissionPct
			marginAmt := sellingPrice - prod.CostAmount - commissionAmt - pol.FixedFeeAmount - freightAmt
			marginPct := 0.0
			if sellingPrice > 0 {
				marginPct = marginAmt / sellingPrice
			}
			status := simulationStatusForBatch(marginPct, freightAvailable)

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
