package transport

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

// FeeSeedTrigger is the transport-layer interface for triggering fee sync/seed.
// Satisfied by connectors/application.FeeSyncService — defined here to avoid import cycles.
type FeeSeedTrigger interface {
	SeedMarketplace(ctx context.Context, marketplaceCode string, force bool) (int, error)
}

type Handler struct {
	svc        application.Service
	feeSvc     *application.FeeScheduleService
	feeSyncSvc FeeSeedTrigger
}

func NewHandler(svc application.Service, feeSvc *application.FeeScheduleService, feeSyncSvc FeeSeedTrigger) Handler {
	return Handler{svc: svc, feeSvc: feeSvc, feeSyncSvc: feeSyncSvc}
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
				AccountID       string            `json:"account_id"`
				MarketplaceCode string            `json:"marketplace_code"`
				ChannelCode     string            `json:"channel_code"`
				DisplayName     string            `json:"display_name"`
				ConnectionMode  string            `json:"connection_mode"`
				CredentialsJSON map[string]string `json:"credentials_json"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeMarketplacesError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
				return
			}
			account, err := h.svc.CreateAccount(r.Context(), application.CreateAccountInput{
				AccountID:       req.AccountID,
				MarketplaceCode: req.MarketplaceCode,
				ChannelCode:     req.ChannelCode,
				DisplayName:     req.DisplayName,
				ConnectionMode:  req.ConnectionMode,
				CredentialsJSON: req.CredentialsJSON,
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
				PolicyID           string   `json:"policy_id"`
				AccountID          string   `json:"account_id"`
				CommissionPercent  float64  `json:"commission_percent"`
				CommissionOverride *float64 `json:"commission_override"`
				FixedFeeAmount     float64  `json:"fixed_fee_amount"`
				DefaultShipping    float64  `json:"default_shipping"`
				MinMarginPercent   float64  `json:"min_margin_percent"`
				SLAQuestionMinutes int      `json:"sla_question_minutes"`
				SLADispatchHours   int      `json:"sla_dispatch_hours"`
				ShippingProvider   string   `json:"shipping_provider"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeMarketplacesError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
				return
			}
			policy, err := h.svc.CreatePolicy(r.Context(), application.CreatePolicyInput{
				PolicyID:           req.PolicyID,
				AccountID:          req.AccountID,
				CommissionPercent:  req.CommissionPercent,
				CommissionOverride: req.CommissionOverride,
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

	mux.HandleFunc("/marketplaces/definitions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			writeMarketplacesError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
			return
		}
		start := time.Now()
		defs, err := h.feeSvc.ListDefinitions(r.Context())
		if err != nil {
			slog.Error("list definitions failed", "action", "list_definitions", "result", "error", "duration_ms", time.Since(start).Milliseconds(), "err", err)
			writeMarketplacesError(w, http.StatusInternalServerError, "MARKETPLACES_DEFINITIONS_FETCH_FAILED", err.Error())
			return
		}
		slog.Info("list definitions", "action", "list_definitions", "result", "ok", "duration_ms", time.Since(start).Milliseconds(), "count", len(defs))

		type defItem struct {
			Code              string                   `json:"code"`
			DisplayName       string                   `json:"display_name"`
			AuthStrategy      string                   `json:"auth_strategy"`
			IsActive          bool                     `json:"is_active"`
			CapabilityProfile domain.CapabilityProfile `json:"capability_profile"`
			Metadata          domain.PluginMetadata    `json:"metadata"`
		}
		out := make([]defItem, 0, len(defs))
		for _, d := range defs {
			out = append(out, defItem{
				Code:              d.MarketplaceCode,
				DisplayName:       d.DisplayName,
				AuthStrategy:      d.AuthStrategy,
				IsActive:          d.Active,
				CapabilityProfile: d.CapabilityProfile,
				Metadata:          d.Metadata,
			})
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
	})

	mux.HandleFunc("/marketplaces/fee-schedules", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			writeMarketplacesError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
			return
		}
		code := r.URL.Query().Get("marketplace_code")
		if code == "" {
			writeMarketplacesError(w, http.StatusBadRequest, "MARKETPLACES_FEESCHEDULE_PARAM_MISSING", "marketplace_code query param required")
			return
		}
		schedules, err := h.feeSvc.ListFeeSchedules(r.Context(), code)
		if err != nil {
			writeMarketplacesError(w, http.StatusInternalServerError, "internal_error", err.Error())
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": schedules})
	})

	mux.HandleFunc("/admin/fee-schedules/seed", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			writeMarketplacesError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
			return
		}
		code := r.URL.Query().Get("marketplace_code")
		if code == "" {
			writeMarketplacesError(w, http.StatusBadRequest, "MARKETPLACES_FEESCHEDULE_PARAM_MISSING", "marketplace_code query param required")
			return
		}
		n, err := h.feeSyncSvc.SeedMarketplace(r.Context(), code, true)
		if err != nil {
			writeMarketplacesError(w, http.StatusBadRequest, "MARKETPLACES_FEESEED_UNKNOWN", err.Error())
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"seeded": n, "marketplace_code": code})
	})

	mux.HandleFunc("/admin/fee-schedules/sync", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			writeMarketplacesError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
			return
		}
		code := r.URL.Query().Get("marketplace_code")
		if code == "" {
			writeMarketplacesError(w, http.StatusBadRequest, "MARKETPLACES_FEESCHEDULE_PARAM_MISSING", "marketplace_code query param required")
			return
		}
		n, err := h.feeSyncSvc.SeedMarketplace(r.Context(), code, true)
		if err != nil {
			writeMarketplacesError(w, http.StatusBadRequest, "MARKETPLACES_FEESYNC_UNKNOWN", err.Error())
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"synced": n, "marketplace_code": code})
	})
}
