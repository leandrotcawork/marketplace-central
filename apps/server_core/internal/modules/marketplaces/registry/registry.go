// Package registry declares the set of marketplace plugins known to the system.
// To add a new marketplace: create a new file in this package, add it to All().
package registry

import "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"

// All returns every registered marketplace definition.
func All() []domain.MarketplaceDefinition {
	return []domain.MarketplaceDefinition{
		MercadoLivre(),
		Shopee(),
		Magalu(),
	}
}
