package domain

type Simulation struct {
	SimulationID  string
	TenantID      string
	ProductID     string
	AccountID     string
	MarginAmount  float64
	MarginPercent float64
	Status        string
}
