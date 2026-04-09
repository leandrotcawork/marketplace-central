package domain

type Account struct {
	AccountID                 string            `json:"account_id"`
	TenantID                  string            `json:"tenant_id"`
	IntegrationInstallationID string            `json:"integration_installation_id,omitempty"`
	MarketplaceCode           string            `json:"marketplace_code"`
	ChannelCode               string            `json:"channel_code"`
	DisplayName               string            `json:"display_name"`
	Status                    string            `json:"status"`
	ConnectionMode            string            `json:"connection_mode"`
	CredentialsJSON           map[string]string `json:"credentials_json,omitempty"`
}
