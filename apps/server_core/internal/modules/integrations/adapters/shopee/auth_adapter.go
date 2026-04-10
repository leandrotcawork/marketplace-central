package shopee

import (
	"context"
	"strings"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type Config struct{}

type Adapter struct{}

func NewAdapter(Config) *Adapter {
	return &Adapter{}
}

func (a *Adapter) ProviderCode() string { return "shopee" }

func (a *Adapter) AuthStrategy() domain.AuthStrategy { return domain.AuthStrategyAPIKey }

func (a *Adapter) StartAuthorize(context.Context, application.StartAuthorizeAdapterInput) (application.AuthorizeStart, error) {
	return application.AuthorizeStart{}, domain.ErrNotSupported
}

func (a *Adapter) BuildAuthorizeURL(string, string, string) (string, error) {
	return "", domain.ErrNotSupported
}

func (a *Adapter) ExchangeCallback(context.Context, application.HandleCallbackAdapterInput) (application.CredentialPayload, error) {
	return application.CredentialPayload{}, domain.ErrNotSupported
}

func (a *Adapter) ExchangeCode(context.Context, string, string, string) (*domain.TokenResult, error) {
	return nil, domain.ErrNotSupported
}

func (a *Adapter) Refresh(context.Context, application.RefreshCredentialAdapterInput) (application.CredentialPayload, error) {
	return application.CredentialPayload{}, domain.ErrNotSupported
}

func (a *Adapter) RefreshToken(context.Context, string) (*domain.TokenResult, error) {
	return nil, domain.ErrNotSupported
}

func (a *Adapter) RevokeToken(context.Context, string) error {
	return nil
}

func (a *Adapter) VerifyAPIKey(_ context.Context, input application.SubmitAPIKeyAdapterInput) (application.CredentialPayload, error) {
	if strings.TrimSpace(input.APIKey) == "" {
		return application.CredentialPayload{}, domain.ErrAPIKeyValidationFailed
	}
	return application.CredentialPayload{
		SecretType:          "api_key",
		APIKey:              input.APIKey,
		ProviderAccountID:   strings.TrimSpace(input.Metadata["shop_id"]),
		ProviderAccountName: strings.TrimSpace(input.Metadata["shop_name"]),
	}, nil
}

func (a *Adapter) ValidateCredentials(ctx context.Context, creds map[string]string) (*domain.TokenResult, error) {
	payload, err := a.VerifyAPIKey(ctx, application.SubmitAPIKeyAdapterInput{
		APIKey:   creds["api_key"],
		Metadata: creds,
	})
	if err != nil {
		return nil, err
	}
	return &domain.TokenResult{
		TokenType:         "api_key",
		ProviderAccountID: payload.ProviderAccountID,
		RawExtras: map[string]any{
			"provider_account_name": payload.ProviderAccountName,
		},
	}, nil
}
