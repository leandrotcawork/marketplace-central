package transport

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type AuthFlowReader interface {
	StartAuthorize(ctx context.Context, input application.StartAuthorizeInput) (application.AuthorizeStart, error)
	HandleCallback(ctx context.Context, input application.HandleCallbackInput) (application.AuthStatus, error)
	SubmitAPIKey(ctx context.Context, input application.SubmitAPIKeyInput) (application.AuthStatus, error)
	RefreshCredential(ctx context.Context, input application.RefreshCredentialInput) (application.AuthStatus, error)
	Disconnect(ctx context.Context, input application.DisconnectInput) (application.AuthStatus, error)
	StartReauth(ctx context.Context, input application.StartReauthInput) (application.AuthorizeStart, error)
	GetAuthStatus(ctx context.Context, input application.GetAuthStatusInput) (application.AuthStatus, error)
}

type AuthHandler struct {
	flow AuthFlowReader
}

func NewAuthHandler(flow AuthFlowReader) AuthHandler {
	return AuthHandler{flow: flow}
}

func (h AuthHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/integrations/installations/", h.handleInstallationAuth)
	mux.HandleFunc("/integrations/auth/callback", h.handleCallback)
}

func (h AuthHandler) handleCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeIntegrationError(w, http.StatusMethodNotAllowed, "INTEGRATIONS_AUTH_METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	installationID := r.URL.Query().Get("installation_id")
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if installationID == "" || code == "" || state == "" {
		writeIntegrationError(w, http.StatusBadRequest, "INTEGRATIONS_AUTH_STATE_INVALID", "missing callback params")
		return
	}
	_, err := h.flow.HandleCallback(r.Context(), application.HandleCallbackInput{
		InstallationID: installationID,
		Code:           code,
		State:          state,
		RedirectURI:    "",
	})
	if err != nil {
		http.Redirect(w, r, "/connections/"+installationID+"?status=failed", http.StatusFound)
		return
	}
	http.Redirect(w, r, "/connections/"+installationID+"?status=connected", http.StatusFound)
}

func (h AuthHandler) handleInstallationAuth(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	path := strings.TrimPrefix(r.URL.Path, "/integrations/installations/")
	segments := strings.Split(path, "/")
	if len(segments) < 3 {
		http.NotFound(w, r)
		return
	}
	installationID := segments[0]
	suffix := strings.Join(segments[1:], "/")

	switch suffix {
	case "auth/start", "auth/authorize":
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			writeIntegrationError(w, http.StatusMethodNotAllowed, "INTEGRATIONS_AUTH_METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		var body struct {
			RedirectURI string   `json:"redirect_uri"`
			Scopes      []string `json:"scopes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		result, err := h.flow.StartAuthorize(r.Context(), application.StartAuthorizeInput{
			InstallationID: installationID,
			RedirectURI:    body.RedirectURI,
			Scopes:         body.Scopes,
		})
		if err != nil {
			status, code, message := mapIntegrationError(err)
			writeIntegrationError(w, status, code, message)
			return
		}
		slog.Info("integrations.auth.start", "action", "start_authorize", "result", "200", "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusOK, result)
	case "auth/api-key", "auth/credentials":
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			writeIntegrationError(w, http.StatusMethodNotAllowed, "INTEGRATIONS_AUTH_METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		var body struct {
			APIKey      string            `json:"api_key"`
			Credentials map[string]string `json:"credentials"`
			Metadata    map[string]string `json:"metadata"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeIntegrationError(w, http.StatusBadRequest, "INTEGRATIONS_APIKEY_MISSING_FIELDS", "malformed request body")
			return
		}
		apiKey := body.APIKey
		if apiKey == "" {
			apiKey = body.Credentials["api_key"]
		}
		meta := body.Metadata
		if len(meta) == 0 {
			meta = body.Credentials
		}
		result, err := h.flow.SubmitAPIKey(r.Context(), application.SubmitAPIKeyInput{
			InstallationID: installationID,
			APIKey:         apiKey,
			Metadata:       meta,
		})
		if err != nil {
			status, code, message := mapIntegrationError(err)
			writeIntegrationError(w, status, code, message)
			return
		}
		slog.Info("integrations.auth.credentials", "action", "submit_credentials", "result", "200", "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusOK, result)
	case "disconnect":
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			writeIntegrationError(w, http.StatusMethodNotAllowed, "INTEGRATIONS_AUTH_METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		result, err := h.flow.Disconnect(r.Context(), application.DisconnectInput{InstallationID: installationID})
		if err != nil {
			status, code, message := mapIntegrationError(err)
			writeIntegrationError(w, status, code, message)
			return
		}
		slog.Info("integrations.auth.disconnect", "action", "disconnect", "result", "200", "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusOK, result)
	case "reauth/authorize":
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			writeIntegrationError(w, http.StatusMethodNotAllowed, "INTEGRATIONS_AUTH_METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		var body struct {
			RedirectURI string   `json:"redirect_uri"`
			Scopes      []string `json:"scopes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		result, err := h.flow.StartReauth(r.Context(), application.StartReauthInput{
			InstallationID: installationID,
			RedirectURI:    body.RedirectURI,
			Scopes:         body.Scopes,
		})
		if err != nil {
			status, code, message := mapIntegrationError(err)
			writeIntegrationError(w, status, code, message)
			return
		}
		slog.Info("integrations.auth.reauth", "action", "start_reauth", "result", "200", "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusOK, result)
	case "auth/status":
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			writeIntegrationError(w, http.StatusMethodNotAllowed, "INTEGRATIONS_AUTH_METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		result, err := h.flow.GetAuthStatus(r.Context(), application.GetAuthStatusInput{
			InstallationID: installationID,
		})
		if err != nil {
			status, code, message := mapIntegrationError(err)
			writeIntegrationError(w, status, code, message)
			return
		}
		slog.Info("integrations.auth.status", "action", "get_status", "result", "200", "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusOK, result)
	default:
		http.NotFound(w, r)
	}
}
