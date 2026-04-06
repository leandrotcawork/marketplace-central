package melhorenvio

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TokenStore persists and retrieves the ME OAuth access token in Postgres.
type TokenStore struct {
	pool     *pgxpool.Pool
	tenantID string
}

// NewTokenStore creates a TokenStore backed by the given pool.
func NewTokenStore(pool *pgxpool.Pool, tenantID string) *TokenStore {
	return &TokenStore{pool: pool, tenantID: tenantID}
}

// GetToken returns the stored access token, or "" if none exists.
func (s *TokenStore) GetToken(ctx context.Context) (string, error) {
	var token string
	err := s.pool.QueryRow(ctx, `
		SELECT access_token FROM connector_oauth_tokens
		WHERE tenant_id = $1 AND channel_code = 'melhor_envio'
	`, s.tenantID).Scan(&token)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return token, err
}

// SaveToken upserts the access + refresh token pair.
func (s *TokenStore) SaveToken(ctx context.Context, accessToken, refreshToken string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO connector_oauth_tokens (tenant_id, channel_code, access_token, refresh_token, updated_at)
		VALUES ($1, 'melhor_envio', $2, $3, now())
		ON CONFLICT (tenant_id, channel_code) DO UPDATE SET
			access_token  = EXCLUDED.access_token,
			refresh_token = EXCLUDED.refresh_token,
			updated_at    = now()
	`, s.tenantID, accessToken, refreshToken)
	return err
}
