package mercadolivre

import (
	"context"
	"encoding/json"
	"errors"
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

func (a *Adapter) ProviderCode() string {
	return "mercado_livre"
}

func (a *Adapter) AuthStrategy() domain.AuthStrategy {
	return domain.AuthStrategyOAuth2
}

func (a *Adapter) StartAuthorize(_ context.Context, input application.StartAuthorizeAdapterInput) (application.AuthorizeStart, error) {
	authURL, err := a.BuildAuthorizeURL(input.State, input.RedirectURI, input.CodeChallenge)
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
	q := base.Query()
	q.Set("response_type", "code")
	q.Set("client_id", a.cfg.ClientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("state", state)
	if codeChallenge != "" {
		q.Set("code_challenge", codeChallenge)
		q.Set("code_challenge_method", "S256")
	}
	base.RawQuery = q.Encode()
	return base.String(), nil
}

func (a *Adapter) ExchangeCallback(ctx context.Context, input application.HandleCallbackAdapterInput) (application.CredentialPayload, error) {
	result, err := a.ExchangeCode(ctx, input.Code, input.RedirectURI, input.CodeVerifier)
	if err != nil {
		return application.CredentialPayload{}, err
	}

	var expiresAt *time.Time
	if result.ExpiresIn > 0 {
		ts := time.Now().UTC().Add(time.Duration(result.ExpiresIn) * time.Second)
		expiresAt = &ts
	}

	return application.CredentialPayload{
		SecretType:        "oauth2",
		AccessToken:       result.AccessToken,
		RefreshToken:      result.RefreshToken,
		ProviderAccountID: result.ProviderAccountID,
		ExpiresAt:         expiresAt,
		Extra:             result.RawExtras,
	}, nil
}

func (a *Adapter) ExchangeCode(ctx context.Context, code, redirectURI, codeVerifier string) (*domain.TokenResult, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", a.cfg.ClientID)
	form.Set("client_secret", a.cfg.ClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	if strings.TrimSpace(codeVerifier) != "" {
		form.Set("code_verifier", codeVerifier)
	}

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
		return nil, fmt.Errorf("%w: status=%d body=%s", domain.ErrAuthCodeExchangeFailed, resp.StatusCode, readProviderErrorBody(resp))
	}

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		UserID       any    `json:"user_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}

	return &domain.TokenResult{
		AccessToken:       payload.AccessToken,
		RefreshToken:      payload.RefreshToken,
		ExpiresIn:         payload.ExpiresIn,
		TokenType:         "Bearer",
		ProviderAccountID: normalizeAnyString(payload.UserID),
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

	return application.CredentialPayload{
		SecretType:        "oauth2",
		AccessToken:       result.AccessToken,
		RefreshToken:      result.RefreshToken,
		ProviderAccountID: result.ProviderAccountID,
		ExpiresAt:         expiresAt,
		Extra:             result.RawExtras,
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
		return nil, fmt.Errorf("%w: status=%d body=%s", domain.ErrRefreshProviderError, resp.StatusCode, readProviderErrorBody(resp))
	}

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		UserID       any    `json:"user_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}

	return &domain.TokenResult{
		AccessToken:       payload.AccessToken,
		RefreshToken:      payload.RefreshToken,
		ExpiresIn:         payload.ExpiresIn,
		TokenType:         "Bearer",
		ProviderAccountID: normalizeAnyString(payload.UserID),
	}, nil
}

func (a *Adapter) RevokeToken(context.Context, string) error {
	return nil
}

func (a *Adapter) VerifyAPIKey(context.Context, application.SubmitAPIKeyAdapterInput) (application.CredentialPayload, error) {
	return application.CredentialPayload{}, domain.ErrNotSupported
}

func (a *Adapter) ValidateCredentials(context.Context, map[string]string) (*domain.TokenResult, error) {
	return nil, domain.ErrNotSupported
}

func normalizeAnyString(value any) string {
	switch v := value.(type) {
	case string:
		return v
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
		return fmt.Sprintf("%v", value)
	}
}

var errInvalidConfig = errors.New("INTEGRATIONS_AUTH_PROVIDER_UNREACHABLE")

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
