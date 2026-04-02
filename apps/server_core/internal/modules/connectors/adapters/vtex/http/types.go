package vtexhttp

type vtexCategoryRequest struct {
	Name     string `json:"Name"`
	IsActive bool   `json:"IsActive"`
}

type vtexBrandRequest struct {
	Name     string `json:"Name"`
	IsActive bool   `json:"IsActive"`
}

type vtexProductRequest struct {
	Name        string `json:"Name"`
	CategoryId  int    `json:"CategoryId"`
	BrandId     int    `json:"BrandId"`
	Description string `json:"Description"`
	IsVisible   bool   `json:"IsVisible"`
	IsActive    bool   `json:"IsActive"`
}

type vtexSKURequest struct {
	ProductId int    `json:"ProductId"`
	Name      string `json:"Name"`
	IsActive  bool   `json:"IsActive"`
	EAN       string `json:"Ean"`
}

type vtexImageRequest struct {
	IsMain bool   `json:"IsMain"`
	Label  string `json:"Label"`
	Name   string `json:"Name"`
	Url    string `json:"Url"`
}

type vtexPriceRequest struct {
	Markup      float64          `json:"markup"`
	ListPrice   *float64         `json:"listPrice"`
	BasePrice   float64          `json:"basePrice"`
	FixedPrices []vtexFixedPrice `json:"fixedPrices,omitempty"`
}

type vtexFixedPrice struct {
	TradePolicyId string  `json:"tradePolicyId"`
	Value         float64 `json:"value"`
	MinQuantity   int     `json:"minQuantity"`
}

type vtexStockRequest struct {
	UnlimitedQuantity bool `json:"unlimitedQuantity"`
	Quantity          int  `json:"quantity"`
}

type vtexProductUpdateRequest struct {
	IsActive bool `json:"IsActive"`
}

type vtexCategoryResponse struct {
	Id   int    `json:"Id"`
	Name string `json:"Name"`
}

type vtexBrandResponse struct {
	Id   int    `json:"Id"`
	Name string `json:"Name"`
}

type vtexProductResponse struct {
	Id       int    `json:"Id"`
	Name     string `json:"Name"`
	IsActive bool   `json:"IsActive"`
}

type vtexSKUResponse struct {
	Id        int    `json:"Id"`
	ProductId int    `json:"ProductId"`
	Name      string `json:"Name"`
	EAN       string `json:"Ean"`
	IsActive  bool   `json:"IsActive"`
}

type vtexErrorResponse struct {
	Message string `json:"Message"`
	Error   string `json:"error"`
}
