package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

var _ ports.OperationRunStore = (*OperationRunRepository)(nil)

type OperationRunRepository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewOperationRunRepository(pool *pgxpool.Pool, tenantID string) *OperationRunRepository {
	return &OperationRunRepository{pool: pool, tenantID: tenantID}
}

func (r *OperationRunRepository) SaveOperationRun(ctx context.Context, run domain.OperationRun) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO integration_operation_runs (
			tenant_id, operation_run_id, installation_id, operation_type,
			status, result_code, failure_code, attempt_count,
			actor_type, actor_id, started_at, completed_at,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8,
			$9, $10, $11, $12,
			$13, $14
		)
		ON CONFLICT (tenant_id, operation_run_id) DO UPDATE SET
			installation_id = EXCLUDED.installation_id,
			operation_type = EXCLUDED.operation_type,
			status = EXCLUDED.status,
			result_code = EXCLUDED.result_code,
			failure_code = EXCLUDED.failure_code,
			attempt_count = EXCLUDED.attempt_count,
			actor_type = EXCLUDED.actor_type,
			actor_id = EXCLUDED.actor_id,
			started_at = EXCLUDED.started_at,
			completed_at = EXCLUDED.completed_at,
			created_at = EXCLUDED.created_at,
			updated_at = EXCLUDED.updated_at
	`, r.tenantID, run.OperationRunID, run.InstallationID, run.OperationType, run.Status,
		run.ResultCode, run.FailureCode, run.AttemptCount, run.ActorType, run.ActorID,
		timestamptzArg(run.StartedAt), timestamptzArg(run.CompletedAt), run.CreatedAt, run.UpdatedAt)
	return err
}

func (r *OperationRunRepository) ListByInstallation(ctx context.Context, installationID string) ([]domain.OperationRun, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			operation_run_id, tenant_id, installation_id, operation_type, status,
			result_code, failure_code, attempt_count, actor_type, actor_id,
			started_at, completed_at, created_at, updated_at
		FROM integration_operation_runs
		WHERE tenant_id = $1
		  AND installation_id = $2
		ORDER BY created_at DESC, operation_run_id DESC
	`, r.tenantID, installationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := make([]domain.OperationRun, 0)
	for rows.Next() {
		run, _, err := scanOperationRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

func scanOperationRun(scanner interface {
	Scan(dest ...any) error
}) (domain.OperationRun, bool, error) {
	var run domain.OperationRun
	var startedAt pgtype.Timestamptz
	var completedAt pgtype.Timestamptz

	err := scanner.Scan(
		&run.OperationRunID,
		&run.TenantID,
		&run.InstallationID,
		&run.OperationType,
		&run.Status,
		&run.ResultCode,
		&run.FailureCode,
		&run.AttemptCount,
		&run.ActorType,
		&run.ActorID,
		&startedAt,
		&completedAt,
		&run.CreatedAt,
		&run.UpdatedAt,
	)
	if err != nil {
		return domain.OperationRun{}, false, err
	}

	run.StartedAt = scanTimestamptz(startedAt)
	run.CompletedAt = scanTimestamptz(completedAt)

	return run, true, nil
}
