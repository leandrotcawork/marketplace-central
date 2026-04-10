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

var _ ports.OAuthStateStore = (*OAuthStateRepository)(nil)

type OAuthStateRepository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewOAuthStateRepository(pool *pgxpool.Pool, tenantID string) *OAuthStateRepository {
	return &OAuthStateRepository{pool: pool, tenantID: tenantID}
}

func (r *OAuthStateRepository) Save(ctx context.Context, state domain.OAuthState) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO integration_oauth_states (
			tenant_id, oauth_state_id, installation_id, nonce, code_verifier,
			hmac_signature, expires_at, consumed_at, created_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9
		)
		ON CONFLICT (tenant_id, nonce) DO UPDATE SET
			oauth_state_id = EXCLUDED.oauth_state_id,
			installation_id = EXCLUDED.installation_id,
			code_verifier = EXCLUDED.code_verifier,
			hmac_signature = EXCLUDED.hmac_signature,
			expires_at = EXCLUDED.expires_at,
			consumed_at = EXCLUDED.consumed_at,
			created_at = EXCLUDED.created_at
	`, r.tenantID, state.ID, state.InstallationID, state.Nonce, state.CodeVerifier,
		state.HMACSignature, state.ExpiresAt.UTC(), timestamptzArg(state.ConsumedAt), state.CreatedAt.UTC())
	return err
}

func (r *OAuthStateRepository) GetByNonce(ctx context.Context, nonce string) (domain.OAuthState, bool, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT
			oauth_state_id, tenant_id, installation_id, nonce, code_verifier,
			hmac_signature, expires_at, consumed_at, created_at
		FROM integration_oauth_states
		WHERE tenant_id = $1
		  AND nonce = $2
	`, r.tenantID, nonce)

	state, found, err := scanOAuthState(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return domain.OAuthState{}, false, nil
		}
		return domain.OAuthState{}, false, err
	}
	return state, found, nil
}

func (r *OAuthStateRepository) ConsumeNonce(ctx context.Context, id string) (bool, error) {
	ct, err := r.pool.Exec(ctx, `
		UPDATE integration_oauth_states
		SET consumed_at = now()
		WHERE tenant_id = $1
		  AND oauth_state_id = $2
		  AND consumed_at IS NULL
		  AND expires_at > now()
	`, r.tenantID, id)
	if err != nil {
		return false, err
	}
	return ct.RowsAffected() > 0, nil
}

func (r *OAuthStateRepository) DeleteExpired(ctx context.Context, olderThan time.Time) (int64, error) {
	ct, err := r.pool.Exec(ctx, `
		DELETE FROM integration_oauth_states
		WHERE tenant_id = $1
		  AND expires_at <= $2
	`, r.tenantID, olderThan.UTC())
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}

func scanOAuthState(scanner interface {
	Scan(dest ...any) error
}) (domain.OAuthState, bool, error) {
	var state domain.OAuthState
	var consumedAt pgtype.Timestamptz
	var expiresAt pgtype.Timestamptz

	err := scanner.Scan(
		&state.ID,
		&state.TenantID,
		&state.InstallationID,
		&state.Nonce,
		&state.CodeVerifier,
		&state.HMACSignature,
		&expiresAt,
		&consumedAt,
		&state.CreatedAt,
	)
	if err != nil {
		return domain.OAuthState{}, false, err
	}

	state.ExpiresAt = expiresAt.Time.UTC()
	if consumedAt.Valid {
		ts := consumedAt.Time.UTC()
		state.ConsumedAt = &ts
	}

	return state, true, nil
}
