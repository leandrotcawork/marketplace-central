package postgres

import (
	"context"
	"errors"
	"time"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	"marketplace-central/apps/server_core/internal/modules/connectors/ports"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var _ ports.Repository = (*Repository)(nil)

type Repository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewRepository(pool *pgxpool.Pool, tenantID string) *Repository {
	return &Repository{pool: pool, tenantID: tenantID}
}

func (r *Repository) SaveBatch(ctx context.Context, batch domain.PublicationBatch) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO publication_batches
		 (batch_id, tenant_id, vtex_account, status, total_products, succeeded_count, failed_count, created_at, completed_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (batch_id) DO NOTHING`,
		batch.BatchID, r.tenantID, batch.VTEXAccount, batch.Status,
		batch.TotalProducts, batch.SucceededCount, batch.FailedCount,
		batch.CreatedAt, batch.CompletedAt,
	)
	return err
}

func (r *Repository) GetBatch(ctx context.Context, tenantID, batchID string) (domain.PublicationBatch, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT batch_id, tenant_id, vtex_account, status, total_products,
		        succeeded_count, failed_count, created_at, completed_at
		 FROM publication_batches
		 WHERE tenant_id = $1 AND batch_id = $2`,
		r.tenantID, batchID,
	)
	var b domain.PublicationBatch
	err := row.Scan(
		&b.BatchID, &b.TenantID, &b.VTEXAccount, &b.Status,
		&b.TotalProducts, &b.SucceededCount, &b.FailedCount,
		&b.CreatedAt, &b.CompletedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.PublicationBatch{}, errors.New("CONNECTORS_BATCH_NOT_FOUND")
	}
	return b, err
}

func (r *Repository) UpdateBatchStatus(ctx context.Context, tenantID, batchID, status string, succeededCount, failedCount int) error {
	now := time.Now()
	var completedAt *time.Time
	if status == domain.BatchStatusCompleted || status == domain.BatchStatusFailed {
		completedAt = &now
	}
	_, err := r.pool.Exec(ctx,
		`UPDATE publication_batches
		 SET status = $3, succeeded_count = $4, failed_count = $5, completed_at = $6
		 WHERE tenant_id = $1 AND batch_id = $2`,
		r.tenantID, batchID, status, succeededCount, failedCount, completedAt,
	)
	return err
}

func (r *Repository) SaveOperation(ctx context.Context, op domain.PublicationOperation) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO publication_operations
		 (operation_id, batch_id, tenant_id, vtex_account, product_id, current_step, status, error_code, error_message, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 ON CONFLICT (operation_id) DO NOTHING`,
		op.OperationID, op.BatchID, r.tenantID, op.VTEXAccount,
		op.ProductID, op.CurrentStep, op.Status,
		op.ErrorCode, op.ErrorMessage, op.CreatedAt, op.UpdatedAt,
	)
	return err
}

func (r *Repository) ListOperationsByBatch(ctx context.Context, tenantID, batchID string) ([]domain.PublicationOperation, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT operation_id, batch_id, tenant_id, vtex_account, product_id,
		        current_step, status, error_code, error_message, created_at, updated_at
		 FROM publication_operations
		 WHERE tenant_id = $1 AND batch_id = $2
		 ORDER BY created_at`,
		r.tenantID, batchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ops []domain.PublicationOperation
	for rows.Next() {
		var op domain.PublicationOperation
		if err := rows.Scan(
			&op.OperationID, &op.BatchID, &op.TenantID, &op.VTEXAccount,
			&op.ProductID, &op.CurrentStep, &op.Status,
			&op.ErrorCode, &op.ErrorMessage, &op.CreatedAt, &op.UpdatedAt,
		); err != nil {
			return nil, err
		}
		ops = append(ops, op)
	}
	return ops, rows.Err()
}

func (r *Repository) UpdateOperationStatus(ctx context.Context, tenantID, operationID, status, currentStep, errorCode, errorMessage string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE publication_operations
		 SET status = $3, current_step = $4, error_code = $5, error_message = $6, updated_at = now()
		 WHERE tenant_id = $1 AND operation_id = $2`,
		r.tenantID, operationID, status, currentStep, errorCode, errorMessage,
	)
	return err
}

func (r *Repository) HasActiveOperation(ctx context.Context, tenantID, vtexAccount, productID string) (bool, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT EXISTS(
		   SELECT 1 FROM publication_operations
		   WHERE tenant_id = $1 AND vtex_account = $2 AND product_id = $3
		   AND status IN ('pending', 'in_progress')
		 )`,
		r.tenantID, vtexAccount, productID,
	)
	var exists bool
	err := row.Scan(&exists)
	return exists, err
}

func (r *Repository) SaveStepResult(ctx context.Context, result domain.PipelineStepResult) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO pipeline_step_results
		 (step_result_id, operation_id, tenant_id, step_name, status,
		  vtex_entity_id, attempt_count, error_code, error_message, started_at, completed_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 ON CONFLICT (step_result_id) DO NOTHING`,
		result.StepResultID, result.OperationID, r.tenantID,
		result.StepName, result.Status, result.VTEXEntityID,
		result.AttemptCount, result.ErrorCode, result.ErrorMessage,
		result.StartedAt, result.CompletedAt,
	)
	return err
}

func (r *Repository) UpdateStepResult(ctx context.Context, tenantID, stepResultID, status string, vtexEntityID *string, errorCode, errorMessage string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE pipeline_step_results
		 SET status = $3, vtex_entity_id = $4, error_code = $5, error_message = $6,
		     attempt_count = attempt_count + 1, completed_at = now()
		 WHERE tenant_id = $1 AND step_result_id = $2`,
		r.tenantID, stepResultID, status, vtexEntityID, errorCode, errorMessage,
	)
	return err
}

func (r *Repository) ListStepResultsByOperation(ctx context.Context, tenantID, operationID string) ([]domain.PipelineStepResult, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT step_result_id, operation_id, tenant_id, step_name, status,
		        vtex_entity_id, attempt_count, error_code, error_message, started_at, completed_at
		 FROM pipeline_step_results
		 WHERE tenant_id = $1 AND operation_id = $2
		 ORDER BY started_at`,
		r.tenantID, operationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []domain.PipelineStepResult
	for rows.Next() {
		var sr domain.PipelineStepResult
		if err := rows.Scan(
			&sr.StepResultID, &sr.OperationID, &sr.TenantID, &sr.StepName, &sr.Status,
			&sr.VTEXEntityID, &sr.AttemptCount, &sr.ErrorCode, &sr.ErrorMessage,
			&sr.StartedAt, &sr.CompletedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, sr)
	}
	return results, rows.Err()
}

func (r *Repository) FindMapping(ctx context.Context, tenantID, vtexAccount, entityType, localID string) (*domain.VTEXEntityMapping, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT mapping_id, tenant_id, vtex_account, entity_type, local_id, vtex_id, created_at, updated_at
		 FROM vtex_entity_mappings
		 WHERE tenant_id = $1 AND vtex_account = $2 AND entity_type = $3 AND local_id = $4`,
		r.tenantID, vtexAccount, entityType, localID,
	)
	var m domain.VTEXEntityMapping
	err := row.Scan(
		&m.MappingID, &m.TenantID, &m.VTEXAccount, &m.EntityType,
		&m.LocalID, &m.VTEXID, &m.CreatedAt, &m.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) SaveMapping(ctx context.Context, mapping domain.VTEXEntityMapping) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO vtex_entity_mappings
		 (mapping_id, tenant_id, vtex_account, entity_type, local_id, vtex_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (tenant_id, vtex_account, entity_type, local_id)
		 DO UPDATE SET vtex_id = EXCLUDED.vtex_id, updated_at = EXCLUDED.updated_at`,
		mapping.MappingID, r.tenantID, mapping.VTEXAccount,
		mapping.EntityType, mapping.LocalID, mapping.VTEXID,
		mapping.CreatedAt, mapping.UpdatedAt,
	)
	return err
}
