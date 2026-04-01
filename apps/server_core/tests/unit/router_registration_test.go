package unit

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/composition"
)

func TestRouterRegistersAllFoundationEndpoints(t *testing.T) {
	router := composition.NewRootRouter()

	cases := []string{
		"/healthz",
		"/catalog/products",
		"/marketplaces/accounts",
		"/marketplaces/policies",
		"/pricing/simulations",
	}

	for _, path := range cases {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code == http.StatusNotFound {
			t.Fatalf("expected route %s to exist", path)
		}
	}
}
