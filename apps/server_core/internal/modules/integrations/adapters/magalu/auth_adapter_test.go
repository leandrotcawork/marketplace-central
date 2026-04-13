package magalu

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
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

func TestAdapterExchangeCallbackDerivesProviderAccountIDFromJWTWhenSellerIDMissing(t *testing.T) {
	t.Parallel()

	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"seller-from-jwt"}`))
	accessToken := header + "." + payload + "."

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/oauth/token" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":  accessToken,
			"refresh_token": "magalu-refresh",
			"expires_in":    7200,
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

	credential, err := adapter.ExchangeCallback(context.Background(), application.HandleCallbackAdapterInput{
		InstallationID: "inst-magalu",
		Code:           "code-magalu",
		RedirectURI:    "https://app.test/callback",
	})
	if err != nil {
		t.Fatalf("ExchangeCallback() error = %v", err)
	}
	if credential.ProviderAccountID != "seller-from-jwt" {
		t.Fatalf("ProviderAccountID = %q, want seller-from-jwt", credential.ProviderAccountID)
	}
}

func TestAdapterStartAuthorizeIncludesScopeWhenProvided(t *testing.T) {
	t.Parallel()

	adapter := NewAdapter(Config{
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		AuthorizeURL: "https://id.magalu.com/login",
		TokenURL:     "https://id.magalu.com/oauth/token",
	})

	start, err := adapter.StartAuthorize(context.Background(), application.StartAuthorizeAdapterInput{
		InstallationID: "inst-magalu",
		State:          "state-magalu",
		RedirectURI:    "https://app.test/callback",
		Scopes: []string{
			"open:portfolio-skus-seller:read",
			"open:order-order-seller:read",
		},
	})
	if err != nil {
		t.Fatalf("StartAuthorize() error = %v", err)
	}

	authURL, err := url.Parse(start.AuthURL)
	if err != nil {
		t.Fatalf("parse auth URL: %v", err)
	}
	if got := authURL.Query().Get("scope"); got != "open:portfolio-skus-seller:read open:order-order-seller:read" {
		t.Fatalf("scope = %q, want joined scopes", got)
	}
}

func TestAdapterRefreshTokenUsesFormURLEncodedRequest(t *testing.T) {
	t.Parallel()

	var gotContentType string
	var gotGrantType string
	var gotClientID string
	var gotClientSecret string
	var gotRefreshToken string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/oauth/token" {
			http.NotFound(w, r)
			return
		}
		gotContentType = r.Header.Get("Content-Type")
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read body", http.StatusInternalServerError)
			return
		}
		values, err := url.ParseQuery(string(body))
		if err != nil {
			http.Error(w, "parse body", http.StatusBadRequest)
			return
		}
		gotGrantType = values.Get("grant_type")
		gotClientID = values.Get("client_id")
		gotClientSecret = values.Get("client_secret")
		gotRefreshToken = values.Get("refresh_token")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":  "new-access",
			"refresh_token": "new-refresh",
			"expires_in":    7200,
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

	_, err := adapter.Refresh(context.Background(), application.RefreshCredentialAdapterInput{
		InstallationID: "inst-magalu",
		RefreshToken:   "refresh-123",
	})
	if err != nil {
		t.Fatalf("Refresh() error = %v", err)
	}

	if gotContentType != "application/x-www-form-urlencoded" {
		t.Fatalf("Content-Type = %q, want application/x-www-form-urlencoded", gotContentType)
	}
	if gotGrantType != "refresh_token" {
		t.Fatalf("grant_type = %q, want refresh_token", gotGrantType)
	}
	if gotClientID != "client-id" || gotClientSecret != "client-secret" || gotRefreshToken != "refresh-123" {
		t.Fatalf("payload = client_id=%q client_secret=%q refresh_token=%q", gotClientID, gotClientSecret, gotRefreshToken)
	}
}
