package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

type marketplaceRepoStub struct {
	account domain.Account
	policy  domain.Policy
}

func (s *marketplaceRepoStub) SaveAccount(_ context.Context, account domain.Account) error {
	s.account = account
	return nil
}

func (s *marketplaceRepoStub) SavePolicy(_ context.Context, policy domain.Policy) error {
	s.policy = policy
	return nil
}

func (s *marketplaceRepoStub) ListAccounts(context.Context) ([]domain.Account, error) {
	return nil, nil
}

func (s *marketplaceRepoStub) ListPolicies(context.Context) ([]domain.Policy, error) {
	return nil, nil
}

func TestCreateMarketplacePolicyPersistsCommissionAndSla(t *testing.T) {
	repo := &marketplaceRepoStub{}
	service := application.NewService(repo, "tenant_default")

	account, err := service.CreateAccount(context.Background(), application.CreateAccountInput{
		AccountID:      "mercado-livre-main",
		ChannelCode:    "mercado_livre",
		DisplayName:    "Mercado Livre Principal",
		ConnectionMode: "manual",
	})
	if err != nil {
		t.Fatalf("unexpected account error: %v", err)
	}

	policy, err := service.CreatePolicy(context.Background(), application.CreatePolicyInput{
		PolicyID:           "policy-ml-main",
		AccountID:          account.AccountID,
		CommissionPercent:  16,
		FixedFeeAmount:     0,
		DefaultShipping:    27.9,
		MinMarginPercent:   12,
		SLAQuestionMinutes: 60,
		SLADispatchHours:   24,
	})
	if err != nil {
		t.Fatalf("unexpected policy error: %v", err)
	}

	if policy.CommissionPercent != 16 {
		t.Fatalf("expected 16, got %v", policy.CommissionPercent)
	}
}
