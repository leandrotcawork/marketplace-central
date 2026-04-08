package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

var _ ports.FeeScheduleRepository = (*FeeScheduleRepository)(nil)

type FeeScheduleRepository struct {
	pool *pgxpool.Pool
}

func NewFeeScheduleRepository(pool *pgxpool.Pool) *FeeScheduleRepository {
	return &FeeScheduleRepository{pool: pool}
}

func (r *FeeScheduleRepository) UpsertDefinitions(ctx context.Context, defs []domain.MarketplaceDefinition) error {
	for _, d := range defs {
		caps := d.Capabilities
		if caps == nil {
			caps = []string{}
		}
		schema, err := json.Marshal(d.CredentialSchema)
		if err != nil {
			return err
		}
		_, err = r.pool.Exec(ctx, `
			INSERT INTO marketplace_definitions
				(marketplace_code, display_name, fee_source, capabilities, credential_schema, active)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (marketplace_code) DO UPDATE SET
				display_name      = EXCLUDED.display_name,
				fee_source        = EXCLUDED.fee_source,
				capabilities      = EXCLUDED.capabilities,
				credential_schema = EXCLUDED.credential_schema,
				active            = EXCLUDED.active
		`, d.MarketplaceCode, d.DisplayName, d.FeeSource, caps, schema, d.Active)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *FeeScheduleRepository) ListDefinitions(ctx context.Context) ([]domain.MarketplaceDefinition, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT marketplace_code, display_name, fee_source, capabilities, credential_schema, active
		FROM marketplace_definitions
		WHERE active = true
		ORDER BY marketplace_code
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var defs []domain.MarketplaceDefinition
	for rows.Next() {
		var d domain.MarketplaceDefinition
		var schemaRaw []byte
		if err := rows.Scan(&d.MarketplaceCode, &d.DisplayName, &d.FeeSource, &d.Capabilities, &schemaRaw, &d.Active); err != nil {
			return nil, err
		}
		if len(schemaRaw) > 0 {
			if err := json.Unmarshal(schemaRaw, &d.CredentialSchema); err != nil {
				return nil, err
			}
		}
		defs = append(defs, d)
	}
	return defs, rows.Err()
}

func (r *FeeScheduleRepository) UpsertSchedules(ctx context.Context, schedules []domain.FeeSchedule) error {
	for _, s := range schedules {
		var listingType *string
		if s.ListingType != "" {
			listingType = &s.ListingType
		}
		_, err := r.pool.Exec(ctx, `
			INSERT INTO marketplace_fee_schedules
				(marketplace_code, category_id, listing_type, commission_percent,
				 fixed_fee_amount, notes, source, synced_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, now())
			ON CONFLICT (marketplace_code, category_id, listing_type) DO UPDATE SET
				commission_percent = EXCLUDED.commission_percent,
				fixed_fee_amount   = EXCLUDED.fixed_fee_amount,
				notes              = EXCLUDED.notes,
				source             = EXCLUDED.source,
				synced_at          = now()
		`, s.MarketplaceCode, s.CategoryID, listingType,
			s.CommissionPercent, s.FixedFeeAmount, s.Notes, s.Source)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *FeeScheduleRepository) LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (domain.FeeSchedule, bool, error) {
	var s domain.FeeSchedule
	var lt *string
	var syncedAt time.Time

	// Single query covers the full fallback matrix in one round-trip.
	// Priority (ORDER BY): exact category > "default"; exact listing_type > NULL catch-all.
	// When listingType="" only IS NULL rows are valid (caller has no listing type).
	// valid_from/valid_to enforce date-window correctness.
	err := r.pool.QueryRow(ctx, `
		SELECT id, marketplace_code, category_id, COALESCE(listing_type, ''),
		       commission_percent, fixed_fee_amount, COALESCE(notes, ''), source, synced_at
		FROM marketplace_fee_schedules
		WHERE marketplace_code = $1
		  AND (category_id = $2 OR category_id = 'default')
		  AND (
		        listing_type IS NULL
		    OR  ($3 <> '' AND listing_type = $3)
		  )
		  AND (valid_from IS NULL OR valid_from <= current_date)
		  AND (valid_to   IS NULL OR valid_to   >= current_date)
		ORDER BY
		  (category_id = $2)          DESC,  -- exact category before 'default'
		  (listing_type IS NOT NULL)   DESC   -- exact listing_type before NULL catch-all
		LIMIT 1
	`, marketplaceCode, categoryID, listingType).Scan(
		&s.ID, &s.MarketplaceCode, &s.CategoryID, &lt,
		&s.CommissionPercent, &s.FixedFeeAmount, &s.Notes, &s.Source, &syncedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.FeeSchedule{}, false, nil
		}
		return domain.FeeSchedule{}, false, err
	}
	if lt != nil {
		s.ListingType = *lt
	}
	s.SyncedAt = syncedAt
	return s, true, nil
}

func (r *FeeScheduleRepository) ListByMarketplace(ctx context.Context, marketplaceCode string) ([]domain.FeeSchedule, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, marketplace_code, category_id, COALESCE(listing_type, ''),
		       commission_percent, fixed_fee_amount, COALESCE(notes, ''), source, synced_at
		FROM marketplace_fee_schedules
		WHERE marketplace_code = $1
		  AND (valid_to IS NULL OR valid_to >= current_date)
		ORDER BY category_id, listing_type
	`, marketplaceCode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var schedules []domain.FeeSchedule
	for rows.Next() {
		var s domain.FeeSchedule
		var lt *string
		var syncedAt time.Time
		if err := rows.Scan(&s.ID, &s.MarketplaceCode, &s.CategoryID, &lt,
			&s.CommissionPercent, &s.FixedFeeAmount, &s.Notes, &s.Source, &syncedAt); err != nil {
			return nil, err
		}
		if lt != nil {
			s.ListingType = *lt
		}
		s.SyncedAt = syncedAt
		schedules = append(schedules, s)
	}
	return schedules, rows.Err()
}

func (r *FeeScheduleRepository) HasSchedules(ctx context.Context, marketplaceCode string) (bool, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM marketplace_fee_schedules WHERE marketplace_code = $1
	`, marketplaceCode).Scan(&count)
	return count > 0, err
}
