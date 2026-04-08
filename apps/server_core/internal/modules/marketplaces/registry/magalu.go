package registry

import "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"

// Magalu returns the system definition for Magazine Luiza (Magalu).
func Magalu() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "magalu",
		DisplayName:     "Magalu",
		FeeSource:       "static_table",
		Capabilities:    []string{"orders", "messages"},
		CredentialSchema: []domain.CredentialField{
			{Key: "api_key", Label: "API Key", Secret: true},
			{Key: "seller_id", Label: "Seller ID", Secret: false},
		},
		Active: true,
	}
}
