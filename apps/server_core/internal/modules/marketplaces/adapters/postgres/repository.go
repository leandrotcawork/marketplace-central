package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

var _ ports.Repository = (*Repository)(nil)

type Repository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewRepository(pool *pgxpool.Pool, tenantID string) *Repository {
	return &Repository{pool: pool, tenantID: tenantID}
}

func (r *Repository) SaveAccount(ctx context.Context, account domain.Account) error {
	_, err := r.pool.Exec(ctx, `
        INSERT INTO marketplace_accounts (
            tenant_id, account_id, channel_code, display_name, status, connection_mode
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (account_id) DO UPDATE SET
            channel_code = EXCLUDED.channel_code,
            display_name = EXCLUDED.display_name,
            status = EXCLUDED.status,
            connection_mode = EXCLUDED.connection_mode,
            updated_at = now()
    `, account.TenantID, account.AccountID, account.ChannelCode, account.DisplayName, account.Status, account.ConnectionMode)
	return err
}

func (r *Repository) SavePolicy(ctx context.Context, policy domain.Policy) error {
	_, err := r.pool.Exec(ctx, `
        INSERT INTO marketplace_pricing_policies (
            tenant_id, policy_id, account_id, commission_percent, fixed_fee_amount,
            default_shipping_amount, tax_percent, min_margin_percent, sla_question_minutes, sla_dispatch_hours, shipping_provider
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (policy_id) DO UPDATE SET
            account_id = EXCLUDED.account_id,
            commission_percent = EXCLUDED.commission_percent,
            fixed_fee_amount = EXCLUDED.fixed_fee_amount,
            default_shipping_amount = EXCLUDED.default_shipping_amount,
            tax_percent = EXCLUDED.tax_percent,
            min_margin_percent = EXCLUDED.min_margin_percent,
            sla_question_minutes = EXCLUDED.sla_question_minutes,
            sla_dispatch_hours = EXCLUDED.sla_dispatch_hours,
            shipping_provider = EXCLUDED.shipping_provider,
            updated_at = now()
    `, policy.TenantID, policy.PolicyID, policy.AccountID, policy.CommissionPercent, policy.FixedFeeAmount,
		policy.DefaultShipping, policy.TaxPercent, policy.MinMarginPercent, policy.SLAQuestionMinutes, policy.SLADispatchHours, policy.ShippingProvider)
	return err
}

func (r *Repository) ListAccounts(ctx context.Context) ([]domain.Account, error) {
	rows, err := r.pool.Query(ctx, `
        SELECT tenant_id, account_id, channel_code, display_name, status, connection_mode
        FROM marketplace_accounts
        WHERE tenant_id = $1
        ORDER BY account_id
    `, r.tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	accounts := make([]domain.Account, 0)
	for rows.Next() {
		var a domain.Account
		if err := rows.Scan(&a.TenantID, &a.AccountID, &a.ChannelCode, &a.DisplayName, &a.Status, &a.ConnectionMode); err != nil {
			return nil, err
		}
		accounts = append(accounts, a)
	}
	return accounts, rows.Err()
}

func (r *Repository) ListPolicies(ctx context.Context) ([]domain.Policy, error) {
	rows, err := r.pool.Query(ctx, `
        SELECT tenant_id, policy_id, account_id, commission_percent, fixed_fee_amount,
               default_shipping_amount, tax_percent, min_margin_percent, sla_question_minutes, sla_dispatch_hours, shipping_provider
        FROM marketplace_pricing_policies
        WHERE tenant_id = $1
        ORDER BY policy_id
    `, r.tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	policies := make([]domain.Policy, 0)
	for rows.Next() {
		var p domain.Policy
		if err := rows.Scan(&p.TenantID, &p.PolicyID, &p.AccountID, &p.CommissionPercent, &p.FixedFeeAmount,
			&p.DefaultShipping, &p.TaxPercent, &p.MinMarginPercent, &p.SLAQuestionMinutes, &p.SLADispatchHours, &p.ShippingProvider); err != nil {
			return nil, err
		}
		policies = append(policies, p)
	}
	return policies, rows.Err()
}

func (r *Repository) ListPoliciesByIDs(ctx context.Context, policyIDs []string) ([]domain.Policy, error) {
	if len(policyIDs) == 0 {
		return []domain.Policy{}, nil
	}
	rows, err := r.pool.Query(ctx, `
        SELECT tenant_id, policy_id, account_id, commission_percent, fixed_fee_amount,
               default_shipping_amount, tax_percent, min_margin_percent, sla_question_minutes, sla_dispatch_hours, shipping_provider
        FROM marketplace_pricing_policies
        WHERE tenant_id = $1 AND policy_id = ANY($2)
        ORDER BY policy_id
    `, r.tenantID, policyIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	policies := make([]domain.Policy, 0, len(policyIDs))
	for rows.Next() {
		var p domain.Policy
		if err := rows.Scan(&p.TenantID, &p.PolicyID, &p.AccountID, &p.CommissionPercent, &p.FixedFeeAmount,
			&p.DefaultShipping, &p.TaxPercent, &p.MinMarginPercent, &p.SLAQuestionMinutes, &p.SLADispatchHours, &p.ShippingProvider); err != nil {
			return nil, err
		}
		policies = append(policies, p)
	}
	return policies, rows.Err()
}
