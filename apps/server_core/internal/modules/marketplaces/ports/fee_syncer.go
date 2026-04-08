package ports

import "context"

// FeeScheduleSyncer is implemented by each marketplace connector adapter.
// For API-based marketplaces it calls the live fee API.
// For static-table marketplaces it returns curated seed rows.
type FeeScheduleSyncer interface {
	// MarketplaceCode returns the code this syncer is responsible for.
	MarketplaceCode() string

	// Sync fetches or generates the latest fee schedules and upserts them
	// via the provided repository. Returns the number of rows upserted.
	Sync(ctx context.Context, repo FeeScheduleRepository) (int, error)
}
