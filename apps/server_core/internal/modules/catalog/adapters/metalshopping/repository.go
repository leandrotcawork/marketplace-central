package metalshopping

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

var _ ports.ProductReader = (*Repository)(nil)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

type filterKind int

const (
	filterNone     filterKind = iota
	filterByID
	filterBySearch
)

func filterSQL(kind filterKind) string {
	switch kind {
	case filterByID:
		return "AND p.product_id = $1"
	case filterBySearch:
		return "AND (p.name ILIKE $1 OR p.sku ILIKE $1 OR ean.identifier_value ILIKE $1 OR ref.identifier_value ILIKE $1)"
	default:
		return ""
	}
}

func (r *Repository) ListProducts(ctx context.Context) ([]domain.Product, error) {
	return r.queryProducts(ctx, filterNone)
}

func (r *Repository) GetProduct(ctx context.Context, productID string) (domain.Product, error) {
	products, err := r.queryProducts(ctx, filterByID, productID)
	if err != nil {
		return domain.Product{}, err
	}
	if len(products) == 0 {
		return domain.Product{}, fmt.Errorf("CATALOG_PRODUCT_NOT_FOUND")
	}
	return products[0], nil
}

func (r *Repository) SearchProducts(ctx context.Context, query string) ([]domain.Product, error) {
	searchPattern := "%" + query + "%"
	return r.queryProducts(ctx, filterBySearch, searchPattern)
}

func (r *Repository) ListTaxonomyNodes(ctx context.Context) ([]domain.TaxonomyNode, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			tn.taxonomy_node_id,
			tn.name,
			tn.level,
			COALESCE(ld.label, ''),
			COALESCE(tn.parent_taxonomy_node_id, ''),
			tn.is_active,
			COUNT(p.product_id)::int
		FROM catalog_taxonomy_nodes tn
		LEFT JOIN catalog_taxonomy_level_defs ld
			ON ld.tenant_id = tn.tenant_id AND ld.level = tn.level
		LEFT JOIN catalog_products p
			ON p.primary_taxonomy_node_id = tn.taxonomy_node_id
			AND p.tenant_id = tn.tenant_id AND p.status = 'active'
		WHERE tn.tenant_id = current_setting('app.tenant_id') AND tn.is_active = true
		GROUP BY tn.taxonomy_node_id, tn.name, tn.level, ld.label, tn.parent_taxonomy_node_id, tn.is_active
		ORDER BY tn.level, tn.name
	`)
	if err != nil {
		return nil, fmt.Errorf("list taxonomy: %w", err)
	}
	defer rows.Close()

	nodes := make([]domain.TaxonomyNode, 0)
	for rows.Next() {
		var n domain.TaxonomyNode
		if err := rows.Scan(&n.NodeID, &n.Name, &n.Level, &n.LevelLabel, &n.ParentNodeID, &n.IsActive, &n.ProductCount); err != nil {
			return nil, fmt.Errorf("scan taxonomy node: %w", err)
		}
		nodes = append(nodes, n)
	}
	return nodes, rows.Err()
}

func (r *Repository) queryProducts(ctx context.Context, kind filterKind, args ...any) ([]domain.Product, error) {
	query := `
		SELECT
			p.product_id,
			p.sku,
			p.name,
			COALESCE(p.description, ''),
			COALESCE(p.brand_name, ''),
			p.status,
			COALESCE(pr.replacement_cost_amount, 0),
			COALESCE(pr.price_amount, 0),
			COALESCE(inv.on_hand_quantity, 0),
			COALESCE(ean.identifier_value, ''),
			COALESCE(ref.identifier_value, ''),
			COALESCE(p.primary_taxonomy_node_id, ''),
			COALESCE(tn.name, ''),
			sp.observed_price
		FROM catalog_products p
		LEFT JOIN pricing_product_prices pr
			ON pr.product_id = p.product_id AND pr.tenant_id = p.tenant_id
			AND pr.pricing_status = 'active' AND pr.effective_to IS NULL
		LEFT JOIN inventory_product_positions inv
			ON inv.product_id = p.product_id AND inv.tenant_id = p.tenant_id
			AND inv.position_status = 'active' AND inv.effective_to IS NULL
		LEFT JOIN catalog_product_identifiers ean
			ON ean.product_id = p.product_id AND ean.tenant_id = p.tenant_id
			AND ean.identifier_type = 'ean' AND ean.is_primary = true
		LEFT JOIN catalog_product_identifiers ref
			ON ref.product_id = p.product_id AND ref.tenant_id = p.tenant_id
			AND ref.identifier_type = 'reference' AND ref.is_primary = true
		LEFT JOIN catalog_taxonomy_nodes tn
			ON tn.taxonomy_node_id = p.primary_taxonomy_node_id AND tn.tenant_id = p.tenant_id
		LEFT JOIN LATERAL (
			-- shopping_price_latest_snapshot has no tenant_id column.
			-- Tenant isolation is enforced by the outer p.tenant_id predicate.
			SELECT sp2.observed_price
			FROM shopping_price_latest_snapshot sp2
			WHERE sp2.sku = p.sku
			ORDER BY sp2.observed_at DESC
			LIMIT 1
		) sp ON true
		WHERE p.tenant_id = current_setting('app.tenant_id') AND p.status = 'active' ` + filterSQL(kind) + `
		ORDER BY p.name
	`

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query products: %w", err)
	}
	defer rows.Close()

	products := make([]domain.Product, 0)
	for rows.Next() {
		var p domain.Product
		var shoppingPrice *float64
		if err := rows.Scan(
			&p.ProductID, &p.SKU, &p.Name, &p.Description, &p.BrandName,
			&p.Status, &p.CostAmount, &p.PriceAmount, &p.StockQuantity,
			&p.EAN, &p.Reference, &p.TaxonomyNodeID, &p.TaxonomyName,
			&shoppingPrice,
		); err != nil {
			return nil, fmt.Errorf("scan product: %w", err)
		}
		p.SuggestedPrice = shoppingPrice
		products = append(products, p)
	}
	return products, rows.Err()
}
