package transport

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/pricing/application"
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

func writePricingError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, apiErrorResponse{Error: apiError{Code: code, Message: message, Details: map[string]any{}}})
}

func mapPricingError(msg string) (int, string) {
	if strings.HasPrefix(msg, "PRICING_") {
		return http.StatusBadRequest, "PRICING_SIMULATION_INVALID"
	}
	return http.StatusInternalServerError, "PRICING_INTERNAL_ERROR"
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/pricing/simulations", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			start := time.Now()
			sims, err := h.svc.ListSimulations(r.Context())
			if err != nil {
				slog.Error("pricing.simulations", "action", "list", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
				writePricingError(w, http.StatusInternalServerError, "PRICING_INTERNAL_ERROR", "internal error")
				return
			}
			slog.Info("pricing.simulations", "action", "list", "result", "200", "count", len(sims), "duration_ms", time.Since(start).Milliseconds())
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": sims})

		case http.MethodPost:
			start := time.Now()
			var req struct {
				SimulationID      string  `json:"simulation_id"`
				ProductID         string  `json:"product_id"`
				AccountID         string  `json:"account_id"`
				BasePriceAmount   float64 `json:"base_price_amount"`
				CostAmount        float64 `json:"cost_amount"`
				CommissionPercent float64 `json:"commission_percent"`
				FixedFeeAmount    float64 `json:"fixed_fee_amount"`
				ShippingAmount    float64 `json:"shipping_amount"`
				MinMarginPercent  float64 `json:"min_margin_percent"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				slog.Info("pricing.simulations", "action", "create", "result", "400", "duration_ms", time.Since(start).Milliseconds())
				writePricingError(w, http.StatusBadRequest, "PRICING_REQUEST_INVALID", "malformed request body")
				return
			}
			sim, err := h.svc.RunSimulation(r.Context(), application.RunSimulationInput{
				SimulationID:      req.SimulationID,
				ProductID:         req.ProductID,
				AccountID:         req.AccountID,
				BasePriceAmount:   req.BasePriceAmount,
				CostAmount:        req.CostAmount,
				CommissionPercent: req.CommissionPercent,
				FixedFeeAmount:    req.FixedFeeAmount,
				ShippingAmount:    req.ShippingAmount,
				MinMarginPercent:  req.MinMarginPercent,
			})
			if err != nil {
				status, code := mapPricingError(err.Error())
				slog.Error("pricing.simulations", "action", "create", "result", strconv.Itoa(status), "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
				writePricingError(w, status, code, "internal error")
				return
			}
			slog.Info("pricing.simulations", "action", "create", "result", "201", "simulation_id", sim.SimulationID, "duration_ms", time.Since(start).Milliseconds())
			httpx.WriteJSON(w, http.StatusCreated, sim)

		default:
			start := time.Now()
			w.Header().Set("Allow", "GET, POST")
			slog.Info("pricing.simulations", "action", "reject_method", "result", "405", "duration_ms", time.Since(start).Milliseconds())
			writePricingError(w, http.StatusMethodNotAllowed, "PRICING_METHOD_NOT_ALLOWED", "method not allowed")
		}
	})
}
