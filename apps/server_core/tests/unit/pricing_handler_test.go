package unit

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/pricing/application"
	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
	"marketplace-central/apps/server_core/internal/modules/pricing/transport"
)

type pricingRepoHandlerStub struct {
	simulations []domain.Simulation
}

func (r *pricingRepoHandlerStub) SaveSimulation(_ context.Context, sim domain.Simulation) error {
	r.simulations = append(r.simulations, sim)
	return nil
}
func (r *pricingRepoHandlerStub) ListSimulations(_ context.Context) ([]domain.Simulation, error) {
	return r.simulations, nil
}

func newPricingHandlerWithStub() (transport.Handler, *pricingRepoHandlerStub) {
	repo := &pricingRepoHandlerStub{}
	svc := application.NewService(repo, "tenant_default")
	return transport.NewHandler(svc, nil), repo
}

func TestPricingHandlerPostReturnsSimulation(t *testing.T) {
	mux := http.NewServeMux()
	h, _ := newPricingHandlerWithStub()
	h.Register(mux)

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

func TestPricingHandlerGetReturnsPersistedSimulations(t *testing.T) {
	mux := http.NewServeMux()
	h, repo := newPricingHandlerWithStub()
	h.Register(mux)

	// Seed the stub with one simulation
	repo.simulations = []domain.Simulation{
		{SimulationID: "sim-seed", TenantID: "tenant_default", ProductID: "prod-1", AccountID: "acct-1", MarginAmount: 9.0, MarginPercent: 0.09, Status: "warning"},
	}

	req := httptest.NewRequest(http.MethodGet, "/pricing/simulations", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var result map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	items, ok := result["items"].([]any)
	if !ok || len(items) == 0 {
		t.Fatalf("expected non-empty items array, got %v", result["items"])
	}
	first := items[0].(map[string]any)
	if first["simulation_id"] != "sim-seed" {
		t.Fatalf("expected simulation_id sim-seed, got %v", first["simulation_id"])
	}
}

func TestPricingHandlerRejectsOtherMethods(t *testing.T) {
	mux := http.NewServeMux()
	h, _ := newPricingHandlerWithStub()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodPut, "/pricing/simulations", nil)
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
		t.Fatal("expected error field in 405 response body")
	}
}

func TestPricingBatchEndpointReturnsResults(t *testing.T) {
	stubProducts := &stubProductProvider{products: []pricingports.BatchProduct{
		{ProductID: "p1", CostAmount: 80, PriceAmount: 150},
	}}
	stubPolicies := &stubPolicyProvider{policies: []pricingports.BatchPolicy{
		{PolicyID: "pol1", CommissionPercent: 0.16, DefaultShipping: 20, MinMarginPercent: 0.10, ShippingProvider: "fixed"},
	}}
	stubFreight := &stubFreightQuoter{connected: false}
	batch := application.NewBatchOrchestrator(stubProducts, stubPolicies, stubFreight, "t1")

	repo := &pricingRepoStub{}
	svc := application.NewService(repo, "t1")
	handler := transport.NewHandler(svc, batch)

	mux := http.NewServeMux()
	handler.Register(mux)

	body := `{"product_ids":["p1"],"policy_ids":["pol1"],"origin_cep":"01310100","destination_cep":"30140071","price_source":"my_price"}`
	req := httptest.NewRequest(http.MethodPost, "/pricing/simulations/batch", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(resp.Items))
	}
}
