package transport

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type ProviderReader interface {
	ListProviderDefinitions(ctx context.Context) ([]domain.ProviderDefinition, error)
}

type InstallationReader interface {
	List(ctx context.Context) ([]domain.Installation, error)
	Get(ctx context.Context, installationID string) (domain.Installation, bool, error)
	CreateDraft(ctx context.Context, input application.CreateInstallationInput) (domain.Installation, error)
}

type Handler struct {
	providerReader     ProviderReader
	installationReader InstallationReader
}

func NewHandler(providerReader ProviderReader, installationReader InstallationReader) Handler {
	return Handler{
		providerReader:     providerReader,
		installationReader: installationReader,
	}
}

type apiError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details"`
}

type apiErrorResponse struct {
	Error apiError `json:"error"`
}

func writeIntegrationError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, apiErrorResponse{
		Error: apiError{
			Code:    code,
			Message: message,
			Details: map[string]any{},
		},
	})
}

func mapIntegrationError(err error) (int, string, string) {
	if err == nil {
		return http.StatusInternalServerError, "INTEGRATIONS_INTERNAL_ERROR", "internal error"
	}

	msg := err.Error()
	if strings.HasPrefix(msg, "INTEGRATIONS_") {
		return http.StatusBadRequest, msg, msg
	}

	return http.StatusInternalServerError, "INTEGRATIONS_INTERNAL_ERROR", "internal error"
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/integrations/providers", h.handleProviders)
	mux.HandleFunc("/integrations/installations", h.handleInstallations)
}

func (h Handler) handleProviders(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		slog.Info("integrations.providers", "action", "reject_method", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		writeIntegrationError(w, http.StatusMethodNotAllowed, "INTEGRATIONS_PROVIDER_METHOD_NOT_ALLOWED", "method not allowed")
		return
	}

	items, err := h.providerReader.ListProviderDefinitions(r.Context())
	if err != nil {
		status, code, message := mapIntegrationError(err)
		slog.Error("integrations.providers", "action", "list", "result", status, "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		writeIntegrationError(w, status, code, message)
		return
	}

	slog.Info("integrations.providers", "action", "list", "result", "200", "count", len(items), "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h Handler) handleInstallations(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	switch r.Method {
	case http.MethodGet:
		items, err := h.installationReader.List(r.Context())
		if err != nil {
			status, code, message := mapIntegrationError(err)
			slog.Error("integrations.installations", "action", "list", "result", status, "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
			writeIntegrationError(w, status, code, message)
			return
		}

		slog.Info("integrations.installations", "action", "list", "result", "200", "count", len(items), "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})

	case http.MethodPost:
		var req struct {
			InstallationID string `json:"installation_id"`
			ProviderCode   string `json:"provider_code"`
			Family         string `json:"family"`
			DisplayName    string `json:"display_name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			slog.Info("integrations.installations", "action", "decode", "result", "400", "duration_ms", time.Since(start).Milliseconds())
			writeIntegrationError(w, http.StatusBadRequest, "INTEGRATIONS_INSTALLATION_INVALID", "malformed request body")
			return
		}

		installation, err := h.installationReader.CreateDraft(r.Context(), application.CreateInstallationInput{
			InstallationID: req.InstallationID,
			ProviderCode:   req.ProviderCode,
			Family:         req.Family,
			DisplayName:    req.DisplayName,
		})
		if err != nil {
			status, code, message := mapIntegrationError(err)
			slog.Error("integrations.installations", "action", "create_draft", "result", status, "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
			writeIntegrationError(w, status, code, message)
			return
		}

		slog.Info("integrations.installations", "action", "create_draft", "result", "201", "installation_id", installation.InstallationID, "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusCreated, installation)

	default:
		w.Header().Set("Allow", "GET, POST")
		slog.Info("integrations.installations", "action", "reject_method", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		writeIntegrationError(w, http.StatusMethodNotAllowed, "INTEGRATIONS_INSTALLATION_METHOD_NOT_ALLOWED", "method not allowed")
	}
}
