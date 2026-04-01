package unit

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/pricing/transport"
)

func TestPricingHandlerAcceptsGet(t *testing.T) {
	handler := transport.Handler{}
	mux := http.NewServeMux()
	handler.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/pricing/simulations", nil)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
}

func TestPricingHandlerAcceptsPost(t *testing.T) {
	handler := transport.Handler{}
	mux := http.NewServeMux()
	handler.Register(mux)

	req := httptest.NewRequest(http.MethodPost, "/pricing/simulations", nil)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", rec.Code)
	}
}

func TestPricingHandlerRejectsOtherMethods(t *testing.T) {
	handler := transport.Handler{}
	mux := http.NewServeMux()
	handler.Register(mux)

	req := httptest.NewRequest(http.MethodPut, "/pricing/simulations", nil)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status 405, got %d", rec.Code)
	}
}
