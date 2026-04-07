package transport

import (
	"encoding/json"
	"net/http"
	"strings"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/application"
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

func writeMarketplacesError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, apiErrorResponse{Error: apiError{Code: code, Message: message, Details: map[string]any{}}})
}

func mapMarketplacesError(msg string) (int, string) {
	if strings.HasPrefix(msg, "MARKETPLACES_") {
		return http.StatusBadRequest, "invalid_request"
	}
	return http.StatusInternalServerError, "internal_error"
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/marketplaces/accounts", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			accounts, err := h.svc.ListAccounts(r.Context())
			if err != nil {
				writeMarketplacesError(w, http.StatusInternalServerError, "internal_error", err.Error())
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": accounts})

		case http.MethodPost:
			var req struct {
				AccountID      string `json:"account_id"`
				ChannelCode    string `json:"channel_code"`
				DisplayName    string `json:"display_name"`
				ConnectionMode string `json:"connection_mode"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeMarketplacesError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
				return
			}
			account, err := h.svc.CreateAccount(r.Context(), application.CreateAccountInput{
				AccountID:      req.AccountID,
				ChannelCode:    req.ChannelCode,
				DisplayName:    req.DisplayName,
				ConnectionMode: req.ConnectionMode,
			})
			if err != nil {
				status, code := mapMarketplacesError(err.Error())
				writeMarketplacesError(w, status, code, err.Error())
				return
			}
			httpx.WriteJSON(w, http.StatusCreated, account)

		default:
			w.Header().Set("Allow", "GET, POST")
			writeMarketplacesError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		}
	})

	mux.HandleFunc("/marketplaces/policies", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			policies, err := h.svc.ListPolicies(r.Context())
			if err != nil {
				writeMarketplacesError(w, http.StatusInternalServerError, "internal_error", err.Error())
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": policies})

		case http.MethodPost:
			var req struct {
				PolicyID           string  `json:"policy_id"`
				AccountID          string  `json:"account_id"`
				CommissionPercent  float64 `json:"commission_percent"`
				FixedFeeAmount     float64 `json:"fixed_fee_amount"`
				DefaultShipping    float64 `json:"default_shipping"`
				MinMarginPercent   float64 `json:"min_margin_percent"`
				SLAQuestionMinutes int     `json:"sla_question_minutes"`
				SLADispatchHours   int     `json:"sla_dispatch_hours"`
				ShippingProvider   string  `json:"shipping_provider"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeMarketplacesError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
				return
			}
			policy, err := h.svc.CreatePolicy(r.Context(), application.CreatePolicyInput{
				PolicyID:           req.PolicyID,
				AccountID:          req.AccountID,
				CommissionPercent:  req.CommissionPercent,
				FixedFeeAmount:     req.FixedFeeAmount,
				DefaultShipping:    req.DefaultShipping,
				MinMarginPercent:   req.MinMarginPercent,
				SLAQuestionMinutes: req.SLAQuestionMinutes,
				SLADispatchHours:   req.SLADispatchHours,
				ShippingProvider:   req.ShippingProvider,
			})
			if err != nil {
				status, code := mapMarketplacesError(err.Error())
				writeMarketplacesError(w, status, code, err.Error())
				return
			}
			httpx.WriteJSON(w, http.StatusCreated, policy)

		default:
			w.Header().Set("Allow", "GET, POST")
			writeMarketplacesError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		}
	})
}
