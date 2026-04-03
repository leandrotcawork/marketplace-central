package unit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	catalogdomain "marketplace-central/apps/server_core/internal/modules/catalog/domain"
	catalogtransport "marketplace-central/apps/server_core/internal/modules/catalog/transport"
	connectorsapp "marketplace-central/apps/server_core/internal/modules/connectors/application"
	connectorsdomain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	connectorports "marketplace-central/apps/server_core/internal/modules/connectors/ports"
	connectorstransport "marketplace-central/apps/server_core/internal/modules/connectors/transport"
	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	marketplacesdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	marketplacestransport "marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
	pricingapp "marketplace-central/apps/server_core/internal/modules/pricing/application"
	pricingdomain "marketplace-central/apps/server_core/internal/modules/pricing/domain"
	pricingtransport "marketplace-central/apps/server_core/internal/modules/pricing/transport"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

// stubCatalogReader satisfies catalog ports.ProductReader with in-memory no-ops.
type stubCatalogReader struct{}

func (r stubCatalogReader) ListProducts(_ context.Context) ([]catalogdomain.Product, error) {
	return nil, nil
}

func (r stubCatalogReader) GetProduct(_ context.Context, _ string) (catalogdomain.Product, error) {
	return catalogdomain.Product{}, nil
}

func (r stubCatalogReader) SearchProducts(_ context.Context, _ string) ([]catalogdomain.Product, error) {
	return nil, nil
}

func (r stubCatalogReader) ListTaxonomyNodes(_ context.Context) ([]catalogdomain.TaxonomyNode, error) {
	return nil, nil
}

// stubCatalogEnrichments satisfies catalog ports.EnrichmentStore with in-memory no-ops.
type stubCatalogEnrichments struct{}

func (r stubCatalogEnrichments) GetEnrichment(_ context.Context, productID string) (catalogdomain.ProductEnrichment, error) {
	return catalogdomain.ProductEnrichment{ProductID: productID}, nil
}

func (r stubCatalogEnrichments) UpsertEnrichment(_ context.Context, _ catalogdomain.ProductEnrichment) error {
	return nil
}

func (r stubCatalogEnrichments) ListEnrichments(_ context.Context, _ []string) (map[string]catalogdomain.ProductEnrichment, error) {
	return make(map[string]catalogdomain.ProductEnrichment), nil
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

// stubConnectorsRepo satisfies connectors ports.Repository with in-memory no-ops.
type stubConnectorsRepo struct{}

func (r stubConnectorsRepo) WithTx(_ context.Context, fn func(connectorports.Repository) error) error {
	return fn(r)
}
func (r stubConnectorsRepo) SaveBatch(_ context.Context, _ connectorsdomain.PublicationBatch) error {
	return nil
}
func (r stubConnectorsRepo) GetBatch(_ context.Context, _ string) (connectorsdomain.PublicationBatch, error) {
	return connectorsdomain.PublicationBatch{}, nil
}
func (r stubConnectorsRepo) UpdateBatchStatus(_ context.Context, _, _ string, _, _ int) error {
	return nil
}
func (r stubConnectorsRepo) SaveOperation(_ context.Context, _ connectorsdomain.PublicationOperation) error {
	return nil
}
func (r stubConnectorsRepo) ListOperationsByBatch(_ context.Context, _ string) ([]connectorsdomain.PublicationOperation, error) {
	return nil, nil
}
func (r stubConnectorsRepo) UpdateOperationStatus(_ context.Context, _, _, _, _, _ string) error {
	return nil
}
func (r stubConnectorsRepo) HasActiveOperation(_ context.Context, _, _ string) (bool, error) {
	return false, nil
}
func (r stubConnectorsRepo) SaveStepResult(_ context.Context, _ connectorsdomain.PipelineStepResult) error {
	return nil
}
func (r stubConnectorsRepo) UpdateStepResult(_ context.Context, _, _ string, _ *string, _, _ string) error {
	return nil
}
func (r stubConnectorsRepo) ListStepResultsByOperation(_ context.Context, _ string) ([]connectorsdomain.PipelineStepResult, error) {
	return nil, nil
}
func (r stubConnectorsRepo) FindMapping(_ context.Context, _, _, _ string) (*connectorsdomain.VTEXEntityMapping, error) {
	return nil, nil
}
func (r stubConnectorsRepo) SaveMapping(_ context.Context, _ connectorsdomain.VTEXEntityMapping) error {
	return nil
}

// stubVTEXAdapter satisfies connectors ports.VTEXCatalogPort with in-memory no-ops.
type stubVTEXAdapter struct{}

func (a stubVTEXAdapter) FindOrCreateCategory(_ context.Context, _ connectorports.CategoryParams) (string, error) {
	return "cat_1", nil
}
func (a stubVTEXAdapter) FindOrCreateBrand(_ context.Context, _ connectorports.BrandParams) (string, error) {
	return "brand_1", nil
}
func (a stubVTEXAdapter) CreateProduct(_ context.Context, _ connectorports.ProductParams) (string, error) {
	return "prod_1", nil
}
func (a stubVTEXAdapter) CreateSKU(_ context.Context, _ connectorports.SKUParams) (string, error) {
	return "sku_1", nil
}
func (a stubVTEXAdapter) AttachSpecsAndImages(_ context.Context, _ connectorports.SpecsImagesParams) error {
	return nil
}
func (a stubVTEXAdapter) AssociateTradePolicy(_ context.Context, _ connectorports.TradePolicyParams) error {
	return nil
}
func (a stubVTEXAdapter) SetPrice(_ context.Context, _ connectorports.PriceParams) error {
	return nil
}
func (a stubVTEXAdapter) SetStock(_ context.Context, _ connectorports.StockParams) error {
	return nil
}
func (a stubVTEXAdapter) ActivateProduct(_ context.Context, _ connectorports.ActivateParams) error {
	return nil
}
func (a stubVTEXAdapter) GetProduct(_ context.Context, _, _ string) (connectorports.ProductData, error) {
	return connectorports.ProductData{}, nil
}
func (a stubVTEXAdapter) GetSKU(_ context.Context, _, _ string) (connectorports.SKUData, error) {
	return connectorports.SKUData{}, nil
}
func (a stubVTEXAdapter) GetCategory(_ context.Context, _, _ string) (connectorports.CategoryData, error) {
	return connectorports.CategoryData{}, nil
}
func (a stubVTEXAdapter) GetBrand(_ context.Context, _, _ string) (connectorports.BrandData, error) {
	return connectorports.BrandData{}, nil
}

// TestRouterRegistersAllFoundationEndpoints verifies that every expected route
// is registered and returns a non-404 response. It builds a minimal mux with
// stub repository adapters so that no real database connection is required.
func TestRouterRegistersAllFoundationEndpoints(t *testing.T) {
	t.Setenv("VTEX_APP_KEY", "test-key")
	t.Setenv("VTEX_APP_TOKEN", "test-token")

	mux := http.NewServeMux()

	// /healthz
	base := httpx.NewRouter()
	mux.Handle("/healthz", base)

	// /catalog/products
	catalogSvc := catalogapp.NewService(stubCatalogReader{}, stubCatalogEnrichments{}, "tenant_default")
	catalogtransport.Handler{Service: catalogSvc}.Register(mux)

	// /marketplaces/accounts, /marketplaces/policies
	marketSvc := marketplacesapp.NewService(stubMarketplacesRepo{}, "tenant_default")
	marketplacestransport.NewHandler(marketSvc).Register(mux)

	// /pricing/simulations
	pricingSvc := pricingapp.NewService(stubPricingRepo{}, "tenant_default")
	pricingtransport.NewHandler(pricingSvc).Register(mux)

	// /connectors/vtex/publish, /connectors/vtex/publish/batch/...
	connectorsOrch := connectorsapp.NewBatchOrchestrator(stubConnectorsRepo{}, stubVTEXAdapter{}, "tenant_default")
	connectorstransport.NewHandler(connectorsOrch).Register(mux)

	cases := []string{
		"/healthz",
		"/catalog/products",
		"/marketplaces/accounts",
		"/marketplaces/policies",
		"/pricing/simulations",
		"/connectors/vtex/publish",
		"/connectors/vtex/publish/batch/test_batch_123",
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
