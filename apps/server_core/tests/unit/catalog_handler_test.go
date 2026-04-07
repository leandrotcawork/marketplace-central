package unit

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	catalogdomain "marketplace-central/apps/server_core/internal/modules/catalog/domain"
	catalogtransport "marketplace-central/apps/server_core/internal/modules/catalog/transport"
)

type catalogHandlerReaderStub struct {
	products []catalogdomain.Product
}

func (r *catalogHandlerReaderStub) ListProducts(_ context.Context) ([]catalogdomain.Product, error) {
	return r.products, nil
}

func (r *catalogHandlerReaderStub) GetProduct(_ context.Context, id string) (catalogdomain.Product, error) {
	for _, p := range r.products {
		if p.ProductID == id {
			return p, nil
		}
	}
	return catalogdomain.Product{}, nil
}

func (r *catalogHandlerReaderStub) SearchProducts(_ context.Context, q string) ([]catalogdomain.Product, error) {
	var result []catalogdomain.Product
	for _, p := range r.products {
		if strings.Contains(strings.ToLower(p.Name), strings.ToLower(q)) {
			result = append(result, p)
		}
	}
	return result, nil
}

func (r *catalogHandlerReaderStub) ListTaxonomyNodes(_ context.Context) ([]catalogdomain.TaxonomyNode, error) {
	return nil, nil
}

func (r *catalogHandlerReaderStub) ListProductsByIDs(_ context.Context, productIDs []string) ([]catalogdomain.Product, error) {
	result := make([]catalogdomain.Product, 0, len(productIDs))
	seen := make(map[string]struct{}, len(productIDs))
	for _, id := range productIDs {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		for _, p := range r.products {
			if p.ProductID == id {
				result = append(result, p)
				break
			}
		}
	}
	return result, nil
}

type catalogHandlerEnrichmentStub struct{}

func (s catalogHandlerEnrichmentStub) GetEnrichment(_ context.Context, productID string) (catalogdomain.ProductEnrichment, error) {
	return catalogdomain.ProductEnrichment{ProductID: productID}, nil
}

func (s catalogHandlerEnrichmentStub) UpsertEnrichment(_ context.Context, _ catalogdomain.ProductEnrichment) error {
	return nil
}

func (s catalogHandlerEnrichmentStub) ListEnrichments(_ context.Context, _ []string) (map[string]catalogdomain.ProductEnrichment, error) {
	return make(map[string]catalogdomain.ProductEnrichment), nil
}

func newCatalogHandler(products []catalogdomain.Product) catalogtransport.Handler {
	reader := &catalogHandlerReaderStub{products: products}
	svc := catalogapp.NewService(reader, catalogHandlerEnrichmentStub{}, "tnt_test")
	return catalogtransport.Handler{Service: svc}
}

func TestCatalogHandlerGetReturnsProducts(t *testing.T) {
	seeded := []catalogdomain.Product{
		{ProductID: "p-1", SKU: "SKU-1", Name: "Widget", Status: "active", CostAmount: 10.0},
	}
	mux := http.NewServeMux()
	newCatalogHandler(seeded).Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/catalog/products", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var result map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	items, ok := result["items"].([]any)
	if !ok || len(items) == 0 {
		t.Fatalf("expected non-empty items, got %v", result["items"])
	}
}

func TestCatalogHandlerRejectsPost(t *testing.T) {
	mux := http.NewServeMux()
	newCatalogHandler(nil).Register(mux)

	req := httptest.NewRequest(http.MethodPost, "/catalog/products", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
	var body map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("expected JSON error body on 405: %v", err)
	}
	if body["error"] == nil {
		t.Fatal("expected error field in response")
	}
}

func TestCatalogHandlerRejectsPut(t *testing.T) {
	mux := http.NewServeMux()
	newCatalogHandler(nil).Register(mux)

	req := httptest.NewRequest(http.MethodPut, "/catalog/products", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestCatalogSearchEndpoint(t *testing.T) {
	seeded := []catalogdomain.Product{
		{ProductID: "prd_1", SKU: "SKU-001", Name: "Cuba Inox"},
		{ProductID: "prd_2", SKU: "SKU-002", Name: "Torneira Gourmet"},
	}
	mux := http.NewServeMux()
	newCatalogHandler(seeded).Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/catalog/products/search?q=cuba", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var result map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	items, ok := result["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected 1 search result, got %v", result["items"])
	}
}

func TestCatalogSearchEndpointRequiresQuery(t *testing.T) {
	mux := http.NewServeMux()
	newCatalogHandler(nil).Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/catalog/products/search", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCatalogGetProductEndpoint(t *testing.T) {
	seeded := []catalogdomain.Product{
		{ProductID: "prd_1", SKU: "SKU-001", Name: "Cuba Inox"},
	}
	mux := http.NewServeMux()
	newCatalogHandler(seeded).Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/catalog/products/prd_1", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var result map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if result["product_id"] != "prd_1" {
		t.Fatalf("expected product_id prd_1, got %v", result["product_id"])
	}
}

func TestCatalogUpsertEnrichmentEndpoint(t *testing.T) {
	seeded := []catalogdomain.Product{
		{ProductID: "prd_1", SKU: "SKU-001", Name: "Cuba Inox"},
	}
	mux := http.NewServeMux()
	newCatalogHandler(seeded).Register(mux)

	body := `{"height_cm": 30.0, "suggested_price_amount": 199.99}`
	req := httptest.NewRequest(http.MethodPut, "/catalog/products/prd_1/enrichment", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}
