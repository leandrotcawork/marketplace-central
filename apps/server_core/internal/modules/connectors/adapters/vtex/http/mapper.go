package vtexhttp

import (
	"encoding/json"
	"fmt"
	"strconv"

	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

func toVTEXCategoryPayload(p ports.CategoryParams) vtexCategoryRequest {
	return vtexCategoryRequest{Name: p.CategoryName, IsActive: true}
}

func toVTEXBrandPayload(p ports.BrandParams) vtexBrandRequest {
	return vtexBrandRequest{Name: p.BrandName, IsActive: true}
}

func toVTEXProductPayload(p ports.ProductParams) (vtexProductRequest, error) {
	catID, err := strconv.Atoi(p.VTEXCategoryID)
	if err != nil {
		return vtexProductRequest{}, fmt.Errorf("invalid VTEXCategoryID %q: %w", p.VTEXCategoryID, err)
	}

	brandID, err := strconv.Atoi(p.VTEXBrandID)
	if err != nil {
		return vtexProductRequest{}, fmt.Errorf("invalid VTEXBrandID %q: %w", p.VTEXBrandID, err)
	}

	return vtexProductRequest{
		Name:        p.Name,
		CategoryId:  catID,
		BrandId:     brandID,
		Description: p.Description,
		RefId:       p.LocalID,
		IsVisible:   true,
		IsActive:    false,
	}, nil
}

func toVTEXSKUPayload(p ports.SKUParams) (vtexSKURequest, error) {
	prodID, err := strconv.Atoi(p.VTEXProductID)
	if err != nil {
		return vtexSKURequest{}, fmt.Errorf("invalid VTEXProductID %q: %w", p.VTEXProductID, err)
	}

	return vtexSKURequest{
		ProductId: prodID,
		Name:      p.Name,
		IsActive:  false,
		EAN:       p.EAN,
	}, nil
}

func toVTEXPricePayload(p ports.PriceParams) vtexPriceRequest {
	req := vtexPriceRequest{BasePrice: p.BasePrice}
	if p.TradePolicyID != "" {
		req.FixedPrices = []vtexFixedPrice{{
			TradePolicyId: p.TradePolicyID,
			Value:         p.BasePrice,
			MinQuantity:   1,
		}}
	}

	return req
}

func toVTEXStockPayload(p ports.StockParams) vtexStockRequest {
	return vtexStockRequest{
		UnlimitedQuantity:      false,
		Quantity:               p.Quantity,
		DateUtcOnBalanceSystem: nil,
	}
}

// fromVTEXIDResponse parses a generic {Id: int} response and returns vtexID as string.
func fromVTEXIDResponse(body []byte, label string) (string, error) {
	var resp struct {
		Id int `json:"Id"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return "", fmt.Errorf("unmarshal %s response: %w", label, err)
	}

	if resp.Id == 0 {
		return "", fmt.Errorf("%s response missing Id field", label)
	}

	return strconv.Itoa(resp.Id), nil
}

func fromVTEXProductDataResponse(body []byte) (ports.ProductData, error) {
	var resp vtexProductResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return ports.ProductData{}, fmt.Errorf("unmarshal product response: %w", err)
	}
	if resp.Id == 0 {
		return ports.ProductData{}, fmt.Errorf("product response missing Id field")
	}

	return ports.ProductData{
		VTEXID: strconv.Itoa(resp.Id),
		Name:   resp.Name,
		Active: resp.IsActive,
	}, nil
}

func fromVTEXSKUDataResponse(body []byte) (ports.SKUData, error) {
	var resp vtexSKUResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return ports.SKUData{}, fmt.Errorf("unmarshal sku response: %w", err)
	}
	if resp.Id == 0 {
		return ports.SKUData{}, fmt.Errorf("sku response missing Id field")
	}
	if resp.ProductId == 0 {
		return ports.SKUData{}, fmt.Errorf("sku response missing ProductId field")
	}

	return ports.SKUData{
		VTEXID:    strconv.Itoa(resp.Id),
		ProductID: strconv.Itoa(resp.ProductId),
		Name:      resp.Name,
		EAN:       resp.EAN,
		Active:    resp.IsActive,
	}, nil
}

func fromVTEXCategoryDataResponse(body []byte) (ports.CategoryData, error) {
	var resp vtexCategoryResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return ports.CategoryData{}, fmt.Errorf("unmarshal category response: %w", err)
	}
	if resp.Id == 0 {
		return ports.CategoryData{}, fmt.Errorf("category response missing Id field")
	}

	return ports.CategoryData{
		VTEXID: strconv.Itoa(resp.Id),
		Name:   resp.Name,
	}, nil
}

func fromVTEXBrandDataResponse(body []byte) (ports.BrandData, error) {
	var resp vtexBrandResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return ports.BrandData{}, fmt.Errorf("unmarshal brand response: %w", err)
	}
	if resp.Id == 0 {
		return ports.BrandData{}, fmt.Errorf("brand response missing Id field")
	}

	return ports.BrandData{
		VTEXID: strconv.Itoa(resp.Id),
		Name:   resp.Name,
	}, nil
}
