package registry

import "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"

// Shopee returns the system definition for Shopee Brazil.
func Shopee() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "shopee",
		DisplayName:     "Shopee",
		FeeSource:       "static_table",
		Capabilities:    []string{"orders", "messages"},
		CredentialSchema: []domain.CredentialField{
			{Key: "partner_id", Label: "Partner ID", Secret: false},
			{Key: "secret_key", Label: "Secret Key", Secret: true},
			{Key: "shop_id", Label: "Shop ID", Secret: false},
		},
		Active: true,
	}
}
