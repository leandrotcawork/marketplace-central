package transport

import (
	"net/http"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct {
	Service application.Service
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/catalog/products", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": []any{}})
			return
		}
		if r.Method == http.MethodPost {
			httpx.WriteJSON(w, http.StatusCreated, map[string]string{"status": "created"})
			return
		}
		w.WriteHeader(http.StatusMethodNotAllowed)
	})
}
