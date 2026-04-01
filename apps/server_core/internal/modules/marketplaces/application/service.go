package application

import (
	"context"
	"errors"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

type CreateAccountInput struct {
	AccountID      string
	ChannelCode    string
	DisplayName    string
	ConnectionMode string
}

type CreatePolicyInput struct {
	PolicyID           string
	AccountID          string
	CommissionPercent  float64
	FixedFeeAmount     float64
	DefaultShipping    float64
	MinMarginPercent   float64
	SLAQuestionMinutes int
	SLADispatchHours   int
}

type Service struct {
	repo     ports.Repository
	tenantID string
}

func NewService(repo ports.Repository, tenantID string) Service {
	return Service{repo: repo, tenantID: tenantID}
}

func (s Service) CreateAccount(ctx context.Context, input CreateAccountInput) (domain.Account, error) {
	if input.AccountID == "" || input.ChannelCode == "" || input.DisplayName == "" || input.ConnectionMode == "" {
		return domain.Account{}, errors.New("MARKETPLACES_ACCOUNT_INVALID")
	}
	account := domain.Account{
		AccountID:      input.AccountID,
		TenantID:       s.tenantID,
		ChannelCode:    input.ChannelCode,
		DisplayName:    input.DisplayName,
		Status:         "active",
		ConnectionMode: input.ConnectionMode,
	}
	return account, s.repo.SaveAccount(ctx, account)
}

func (s Service) CreatePolicy(ctx context.Context, input CreatePolicyInput) (domain.Policy, error) {
	if input.PolicyID == "" || input.AccountID == "" {
		return domain.Policy{}, errors.New("MARKETPLACES_POLICY_INVALID")
	}
	if input.CommissionPercent < 0 || input.FixedFeeAmount < 0 || input.DefaultShipping < 0 || input.MinMarginPercent < 0 {
		return domain.Policy{}, errors.New("MARKETPLACES_POLICY_INVALID")
	}
	if input.SLAQuestionMinutes <= 0 || input.SLADispatchHours <= 0 {
		return domain.Policy{}, errors.New("MARKETPLACES_POLICY_INVALID")
	}
	policy := domain.Policy{
		PolicyID:           input.PolicyID,
		TenantID:           s.tenantID,
		AccountID:          input.AccountID,
		CommissionPercent:  input.CommissionPercent,
		FixedFeeAmount:     input.FixedFeeAmount,
		DefaultShipping:    input.DefaultShipping,
		TaxPercent:         0,
		MinMarginPercent:   input.MinMarginPercent,
		SLAQuestionMinutes: input.SLAQuestionMinutes,
		SLADispatchHours:   input.SLADispatchHours,
	}
	return policy, s.repo.SavePolicy(ctx, policy)
}

func (s Service) ListAccounts(ctx context.Context) ([]domain.Account, error) {
	return s.repo.ListAccounts(ctx)
}

func (s Service) ListPolicies(ctx context.Context) ([]domain.Policy, error) {
	return s.repo.ListPolicies(ctx)
}
