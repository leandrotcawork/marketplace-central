package unit

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/connectors/adapters/melhorenvio"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

func TestMEClientQuoteFreightReturnsLowestPrice(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/me/shipment/calculate" {
			http.NotFound(w, r)
			return
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Fatalf("expected bearer token header, got %q", got)
		}

		resp := []map[string]any{
			{"id": 1, "name": "PAC", "custom_price": 18.50, "price": 25.0, "delivery_time": 5},
			{"id": 2, "name": "SEDEX", "custom_price": 32.00, "price": 40.0, "delivery_time": 2},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	store := melhorenvio.NewInMemoryTokenStore("test-token")
	client := melhorenvio.NewClientWithBaseURL(store, srv.URL)

	results, err := client.QuoteFreight(context.Background(), pricingports.FreightRequest{
		OriginCEP: "01310-100",
		DestCEP:   "30140-071",
		Products: []pricingports.FreightProduct{
			{ProductID: "p1", HeightCM: 10, WidthCM: 15, LengthCM: 20, WeightKg: 0.5, Value: 100},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	r, ok := results["p1"]
	if !ok {
		t.Fatal("expected result for p1")
	}
	if r.Amount != 18.50 {
		t.Fatalf("expected 18.50 (lowest custom_price), got %v", r.Amount)
	}
	if r.Source != "melhor_envio" {
		t.Fatalf("expected source melhor_envio, got %q", r.Source)
	}
}

func TestMEClientIsConnectedReturnsFalseWhenNoToken(t *testing.T) {
	store := melhorenvio.NewInMemoryTokenStore("")
	client := melhorenvio.NewClientWithBaseURL(store, "http://unused")

	connected, err := client.IsConnected(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if connected {
		t.Fatal("expected IsConnected false when token is empty")
	}
}
