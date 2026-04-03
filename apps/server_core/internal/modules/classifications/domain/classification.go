package domain

import "time"

type Classification struct {
	ClassificationID string    `json:"classification_id"`
	TenantID         string    `json:"tenant_id"`
	Name             string    `json:"name"`
	AIContext        string    `json:"ai_context"`
	ProductIDs       []string  `json:"product_ids"`
	ProductCount     int       `json:"product_count"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}
