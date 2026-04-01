package unit

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/platform/httpx"
)

func TestHealthRouteReturnsCanonicalPayload(t *testing.T) {
	router := httpx.NewRouter()

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	expected := "{\"service\":\"marketplace-central-server-core\",\"status\":\"ok\"}\n"
	if rec.Body.String() != expected {
		t.Fatalf("unexpected body: %q", rec.Body.String())
	}
}
