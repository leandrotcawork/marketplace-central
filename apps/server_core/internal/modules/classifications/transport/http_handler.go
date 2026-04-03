package transport

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/classifications/application"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct {
	svc application.Service
}

func NewHandler(svc application.Service) Handler {
	return Handler{svc: svc}
}

type apiError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details"`
}

type apiErrorResponse struct {
	Error apiError `json:"error"`
}

func writeClassificationsError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, apiErrorResponse{Error: apiError{Code: code, Message: message, Details: map[string]any{}}})
}

func mapClassificationsError(msg string) (int, string, string) {
	switch {
	case strings.Contains(msg, "NOT_FOUND"):
		return http.StatusNotFound, "CLASSIFICATIONS_ENTITY_NOT_FOUND", "classification not found"
	case strings.HasPrefix(msg, "CLASSIFICATIONS_"):
		return http.StatusBadRequest, "CLASSIFICATIONS_CREATE_INVALID", "invalid request"
	default:
		return http.StatusInternalServerError, "CLASSIFICATIONS_INTERNAL_ERROR", "internal error"
	}
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/classifications", h.handleCollection)
	mux.HandleFunc("GET /classifications/{id}", h.handleGet)
	mux.HandleFunc("PUT /classifications/{id}", h.handleUpdate)
	mux.HandleFunc("DELETE /classifications/{id}", h.handleDelete)
}

func (h Handler) handleCollection(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	switch r.Method {
	case http.MethodGet:
		items, err := h.svc.List(r.Context())
		if err != nil {
			slog.Error("classifications.list", "action", "list", "result", "500", "duration_ms", time.Since(start).Milliseconds())
			writeClassificationsError(w, http.StatusInternalServerError, "CLASSIFICATIONS_INTERNAL_ERROR", "internal error")
			return
		}
		slog.Info("classifications.list", "action", "list", "result", "200", "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})

	case http.MethodPost:
		var req struct {
			Name       string   `json:"name"`
			AIContext  string   `json:"ai_context"`
			ProductIDs []string `json:"product_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			slog.Error("classifications.create", "action", "create", "result", "400", "duration_ms", time.Since(start).Milliseconds())
			writeClassificationsError(w, http.StatusBadRequest, "CLASSIFICATIONS_CREATE_INVALID", "malformed request body")
			return
		}
		c, err := h.svc.Create(r.Context(), application.CreateInput{
			Name:       req.Name,
			AIContext:  req.AIContext,
			ProductIDs: req.ProductIDs,
		})
		if err != nil {
			status, code, message := mapClassificationsError(err.Error())
			slog.Error("classifications.create", "action", "create", "result", fmt.Sprintf("%d", status), "duration_ms", time.Since(start).Milliseconds())
			writeClassificationsError(w, status, code, message)
			return
		}
		slog.Info("classifications.create", "action", "create", "result", "201", "duration_ms", time.Since(start).Milliseconds())
		httpx.WriteJSON(w, http.StatusCreated, c)

	default:
		w.Header().Set("Allow", "GET, POST")
		slog.Error("classifications.collection", "action", "unknown", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		writeClassificationsError(w, http.StatusMethodNotAllowed, "CLASSIFICATIONS_METHOD_NOT_ALLOWED", "method not allowed")
	}
}

func (h Handler) handleGet(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	id := r.PathValue("id")
	c, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		status, code, message := mapClassificationsError(err.Error())
		slog.Error("classifications.get", "action", "get", "result", fmt.Sprintf("%d", status), "id", id, "duration_ms", time.Since(start).Milliseconds())
		writeClassificationsError(w, status, code, message)
		return
	}
	slog.Info("classifications.get", "action", "get", "result", "200", "id", id, "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, c)
}

func (h Handler) handleUpdate(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	id := r.PathValue("id")
	var req struct {
		Name       string   `json:"name"`
		AIContext  string   `json:"ai_context"`
		ProductIDs []string `json:"product_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		slog.Error("classifications.update", "action", "update", "result", "400", "id", id, "duration_ms", time.Since(start).Milliseconds())
		writeClassificationsError(w, http.StatusBadRequest, "CLASSIFICATIONS_CREATE_INVALID", "malformed request body")
		return
	}
	c, err := h.svc.Update(r.Context(), id, application.UpdateInput{
		Name:       req.Name,
		AIContext:  req.AIContext,
		ProductIDs: req.ProductIDs,
	})
	if err != nil {
		status, code, message := mapClassificationsError(err.Error())
		slog.Error("classifications.update", "action", "update", "result", fmt.Sprintf("%d", status), "id", id, "duration_ms", time.Since(start).Milliseconds())
		writeClassificationsError(w, status, code, message)
		return
	}
	slog.Info("classifications.update", "action", "update", "result", "200", "id", id, "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, c)
}

func (h Handler) handleDelete(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	id := r.PathValue("id")
	if err := h.svc.Delete(r.Context(), id); err != nil {
		status, code, message := mapClassificationsError(err.Error())
		slog.Error("classifications.delete", "action", "delete", "result", fmt.Sprintf("%d", status), "id", id, "duration_ms", time.Since(start).Milliseconds())
		writeClassificationsError(w, status, code, message)
		return
	}
	slog.Info("classifications.delete", "action", "delete", "result", "204", "id", id, "duration_ms", time.Since(start).Milliseconds())
	w.WriteHeader(http.StatusNoContent)
}
