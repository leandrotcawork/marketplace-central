package mercadolivre

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
)

func TestAdapterBuildsAuthorizeURLAndExchangesCallback(t *testing.T) {
	t.Parallel()

	var tokenRequestBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/oauth/token":
			tokenRequestBody = mustReadBody(t, r)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token":  "ml-access",
				"refresh_token": "ml-refresh",
				"expires_in":    3600,
				"user_id":       12345,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	adapter := NewAdapter(Config{
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		AuthorizeURL: server.URL + "/authorization",
		TokenURL:     server.URL + "/oauth/token",
		HTTPClient:   server.Client(),
	})

	start, err := adapter.StartAuthorize(context.Background(), application.StartAuthorizeAdapterInput{
		InstallationID: "inst-ml",
		State:          "state-1",
		RedirectURI:    "https://app.test/callback",
		CodeChallenge:  "challenge-1",
		Scopes:         []string{"read", "write"},
	})
	if err != nil {
		t.Fatalf("StartAuthorize() error = %v", err)
	}
	if !strings.Contains(start.AuthURL, "client_id=client-id") || !strings.Contains(start.AuthURL, "state=state-1") || !strings.Contains(start.AuthURL, "code_challenge=challenge-1") || !strings.Contains(start.AuthURL, "code_challenge_method=S256") {
		t.Fatalf("auth URL missing expected query params: %s", start.AuthURL)
	}

	credential, err := adapter.ExchangeCallback(context.Background(), application.HandleCallbackAdapterInput{
		InstallationID: "inst-ml",
		Code:           "code-1",
		RedirectURI:    "https://app.test/callback",
		CodeVerifier:   "verifier-1",
	})
	if err != nil {
		t.Fatalf("ExchangeCallback() error = %v", err)
	}
	if credential.AccessToken != "ml-access" || credential.RefreshToken != "ml-refresh" {
		t.Fatalf("credential tokens = %#v, want exchanged tokens", credential)
	}
	if credential.ProviderAccountID != "12345" {
		t.Fatalf("provider account ID = %q, want 12345", credential.ProviderAccountID)
	}
	if !strings.Contains(tokenRequestBody, "grant_type=authorization_code") || !strings.Contains(tokenRequestBody, "code=code-1") || !strings.Contains(tokenRequestBody, "code_verifier=verifier-1") {
		t.Fatalf("token request body = %q, want auth code grant with code and PKCE verifier", tokenRequestBody)
	}
}

func mustReadBody(t *testing.T, r *http.Request) string {
	t.Helper()
	buf, err := io.ReadAll(r.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return string(buf)
}
