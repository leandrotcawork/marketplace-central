package domain

import "time"

// FeeSchedule represents one commission rate row for a marketplace + category.
type FeeSchedule struct {
	ID                string
	MarketplaceCode   string
	CategoryID        string
	ListingType       string // empty string = not applicable
	CommissionPercent float64
	FixedFeeAmount    float64
	Notes             string
	Source            string // "api_sync" | "seeded" | "manual"
	SyncedAt          time.Time
}
