package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

var _ ports.Repository = (*Repository)(nil)

type Repository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewRepository(pool *pgxpool.Pool, tenantID string) *Repository {
	return &Repository{pool: pool, tenantID: tenantID}
}

func (r *Repository) SaveProduct(ctx context.Context, product domain.Product) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO catalog_products (
			tenant_id, product_id, sku, name, status, cost_amount
		) VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (tenant_id, product_id) DO UPDATE SET
			sku = EXCLUDED.sku,
			name = EXCLUDED.name,
			status = EXCLUDED.status,
			cost_amount = EXCLUDED.cost_amount,
			updated_at = now()
	`, product.TenantID, product.ProductID, product.SKU, product.Name, product.Status, product.Cost)
	return err
}

func (r *Repository) ListProducts(ctx context.Context) ([]domain.Product, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT tenant_id, product_id, sku, name, status, cost_amount
		FROM catalog_products
		WHERE tenant_id = $1
		ORDER BY product_id
	`, r.tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	products := make([]domain.Product, 0)
	for rows.Next() {
		var p domain.Product
		if err := rows.Scan(&p.TenantID, &p.ProductID, &p.SKU, &p.Name, &p.Status, &p.Cost); err != nil {
			return nil, err
		}
		products = append(products, p)
	}
	return products, rows.Err()
}
