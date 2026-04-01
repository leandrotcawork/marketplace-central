package domain

type Account struct {
	AccountID      string `json:"account_id"`
	TenantID       string `json:"tenant_id"`
	ChannelCode    string `json:"channel_code"`
	DisplayName    string `json:"display_name"`
	Status         string `json:"status"`
	ConnectionMode string `json:"connection_mode"`
}
