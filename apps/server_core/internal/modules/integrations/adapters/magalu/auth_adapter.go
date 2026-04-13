package magalu

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type Config struct {
	ClientID     string
	ClientSecret string
	AuthorizeURL string
	TokenURL     string
	HTTPClient   *http.Client
}

type Adapter struct {
	cfg Config
}

func NewAdapter(cfg Config) *Adapter {
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Adapter{cfg: cfg}
}

func (a *Adapter) ProviderCode() string { return "magalu" }

func (a *Adapter) AuthStrategy() domain.AuthStrategy { return domain.AuthStrategyOAuth2 }

func (a *Adapter) StartAuthorize(_ context.Context, input application.StartAuthorizeAdapterInput) (application.AuthorizeStart, error) {
	authURL, err := a.BuildAuthorizeURL(input.State, input.RedirectURI, "", input.Scopes)
	if err != nil {
		return application.AuthorizeStart{}, err
	}
	return application.AuthorizeStart{AuthURL: authURL}, nil
}

func (a *Adapter) BuildAuthorizeURL(state, redirectURI, codeChallenge string, scopes []string) (string, error) {
	base, err := url.Parse(a.cfg.AuthorizeURL)
	if err != nil {
		return "", err
	}
	query := base.Query()
	query.Set("response_type", "code")
	query.Set("client_id", a.cfg.ClientID)
	query.Set("redirect_uri", redirectURI)
	query.Set("choose_tenants", "true")
	query.Set("state", state)
	if scope := joinScopes(scopes); scope != "" {
		query.Set("scope", scope)
	}
	if codeChallenge != "" {
		query.Set("code_challenge", codeChallenge)
		query.Set("code_challenge_method", "S256")
	}
	base.RawQuery = query.Encode()
	return base.String(), nil
}

func (a *Adapter) ExchangeCallback(ctx context.Context, input application.HandleCallbackAdapterInput) (application.CredentialPayload, error) {
	result, err := a.ExchangeCode(ctx, input.Code, input.RedirectURI, "")
	if err != nil {
		return application.CredentialPayload{}, err
	}

	var expiresAt *time.Time
	if result.ExpiresIn > 0 {
		ts := time.Now().UTC().Add(time.Duration(result.ExpiresIn) * time.Second)
		expiresAt = &ts
	}

	accountName, _ := result.RawExtras["provider_account_name"].(string)
	return application.CredentialPayload{
		SecretType:          "oauth2",
		AccessToken:         result.AccessToken,
		RefreshToken:        result.RefreshToken,
		ProviderAccountID:   result.ProviderAccountID,
		ProviderAccountName: accountName,
		ExpiresAt:           expiresAt,
		Extra:               result.RawExtras,
	}, nil
}

func (a *Adapter) ExchangeCode(ctx context.Context, code, redirectURI, _ string) (*domain.TokenResult, error) {
	requestPayload := map[string]string{
		"grant_type":    "authorization_code",
		"client_id":     a.cfg.ClientID,
		"client_secret": a.cfg.ClientSecret,
		"code":          code,
		"redirect_uri":  redirectURI,
	}
	body, err := json.Marshal(requestPayload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.cfg.TokenURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := a.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("%w: status=%d body=%s", domain.ErrAuthCodeExchangeFailed, resp.StatusCode, readProviderErrorBody(resp))
	}

	var responsePayload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		SellerID     any    `json:"seller_id"`
		TenantID     any    `json:"tenant_id"`
		UserID       any    `json:"user_id"`
		SellerName   string `json:"seller_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&responsePayload); err != nil {
		return nil, err
	}
	providerAccountID := resolveProviderAccountID(responsePayload.AccessToken, responsePayload.SellerID, responsePayload.TenantID, responsePayload.UserID)

	return &domain.TokenResult{
		AccessToken:       responsePayload.AccessToken,
		RefreshToken:      responsePayload.RefreshToken,
		ExpiresIn:         responsePayload.ExpiresIn,
		TokenType:         "Bearer",
		ProviderAccountID: providerAccountID,
		RawExtras: map[string]any{
			"provider_account_name": responsePayload.SellerName,
		},
	}, nil
}

func (a *Adapter) Refresh(ctx context.Context, input application.RefreshCredentialAdapterInput) (application.CredentialPayload, error) {
	result, err := a.RefreshToken(ctx, input.RefreshToken)
	if err != nil {
		return application.CredentialPayload{}, err
	}
	var expiresAt *time.Time
	if result.ExpiresIn > 0 {
		ts := time.Now().UTC().Add(time.Duration(result.ExpiresIn) * time.Second)
		expiresAt = &ts
	}
	accountName, _ := result.RawExtras["provider_account_name"].(string)
	return application.CredentialPayload{
		SecretType:          "oauth2",
		AccessToken:         result.AccessToken,
		RefreshToken:        result.RefreshToken,
		ProviderAccountID:   result.ProviderAccountID,
		ProviderAccountName: accountName,
		ExpiresAt:           expiresAt,
		Extra:               result.RawExtras,
	}, nil
}

func (a *Adapter) RefreshToken(ctx context.Context, refreshToken string) (*domain.TokenResult, error) {
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("client_id", a.cfg.ClientID)
	form.Set("client_secret", a.cfg.ClientSecret)
	form.Set("refresh_token", refreshToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.cfg.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := a.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("%w: status=%d body=%s", domain.ErrRefreshProviderError, resp.StatusCode, readProviderErrorBody(resp))
	}

	var responsePayload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		SellerID     any    `json:"seller_id"`
		TenantID     any    `json:"tenant_id"`
		UserID       any    `json:"user_id"`
		SellerName   string `json:"seller_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&responsePayload); err != nil {
		return nil, err
	}
	providerAccountID := resolveProviderAccountID(responsePayload.AccessToken, responsePayload.SellerID, responsePayload.TenantID, responsePayload.UserID)

	return &domain.TokenResult{
		AccessToken:       responsePayload.AccessToken,
		RefreshToken:      responsePayload.RefreshToken,
		ExpiresIn:         responsePayload.ExpiresIn,
		TokenType:         "Bearer",
		ProviderAccountID: providerAccountID,
		RawExtras: map[string]any{
			"provider_account_name": responsePayload.SellerName,
		},
	}, nil
}

func (a *Adapter) RevokeToken(context.Context, string) error { return nil }

func (a *Adapter) VerifyAPIKey(context.Context, application.SubmitAPIKeyAdapterInput) (application.CredentialPayload, error) {
	return application.CredentialPayload{}, domain.ErrNotSupported
}

func (a *Adapter) ValidateCredentials(context.Context, map[string]string) (*domain.TokenResult, error) {
	return nil, domain.ErrNotSupported
}

func readProviderErrorBody(resp *http.Response) string {
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1024))
	if err != nil {
		return "unavailable"
	}
	text := strings.TrimSpace(string(raw))
	if text == "" {
		return "empty"
	}
	return text
}

func joinScopes(scopes []string) string {
	filtered := make([]string, 0, len(scopes))
	for _, scope := range scopes {
		scope = strings.TrimSpace(scope)
		if scope == "" {
			continue
		}
		filtered = append(filtered, scope)
	}
	return strings.Join(filtered, " ")
}

func resolveProviderAccountID(accessToken string, candidates ...any) string {
	for _, candidate := range candidates {
		if value := normalizeAnyString(candidate); value != "" {
			return value
		}
	}
	if value := providerAccountIDFromJWT(accessToken); value != "" {
		return value
	}
	return ""
}

func providerAccountIDFromJWT(accessToken string) string {
	parts := strings.Split(strings.TrimSpace(accessToken), ".")
	if len(parts) < 2 {
		return ""
	}
	rawPayload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ""
	}
	var claims map[string]any
	if err := json.Unmarshal(rawPayload, &claims); err != nil {
		return ""
	}

	for _, key := range []string{"seller_id", "tenant_id", "organization_id", "org_id", "user_id", "sub"} {
		if value := normalizeAnyString(claims[key]); value != "" {
			return value
		}
	}
	return ""
}

func normalizeAnyString(value any) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return strconv.FormatInt(int64(v), 10)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	default:
		if value == nil {
			return ""
		}
		return strings.TrimSpace(fmt.Sprintf("%v", value))
	}
}
