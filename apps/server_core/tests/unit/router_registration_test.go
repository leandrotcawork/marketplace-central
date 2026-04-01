package unit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	catalogdomain "marketplace-central/apps/server_core/internal/modules/catalog/domain"
	catalogtransport "marketplace-central/apps/server_core/internal/modules/catalog/transport"
	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	marketplacesdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	marketplacestransport "marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
	pricingapp "marketplace-central/apps/server_core/internal/modules/pricing/application"
	pricingdomain "marketplace-central/apps/server_core/internal/modules/pricing/domain"
	pricingtransport "marketplace-central/apps/server_core/internal/modules/pricing/transport"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

// stubCatalogRepo satisfies catalog ports.Repository with in-memory no-ops.
type stubCatalogRepo struct{}

func (r stubCatalogRepo) SaveProduct(_ context.Context, _ catalogdomain.Product) error {
	return nil
}
func (r stubCatalogRepo) ListProducts(_ context.Context) ([]catalogdomain.Product, error) {
	return nil, nil
}

// stubMarketplacesRepo satisfies marketplaces ports.Repository with in-memory no-ops.
type stubMarketplacesRepo struct{}

func (r stubMarketplacesRepo) SaveAccount(_ context.Context, _ marketplacesdomain.Account) error {
	return nil
}
func (r stubMarketplacesRepo) SavePolicy(_ context.Context, _ marketplacesdomain.Policy) error {
	return nil
}
func (r stubMarketplacesRepo) ListAccounts(_ context.Context) ([]marketplacesdomain.Account, error) {
	return nil, nil
}
func (r stubMarketplacesRepo) ListPolicies(_ context.Context) ([]marketplacesdomain.Policy, error) {
	return nil, nil
}

// stubPricingRepo satisfies pricing ports.Repository with in-memory no-ops.
type stubPricingRepo struct{}

func (r stubPricingRepo) SaveSimulation(_ context.Context, _ pricingdomain.Simulation) error {
	return nil
}
func (r stubPricingRepo) ListSimulations(_ context.Context) ([]pricingdomain.Simulation, error) {
	return nil, nil
}

// TestRouterRegistersAllFoundationEndpoints verifies that every expected route
// is registered and returns a non-404 response. It builds a minimal mux with
// stub repository adapters so that no real database connection is required.
func TestRouterRegistersAllFoundationEndpoints(t *testing.T) {
	mux := http.NewServeMux()

	// /healthz
	base := httpx.NewRouter()
	mux.Handle("/healthz", base)

	// /catalog/products
	catalogSvc := catalogapp.NewService(stubCatalogRepo{}, "tenant_default")
	catalogtransport.Handler{Service: catalogSvc}.Register(mux)

	// /marketplaces/accounts, /marketplaces/policies
	marketSvc := marketplacesapp.NewService(stubMarketplacesRepo{}, "tenant_default")
	marketplacestransport.NewHandler(marketSvc).Register(mux)

	// /pricing/simulations
	pricingSvc := pricingapp.NewService(stubPricingRepo{}, "tenant_default")
	pricingtransport.NewHandler(pricingSvc).Register(mux)

	cases := []string{
		"/healthz",
		"/catalog/products",
		"/marketplaces/accounts",
		"/marketplaces/policies",
		"/pricing/simulations",
	}

	for _, path := range cases {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code == http.StatusNotFound {
			t.Fatalf("expected route %s to be registered (got 404)", path)
		}
	}
}
