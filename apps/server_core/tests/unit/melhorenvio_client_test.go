package unit

import (
	"context"
	"encoding/json"
	"errors"
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

func TestMEClientQuoteFreightFallsBackToPriceWhenCustomPriceIsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := []map[string]any{
			{"id": 1, "name": "PAC", "custom_price": 0.0, "price": 21.75},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := melhorenvio.NewClientWithBaseURL(melhorenvio.NewInMemoryTokenStore("test-token"), srv.URL)

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
	if got := results["p1"].Amount; got != 21.75 {
		t.Fatalf("expected fallback price 21.75, got %v", got)
	}
}

func TestMEClientQuoteFreightTreatsEmptyStringErrorAsSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := []map[string]any{
			{"id": 1, "name": "PAC", "custom_price": 12.34, "price": 20.0, "error": ""},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := melhorenvio.NewClientWithBaseURL(melhorenvio.NewInMemoryTokenStore("test-token"), srv.URL)

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
	if got := results["p1"].Amount; got != 12.34 {
		t.Fatalf("expected amount 12.34, got %v", got)
	}
	if got := results["p1"].Source; got != "melhor_envio" {
		t.Fatalf("expected source melhor_envio, got %q", got)
	}
}

func TestMEClientQuoteFreightPreservesValidZeroPriceQuote(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := []map[string]any{
			{"id": 1, "name": "PAC", "custom_price": 0.0, "price": 0.0},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := melhorenvio.NewClientWithBaseURL(melhorenvio.NewInMemoryTokenStore("test-token"), srv.URL)

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
	if got := results["p1"].Amount; got != 0 {
		t.Fatalf("expected zero-priced quote to be preserved, got %v", got)
	}
	if got := results["p1"].Source; got != "melhor_envio" {
		t.Fatalf("expected source melhor_envio, got %q", got)
	}
}

func TestMEClientQuoteFreightNormalizesCEPsInRequestPayload(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			From struct {
				PostalCode string `json:"postal_code"`
			} `json:"from"`
			To struct {
				PostalCode string `json:"postal_code"`
			} `json:"to"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if payload.From.PostalCode != "01310100" {
			t.Fatalf("expected normalized origin CEP, got %q", payload.From.PostalCode)
		}
		if payload.To.PostalCode != "30140071" {
			t.Fatalf("expected normalized destination CEP, got %q", payload.To.PostalCode)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"id": 1, "name": "PAC", "custom_price": 10.0},
		})
	}))
	defer srv.Close()

	client := melhorenvio.NewClientWithBaseURL(melhorenvio.NewInMemoryTokenStore("test-token"), srv.URL)

	_, err := client.QuoteFreight(context.Background(), pricingports.FreightRequest{
		OriginCEP: "01310-100",
		DestCEP:   "30140-071",
		Products: []pricingports.FreightProduct{
			{ProductID: "p1", HeightCM: 10, WidthCM: 15, LengthCM: 20, WeightKg: 0.5, Value: 100},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMEClientQuoteFreightReturnsErrorForNon200Response(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad gateway", http.StatusBadGateway)
	}))
	defer srv.Close()

	client := melhorenvio.NewClientWithBaseURL(melhorenvio.NewInMemoryTokenStore("test-token"), srv.URL)

	_, err := client.QuoteFreight(context.Background(), pricingports.FreightRequest{
		OriginCEP: "01310-100",
		DestCEP:   "30140-071",
		Products: []pricingports.FreightProduct{
			{ProductID: "p1", HeightCM: 10, WidthCM: 15, LengthCM: 20, WeightKg: 0.5, Value: 100},
		},
	})
	if err == nil {
		t.Fatal("expected error for non-200 response")
	}
}

func TestMEClientQuoteFreightSurfacesTokenGetterError(t *testing.T) {
	expectedErr := errors.New("token store unavailable")
	client := melhorenvio.NewClientWithBaseURL(tokenGetterStub{err: expectedErr}, "http://unused")

	_, err := client.QuoteFreight(context.Background(), pricingports.FreightRequest{
		OriginCEP: "01310-100",
		DestCEP:   "30140-071",
		Products: []pricingports.FreightProduct{
			{ProductID: "p1", HeightCM: 10, WidthCM: 15, LengthCM: 20, WeightKg: 0.5, Value: 100},
		},
	})
	if !errors.Is(err, expectedErr) {
		t.Fatalf("expected token getter error, got %v", err)
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

type tokenGetterStub struct {
	token string
	err   error
}

func (s tokenGetterStub) GetToken(context.Context) (string, error) {
	return s.token, s.err
}
