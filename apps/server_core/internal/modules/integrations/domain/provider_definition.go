package domain

import "time"

type ProviderDefinition struct {
	ProviderCode         string            `json:"provider_code"`
	TenantID             string            `json:"tenant_id"`
	Family               IntegrationFamily `json:"family"`
	DisplayName          string            `json:"display_name"`
	AuthStrategy         AuthStrategy      `json:"auth_strategy"`
	InstallMode          InstallMode       `json:"install_mode"`
	Metadata             map[string]any    `json:"metadata,omitempty"`
	DeclaredCapabilities []string          `json:"declared_capabilities"`
	IsActive             bool              `json:"is_active"`
	CreatedAt            time.Time         `json:"created_at"`
	UpdatedAt            time.Time         `json:"updated_at"`
}
