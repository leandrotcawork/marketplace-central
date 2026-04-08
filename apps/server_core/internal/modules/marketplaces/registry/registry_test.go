package registry_test

import (
	"context"
	"errors"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/registry"
)

func TestRegistry_NoDuplicateCodes(t *testing.T) {
	seen := map[string]bool{}
	for _, d := range registry.All() {
		if seen[d.MarketplaceCode] {
			t.Errorf("duplicate marketplace code: %s", d.MarketplaceCode)
		}
		seen[d.MarketplaceCode] = true
	}
}

func TestRegistry_AllPluginsHaveRequiredFields(t *testing.T) {
	for _, d := range registry.All() {
		if d.MarketplaceCode == "" {
			t.Errorf("plugin has empty MarketplaceCode")
		}
		if d.DisplayName == "" {
			t.Errorf("plugin %q has empty DisplayName", d.MarketplaceCode)
		}
		if d.AuthStrategy == "" {
			t.Errorf("plugin %q has empty AuthStrategy", d.MarketplaceCode)
		}
	}
}

func TestRegistry_AllPluginsNewConnectorReturnsErrNotImplemented(t *testing.T) {
	codes := []string{"mercado_livre", "shopee", "magalu", "amazon", "leroy_merlin", "madeira_madeira"}
	for _, code := range codes {
		p, ok := registry.Get(code)
		if !ok {
			t.Errorf("plugin %q not registered", code)
			continue
		}
		conn, err := p.NewConnector(nil)
		if conn != nil {
			t.Errorf("plugin %q NewConnector returned non-nil connector", code)
		}
		if !errors.Is(err, registry.ErrNotImplemented) {
			t.Errorf("plugin %q NewConnector returned %v, want ErrNotImplemented", code, err)
		}
	}
}

func TestRegistry_SeedFees_NoopForLegacyPlugins(t *testing.T) {
	// ML, Shopee, Magalu SeedFees must return nil without hitting DB (no pool).
	for _, code := range []string{"mercado_livre", "shopee", "magalu"} {
		p, ok := registry.Get(code)
		if !ok {
			t.Fatalf("plugin %q not registered", code)
		}
		if err := p.SeedFees(context.Background(), nil); err != nil {
			t.Errorf("plugin %q SeedFees(nil pool) returned error: %v", code, err)
		}
	}
}
