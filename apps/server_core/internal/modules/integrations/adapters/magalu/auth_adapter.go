package magalu

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
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
	authURL, err := a.BuildAuthorizeURL(input.State, input.RedirectURI, "")
	if err != nil {
		return application.AuthorizeStart{}, err
	}
	return application.AuthorizeStart{AuthURL: authURL}, nil
}

func (a *Adapter) BuildAuthorizeURL(state, redirectURI, codeChallenge string) (string, error) {
	base, err := url.Parse(a.cfg.AuthorizeURL)
	if err != nil {
		return "", err
	}
	query := base.Query()
	query.Set("response_type", "code")
	query.Set("client_id", a.cfg.ClientID)
	query.Set("redirect_uri", redirectURI)
	query.Set("state", state)
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
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", a.cfg.ClientID)
	form.Set("client_secret", a.cfg.ClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.cfg.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := a.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, domain.ErrAuthCodeExchangeFailed
	}

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		SellerID     string `json:"seller_id"`
		SellerName   string `json:"seller_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}

	return &domain.TokenResult{
		AccessToken:       payload.AccessToken,
		RefreshToken:      payload.RefreshToken,
		ExpiresIn:         payload.ExpiresIn,
		TokenType:         "Bearer",
		ProviderAccountID: payload.SellerID,
		RawExtras: map[string]any{
			"provider_account_name": payload.SellerName,
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

	resp, err := a.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, domain.ErrRefreshProviderError
	}

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		SellerID     string `json:"seller_id"`
		SellerName   string `json:"seller_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}

	return &domain.TokenResult{
		AccessToken:       payload.AccessToken,
		RefreshToken:      payload.RefreshToken,
		ExpiresIn:         payload.ExpiresIn,
		TokenType:         "Bearer",
		ProviderAccountID: payload.SellerID,
		RawExtras: map[string]any{
			"provider_account_name": payload.SellerName,
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
