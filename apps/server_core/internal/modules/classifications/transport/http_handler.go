package transport

import (
	"encoding/json"
	"net/http"
	"strings"

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
	switch r.Method {
	case http.MethodGet:
		items, err := h.svc.List(r.Context())
		if err != nil {
			writeClassificationsError(w, http.StatusInternalServerError, "CLASSIFICATIONS_INTERNAL_ERROR", "internal error")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})

	case http.MethodPost:
		var req struct {
			Name       string   `json:"name"`
			AIContext  string   `json:"ai_context"`
			ProductIDs []string `json:"product_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
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
			writeClassificationsError(w, status, code, message)
			return
		}
		httpx.WriteJSON(w, http.StatusCreated, c)

	default:
		w.Header().Set("Allow", "GET, POST")
		writeClassificationsError(w, http.StatusMethodNotAllowed, "CLASSIFICATIONS_METHOD_NOT_ALLOWED", "method not allowed")
	}
}

func (h Handler) handleGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		status, code, message := mapClassificationsError(err.Error())
		writeClassificationsError(w, status, code, message)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, c)
}

func (h Handler) handleUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Name       string   `json:"name"`
		AIContext  string   `json:"ai_context"`
		ProductIDs []string `json:"product_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
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
		writeClassificationsError(w, status, code, message)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, c)
}

func (h Handler) handleDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.svc.Delete(r.Context(), id); err != nil {
		status, code, message := mapClassificationsError(err.Error())
		writeClassificationsError(w, status, code, message)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true})
}
