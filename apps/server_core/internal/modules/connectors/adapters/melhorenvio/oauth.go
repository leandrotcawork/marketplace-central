package melhorenvio

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/platform/httpx"
)

const (
	meAuthURL               = "https://melhorenvio.com.br/oauth/authorize"
	meTokenURL              = "https://melhorenvio.com.br/oauth/token"
	meOAuthStateCookieName  = "me_oauth_state"
	meOAuthSettingsRedirect = "http://localhost:5173/marketplace-settings?me_connected=1"
)

const defaultOAuthTimeout = 10 * time.Second

type oauthTokenStore interface {
	GetToken(ctx context.Context) (string, error)
	SaveToken(ctx context.Context, accessToken, refreshToken string) error
}

// OAuthHandler handles ME OAuth2 start, callback, and status routes.
type OAuthHandler struct {
	store        oauthTokenStore
	clientID     string
	clientSecret string
	redirectURI  string
	httpClient   *http.Client
}

// NewOAuthHandlerFromEnv reads ME_CLIENT_ID, ME_CLIENT_SECRET, ME_REDIRECT_URI from env.
// Returns nil if ME_CLIENT_ID is not set (ME integration disabled).
func NewOAuthHandlerFromEnv(store oauthTokenStore) *OAuthHandler {
	clientID := os.Getenv("ME_CLIENT_ID")
	if clientID == "" {
		return nil
	}
	redirectURI := os.Getenv("ME_REDIRECT_URI")
	if redirectURI == "" {
		redirectURI = "http://localhost:8080/connectors/melhor-envio/auth/callback"
	}
	return &OAuthHandler{
		store:        store,
		clientID:     clientID,
		clientSecret: os.Getenv("ME_CLIENT_SECRET"),
		redirectURI:  redirectURI,
		httpClient:   &http.Client{Timeout: defaultOAuthTimeout},
	}
}

// Register wires the handler routes onto mux.
func (h *OAuthHandler) Register(mux *http.ServeMux) {
	if h == nil {
		return
	}
	mux.HandleFunc("/connectors/melhor-envio/auth/start", h.HandleStart)
	mux.HandleFunc("/connectors/melhor-envio/auth/callback", h.HandleCallback)
	mux.HandleFunc("/connectors/melhor-envio/auth/status", h.HandleStatus)
}

// HandleStart redirects the user to ME's OAuth authorization page.
func (h *OAuthHandler) HandleStart(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeOAuthError(w, http.StatusMethodNotAllowed, "CONNECTORS_ME_METHOD_NOT_ALLOWED", "method not allowed")
		slog.Info("connectors.me_auth", "action", "start", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	state, err := newOAuthState()
	if err != nil {
		writeOAuthError(w, http.StatusInternalServerError, "CONNECTORS_ME_STATE_GENERATION_FAILED", "failed to create oauth state")
		slog.Error("connectors.me_auth", "action", "start", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     meOAuthStateCookieName,
		Value:    state,
		Path:     "/connectors/melhor-envio/auth",
		MaxAge:   600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	u, _ := url.Parse(meAuthURL)
	q := u.Query()
	q.Set("client_id", h.clientID)
	q.Set("redirect_uri", h.redirectURI)
	q.Set("response_type", "code")
	q.Set("scope", "shipping-calculate")
	q.Set("state", state)
	u.RawQuery = q.Encode()

	slog.Info("connectors.me_auth", "action", "start", "result", "302", "duration_ms", time.Since(start).Milliseconds())
	http.Redirect(w, r, u.String(), http.StatusFound)
}

// HandleCallback exchanges the authorization code for tokens and saves them.
func (h *OAuthHandler) HandleCallback(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeOAuthError(w, http.StatusMethodNotAllowed, "CONNECTORS_ME_METHOD_NOT_ALLOWED", "method not allowed")
		slog.Info("connectors.me_auth", "action", "callback", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	stateQuery := r.URL.Query().Get("state")
	if stateQuery == "" {
		writeOAuthError(w, http.StatusBadRequest, "CONNECTORS_ME_STATE_MISSING", "missing oauth state")
		slog.Info("connectors.me_auth", "action", "callback", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	stateCookie, err := r.Cookie(meOAuthStateCookieName)
	if err != nil || stateCookie.Value == "" {
		writeOAuthError(w, http.StatusBadRequest, "CONNECTORS_ME_STATE_MISSING", "missing oauth state")
		slog.Info("connectors.me_auth", "action", "callback", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	defer http.SetCookie(w, &http.Cookie{
		Name:     meOAuthStateCookieName,
		Value:    "",
		Path:     "/connectors/melhor-envio/auth",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	if subtle.ConstantTimeCompare([]byte(stateCookie.Value), []byte(stateQuery)) != 1 {
		writeOAuthError(w, http.StatusBadRequest, "CONNECTORS_ME_STATE_MISMATCH", "oauth state mismatch")
		slog.Info("connectors.me_auth", "action", "callback", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		writeOAuthError(w, http.StatusBadRequest, "CONNECTORS_ME_CODE_MISSING", "missing authorization code")
		slog.Info("connectors.me_auth", "action", "callback", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	body := url.Values{}
	body.Set("grant_type", "authorization_code")
	body.Set("client_id", h.clientID)
	body.Set("client_secret", h.clientSecret)
	body.Set("redirect_uri", h.redirectURI)
	body.Set("code", code)

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, meTokenURL, strings.NewReader(body.Encode()))
	if err != nil {
		writeOAuthError(w, http.StatusInternalServerError, "CONNECTORS_ME_TOKEN_EXCHANGE_FAILED", "failed to prepare token exchange")
		slog.Error("connectors.me_auth", "action", "callback", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	client := h.httpClient
	if client == nil {
		client = &http.Client{Timeout: defaultOAuthTimeout}
	}

	resp, err := client.Do(req)
	if err != nil {
		writeOAuthError(w, http.StatusBadGateway, "CONNECTORS_ME_TOKEN_EXCHANGE_FAILED", "failed to exchange token")
		slog.Error("connectors.me_auth", "action", "callback", "result", "502", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}
	defer resp.Body.Close()

	var data struct {
		AccessToken      string `json:"access_token"`
		RefreshToken     string `json:"refresh_token"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || data.AccessToken == "" {
		errMsg := data.Error
		if errMsg == "" {
			errMsg = data.ErrorDescription
		}
		if errMsg == "" {
			errMsg = fmt.Sprintf("ME returned status %d", resp.StatusCode)
		}
		writeOAuthError(w, http.StatusBadGateway, "CONNECTORS_ME_TOKEN_EXCHANGE_FAILED", "failed to exchange token")
		slog.Error("connectors.me_auth", "action", "callback", "result", "502", "me_error", errMsg, "duration_ms", time.Since(start).Milliseconds())
		return
	}

	if err := h.store.SaveToken(r.Context(), data.AccessToken, data.RefreshToken); err != nil {
		writeOAuthError(w, http.StatusInternalServerError, "CONNECTORS_ME_TOKEN_SAVE_FAILED", "failed to save token")
		slog.Error("connectors.me_auth", "action", "save_token", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}

	slog.Info("connectors.me_auth", "action", "callback", "result", "302", "duration_ms", time.Since(start).Milliseconds())
	http.Redirect(w, r, meOAuthSettingsRedirect, http.StatusFound)
}

// HandleStatus returns {"connected": true/false}.
func (h *OAuthHandler) HandleStatus(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeOAuthError(w, http.StatusMethodNotAllowed, "CONNECTORS_ME_METHOD_NOT_ALLOWED", "method not allowed")
		slog.Info("connectors.me_auth", "action", "status", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	token, err := h.store.GetToken(r.Context())
	if err != nil {
		writeOAuthError(w, http.StatusInternalServerError, "CONNECTORS_ME_STATUS_STORE_FAILED", "failed to load token state")
		slog.Error("connectors.me_auth", "action", "status", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}

	connected := strings.TrimSpace(token) != ""
	slog.Info("connectors.me_auth", "action", "status", "result", "200", "connected", connected, "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"connected": connected})
}

func writeOAuthError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
			"details": map[string]any{},
		},
	})
}

func newOAuthState() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
