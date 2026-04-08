package registry

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

func init() { register(&MadeiraPlugin{}) }

type MadeiraPlugin struct{}

func (p *MadeiraPlugin) Code() string { return "madeira_madeira" }

func (p *MadeiraPlugin) Definition() domain.MarketplaceDefinition {
	return domain.MarketplaceDefinition{
		MarketplaceCode: "madeira_madeira",
		DisplayName:     "Madeira Madeira",
		FeeSource:       "seed",
		AuthStrategy:    "token",
		CapabilityProfile: domain.CapabilityProfile{
			Publish:       domain.CapabilityPlanned,
			PriceSync:     domain.CapabilityPlanned,
			StockSync:     domain.CapabilityPlanned,
			Orders:        domain.CapabilityPlanned,
			Messages:      domain.CapabilityBlocked,
			Questions:     domain.CapabilityBlocked,
			FreightQuotes: domain.CapabilitySupported,
			Webhooks:      domain.CapabilityPartial,
			Sandbox:       domain.CapabilityPlanned,
		},
		Metadata: domain.PluginMetadata{
			RolloutStage:  "wave_2",
			ExecutionMode: "live",
		},
		CredentialSchema: []domain.CredentialField{
			{Key: "api_token", Label: "API Token", Secret: true},
		},
		Active: true,
	}
}

// SeedFees inserts a stub default fee row for Madeira Madeira.
func (p *MadeiraPlugin) SeedFees(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO marketplace_fee_schedules
			(marketplace_code, category_id, listing_type, commission_percent, fixed_fee_amount, notes, source, synced_at)
		VALUES ('madeira_madeira', 'default', NULL, 0.15, 0, 'stub — to be filled with official per-category rates', 'seed', NOW())
		ON CONFLICT DO NOTHING
	`)
	return err
}

func (p *MadeiraPlugin) NewConnector(_ map[string]string) (MarketplaceConnector, error) {
	return nil, ErrNotImplemented
}
