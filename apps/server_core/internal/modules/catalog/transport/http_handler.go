package transport

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct {
	Service application.Service
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{
		"error": map[string]any{"code": code, "message": message, "details": map[string]any{}},
	})
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/catalog/products", h.handleProducts)
	mux.HandleFunc("GET /catalog/products/search", h.handleSearch)
	mux.HandleFunc("/catalog/taxonomy", h.handleTaxonomy)
	mux.HandleFunc("GET /catalog/products/{id}", h.handleGetProduct)
	mux.HandleFunc("GET /catalog/products/{id}/enrichment", h.handleGetEnrichment)
	mux.HandleFunc("PUT /catalog/products/{id}/enrichment", h.handleUpsertEnrichment)
}

func (h Handler) handleProducts(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		slog.Error("catalog.products", "action", "list", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusMethodNotAllowed, "CATALOG_METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	products, err := h.Service.ListProducts(r.Context())
	if err != nil {
		slog.Error("catalog.products", "action", "list", "result", "500", "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusInternalServerError, "CATALOG_INTERNAL_ERROR", "internal error")
		return
	}
	slog.Info("catalog.products", "action", "list", "result", "200", "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": products})
}

func (h Handler) handleSearch(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	q := r.URL.Query().Get("q")
	if strings.TrimSpace(q) == "" {
		slog.Error("catalog.search", "action", "search", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusBadRequest, "CATALOG_SEARCH_QUERY_REQUIRED", "query parameter q is required")
		return
	}
	products, err := h.Service.SearchProducts(r.Context(), q)
	if err != nil {
		slog.Error("catalog.search", "action", "search", "result", "500", "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusInternalServerError, "CATALOG_INTERNAL_ERROR", "internal error")
		return
	}
	slog.Info("catalog.search", "action", "search", "result", "200", "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": products})
}

func (h Handler) handleGetProduct(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	productID := r.PathValue("id")
	product, err := h.Service.GetProduct(r.Context(), productID)
	if err != nil {
		if strings.Contains(err.Error(), "NOT_FOUND") {
			slog.Error("catalog.product", "action", "get", "result", "404", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
			writeError(w, http.StatusNotFound, "CATALOG_PRODUCT_NOT_FOUND", "product not found")
			return
		}
		slog.Error("catalog.product", "action", "get", "result", "500", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusInternalServerError, "CATALOG_INTERNAL_ERROR", "internal error")
		return
	}
	slog.Info("catalog.product", "action", "get", "result", "200", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, product)
}

func (h Handler) handleTaxonomy(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		slog.Error("catalog.taxonomy", "action", "list", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusMethodNotAllowed, "CATALOG_METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	nodes, err := h.Service.ListTaxonomyNodes(r.Context())
	if err != nil {
		slog.Error("catalog.taxonomy", "action", "list", "result", "500", "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusInternalServerError, "CATALOG_INTERNAL_ERROR", "internal error")
		return
	}
	slog.Info("catalog.taxonomy", "action", "list", "result", "200", "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": nodes})
}

func (h Handler) handleGetEnrichment(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	productID := r.PathValue("id")
	enrichment, err := h.Service.GetEnrichment(r.Context(), productID)
	if err != nil {
		slog.Error("catalog.enrichment", "action", "get", "result", "500", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusInternalServerError, "CATALOG_INTERNAL_ERROR", "internal error")
		return
	}
	slog.Info("catalog.enrichment", "action", "get", "result", "200", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, enrichment)
}

func (h Handler) handleUpsertEnrichment(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	productID := r.PathValue("id")
	var req struct {
		HeightCM             *float64 `json:"height_cm"`
		WidthCM              *float64 `json:"width_cm"`
		LengthCM             *float64 `json:"length_cm"`
		WeightG              *float64 `json:"weight_g"`
		SuggestedPriceAmount *float64 `json:"suggested_price_amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		slog.Error("catalog.enrichment", "action", "upsert", "result", "400", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusBadRequest, "CATALOG_ENRICHMENT_INVALID", "malformed request body")
		return
	}
	enrichment := domain.ProductEnrichment{
		ProductID:            productID,
		HeightCM:             req.HeightCM,
		WidthCM:              req.WidthCM,
		LengthCM:             req.LengthCM,
		WeightG:              req.WeightG,
		SuggestedPriceAmount: req.SuggestedPriceAmount,
	}
	if err := h.Service.UpsertEnrichment(r.Context(), enrichment); err != nil {
		slog.Error("catalog.enrichment", "action", "upsert", "result", "500", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
		writeError(w, http.StatusInternalServerError, "CATALOG_INTERNAL_ERROR", "internal error")
		return
	}
	slog.Info("catalog.enrichment", "action", "upsert", "result", "200", "product_id", productID, "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, enrichment)
}
