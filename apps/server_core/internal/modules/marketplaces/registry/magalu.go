package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&MagaluPlugin{}) }

type MagaluPlugin struct{}

func (p *MagaluPlugin) Code() string { return "magalu" }

func (p *MagaluPlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "magalu",
		DisplayName:     "Magalu",
		FeeSource:       "seed",
		AuthStrategy:    "oauth2",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilitySupported,
			PriceSync:     domain.CapabilitySupported,
			StockSync:     domain.CapabilitySupported,
			Orders:        domain.CapabilitySupported,
			Messages:      domain.CapabilitySupported,
			Questions:     domain.CapabilitySupported,
			FreightQuotes: domain.CapabilityPlanned,
			Webhooks:      domain.CapabilitySupported,
			Sandbox:       domain.CapabilitySupported,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "v1",
			ExecutionMode: "live",
		},
		CredentialSchema: []domain.CredentialField{
			{Key: "client_id", Label: "Client ID", Secret: false},
			{Key: "client_secret", Label: "Client Secret", Secret: true},
		},
		Active: true,
	}
}

// SeedFees is a no-op — Magalu fees are seeded by connectors/adapters/magalu.FeeSyncer.
func (p *MagaluPlugin) SeedFees(_ context.Context, _ *pgxpool.Pool) error { return nil }

func (p *MagaluPlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
