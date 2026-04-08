package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&AmazonPlugin{}) }

type AmazonPlugin struct{}

func (p *AmazonPlugin) Code() string { return "amazon" }

func (p *AmazonPlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "amazon",
		DisplayName:     "Amazon Brasil",
		FeeSource:       "seed",
		AuthStrategy:    "lwa",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilitySupported,
			PriceSync:     domain.CapabilitySupported,
			StockSync:     domain.CapabilitySupported,
			Orders:        domain.CapabilitySupported,
			Messages:      domain.CapabilityPartial,
			Questions:     domain.CapabilityBlocked,
			FreightQuotes: domain.CapabilityBlocked,
			Webhooks:      domain.CapabilitySupported,
			Sandbox:       domain.CapabilitySupported,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "v1",
			ExecutionMode: "live",
		},
		CredentialSchema: []domain.CredentialField{
			{Key: "seller_id", Label: "Seller ID", Secret: false},
			{Key: "lwa_app_id", Label: "LWA App ID", Secret: false},
			{Key: "lwa_client_secret", Label: "LWA Client Secret", Secret: true},
			{Key: "refresh_token", Label: "Refresh Token", Secret: true},
		},
		Active: true,
	}
}

// SeedFees inserts a stub default fee row for Amazon.
// Per-category rates must be filled from official Amazon Brasil pricing table.
func (p *AmazonPlugin) SeedFees(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO marketplace_fee_schedules
			(marketplace_code, category_id, listing_type, commission_percent, fixed_fee_amount, notes, source, synced_at)
		VALUES ('amazon', 'default', NULL, 0.12, 0, 'stub — to be filled with official per-category rates', 'seed', NOW())
		ON CONFLICT DO NOTHING
	`)
	return err
}

func (p *AmazonPlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
