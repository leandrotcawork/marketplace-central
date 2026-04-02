package vtexhttp

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

var _ ports.VTEXCatalogPort = (*Adapter)(nil)

type Adapter struct {
	client *Client
}

func NewAdapter(credentials CredentialProvider) *Adapter {
	return &Adapter{client: NewClient(credentials)}
}

func (a *Adapter) FindOrCreateCategory(ctx context.Context, params ports.CategoryParams) (string, error) {
	start := time.Now()
	payload := toVTEXCategoryPayload(params)

	_, body, err := a.client.Post(ctx, params.VTEXAccount, "/api/catalog/pvt/category", payload, retryConfigs["FindOrCreateCategory"])
	if err != nil {
		slog.Info("vtex_api_call", "action", "FindOrCreateCategory", "result", "failed", "duration_ms", time.Since(start).Milliseconds())
		return "", err
	}

	vtexID, parseErr := fromVTEXIDResponse(body, "category")
	slog.Info("vtex_api_call", "action", "FindOrCreateCategory", "result", resultStr(parseErr), "duration_ms", time.Since(start).Milliseconds())
	return vtexID, parseErr
}

func (a *Adapter) FindOrCreateBrand(ctx context.Context, params ports.BrandParams) (string, error) {
	start := time.Now()
	payload := toVTEXBrandPayload(params)

	_, body, err := a.client.Post(ctx, params.VTEXAccount, "/api/catalog/pvt/brand", payload, retryConfigs["FindOrCreateBrand"])
	if err != nil {
		slog.Info("vtex_api_call", "action", "FindOrCreateBrand", "result", "failed", "duration_ms", time.Since(start).Milliseconds())
		return "", err
	}

	vtexID, parseErr := fromVTEXIDResponse(body, "brand")
	slog.Info("vtex_api_call", "action", "FindOrCreateBrand", "result", resultStr(parseErr), "duration_ms", time.Since(start).Milliseconds())
	return vtexID, parseErr
}

func (a *Adapter) CreateProduct(ctx context.Context, params ports.ProductParams) (string, error) {
	start := time.Now()
	payload, err := toVTEXProductPayload(params)
	if err != nil {
		slog.Info("vtex_api_call", "action", "CreateProduct", "result", "failed", "duration_ms", time.Since(start).Milliseconds())
		return "", err
	}

	_, body, err := a.client.Post(ctx, params.VTEXAccount, "/api/catalog/pvt/product", payload, retryConfigs["CreateProduct"])
	if err != nil {
		slog.Info("vtex_api_call", "action", "CreateProduct", "result", "failed", "duration_ms", time.Since(start).Milliseconds())
		return "", err
	}

	vtexID, parseErr := fromVTEXIDResponse(body, "product")
	slog.Info("vtex_api_call", "action", "CreateProduct", "result", resultStr(parseErr), "duration_ms", time.Since(start).Milliseconds())
	return vtexID, parseErr
}

func (a *Adapter) CreateSKU(ctx context.Context, params ports.SKUParams) (string, error) {
	start := time.Now()
	payload, err := toVTEXSKUPayload(params)
	if err != nil {
		slog.Info("vtex_api_call", "action", "CreateSKU", "result", "failed", "duration_ms", time.Since(start).Milliseconds())
		return "", err
	}

	_, body, err := a.client.Post(ctx, params.VTEXAccount, "/api/catalog/pvt/stockkeepingunit", payload, retryConfigs["CreateSKU"])
	if err != nil {
		slog.Info("vtex_api_call", "action", "CreateSKU", "result", "failed", "duration_ms", time.Since(start).Milliseconds())
		return "", err
	}

	vtexID, parseErr := fromVTEXIDResponse(body, "sku")
	slog.Info("vtex_api_call", "action", "CreateSKU", "result", resultStr(parseErr), "duration_ms", time.Since(start).Milliseconds())
	return vtexID, parseErr
}

func (a *Adapter) AttachSpecsAndImages(ctx context.Context, params ports.SpecsImagesParams) error {
	start := time.Now()

	for i, url := range params.ImageURLs {
		payload := vtexImageRequest{
			IsMain: i == 0,
			Label:  fmt.Sprintf("image_%d", i+1),
			Name:   fmt.Sprintf("image_%d", i+1),
			Url:    url,
		}

		path := fmt.Sprintf("/api/catalog/pvt/stockkeepingunit/%s/file", params.VTEXSKUID)
		_, _, err := a.client.Post(ctx, params.VTEXAccount, path, payload, retryConfigs["AttachSpecsAndImages"])
		if err != nil {
			slog.Info("vtex_api_call", "action", "AttachSpecsAndImages", "result", "failed", "duration_ms", time.Since(start).Milliseconds(), "image_count", len(params.ImageURLs))
			return err
		}
	}

	slog.Info("vtex_api_call", "action", "AttachSpecsAndImages", "result", "succeeded", "duration_ms", time.Since(start).Milliseconds(), "image_count", len(params.ImageURLs))
	return nil
}

func (a *Adapter) AssociateTradePolicy(ctx context.Context, params ports.TradePolicyParams) error {
	start := time.Now()
	path := fmt.Sprintf("/api/catalog/pvt/product/%s/salespolicy/%s", params.VTEXProductID, params.TradePolicyID)

	_, _, err := a.client.Post(ctx, params.VTEXAccount, path, nil, retryConfigs["AssociateTradePolicy"])
	slog.Info("vtex_api_call", "action", "AssociateTradePolicy", "result", resultStr(err), "duration_ms", time.Since(start).Milliseconds())
	return err
}

func (a *Adapter) SetPrice(ctx context.Context, params ports.PriceParams) error {
	start := time.Now()
	payload := toVTEXPricePayload(params)
	path := fmt.Sprintf("/api/pricing/prices/%s", params.VTEXSKUID)

	_, _, err := a.client.Put(ctx, params.VTEXAccount, path, payload, retryConfigs["SetPrice"])
	slog.Info("vtex_api_call", "action", "SetPrice", "result", resultStr(err), "duration_ms", time.Since(start).Milliseconds())
	return err
}

func (a *Adapter) SetStock(ctx context.Context, params ports.StockParams) error {
	start := time.Now()
	payload := toVTEXStockPayload(params)
	path := fmt.Sprintf("/api/logistics/pvt/inventory/skus/%s/warehouses/%s", params.VTEXSKUID, params.WarehouseID)

	_, _, err := a.client.Put(ctx, params.VTEXAccount, path, payload, retryConfigs["SetStock"])
	slog.Info("vtex_api_call", "action", "SetStock", "result", resultStr(err), "duration_ms", time.Since(start).Milliseconds())
	return err
}

func (a *Adapter) ActivateProduct(ctx context.Context, params ports.ActivateParams) error {
	start := time.Now()
	path := fmt.Sprintf("/api/catalog/pvt/product/%s", params.VTEXProductID)
	payload := vtexProductUpdateRequest{IsActive: true}

	_, _, err := a.client.Put(ctx, params.VTEXAccount, path, payload, retryConfigs["ActivateProduct"])
	slog.Info("vtex_api_call", "action", "ActivateProduct", "result", resultStr(err), "duration_ms", time.Since(start).Milliseconds())
	return err
}

func (a *Adapter) GetProduct(ctx context.Context, vtexAccount, vtexID string) (ports.ProductData, error) {
	start := time.Now()
	path := fmt.Sprintf("/api/catalog/pvt/product/%s", vtexID)

	_, body, err := a.client.Get(ctx, vtexAccount, path, retryConfigs["GetProduct"])
	if err != nil {
		slog.Info("vtex_api_call", "action", "GetProduct", "result", "failed", "duration_ms", time.Since(start).Milliseconds())
		return ports.ProductData{}, err
	}

	product, parseErr := fromVTEXProductDataResponse(body)
	slog.Info("vtex_api_call", "action", "GetProduct", "result", resultStr(parseErr), "duration_ms", time.Since(start).Milliseconds())
	return product, parseErr
}

func (a *Adapter) GetSKU(ctx context.Context, vtexAccount, vtexID string) (ports.SKUData, error) {
	start := time.Now()
	path := fmt.Sprintf("/api/catalog/pvt/stockkeepingunit/%s", vtexID)

	_, body, err := a.client.Get(ctx, vtexAccount, path, retryConfigs["GetSKU"])
	if err != nil {
		slog.Info("vtex_api_call", "action", "GetSKU", "result", "failed", "duration_ms", time.Since(start).Milliseconds())
		return ports.SKUData{}, err
	}

	sku, parseErr := fromVTEXSKUDataResponse(body)
	slog.Info("vtex_api_call", "action", "GetSKU", "result", resultStr(parseErr), "duration_ms", time.Since(start).Milliseconds())
	return sku, parseErr
}

func (a *Adapter) GetCategory(ctx context.Context, vtexAccount, vtexID string) (ports.CategoryData, error) {
	start := time.Now()
	path := fmt.Sprintf("/api/catalog/pvt/category/%s", vtexID)

	_, body, err := a.client.Get(ctx, vtexAccount, path, retryConfigs["GetCategory"])
	if err != nil {
		slog.Info("vtex_api_call", "action", "GetCategory", "result", "failed", "duration_ms", time.Since(start).Milliseconds())
		return ports.CategoryData{}, err
	}

	category, parseErr := fromVTEXCategoryDataResponse(body)
	slog.Info("vtex_api_call", "action", "GetCategory", "result", resultStr(parseErr), "duration_ms", time.Since(start).Milliseconds())
	return category, parseErr
}

func (a *Adapter) GetBrand(ctx context.Context, vtexAccount, vtexID string) (ports.BrandData, error) {
	start := time.Now()
	path := fmt.Sprintf("/api/catalog/pvt/brand/%s", vtexID)

	_, body, err := a.client.Get(ctx, vtexAccount, path, retryConfigs["GetBrand"])
	if err != nil {
		slog.Info("vtex_api_call", "action", "GetBrand", "result", "failed", "duration_ms", time.Since(start).Milliseconds())
		return ports.BrandData{}, err
	}

	brand, parseErr := fromVTEXBrandDataResponse(body)
	slog.Info("vtex_api_call", "action", "GetBrand", "result", resultStr(parseErr), "duration_ms", time.Since(start).Milliseconds())
	return brand, parseErr
}

func resultStr(err error) string {
	if err != nil {
		return "failed"
	}

	return "succeeded"
}
