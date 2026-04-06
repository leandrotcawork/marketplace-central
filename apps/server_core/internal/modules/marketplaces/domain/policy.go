package domain

type Policy struct {
	PolicyID           string  `json:"policy_id"`
	TenantID           string  `json:"tenant_id"`
	AccountID          string  `json:"account_id"`
	CommissionPercent  float64 `json:"commission_percent"`
	FixedFeeAmount     float64 `json:"fixed_fee_amount"`
	DefaultShipping    float64 `json:"default_shipping"`
	TaxPercent         float64 `json:"tax_percent"`
	MinMarginPercent   float64 `json:"min_margin_percent"`
	SLAQuestionMinutes int     `json:"sla_question_minutes"`
	SLADispatchHours   int     `json:"sla_dispatch_hours"`
	ShippingProvider   string  `json:"shipping_provider"` // "fixed" | "melhor_envio" | "marketplace"
}
