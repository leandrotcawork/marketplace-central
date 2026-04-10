package magalu

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
)

func TestAdapterExchangesOAuthCode(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/oauth/token" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":  "magalu-access",
			"refresh_token": "magalu-refresh",
			"expires_in":    7200,
			"seller_id":     "seller-magalu",
			"seller_name":   "Magalu Loja",
		})
	}))
	defer server.Close()

	adapter := NewAdapter(Config{
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		AuthorizeURL: server.URL + "/oauth/authorize",
		TokenURL:     server.URL + "/oauth/token",
		HTTPClient:   server.Client(),
	})

	start, err := adapter.StartAuthorize(context.Background(), application.StartAuthorizeAdapterInput{
		InstallationID: "inst-magalu",
		State:          "state-magalu",
		RedirectURI:    "https://app.test/callback",
	})
	if err != nil {
		t.Fatalf("StartAuthorize() error = %v", err)
	}
	if !strings.Contains(start.AuthURL, "client_id=client-id") || !strings.Contains(start.AuthURL, "state=state-magalu") {
		t.Fatalf("auth URL missing expected query params: %s", start.AuthURL)
	}

	credential, err := adapter.ExchangeCallback(context.Background(), application.HandleCallbackAdapterInput{
		InstallationID: "inst-magalu",
		Code:           "code-magalu",
		RedirectURI:    "https://app.test/callback",
	})
	if err != nil {
		t.Fatalf("ExchangeCallback() error = %v", err)
	}
	if credential.ProviderAccountID != "seller-magalu" || credential.ProviderAccountName != "Magalu Loja" {
		t.Fatalf("credential account = %#v, want seller metadata", credential)
	}
	if credential.AccessToken != "magalu-access" || credential.RefreshToken != "magalu-refresh" {
		t.Fatalf("credential tokens = %#v, want magalu tokens", credential)
	}
}
