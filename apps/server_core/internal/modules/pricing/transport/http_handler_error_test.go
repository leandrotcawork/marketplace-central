package transport

import (
	"net/http"
	"testing"
)

func TestMapPricingErrorReturnsServerErrorForBatchLoadFailures(t *testing.T) {
	status, code := mapPricingError("PRICING_BATCH_LOAD_PRODUCTS: database unavailable")
	if status != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", status)
	}
	if code != "PRICING_INTERNAL_ERROR" {
		t.Fatalf("expected PRICING_INTERNAL_ERROR, got %q", code)
	}
}
