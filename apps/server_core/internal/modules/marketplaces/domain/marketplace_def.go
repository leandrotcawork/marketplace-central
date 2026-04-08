package domain

// CapabilityStatus represents integration maturity for a feature.
type CapabilityStatus string

const (
	CapabilitySupported CapabilityStatus = "supported"
	CapabilityPartial   CapabilityStatus = "partial"
	CapabilityPlanned   CapabilityStatus = "planned"
	CapabilityBlocked   CapabilityStatus = "blocked"
)

// CapabilityProfile declares what a marketplace API supports.
type CapabilityProfile struct {
	Publish       CapabilityStatus `json:"publish"`
	PriceSync     CapabilityStatus `json:"price_sync"`
	StockSync     CapabilityStatus `json:"stock_sync"`
	Orders        CapabilityStatus `json:"orders"`
	Messages      CapabilityStatus `json:"messages"`
	Questions     CapabilityStatus `json:"questions"`
	FreightQuotes CapabilityStatus `json:"freight_quotes"`
	Webhooks      CapabilityStatus `json:"webhooks"`
	Sandbox       CapabilityStatus `json:"sandbox"`
}

// PluginMetadata carries display and rollout config — extensible without migrations.
type PluginMetadata struct {
	IconURL       string `json:"icon_url,omitempty"`
	Color         string `json:"color,omitempty"`
	DocsURL       string `json:"docs_url,omitempty"`
	RolloutStage  string `json:"rollout_stage"`  // v1 | wave_2 | blocked
	ExecutionMode string `json:"execution_mode"` // live | blocked
}

// CredentialField describes one required credential for a marketplace account.
type CredentialField struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Secret bool   `json:"secret"`
}

// MarketplaceDefinition is the system-level description of a marketplace plugin.
// Defined in code (registry package) and synced to the DB at startup.
type MarketplaceDefinition struct {
	MarketplaceCode   string            `json:"marketplace_code"`
	DisplayName       string            `json:"display_name"`
	FeeSource         string            `json:"fee_source"` // "api_sync" | "seed"
	AuthStrategy      string            `json:"auth_strategy"` // oauth2 | lwa | api_key | token | unknown
	CapabilityProfile CapabilityProfile `json:"capability_profile"`
	Metadata          PluginMetadata    `json:"metadata"`
	CredentialSchema  []CredentialField `json:"credential_schema"`
	Active            bool              `json:"active"`
}
