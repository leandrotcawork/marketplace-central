package domain

import "time"

type CapabilityState struct {
	CapabilityStateID string           `json:"capability_state_id"`
	TenantID          string           `json:"tenant_id"`
	InstallationID    string           `json:"installation_id"`
	CapabilityCode    string           `json:"capability_code"`
	Status            CapabilityStatus `json:"status"`
	ReasonCode        string           `json:"reason_code"`
	LastEvaluatedAt   *time.Time       `json:"last_evaluated_at,omitempty"`
	CreatedAt         time.Time        `json:"created_at"`
	UpdatedAt         time.Time        `json:"updated_at"`
}
