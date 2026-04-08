package ports

import "context"

// BatchProduct is all product data needed for batch simulation.
type BatchProduct struct {
	ProductID      string
	SKU            string
	CostAmount     float64
	PriceAmount    float64
	SuggestedPrice *float64
	HeightCM       *float64
	WidthCM        *float64
	LengthCM       *float64
	WeightG        *float64
}

// BatchPolicy is all policy data needed for batch simulation.
type BatchPolicy struct {
	PolicyID           string
	AccountID          string
	MarketplaceCode    string   // used to look up fee schedules; empty means no lookup
	CommissionPercent  float64
	CommissionOverride *float64 // explicit override; takes priority over fee schedule lookup
	FixedFeeAmount     float64
	DefaultShipping    float64
	MinMarginPercent   float64
	ShippingProvider   string // "fixed" | "melhor_envio" | "marketplace"
}

// FreightProduct is one product in a freight quote request.
type FreightProduct struct {
	ProductID string
	HeightCM  float64
	WidthCM   float64
	LengthCM  float64
	WeightKg  float64
	Value     float64 // insurance value (product price)
}

// FreightRequest is the input for a freight quote.
type FreightRequest struct {
	OriginCEP string
	DestCEP   string
	Products  []FreightProduct
}

// FreightResult is the freight result for one product.
type FreightResult struct {
	Amount float64
	Source string // "melhor_envio" | "fixed" | "no_dimensions" | "me_error" | "me_not_connected"
}

// ProductProvider fetches product data for batch simulation.
type ProductProvider interface {
	GetProductsForBatch(ctx context.Context, productIDs []string) ([]BatchProduct, error)
}

// PolicyProvider fetches policy data for batch simulation.
type PolicyProvider interface {
	GetPoliciesForBatch(ctx context.Context, policyIDs []string) ([]BatchPolicy, error)
}

// FreightQuoter calculates freight costs via an external service.
type FreightQuoter interface {
	IsConnected(ctx context.Context) (bool, error)
	QuoteFreight(ctx context.Context, req FreightRequest) (map[string]FreightResult, error)
}
