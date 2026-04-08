package registry

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

// ErrNotImplemented is returned by NewConnector on plugins that have not
// yet implemented their Phase 4 runtime connector.
var ErrNotImplemented = errors.New("connector not yet implemented for this marketplace")

// MarketplaceConnector is the Phase 4 runtime interface.
// Defined now so the contract is stable; implemented per-plugin in Phase 4.
type MarketplaceConnector interface {
	FetchMessages(ctx context.Context) ([]map[string]any, error)
	FetchOrders(ctx context.Context) ([]map[string]any, error)
	ReplyToMessage(ctx context.Context, messageID string, body string) error
}

// MarketplacePlugin is the interface every channel adapter must implement.
//
//   - Definition() — called at startup to upsert the plugin manifest into marketplace_definitions.
//   - SeedFees()   — called at startup to seed stub fee rows for channels without a dedicated syncer.
//   - NewConnector() — Phase 4 boundary: return ErrNotImplemented until the connector is built.
type MarketplacePlugin interface {
	Code() string
	Definition() domain.MarketplaceDefinition
	SeedFees(ctx context.Context, pool *pgxpool.Pool) error
	NewConnector(credentials map[string]string) (MarketplaceConnector, error)
}
