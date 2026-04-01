package unit

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	catalogdomain "marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/transport"
)

type catalogHandlerRepoStub struct {
	products []catalogdomain.Product
}

func (r *catalogHandlerRepoStub) ListProducts(_ context.Context) ([]catalogdomain.Product, error) {
	return r.products, nil
}

func newCatalogHandler(products []catalogdomain.Product) transport.Handler {
	repo := &catalogHandlerRepoStub{products: products}
	svc := catalogapp.NewService(repo, "tenant_default")
	return transport.Handler{Service: svc}
}

func TestCatalogHandlerGetReturnsProducts(t *testing.T) {
	seeded := []catalogdomain.Product{
		{ProductID: "p-1", TenantID: "tenant_default", SKU: "SKU-1", Name: "Widget", Status: "active", Cost: 10.0},
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
