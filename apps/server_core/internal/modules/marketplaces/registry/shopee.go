package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&ShopeePlugin{}) }

type ShopeePlugin struct{}

func (p *ShopeePlugin) Code() string { return "shopee" }

func (p *ShopeePlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "shopee",
		DisplayName:     "Shopee",
		FeeSource:       "seed",
		AuthStrategy:    "unknown",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilityBlocked,
			PriceSync:     domain.CapabilityBlocked,
			StockSync:     domain.CapabilityBlocked,
			Orders:        domain.CapabilityBlocked,
			Messages:      domain.CapabilityBlocked,
			Questions:     domain.CapabilityBlocked,
			FreightQuotes: domain.CapabilityBlocked,
			Webhooks:      domain.CapabilityBlocked,
			Sandbox:       domain.CapabilityBlocked,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "blocked",
			ExecutionMode: "blocked",
		},
		CredentialSchema: []domain.CredentialField{},
		Active:           true,
	}
}

// SeedFees is a no-op — Shopee fees are seeded by connectors/adapters/shopee.FeeSyncer.
func (p *ShopeePlugin) SeedFees(_ context.Context, _ *pgxpool.Pool) error { return nil }

func (p *ShopeePlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
