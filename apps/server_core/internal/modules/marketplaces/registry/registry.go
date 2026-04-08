// Package registry declares the set of marketplace plugins known to the system.
// To add a new marketplace: create a new file in this package implementing
// MarketplacePlugin, then call register(&YourPlugin{}) in its init() function.
package registry

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

var plugins []MarketplacePlugin

// register is called from each plugin's init() function.
func register(p MarketplacePlugin) {
	plugins = append(plugins, p)
}

// All returns every registered marketplace definition.
func All() []domain.MarketplaceDefinition {
	defs := make([]domain.MarketplaceDefinition, 0, len(plugins))
	for _, p := range plugins {
		defs = append(defs, p.Definition())
	}
	return defs
}

// Get returns the plugin for the given marketplace code, if registered.
func Get(code string) (MarketplacePlugin, bool) {
	for _, p := range plugins {
		if p.Code() == code {
			return p, true
		}
	}
	return nil, false
}

// SeedAll seeds stub fee rows for plugins that do not have a dedicated FeeScheduleSyncer.
// Safe to run concurrently with feeSyncSvc.SeedAll — each plugin guards with ON CONFLICT DO NOTHING.
func SeedAll(ctx context.Context, pool *pgxpool.Pool) {
	for _, p := range plugins {
		if err := p.SeedFees(ctx, pool); err != nil {
			slog.Error("registry fee seed failed", "marketplace", p.Code(), "err", err)
		}
	}
}
