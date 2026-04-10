package postgres

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

var _ ports.ProviderDefinitionRepository = (*ProviderDefinitionRepository)(nil)

type providerDefinitionDB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type ProviderDefinitionRepository struct {
	db providerDefinitionDB
}

func NewProviderDefinitionRepository(pool *pgxpool.Pool) *ProviderDefinitionRepository {
	return &ProviderDefinitionRepository{db: pool}
}

func (r *ProviderDefinitionRepository) UpsertProviderDefinitions(ctx context.Context, defs []domain.ProviderDefinition) error {
	for _, def := range defs {
		metadataJSON, err := marshalJSONMap(def.Metadata)
		if err != nil {
			return err
		}
		declaredCapsJSON, err := marshalJSONStringSlice(def.DeclaredCapabilities)
		if err != nil {
			return err
		}

		_, err = r.db.Exec(ctx, `
			INSERT INTO integration_provider_definitions (
				tenant_id, provider_code, family, display_name, auth_strategy,
				install_mode, metadata_json, declared_caps_json, is_active,
				created_at, updated_at
			) VALUES (
				'system', $1, $2, $3, $4, $5, $6, $7, $8, now(), now()
			)
			ON CONFLICT (provider_code) DO UPDATE SET
				display_name = EXCLUDED.display_name,
				auth_strategy = EXCLUDED.auth_strategy,
				install_mode = EXCLUDED.install_mode,
				metadata_json = EXCLUDED.metadata_json,
				declared_caps_json = EXCLUDED.declared_caps_json,
				is_active = EXCLUDED.is_active,
				updated_at = now()
		`, def.ProviderCode, def.Family, def.DisplayName, def.AuthStrategy, def.InstallMode, metadataJSON, declaredCapsJSON, def.IsActive)
		if err != nil {
			return err
		}
	}

	return nil
}

func (r *ProviderDefinitionRepository) ListProviderDefinitions(ctx context.Context) ([]domain.ProviderDefinition, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			provider_code, tenant_id, family, display_name, auth_strategy,
			install_mode, metadata_json, declared_caps_json, is_active,
			created_at, updated_at
		FROM integration_provider_definitions
		WHERE tenant_id = 'system'
		  AND family = 'marketplace'
		  AND is_active = true
		ORDER BY provider_code
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	defs := make([]domain.ProviderDefinition, 0)
	for rows.Next() {
		var def domain.ProviderDefinition
		var metadataRaw, capsRaw []byte
		if err := rows.Scan(
			&def.ProviderCode, &def.TenantID, &def.Family, &def.DisplayName, &def.AuthStrategy,
			&def.InstallMode, &metadataRaw, &capsRaw, &def.IsActive,
			&def.CreatedAt, &def.UpdatedAt,
		); err != nil {
			return nil, err
		}

		if len(metadataRaw) > 0 {
			if err := json.Unmarshal(metadataRaw, &def.Metadata); err != nil {
				return nil, err
			}
		}
		if len(capsRaw) > 0 {
			if err := json.Unmarshal(capsRaw, &def.DeclaredCapabilities); err != nil {
				return nil, err
			}
		}

		defs = append(defs, def)
	}

	return defs, rows.Err()
}

func (r *ProviderDefinitionRepository) GetProviderDefinition(ctx context.Context, providerCode string) (domain.ProviderDefinition, bool, error) {
	var def domain.ProviderDefinition
	var metadataRaw, capsRaw []byte

	err := r.db.QueryRow(ctx, `
		SELECT
			provider_code, tenant_id, family, display_name, auth_strategy,
			install_mode, metadata_json, declared_caps_json, is_active,
			created_at, updated_at
		FROM integration_provider_definitions
		WHERE tenant_id = 'system'
		  AND provider_code = $1
		  AND family = 'marketplace'
		  AND is_active = true
	`, providerCode).Scan(
		&def.ProviderCode, &def.TenantID, &def.Family, &def.DisplayName, &def.AuthStrategy,
		&def.InstallMode, &metadataRaw, &capsRaw, &def.IsActive,
		&def.CreatedAt, &def.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ProviderDefinition{}, false, nil
		}
		return domain.ProviderDefinition{}, false, err
	}

	if len(metadataRaw) > 0 {
		if err := json.Unmarshal(metadataRaw, &def.Metadata); err != nil {
			return domain.ProviderDefinition{}, false, err
		}
	}
	if len(capsRaw) > 0 {
		if err := json.Unmarshal(capsRaw, &def.DeclaredCapabilities); err != nil {
			return domain.ProviderDefinition{}, false, err
		}
	}

	return def, true, nil
}

func marshalJSONMap(value map[string]any) ([]byte, error) {
	if value == nil {
		return []byte(`{}`), nil
	}
	return json.Marshal(value)
}

func marshalJSONStringSlice(value []string) ([]byte, error) {
	if value == nil {
		return []byte(`[]`), nil
	}
	return json.Marshal(value)
}
