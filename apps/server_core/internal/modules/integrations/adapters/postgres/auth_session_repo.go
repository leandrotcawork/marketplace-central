package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
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
			refresh_failure_code, consecutive_failures, next_retry_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7,
			$8, $9, $10, $11, $12
		)
		ON CONFLICT (tenant_id, auth_session_id) DO UPDATE SET
			installation_id = EXCLUDED.installation_id,
			state = EXCLUDED.state,
			provider_account_id = EXCLUDED.provider_account_id,
			access_token_expires_at = EXCLUDED.access_token_expires_at,
			last_verified_at = EXCLUDED.last_verified_at,
			refresh_failure_code = EXCLUDED.refresh_failure_code,
			consecutive_failures = EXCLUDED.consecutive_failures,
			next_retry_at = EXCLUDED.next_retry_at,
			created_at = EXCLUDED.created_at,
			updated_at = EXCLUDED.updated_at
	`, r.tenantID, session.AuthSessionID, session.InstallationID, session.State,
		session.ProviderAccountID, timestamptzArg(session.AccessTokenExpiresAt), timestamptzArg(session.LastVerifiedAt),
		session.RefreshFailureCode, session.ConsecutiveFailures, timestamptzArg(session.NextRetryAt), session.CreatedAt, session.UpdatedAt)
	return err
}

func (r *AuthSessionRepository) GetAuthSession(ctx context.Context, installationID string) (domain.AuthSession, bool, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT
			auth_session_id, tenant_id, installation_id, state, provider_account_id,
			access_token_expires_at, last_verified_at, refresh_failure_code,
			consecutive_failures, next_retry_at, created_at, updated_at
		FROM integration_auth_sessions
		WHERE tenant_id = $1
		  AND installation_id = $2
	`, r.tenantID, installationID)

	session, found, err := scanAuthSession(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return domain.AuthSession{}, false, nil
		}
		return domain.AuthSession{}, false, err
	}
	return session, found, nil
}

func (r *AuthSessionRepository) ListExpiringSessions(ctx context.Context, expiresWithin time.Duration) ([]domain.AuthSession, error) {
	cutoff := time.Now().UTC().Add(expiresWithin)
	rows, err := r.pool.Query(ctx, `
		SELECT
			auth_session_id, tenant_id, installation_id, state, provider_account_id,
			access_token_expires_at, last_verified_at, refresh_failure_code,
			consecutive_failures, next_retry_at, created_at, updated_at
		FROM integration_auth_sessions
		WHERE tenant_id = $1
		  AND (
			state = 'expiring'
			OR (access_token_expires_at IS NOT NULL AND access_token_expires_at <= $2)
		  )
		  AND (next_retry_at IS NULL OR next_retry_at <= now())
		ORDER BY access_token_expires_at ASC, auth_session_id ASC
	`, r.tenantID, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]domain.AuthSession, 0)
	for rows.Next() {
		session, _, err := scanAuthSession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func scanAuthSession(scanner interface {
	Scan(dest ...any) error
}) (domain.AuthSession, bool, error) {
	var session domain.AuthSession
	var accessTokenExpiresAt pgtype.Timestamptz
	var lastVerifiedAt pgtype.Timestamptz
	var nextRetryAt pgtype.Timestamptz

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
		&nextRetryAt,
		&session.CreatedAt,
		&session.UpdatedAt,
	)
	if err != nil {
		return domain.AuthSession{}, false, err
	}

	session.AccessTokenExpiresAt = scanTimestamptz(accessTokenExpiresAt)
	session.LastVerifiedAt = scanTimestamptz(lastVerifiedAt)
	session.NextRetryAt = scanTimestamptz(nextRetryAt)

	return session, true, nil
}
