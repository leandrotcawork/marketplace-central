package transport

import (
	"net/http"

	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct{}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/marketplaces/accounts", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": []any{}})
		case http.MethodPost:
			httpx.WriteJSON(w, http.StatusCreated, map[string]string{"status": "created"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/marketplaces/policies", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": []any{}})
		case http.MethodPost:
			httpx.WriteJSON(w, http.StatusCreated, map[string]string{"status": "created"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
}
