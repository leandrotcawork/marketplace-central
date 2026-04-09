package domain

import "time"

type Installation struct {
	InstallationID      string             `json:"installation_id"`
	TenantID            string             `json:"tenant_id"`
	ProviderCode        string             `json:"provider_code"`
	Family              IntegrationFamily  `json:"family"`
	DisplayName         string             `json:"display_name"`
	Status              InstallationStatus `json:"status"`
	HealthStatus        HealthStatus       `json:"health_status"`
	ExternalAccountID   string             `json:"external_account_id"`
	ExternalAccountName string             `json:"external_account_name"`
	ActiveCredentialID  string             `json:"active_credential_id,omitempty"`
	LastVerifiedAt      *time.Time         `json:"last_verified_at,omitempty"`
	CreatedAt           time.Time          `json:"created_at"`
	UpdatedAt           time.Time          `json:"updated_at"`
}
