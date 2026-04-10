package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type AuthProvider interface {
	ProviderCode() string
	AuthStrategy() domain.AuthStrategy
	BuildAuthorizeURL(state, redirectURI, codeChallenge string) (string, error)
	ExchangeCode(ctx context.Context, code, redirectURI, codeVerifier string) (*domain.TokenResult, error)
	RefreshToken(ctx context.Context, refreshToken string) (*domain.TokenResult, error)
	RevokeToken(ctx context.Context, accessToken string) error
	ValidateCredentials(ctx context.Context, creds map[string]string) (*domain.TokenResult, error)
}
