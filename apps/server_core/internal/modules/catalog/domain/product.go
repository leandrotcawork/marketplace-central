package domain

type Product struct {
	ProductID string  `json:"product_id"`
	TenantID  string  `json:"tenant_id"`
	SKU       string  `json:"sku"`
	Name      string  `json:"name"`
	Status    string  `json:"status"`
	Cost      float64 `json:"cost"`
}
