package postgres

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
	"marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

var _ ports.Repository = (*Repository)(nil)

type Repository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewRepository(pool *pgxpool.Pool, tenantID string) *Repository {
	return &Repository{pool: pool, tenantID: tenantID}
}

func (r *Repository) SaveSimulation(ctx context.Context, sim domain.Simulation) error {
	result, err := json.Marshal(map[string]any{
		"margin_amount":  sim.MarginAmount,
		"margin_percent": sim.MarginPercent,
		"status":         sim.Status,
	})
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO pricing_simulations (
			simulation_id, tenant_id, product_id, account_id,
			input_snapshot_json, result_snapshot_json
		) VALUES ($1, $2, $3, $4, '{}'::jsonb, $5)
		ON CONFLICT (simulation_id) DO NOTHING
	`, sim.SimulationID, sim.TenantID, sim.ProductID, sim.AccountID, result)
	return err
}

func (r *Repository) ListSimulations(ctx context.Context) ([]domain.Simulation, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT simulation_id, tenant_id, product_id, account_id, result_snapshot_json
		FROM pricing_simulations
		WHERE tenant_id = $1
		ORDER BY created_at DESC
	`, r.tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sims := make([]domain.Simulation, 0)
	for rows.Next() {
		var s domain.Simulation
		var resultJSON []byte
		if err := rows.Scan(&s.SimulationID, &s.TenantID, &s.ProductID, &s.AccountID, &resultJSON); err != nil {
			return nil, err
		}
		var result struct {
			MarginAmount  float64 `json:"margin_amount"`
			MarginPercent float64 `json:"margin_percent"`
			Status        string  `json:"status"`
		}
		if err := json.Unmarshal(resultJSON, &result); err != nil {
			return nil, err
		}
		s.MarginAmount = result.MarginAmount
		s.MarginPercent = result.MarginPercent
		s.Status = result.Status
		sims = append(sims, s)
	}
	return sims, rows.Err()
}
