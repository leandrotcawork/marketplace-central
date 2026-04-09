package postgres

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

var _ ports.InstallationRepository = (*InstallationRepository)(nil)

type InstallationRepository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewInstallationRepository(pool *pgxpool.Pool, tenantID string) *InstallationRepository {
	return &InstallationRepository{pool: pool, tenantID: tenantID}
}

func (r *InstallationRepository) CreateInstallation(ctx context.Context, inst domain.Installation) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO integration_installations (
			installation_id, tenant_id, provider_code, family, display_name,
			status, health_status, external_account_id, external_account_name,
			active_credential_id, last_verified_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9,
			NULLIF($10, ''), $11, $12, $13
		)
		ON CONFLICT (tenant_id, installation_id) DO UPDATE SET
			provider_code = EXCLUDED.provider_code,
			family = EXCLUDED.family,
			display_name = EXCLUDED.display_name,
			status = EXCLUDED.status,
			health_status = EXCLUDED.health_status,
			external_account_id = EXCLUDED.external_account_id,
			external_account_name = EXCLUDED.external_account_name,
			active_credential_id = EXCLUDED.active_credential_id,
			last_verified_at = EXCLUDED.last_verified_at,
			created_at = EXCLUDED.created_at,
			updated_at = EXCLUDED.updated_at
	`, inst.InstallationID, r.tenantID, inst.ProviderCode, inst.Family, inst.DisplayName,
		inst.Status, inst.HealthStatus, inst.ExternalAccountID, inst.ExternalAccountName,
		inst.ActiveCredentialID, inst.LastVerifiedAt, inst.CreatedAt, inst.UpdatedAt)
	return err
}

func (r *InstallationRepository) GetInstallation(ctx context.Context, installationID string) (domain.Installation, bool, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT
			installation_id, tenant_id, provider_code, family, display_name,
			status, health_status, external_account_id, external_account_name,
			active_credential_id, last_verified_at, created_at, updated_at
		FROM integration_installations
		WHERE tenant_id = $1 AND installation_id = $2
	`, r.tenantID, installationID)

	inst, found, err := scanInstallation(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return domain.Installation{}, false, nil
		}
		return domain.Installation{}, false, err
	}
	return inst, found, nil
}

func (r *InstallationRepository) ListInstallations(ctx context.Context) ([]domain.Installation, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			installation_id, tenant_id, provider_code, family, display_name,
			status, health_status, external_account_id, external_account_name,
			active_credential_id, last_verified_at, created_at, updated_at
		FROM integration_installations
		WHERE tenant_id = $1
		ORDER BY created_at DESC, installation_id DESC
	`, r.tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	installations := make([]domain.Installation, 0)
	for rows.Next() {
		inst, _, err := scanInstallation(rows)
		if err != nil {
			return nil, err
		}
		installations = append(installations, inst)
	}
	return installations, rows.Err()
}

func (r *InstallationRepository) UpdateInstallationStatus(ctx context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE integration_installations
		SET status = $3,
		    health_status = $4,
		    updated_at = now()
		WHERE tenant_id = $1 AND installation_id = $2
	`, r.tenantID, installationID, status, health)
	return err
}

func scanInstallation(scanner interface {
	Scan(dest ...any) error
}) (domain.Installation, bool, error) {
	var inst domain.Installation
	var activeCredential pgtype.Text
	var lastVerified pgtype.Timestamptz

	err := scanner.Scan(
		&inst.InstallationID,
		&inst.TenantID,
		&inst.ProviderCode,
		&inst.Family,
		&inst.DisplayName,
		&inst.Status,
		&inst.HealthStatus,
		&inst.ExternalAccountID,
		&inst.ExternalAccountName,
		&activeCredential,
		&lastVerified,
		&inst.CreatedAt,
		&inst.UpdatedAt,
	)
	if err != nil {
		return domain.Installation{}, false, err
	}

	if activeCredential.Valid {
		inst.ActiveCredentialID = activeCredential.String
	}
	if lastVerified.Valid {
		ts := lastVerified.Time.UTC()
		inst.LastVerifiedAt = &ts
	}

	return inst, true, nil
}
