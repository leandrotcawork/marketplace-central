package transport

import (
	"encoding/json"
	"net/http"
	"strings"

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
		return http.StatusBadRequest, "invalid_request"
	}
	return http.StatusInternalServerError, "internal_error"
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/pricing/simulations", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			sims, err := h.svc.ListSimulations(r.Context())
			if err != nil {
				writePricingError(w, http.StatusInternalServerError, "internal_error", err.Error())
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": sims})

		case http.MethodPost:
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
				writePricingError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
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
				writePricingError(w, status, code, err.Error())
				return
			}
			httpx.WriteJSON(w, http.StatusCreated, sim)

		default:
			w.Header().Set("Allow", "GET, POST")
			writePricingError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		}
	})
}
