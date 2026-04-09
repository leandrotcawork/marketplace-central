package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

var _ ports.AuthSessionStore = (*AuthSessionRepository)(nil)

type AuthSessionRepository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewAuthSessionRepository(pool *pgxpool.Pool, tenantID string) *AuthSessionRepository {
	return &AuthSessionRepository{pool: pool, tenantID: tenantID}
}

func (r *AuthSessionRepository) UpsertAuthSession(ctx context.Context, session domain.AuthSession) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO integration_auth_sessions (
			tenant_id, auth_session_id, installation_id, state,
			provider_account_id, access_token_expires_at, last_verified_at,
			refresh_failure_code, consecutive_failures, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7,
			$8, $9, $10, $11
		)
		ON CONFLICT (tenant_id, auth_session_id) DO UPDATE SET
			installation_id = EXCLUDED.installation_id,
			state = EXCLUDED.state,
			provider_account_id = EXCLUDED.provider_account_id,
			access_token_expires_at = EXCLUDED.access_token_expires_at,
			last_verified_at = EXCLUDED.last_verified_at,
			refresh_failure_code = EXCLUDED.refresh_failure_code,
			consecutive_failures = EXCLUDED.consecutive_failures,
			created_at = EXCLUDED.created_at,
			updated_at = EXCLUDED.updated_at
	`, r.tenantID, session.AuthSessionID, session.InstallationID, session.State,
		session.ProviderAccountID, timestamptzArg(session.AccessTokenExpiresAt), timestamptzArg(session.LastVerifiedAt),
		session.RefreshFailureCode, session.ConsecutiveFailures, session.CreatedAt, session.UpdatedAt)
	return err
}

func scanAuthSession(scanner interface {
	Scan(dest ...any) error
}) (domain.AuthSession, bool, error) {
	var session domain.AuthSession
	var accessTokenExpiresAt pgtype.Timestamptz
	var lastVerifiedAt pgtype.Timestamptz

	err := scanner.Scan(
		&session.AuthSessionID,
		&session.TenantID,
		&session.InstallationID,
		&session.State,
		&session.ProviderAccountID,
		&accessTokenExpiresAt,
		&lastVerifiedAt,
		&session.RefreshFailureCode,
		&session.ConsecutiveFailures,
		&session.CreatedAt,
		&session.UpdatedAt,
	)
	if err != nil {
		return domain.AuthSession{}, false, err
	}

	session.AccessTokenExpiresAt = scanTimestamptz(accessTokenExpiresAt)
	session.LastVerifiedAt = scanTimestamptz(lastVerifiedAt)

	return session, true, nil
}
