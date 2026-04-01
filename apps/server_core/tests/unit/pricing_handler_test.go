package unit

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/pricing/application"
	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
	"marketplace-central/apps/server_core/internal/modules/pricing/transport"
)

type pricingRepoHandlerStub struct{}

func (r *pricingRepoHandlerStub) SaveSimulation(_ context.Context, _ domain.Simulation) error {
	return nil
}
func (r *pricingRepoHandlerStub) ListSimulations(_ context.Context) ([]domain.Simulation, error) {
	return nil, nil
}

func newPricingHandler() transport.Handler {
	repo := &pricingRepoHandlerStub{}
	svc := application.NewService(repo, "tenant_default")
	return transport.NewHandler(svc)
}

func TestPricingHandlerPostReturnsSimulation(t *testing.T) {
	mux := http.NewServeMux()
	newPricingHandler().Register(mux)

	body := `{"simulation_id":"sim-1","product_id":"prod-1","account_id":"acct-1","base_price_amount":100.0,"cost_amount":60.0,"commission_percent":0.16,"fixed_fee_amount":5.0,"shipping_amount":10.0,"min_margin_percent":0.10}`
	req := httptest.NewRequest(http.MethodPost, "/pricing/simulations", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var result map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if result["simulation_id"] != "sim-1" {
		t.Fatalf("expected simulation_id sim-1, got %v", result["simulation_id"])
	}
	if result["status"] == "" || result["status"] == nil {
		t.Fatal("expected non-empty status")
	}
}

func TestPricingHandlerAcceptsGet(t *testing.T) {
	mux := http.NewServeMux()
	newPricingHandler().Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/pricing/simulations", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestPricingHandlerRejectsOtherMethods(t *testing.T) {
	mux := http.NewServeMux()
	newPricingHandler().Register(mux)

	req := httptest.NewRequest(http.MethodPut, "/pricing/simulations", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}
