package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

var _ ports.CredentialStore = (*CredentialRepository)(nil)

type CredentialRepository struct {
	pool     *pgxpool.Pool
	tenantID string
}

func NewCredentialRepository(pool *pgxpool.Pool, tenantID string) *CredentialRepository {
	return &CredentialRepository{pool: pool, tenantID: tenantID}
}

func (r *CredentialRepository) NextCredentialVersion(ctx context.Context, installationID string) (int, error) {
	var nextVersion int
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(version), 0) + 1
		FROM integration_credentials
		WHERE tenant_id = $1 AND installation_id = $2
	`, r.tenantID, installationID).Scan(&nextVersion)
	return nextVersion, err
}

func (r *CredentialRepository) SaveCredentialVersion(ctx context.Context, credential domain.Credential) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO integration_credentials (
			tenant_id, credential_id, installation_id, version, secret_type,
			encrypted_payload, encryption_key_id, is_active, revoked_at,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9,
			$10, $11
		)
		ON CONFLICT (tenant_id, credential_id) DO UPDATE SET
			installation_id = EXCLUDED.installation_id,
			version = EXCLUDED.version,
			secret_type = EXCLUDED.secret_type,
			encrypted_payload = EXCLUDED.encrypted_payload,
			encryption_key_id = EXCLUDED.encryption_key_id,
			is_active = EXCLUDED.is_active,
			revoked_at = EXCLUDED.revoked_at,
			created_at = EXCLUDED.created_at,
			updated_at = EXCLUDED.updated_at
	`, r.tenantID, credential.CredentialID, credential.InstallationID, credential.Version, credential.SecretType,
		credential.EncryptedPayload, credential.EncryptionKeyID, credential.IsActive, credential.RevokedAt,
		credential.CreatedAt, credential.UpdatedAt)
	return err
}

func scanCredential(scanner interface {
	Scan(dest ...any) error
}) (domain.Credential, bool, error) {
	var credential domain.Credential
	var revokedAt pgtype.Timestamptz

	err := scanner.Scan(
		&credential.CredentialID,
		&credential.TenantID,
		&credential.InstallationID,
		&credential.Version,
		&credential.SecretType,
		&credential.EncryptedPayload,
		&credential.EncryptionKeyID,
		&credential.IsActive,
		&revokedAt,
		&credential.CreatedAt,
		&credential.UpdatedAt,
	)
	if err != nil {
		return domain.Credential{}, false, err
	}

	if revokedAt.Valid {
		ts := revokedAt.Time.UTC()
		credential.RevokedAt = &ts
	}

	return credential, true, nil
}

func timestamptzArg(ts *time.Time) any {
	if ts == nil {
		return nil
	}
	return *ts
}

func scanTimestamptz(ts pgtype.Timestamptz) *time.Time {
	if !ts.Valid {
		return nil
	}
	value := ts.Time.UTC()
	return &value
}
