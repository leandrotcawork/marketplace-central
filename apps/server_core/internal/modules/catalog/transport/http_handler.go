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
		switch r.Method {
		case http.MethodGet:
			products, err := h.Service.ListProducts(r.Context())
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
					"error": map[string]any{
						"code":    "internal_error",
						"message": err.Error(),
						"details": map[string]any{},
					},
				})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": products})

		default:
			w.Header().Set("Allow", "GET")
			httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]any{
				"error": map[string]any{
					"code":    "invalid_request",
					"message": "method not allowed",
					"details": map[string]any{},
				},
			})
		}
	})
}
