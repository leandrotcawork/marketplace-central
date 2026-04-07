package unit

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
)

type marketplacesRepoStub struct {
	accounts []domain.Account
	policies []domain.Policy
}

func (r *marketplacesRepoStub) SaveAccount(_ context.Context, a domain.Account) error {
	r.accounts = append(r.accounts, a)
	return nil
}
func (r *marketplacesRepoStub) SavePolicy(_ context.Context, p domain.Policy) error {
	r.policies = append(r.policies, p)
	return nil
}
func (r *marketplacesRepoStub) ListAccounts(_ context.Context) ([]domain.Account, error) {
	return r.accounts, nil
}
func (r *marketplacesRepoStub) ListPolicies(_ context.Context) ([]domain.Policy, error) {
	return r.policies, nil
}

func (r *marketplacesRepoStub) ListPoliciesByIDs(_ context.Context, policyIDs []string) ([]domain.Policy, error) {
	result := make([]domain.Policy, 0, len(policyIDs))
	seen := make(map[string]struct{}, len(policyIDs))
	for _, id := range policyIDs {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		for _, p := range r.policies {
			if p.PolicyID == id {
				result = append(result, p)
				break
			}
		}
	}
	return result, nil
}

func newMarketplacesHandler() transport.Handler {
	repo := &marketplacesRepoStub{}
	svc := application.NewService(repo, "tenant_default")
	return transport.NewHandler(svc)
}

func TestMarketplacesAccountsHandlerPostReturnsAccount(t *testing.T) {
	mux := http.NewServeMux()
	newMarketplacesHandler().Register(mux)

	body := `{"account_id":"acct-1","channel_code":"vtex","display_name":"VTEX","connection_mode":"api"}`
	req := httptest.NewRequest(http.MethodPost, "/marketplaces/accounts", bytes.NewBufferString(body))
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
	if result["account_id"] != "acct-1" {
		t.Fatalf("expected account_id acct-1, got %v", result["account_id"])
	}
	if result["status"] != "active" {
		t.Fatalf("expected status active, got %v", result["status"])
	}
}

func TestMarketplacesAccountsHandlerPostReturns400OnInvalidInput(t *testing.T) {
	mux := http.NewServeMux()
	newMarketplacesHandler().Register(mux)

	body := `{"account_id":"","channel_code":"vtex","display_name":"VTEX","connection_mode":"api"}`
	req := httptest.NewRequest(http.MethodPost, "/marketplaces/accounts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	var result map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	errObj, _ := result["error"].(map[string]any)
	if errObj["code"] != "invalid_request" {
		t.Fatalf("expected code invalid_request, got %v", errObj["code"])
	}
}

func TestMarketplacesAccountsHandlerAcceptsGet(t *testing.T) {
	mux := http.NewServeMux()
	newMarketplacesHandler().Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/marketplaces/accounts", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestMarketplacesAccountsHandlerRejectsOtherMethods(t *testing.T) {
	mux := http.NewServeMux()
	newMarketplacesHandler().Register(mux)

	req := httptest.NewRequest(http.MethodPut, "/marketplaces/accounts", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
	if allow := rec.Header().Get("Allow"); allow != "GET, POST" {
		t.Fatalf("expected Allow: GET, POST, got %q", allow)
	}
}

func TestMarketplacesPoliciesHandlerPostReturnsPolicy(t *testing.T) {
	mux := http.NewServeMux()
	newMarketplacesHandler().Register(mux)

	body := `{"policy_id":"pol-1","account_id":"acct-1","commission_percent":0.16,"fixed_fee_amount":5.0,"default_shipping":10.0,"min_margin_percent":0.10,"sla_question_minutes":60,"sla_dispatch_hours":24,"shipping_provider":"marketplace"}`
	req := httptest.NewRequest(http.MethodPost, "/marketplaces/policies", bytes.NewBufferString(body))
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
	if result["policy_id"] != "pol-1" {
		t.Fatalf("expected policy_id pol-1, got %v", result["policy_id"])
	}
	if result["shipping_provider"] != "marketplace" {
		t.Fatalf("expected shipping_provider marketplace, got %v", result["shipping_provider"])
	}
}

func TestMarketplacesPoliciesHandlerPostDefaultsShippingProviderToFixed(t *testing.T) {
	mux := http.NewServeMux()
	newMarketplacesHandler().Register(mux)

	body := `{"policy_id":"pol-default","account_id":"acct-1","commission_percent":0.16,"fixed_fee_amount":5.0,"default_shipping":10.0,"min_margin_percent":0.10,"sla_question_minutes":60,"sla_dispatch_hours":24}`
	req := httptest.NewRequest(http.MethodPost, "/marketplaces/policies", bytes.NewBufferString(body))
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
	if result["shipping_provider"] != "fixed" {
		t.Fatalf("expected shipping_provider fixed, got %v", result["shipping_provider"])
	}
}

func TestMarketplacesPoliciesHandlerAcceptsGet(t *testing.T) {
	mux := http.NewServeMux()
	newMarketplacesHandler().Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/marketplaces/policies", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestMarketplacesPoliciesHandlerRejectsOtherMethods(t *testing.T) {
	mux := http.NewServeMux()
	newMarketplacesHandler().Register(mux)

	req := httptest.NewRequest(http.MethodPut, "/marketplaces/policies", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
	if allow := rec.Header().Get("Allow"); allow != "GET, POST" {
		t.Fatalf("expected Allow: GET, POST, got %q", allow)
	}
}
