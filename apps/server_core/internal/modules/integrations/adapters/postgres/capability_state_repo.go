package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

var _ ports.CapabilityStateStore = (*CapabilityStateRepository)(nil)

type CapabilityStateRepository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewCapabilityStateRepository(pool *pgxpool.Pool, tenantID string) *CapabilityStateRepository {
	return &CapabilityStateRepository{pool: pool, tenantID: tenantID}
}

func (r *CapabilityStateRepository) UpsertCapabilityStates(ctx context.Context, states []domain.CapabilityState) error {
	for _, state := range states {
		_, err := r.pool.Exec(ctx, `
			INSERT INTO integration_capability_states (
				tenant_id, capability_state_id, installation_id, capability_code,
				status, reason_code, last_evaluated_at, created_at, updated_at
			) VALUES (
				$1, $2, $3, $4,
				$5, $6, $7, $8, $9
			)
			ON CONFLICT (tenant_id, installation_id, capability_code) DO UPDATE SET
				capability_state_id = EXCLUDED.capability_state_id,
				status = EXCLUDED.status,
				reason_code = EXCLUDED.reason_code,
				last_evaluated_at = EXCLUDED.last_evaluated_at,
				created_at = EXCLUDED.created_at,
				updated_at = EXCLUDED.updated_at
		`, r.tenantID, state.CapabilityStateID, state.InstallationID, state.CapabilityCode,
			state.Status, state.ReasonCode, timestamptzArg(state.LastEvaluatedAt), state.CreatedAt, state.UpdatedAt)
		if err != nil {
			return err
		}
	}

	return nil
}

func (r *CapabilityStateRepository) ListCapabilityStates(ctx context.Context, installationID string) ([]domain.CapabilityState, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			capability_state_id, tenant_id, installation_id, capability_code,
			status, reason_code, last_evaluated_at, created_at, updated_at
		FROM integration_capability_states
		WHERE tenant_id = $1 AND installation_id = $2
		ORDER BY capability_code, created_at, capability_state_id
	`, r.tenantID, installationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	states := make([]domain.CapabilityState, 0)
	for rows.Next() {
		state, err := scanCapabilityState(rows)
		if err != nil {
			return nil, err
		}
		states = append(states, state)
	}

	return states, rows.Err()
}

func scanCapabilityState(scanner interface {
	Scan(dest ...any) error
}) (domain.CapabilityState, error) {
	var state domain.CapabilityState
	var lastEvaluatedAt pgtype.Timestamptz

	err := scanner.Scan(
		&state.CapabilityStateID,
		&state.TenantID,
		&state.InstallationID,
		&state.CapabilityCode,
		&state.Status,
		&state.ReasonCode,
		&lastEvaluatedAt,
		&state.CreatedAt,
		&state.UpdatedAt,
	)
	if err != nil {
		return domain.CapabilityState{}, err
	}

	state.LastEvaluatedAt = scanTimestamptz(lastEvaluatedAt)

	return state, nil
}
