package domain

type Policy struct {
	PolicyID           string
	TenantID           string
	AccountID          string
	CommissionPercent  float64
	FixedFeeAmount     float64
	DefaultShipping    float64
	TaxPercent         float64
	MinMarginPercent   float64
	SLAQuestionMinutes int
	SLADispatchHours   int
}
