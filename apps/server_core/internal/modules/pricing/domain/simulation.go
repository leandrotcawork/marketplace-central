package domain

type Simulation struct {
	SimulationID  string  `json:"simulation_id"`
	TenantID      string  `json:"tenant_id"`
	ProductID     string  `json:"product_id"`
	AccountID     string  `json:"account_id"`
	MarginAmount  float64 `json:"margin_amount"`
	MarginPercent float64 `json:"margin_percent"`
	Status        string  `json:"status"`
}
