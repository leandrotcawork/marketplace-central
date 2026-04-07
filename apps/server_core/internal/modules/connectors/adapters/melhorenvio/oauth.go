package melhorenvio

import (
	"context"
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
	meAuthURL  = "https://melhorenvio.com.br/oauth/authorize"
	meTokenURL = "https://melhorenvio.com.br/oauth/token"
)

// OAuthHandler handles ME OAuth2 start, callback, and status routes.
type OAuthHandler struct {
	store        *TokenStore
	clientID     string
	clientSecret string
	redirectURI  string
}

// NewOAuthHandlerFromEnv reads ME_CLIENT_ID, ME_CLIENT_SECRET, ME_REDIRECT_URI from env.
// Returns nil if ME_CLIENT_ID is not set (ME integration disabled).
func NewOAuthHandlerFromEnv(store *TokenStore) *OAuthHandler {
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
	}
}

// HandleStart redirects the user to ME's OAuth authorization page.
func (h *OAuthHandler) HandleStart(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	u, _ := url.Parse(meAuthURL)
	q := u.Query()
	q.Set("client_id", h.clientID)
	q.Set("redirect_uri", h.redirectURI)
	q.Set("response_type", "code")
	q.Set("scope", "shipping-calculate")
	u.RawQuery = q.Encode()
	slog.Info("connectors.me_auth", "action", "start", "result", "302", "duration_ms", time.Since(start).Milliseconds())
	http.Redirect(w, r, u.String(), http.StatusFound)
}

// HandleCallback exchanges the authorization code for tokens and saves them.
func (h *OAuthHandler) HandleCallback(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	code := r.URL.Query().Get("code")
	if code == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "missing code"})
		return
	}

	body := url.Values{}
	body.Set("grant_type", "authorization_code")
	body.Set("client_id", h.clientID)
	body.Set("client_secret", h.clientSecret)
	body.Set("redirect_uri", h.redirectURI)
	body.Set("code", code)

	resp, err := http.PostForm(meTokenURL, body)
	if err != nil {
		slog.Error("connectors.me_auth", "action", "callback", "result", "502", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]string{"error": "failed to reach ME"})
		return
	}
	defer resp.Body.Close()

	var data struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		Error        string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || data.AccessToken == "" {
		errMsg := data.Error
		if errMsg == "" {
			errMsg = fmt.Sprintf("ME returned status %d", resp.StatusCode)
		}
		slog.Error("connectors.me_auth", "action", "callback", "result", "400", "me_error", errMsg, "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	if err := h.store.SaveToken(context.Background(), data.AccessToken, data.RefreshToken); err != nil {
		slog.Error("connectors.me_auth", "action", "save_token", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save token"})
		return
	}

	slog.Info("connectors.me_auth", "action", "callback", "result", "200", "duration_ms", time.Since(start).Milliseconds())
	// Redirect back to the app settings page.
	http.Redirect(w, r, "http://localhost:5173/marketplace-settings?me_connected=1", http.StatusFound)
}

// HandleStatus returns {"connected": true/false}.
func (h *OAuthHandler) HandleStatus(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	token, err := h.store.GetToken(r.Context())
	connected := err == nil && strings.TrimSpace(token) != ""
	slog.Info("connectors.me_auth", "action", "status", "result", "200", "connected", connected, "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"connected": connected})
}
