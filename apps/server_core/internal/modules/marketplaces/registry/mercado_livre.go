package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&MercadoLivrePlugin{}) }

type MercadoLivrePlugin struct{}

func (p *MercadoLivrePlugin) Code() string { return "mercado_livre" }

func (p *MercadoLivrePlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "mercado_livre",
		DisplayName:     "Mercado Livre",
		FeeSource:       "api_sync",
		AuthStrategy:    "oauth2",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilitySupported,
			PriceSync:     domain.CapabilityPartial,
			StockSync:     domain.CapabilitySupported,
			Orders:        domain.CapabilitySupported,
			Messages:      domain.CapabilityPartial,
			Questions:     domain.CapabilitySupported,
			FreightQuotes: domain.CapabilityPartial,
			Webhooks:      domain.CapabilitySupported,
			Sandbox:       domain.CapabilityBlocked,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "v1",
			ExecutionMode: "live",
		},
		CredentialSchema: []domain.CredentialField{
			{Key: "client_id", Label: "Client ID", Secret: false},
			{Key: "client_secret", Label: "Client Secret", Secret: true},
			{Key: "redirect_uri", Label: "Redirect URI", Secret: false},
		},
		Active: true,
	}
}

// SeedFees is a no-op — ML fees are seeded by connectors/adapters/mercado_livre.FeeSyncer.
func (p *MercadoLivrePlugin) SeedFees(_ context.Context, _ *pgxpool.Pool) error { return nil }

func (p *MercadoLivrePlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
