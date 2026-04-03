package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/classifications/domain"
	"marketplace-central/apps/server_core/internal/modules/classifications/ports"
)

var _ ports.Repository = (*Repository)(nil)

type Repository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewRepository(pool *pgxpool.Pool, tenantID string) *Repository {
	return &Repository{pool: pool, tenantID: tenantID}
}

func (r *Repository) List(ctx context.Context) ([]domain.Classification, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT c.classification_id, c.tenant_id, c.name, c.ai_context,
		       c.created_at, c.updated_at,
		       COALESCE(array_agg(cp.product_id) FILTER (WHERE cp.product_id IS NOT NULL), '{}')
		FROM classifications c
		LEFT JOIN classification_products cp
			ON cp.classification_id = c.classification_id AND cp.tenant_id = c.tenant_id
		WHERE c.tenant_id = $1
		GROUP BY c.classification_id
		ORDER BY c.created_at DESC
	`, r.tenantID)
	if err != nil {
		return nil, fmt.Errorf("list classifications: %w", err)
	}
	defer rows.Close()

	result := make([]domain.Classification, 0)
	for rows.Next() {
		var c domain.Classification
		if err := rows.Scan(
			&c.ClassificationID, &c.TenantID, &c.Name, &c.AIContext,
			&c.CreatedAt, &c.UpdatedAt, &c.ProductIDs,
		); err != nil {
			return nil, fmt.Errorf("scan classification: %w", err)
		}
		c.ProductCount = len(c.ProductIDs)
		result = append(result, c)
	}
	return result, rows.Err()
}

func (r *Repository) GetByID(ctx context.Context, id string) (domain.Classification, error) {
	var c domain.Classification
	err := r.pool.QueryRow(ctx, `
		SELECT classification_id, tenant_id, name, ai_context, created_at, updated_at
		FROM classifications
		WHERE classification_id = $1 AND tenant_id = $2
	`, id, r.tenantID).Scan(
		&c.ClassificationID, &c.TenantID, &c.Name, &c.AIContext,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return domain.Classification{}, fmt.Errorf("CLASSIFICATIONS_ENTITY_NOT_FOUND")
	}
	if err != nil {
		return domain.Classification{}, fmt.Errorf("get classification: %w", err)
	}

	productRows, err := r.pool.Query(ctx, `
		SELECT product_id FROM classification_products
		WHERE classification_id = $1 AND tenant_id = $2
	`, id, r.tenantID)
	if err != nil {
		return domain.Classification{}, fmt.Errorf("get classification products: %w", err)
	}
	defer productRows.Close()

	productIDs := make([]string, 0)
	for productRows.Next() {
		var pid string
		if err := productRows.Scan(&pid); err != nil {
			return domain.Classification{}, fmt.Errorf("scan product id: %w", err)
		}
		productIDs = append(productIDs, pid)
	}
	if err := productRows.Err(); err != nil {
		return domain.Classification{}, fmt.Errorf("iterate product ids: %w", err)
	}

	c.ProductIDs = productIDs
	c.ProductCount = len(productIDs)
	return c, nil
}

func (r *Repository) Create(ctx context.Context, c domain.Classification) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO classifications (classification_id, tenant_id, name, ai_context, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, c.ClassificationID, r.tenantID, c.Name, c.AIContext, c.CreatedAt, c.UpdatedAt)
	if err != nil {
		return fmt.Errorf("insert classification: %w", err)
	}

	for _, pid := range c.ProductIDs {
		_, err = tx.Exec(ctx, `
			INSERT INTO classification_products (classification_id, tenant_id, product_id)
			VALUES ($1, $2, $3)
		`, c.ClassificationID, r.tenantID, pid)
		if err != nil {
			return fmt.Errorf("insert classification product: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func (r *Repository) Update(ctx context.Context, c domain.Classification) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE classifications
		SET name = $1, ai_context = $2, updated_at = $3
		WHERE classification_id = $4 AND tenant_id = $5
	`, c.Name, c.AIContext, c.UpdatedAt, c.ClassificationID, r.tenantID)
	if err != nil {
		return fmt.Errorf("update classification: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("CLASSIFICATIONS_ENTITY_NOT_FOUND")
	}

	_, err = tx.Exec(ctx, `
		DELETE FROM classification_products
		WHERE classification_id = $1 AND tenant_id = $2
	`, c.ClassificationID, r.tenantID)
	if err != nil {
		return fmt.Errorf("clear classification products: %w", err)
	}

	for _, pid := range c.ProductIDs {
		_, err = tx.Exec(ctx, `
			INSERT INTO classification_products (classification_id, tenant_id, product_id)
			VALUES ($1, $2, $3)
		`, c.ClassificationID, r.tenantID, pid)
		if err != nil {
			return fmt.Errorf("insert classification product: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM classifications
		WHERE classification_id = $1 AND tenant_id = $2
	`, id, r.tenantID)
	if err != nil {
		return fmt.Errorf("delete classification: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("CLASSIFICATIONS_ENTITY_NOT_FOUND")
	}
	return nil
}
