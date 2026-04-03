package domain

type Product struct {
	ProductID      string   `json:"product_id"`
	SKU            string   `json:"sku"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	BrandName      string   `json:"brand_name"`
	Status         string   `json:"status"`
	CostAmount     float64  `json:"cost_amount"`
	PriceAmount    float64  `json:"price_amount"`
	StockQuantity  float64  `json:"stock_quantity"`
	EAN            string   `json:"ean"`
	Reference      string   `json:"reference"`
	TaxonomyNodeID string   `json:"taxonomy_node_id"`
	TaxonomyName   string   `json:"taxonomy_name"`
	SuggestedPrice *float64 `json:"suggested_price"`
	HeightCM       *float64 `json:"height_cm"`
	WidthCM        *float64 `json:"width_cm"`
	LengthCM       *float64 `json:"length_cm"`
}

type TaxonomyNode struct {
	NodeID       string `json:"node_id"`
	Name         string `json:"name"`
	Level        int    `json:"level"`
	LevelLabel   string `json:"level_label"`
	ParentNodeID string `json:"parent_node_id"`
	IsActive     bool   `json:"is_active"`
	ProductCount int    `json:"product_count"`
}

type ProductEnrichment struct {
	ProductID            string   `json:"product_id"`
	TenantID             string   `json:"tenant_id"`
	HeightCM             *float64 `json:"height_cm"`
	WidthCM              *float64 `json:"width_cm"`
	LengthCM             *float64 `json:"length_cm"`
	SuggestedPriceAmount *float64 `json:"suggested_price_amount"`
}
