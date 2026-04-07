package unit

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	app "marketplace-central/apps/server_core/internal/modules/connectors/application"
	transport "marketplace-central/apps/server_core/internal/modules/connectors/transport"
)

func newTestOrchestrator() *app.BatchOrchestrator {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}
	return app.NewBatchOrchestrator(repo, vtex, "tenant_default")
}

func TestConnectorsPublishHandler(t *testing.T) {
	orch := newTestOrchestrator()
	h := transport.NewHandler(orch, nil)
	mux := http.NewServeMux()
	h.Register(mux)

	body := map[string]any{
		"vtex_account": "mystore",
		"products": []map[string]any{
			{
				"product_id":      "prod_1",
				"name":            "Test Product",
				"description":     "A test product",
				"sku_name":        "Test SKU",
				"ean":             "7891234567890",
				"category":        "Ferramentas",
				"brand":           "Bosch",
				"cost":            50.0,
				"base_price":      99.90,
				"image_urls":      []string{"https://example.com/img.jpg"},
				"specs":           map[string]string{"color": "red"},
				"stock_qty":       10,
				"warehouse_id":    "warehouse_1",
				"trade_policy_id": "1",
			},
		},
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/connectors/vtex/publish", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d — body: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if _, ok := resp["batch_id"]; !ok {
		t.Fatal("response missing batch_id")
	}

	validated, ok := resp["validated"].(float64)
	if !ok {
		t.Fatalf("validated field missing or wrong type: %v", resp["validated"])
	}
	if int(validated) != 1 {
		t.Fatalf("expected validated=1, got %v", validated)
	}
}

func TestConnectorsPublishHandlerRejectsInvalidMethod(t *testing.T) {
	orch := newTestOrchestrator()
	h := transport.NewHandler(orch, nil)
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/connectors/vtex/publish", nil)
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}

func TestConnectorsRetryHandlerNotFound(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}
	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	handler := transport.NewHandler(orch, nil)
	mux := http.NewServeMux()
	handler.Register(mux)

	body := map[string]any{
		"products": []map[string]any{},
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/connectors/vtex/publish/batch/nonexistent_batch_id/retry", bytes.NewReader(b))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown batch, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestConnectorsBatchStatusHandler(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}
	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	// Create a batch via the orchestrator directly.
	products := []app.ProductForPublish{
		{
			ProductID:     "prod_1",
			Name:          "Test Product",
			Description:   "A test product",
			SKUName:       "Test SKU",
			EAN:           "7891234567890",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          50.0,
			BasePrice:     99.90,
			ImageURLs:     []string{},
			Specs:         map[string]string{},
			StockQty:      10,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
	}
	result, err := orch.CreateBatch(t.Context(), "mystore", products)
	if err != nil {
		t.Fatalf("CreateBatch failed: %v", err)
	}

	h := transport.NewHandler(orch, nil)
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/connectors/vtex/publish/batch/"+result.BatchID, nil)
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — body: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp["batch_id"] != result.BatchID {
		t.Fatalf("expected batch_id %q, got %v", result.BatchID, resp["batch_id"])
	}
}

func TestConnectorsMEStatusDelegatesToAuthPort(t *testing.T) {
	orch := newTestOrchestrator()
	stub := &meAuthStub{}
	h := transport.NewHandler(orch, stub)
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/status", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if !stub.called {
		t.Fatal("expected ME auth port to be called")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

type meAuthStub struct{ called bool }

func (m *meAuthStub) HandleStart(http.ResponseWriter, *http.Request)    {}
func (m *meAuthStub) HandleCallback(http.ResponseWriter, *http.Request) {}
func (m *meAuthStub) HandleStatus(w http.ResponseWriter, _ *http.Request) {
	m.called = true
	w.WriteHeader(http.StatusOK)
}
