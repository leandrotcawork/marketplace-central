package domain

// CredentialField describes one required credential for a marketplace account.
type CredentialField struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Secret bool   `json:"secret"`
}

// MarketplaceDefinition is the system-level description of a marketplace plugin.
// It is defined in code (registry package) and synced to the DB at startup.
type MarketplaceDefinition struct {
	MarketplaceCode  string            `json:"marketplace_code"`
	DisplayName      string            `json:"display_name"`
	FeeSource        string            `json:"fee_source"` // "api_sync" | "static_table"
	Capabilities     []string          `json:"capabilities"`
	CredentialSchema []CredentialField `json:"credential_schema"`
	Active           bool              `json:"active"`
}
