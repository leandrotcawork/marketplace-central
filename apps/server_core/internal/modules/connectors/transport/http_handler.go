package transport

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"reflect"
	"strings"
	"time"

	app "marketplace-central/apps/server_core/internal/modules/connectors/application"
	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	connectorports "marketplace-central/apps/server_core/internal/modules/connectors/ports"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

// Handler exposes the VTEX publish pipeline over HTTP.
type Handler struct {
	orchestrator *app.BatchOrchestrator
	meAuth       connectorports.MEAuthPort // nil if ME_CLIENT_ID not set
}

// NewHandler constructs a Handler.
func NewHandler(orchestrator *app.BatchOrchestrator, meAuth connectorports.MEAuthPort) *Handler {
	meAuth = normalizeMEAuth(meAuth)
	return &Handler{orchestrator: orchestrator, meAuth: meAuth}
}

func normalizeMEAuth(meAuth connectorports.MEAuthPort) connectorports.MEAuthPort {
	if meAuth == nil {
		return nil
	}

	v := reflect.ValueOf(meAuth)
	switch v.Kind() {
	case reflect.Interface, reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan:
		if v.IsNil() {
			return nil
		}
	}

	return meAuth
}

// Register wires the handler's routes onto mux.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/connectors/vtex/publish", h.handlePublish)
	mux.HandleFunc("/connectors/vtex/publish/batch/", h.handleBatchRoutes)
	mux.HandleFunc("/connectors/vtex/validate-connection", h.handleValidateConnection)
	mux.HandleFunc("/connectors/melhor-envio/auth/start", h.handleMEAuthStart)
	mux.HandleFunc("/connectors/melhor-envio/auth/callback", h.handleMEAuthCallback)
	mux.HandleFunc("/connectors/melhor-envio/status", h.handleMEStatus)
}

// ---- request / response types ----

type publishRequest struct {
	VTEXAccount string           `json:"vtex_account"`
	Products    []productRequest `json:"products"`
}

type retryRequest struct {
	// Kept optional for backward compatibility. Retry now uses persisted batch account.
	VTEXAccount string           `json:"vtex_account,omitempty"`
	Products    []productRequest `json:"products"`
}

type productRequest struct {
	ProductID     string            `json:"product_id"`
	Name          string            `json:"name"`
	Description   string            `json:"description"`
	SKUName       string            `json:"sku_name"`
	EAN           string            `json:"ean"`
	Category      string            `json:"category"`
	Brand         string            `json:"brand"`
	Cost          float64           `json:"cost"`
	BasePrice     float64           `json:"base_price"`
	ImageURLs     []string          `json:"image_urls"`
	Specs         map[string]string `json:"specs"`
	StockQty      int               `json:"stock_qty"`
	WarehouseID   string            `json:"warehouse_id"`
	TradePolicyID string            `json:"trade_policy_id"`
}

// ---- helper ----

func writeConnectorsError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}

func toProductForPublish(p productRequest) app.ProductForPublish {
	return app.ProductForPublish{
		ProductID:     p.ProductID,
		Name:          p.Name,
		Description:   p.Description,
		SKUName:       p.SKUName,
		EAN:           p.EAN,
		Category:      p.Category,
		Brand:         p.Brand,
		Cost:          p.Cost,
		BasePrice:     p.BasePrice,
		ImageURLs:     p.ImageURLs,
		Specs:         p.Specs,
		StockQty:      p.StockQty,
		WarehouseID:   p.WarehouseID,
		TradePolicyID: p.TradePolicyID,
	}
}

// ---- POST /connectors/vtex/publish ----

func (h *Handler) handlePublish(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeConnectorsError(w, http.StatusMethodNotAllowed, "CONNECTORS_METHOD_NOT_ALLOWED", "method not allowed")
		slog.Info("connectors.publish", "action", "reject_method", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	var req publishRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeConnectorsError(w, http.StatusBadRequest, "CONNECTORS_PUBLISH_INVALID_BODY", "malformed request body")
		slog.Info("connectors.publish", "action", "decode_body", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	if req.VTEXAccount == "" {
		writeConnectorsError(w, http.StatusBadRequest, "CONNECTORS_PUBLISH_MISSING_ACCOUNT", "vtex_account is required")
		slog.Info("connectors.publish", "action", "validate_account", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}
	if len(req.Products) == 0 {
		writeConnectorsError(w, http.StatusBadRequest, "CONNECTORS_PUBLISH_MISSING_PRODUCTS", "products must not be empty")
		slog.Info("connectors.publish", "action", "validate_products", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	products := make([]app.ProductForPublish, len(req.Products))
	for i, p := range req.Products {
		products[i] = toProductForPublish(p)
	}

	result, err := h.orchestrator.CreateBatch(r.Context(), req.VTEXAccount, products)
	if err != nil {
		writeConnectorsError(w, http.StatusInternalServerError, "CONNECTORS_PUBLISH_INTERNAL", "internal server error")
		slog.Error("connectors.publish", "action", "create_batch", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}

	// Build the validated product list for async execution.
	if result.Validated > 0 {
		rejectedIDs := make(map[string]bool, len(result.Rejections))
		for _, rej := range result.Rejections {
			rejectedIDs[rej.ProductID] = true
		}
		validProducts := make([]app.ProductForPublish, 0, result.Validated)
		for _, p := range products {
			if !rejectedIDs[p.ProductID] {
				validProducts = append(validProducts, p)
			}
		}
		batchID := result.BatchID
		vtexAccount := req.VTEXAccount
		go func() {
			_ = h.orchestrator.ExecuteBatch(context.Background(), batchID, vtexAccount, validProducts)
		}()
	}

	// Build rejections slice for the response.
	rejections := make([]map[string]string, len(result.Rejections))
	for i, rej := range result.Rejections {
		rejections[i] = map[string]string{
			"product_id": rej.ProductID,
			"error_code": rej.ErrorCode,
		}
	}

	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"batch_id":       result.BatchID,
		"total_products": result.TotalProducts,
		"validated":      result.Validated,
		"rejected":       len(result.Rejections),
		"rejections":     rejections,
	})
	slog.Info("connectors.publish", "action", "create_batch", "result", "201", "batch_id", result.BatchID, "validated", result.Validated, "rejected", len(result.Rejections), "duration_ms", time.Since(start).Milliseconds())
}

// ---- batch routes dispatcher ----

func (h *Handler) handleBatchRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/connectors/vtex/publish/batch/")
	parts := strings.SplitN(path, "/", 2)
	batchID := parts[0]
	if len(parts) == 2 && parts[1] == "retry" {
		h.handleRetry(w, r, batchID)
	} else {
		h.handleBatchStatus(w, r, batchID)
	}
}

// ---- GET /connectors/vtex/publish/batch/{batch_id} ----

func (h *Handler) handleBatchStatus(w http.ResponseWriter, r *http.Request, batchID string) {
	start := time.Now()

	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeConnectorsError(w, http.StatusMethodNotAllowed, "CONNECTORS_METHOD_NOT_ALLOWED", "method not allowed")
		slog.Info("connectors.batch_status", "action", "reject_method", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	batch, ops, err := h.orchestrator.GetBatchStatus(r.Context(), batchID)
	if err != nil {
		if errors.Is(err, domain.ErrBatchNotFound) {
			writeConnectorsError(w, http.StatusNotFound, "CONNECTORS_BATCH_NOT_FOUND", "batch not found")
			slog.Info("connectors.batch_status", "action", "get_batch", "result", "404", "batch_id", batchID, "duration_ms", time.Since(start).Milliseconds())
			return
		}
		writeConnectorsError(w, http.StatusInternalServerError, "CONNECTORS_PUBLISH_INTERNAL", "internal server error")
		slog.Error("connectors.batch_status", "action", "get_batch", "result", "500", "batch_id", batchID, "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}

	inProgress := 0
	for _, op := range ops {
		if op.Status == "in_progress" || op.Status == "pending" {
			inProgress++
		}
	}

	operations := make([]map[string]any, len(ops))
	for i, op := range ops {
		operations[i] = map[string]any{
			"product_id":   op.ProductID,
			"status":       op.Status,
			"current_step": op.CurrentStep,
			"error_code":   op.ErrorCode,
		}
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"batch_id":     batch.BatchID,
		"vtex_account": batch.VTEXAccount,
		"status":       batch.Status,
		"total":        batch.TotalProducts,
		"succeeded":    batch.SucceededCount,
		"failed":       batch.FailedCount,
		"in_progress":  inProgress,
		"operations":   operations,
	})
	slog.Info("connectors.batch_status", "action", "get_batch", "result", "200", "batch_id", batchID, "duration_ms", time.Since(start).Milliseconds())
}

// ---- POST /connectors/vtex/publish/batch/{batch_id}/retry ----

func (h *Handler) handleRetry(w http.ResponseWriter, r *http.Request, batchID string) {
	start := time.Now()

	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeConnectorsError(w, http.StatusMethodNotAllowed, "CONNECTORS_METHOD_NOT_ALLOWED", "method not allowed")
		slog.Info("connectors.retry", "action", "reject_method", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	var req retryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeConnectorsError(w, http.StatusBadRequest, "CONNECTORS_PUBLISH_INVALID_BODY", "malformed request body")
		slog.Info("connectors.retry", "action", "decode_body", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	products := make([]app.ProductForPublish, len(req.Products))
	for i, p := range req.Products {
		products[i] = toProductForPublish(p)
	}

	result, err := h.orchestrator.RetryBatch(r.Context(), batchID, products)
	if err != nil {
		if errors.Is(err, domain.ErrBatchNotFound) {
			writeConnectorsError(w, http.StatusNotFound, "CONNECTORS_BATCH_NOT_FOUND", "batch not found")
			slog.Info("connectors.retry", "action", "retry_batch", "result", "404", "batch_id", batchID, "duration_ms", time.Since(start).Milliseconds())
			return
		}
		writeConnectorsError(w, http.StatusInternalServerError, "CONNECTORS_PUBLISH_INTERNAL", "internal server error")
		slog.Error("connectors.retry", "action", "retry_batch", "result", "500", "batch_id", batchID, "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}

	rejections := make([]map[string]string, len(result.Rejections))
	for i, rej := range result.Rejections {
		rejections[i] = map[string]string{
			"product_id": rej.ProductID,
			"error_code": rej.ErrorCode,
		}
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"batch_id":       result.BatchID,
		"total_products": result.TotalProducts,
		"validated":      result.Validated,
		"rejected":       len(result.Rejections),
		"rejections":     rejections,
	})
	slog.Info("connectors.retry", "action", "retry_batch", "result", "200", "batch_id", batchID, "validated", result.Validated, "duration_ms", time.Since(start).Milliseconds())
}

// ---- POST /connectors/vtex/validate-connection ----

type validateConnectionRequest struct {
	VTEXAccount string `json:"vtex_account"`
}

func (h *Handler) handleValidateConnection(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeConnectorsError(w, http.StatusMethodNotAllowed, "CONNECTORS_METHOD_NOT_ALLOWED", "method not allowed")
		slog.Info("connectors.validate_connection", "action", "reject_method", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	var req validateConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeConnectorsError(w, http.StatusBadRequest, "CONNECTORS_VALIDATE_INVALID_BODY", "malformed request body")
		slog.Info("connectors.validate_connection", "action", "decode_body", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	if req.VTEXAccount == "" {
		writeConnectorsError(w, http.StatusBadRequest, "CONNECTORS_VALIDATE_MISSING_ACCOUNT", "vtex_account is required")
		slog.Info("connectors.validate_connection", "action", "validate_account", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	if err := h.orchestrator.ValidateConnection(r.Context(), req.VTEXAccount); err != nil {
		if errors.Is(err, domain.ErrVTEXAuth) {
			writeConnectorsError(w, http.StatusUnauthorized, "CONNECTORS_VTEX_AUTH_INVALID", "VTEX credentials are invalid or expired")
			slog.Info("connectors.validate_connection", "action", "validate", "result", "401", "vtex_account", req.VTEXAccount, "duration_ms", time.Since(start).Milliseconds())
			return
		}
		writeConnectorsError(w, http.StatusBadGateway, "CONNECTORS_VTEX_TRANSIENT", "VTEX API is unreachable")
		slog.Error("connectors.validate_connection", "action", "validate", "result", "502", "vtex_account", req.VTEXAccount, "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"status":       "connected",
		"vtex_account": req.VTEXAccount,
	})
	slog.Info("connectors.validate_connection", "action", "validate", "result", "200", "vtex_account", req.VTEXAccount, "duration_ms", time.Since(start).Milliseconds())
}

// ---- Melhor Envio OAuth ----

func (h *Handler) handleMEAuthStart(w http.ResponseWriter, r *http.Request) {
	if h.meAuth == nil {
		writeConnectorsError(w, http.StatusServiceUnavailable, "CONNECTORS_ME_NOT_CONFIGURED", "Melhor Envio is not configured (ME_CLIENT_ID missing)")
		return
	}
	h.meAuth.HandleStart(w, r)
}

func (h *Handler) handleMEAuthCallback(w http.ResponseWriter, r *http.Request) {
	if h.meAuth == nil {
		writeConnectorsError(w, http.StatusServiceUnavailable, "CONNECTORS_ME_NOT_CONFIGURED", "Melhor Envio is not configured")
		return
	}
	h.meAuth.HandleCallback(w, r)
}

func (h *Handler) handleMEStatus(w http.ResponseWriter, r *http.Request) {
	if h.meAuth == nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]bool{"connected": false})
		return
	}
	h.meAuth.HandleStatus(w, r)
}
