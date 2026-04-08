package registry

import "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"

// MercadoLivre returns the system definition for Mercado Livre.
func MercadoLivre() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "mercado_livre",
		DisplayName:     "Mercado Livre",
		FeeSource:       "api_sync",
		Capabilities:    []string{"fee_api", "orders", "messages"},
		CredentialSchema: []domain.CredentialField{
			{Key: "client_id", Label: "Client ID", Secret: false},
			{Key: "client_secret", Label: "Client Secret", Secret: true},
			{Key: "redirect_uri", Label: "Redirect URI", Secret: false},
		},
		Active: true,
	}
}
