package domain

import "time"

type VTEXEntityMapping struct {
	MappingID   string    `json:"mapping_id"`
	TenantID    string    `json:"tenant_id"`
	VTEXAccount string    `json:"vtex_account"`
	EntityType  string    `json:"entity_type"`
	LocalID     string    `json:"local_id"`
	VTEXID      string    `json:"vtex_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

const (
	EntityTypeCategory = "category"
	EntityTypeBrand    = "brand"
	EntityTypeProduct  = "product"
	EntityTypeSKU      = "sku"
)
