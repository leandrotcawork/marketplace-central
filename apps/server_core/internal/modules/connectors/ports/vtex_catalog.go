package ports

import "context"

type CategoryParams struct {
	VTEXAccount  string
	CategoryName string
	LocalID      string
}

type BrandParams struct {
	VTEXAccount string
	BrandName   string
	LocalID     string
}

type ProductParams struct {
	VTEXAccount    string
	VTEXCategoryID string
	VTEXBrandID    string
	Name           string
	Description    string
	LocalID        string
}

type SKUParams struct {
	VTEXAccount   string
	VTEXProductID string
	Name          string
	EAN           string
	LocalID       string
}

type SpecsImagesParams struct {
	VTEXAccount string
	VTEXSKUID   string
	ImageURLs   []string
	Specs       map[string]string
}

type TradePolicyParams struct {
	VTEXAccount   string
	VTEXProductID string
	TradePolicyID string
}

type PriceParams struct {
	VTEXAccount   string
	VTEXSKUID     string
	BasePrice     float64
	TradePolicyID string
}

type StockParams struct {
	VTEXAccount string
	VTEXSKUID   string
	WarehouseID string
	Quantity    int
}

type ActivateParams struct {
	VTEXAccount   string
	VTEXProductID string
	VTEXSKUID     string
}

type ProductData struct {
	VTEXID string
	Name   string
	Active bool
}

type SKUData struct {
	VTEXID    string
	Name      string
	EAN       string
	Active    bool
	ProductID string
}

type CategoryData struct {
	VTEXID string
	Name   string
}

type BrandData struct {
	VTEXID string
	Name   string
}

type VTEXCatalogPort interface {
	FindOrCreateCategory(ctx context.Context, params CategoryParams) (vtexID string, err error)
	FindOrCreateBrand(ctx context.Context, params BrandParams) (vtexID string, err error)

	CreateProduct(ctx context.Context, params ProductParams) (vtexID string, err error)
	CreateSKU(ctx context.Context, params SKUParams) (vtexID string, err error)
	AttachSpecsAndImages(ctx context.Context, params SpecsImagesParams) error
	AssociateTradePolicy(ctx context.Context, params TradePolicyParams) error
	SetPrice(ctx context.Context, params PriceParams) error
	SetStock(ctx context.Context, params StockParams) error
	ActivateProduct(ctx context.Context, params ActivateParams) error

	GetProduct(ctx context.Context, vtexAccount, vtexID string) (ProductData, error)
	GetSKU(ctx context.Context, vtexAccount, vtexID string) (SKUData, error)
	GetCategory(ctx context.Context, vtexAccount, vtexID string) (CategoryData, error)
	GetBrand(ctx context.Context, vtexAccount, vtexID string) (BrandData, error)
}
