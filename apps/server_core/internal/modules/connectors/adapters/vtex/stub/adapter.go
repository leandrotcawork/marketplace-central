package stub

import (
	"context"
	"fmt"
	"sync/atomic"

	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

var _ ports.VTEXCatalogPort = (*Adapter)(nil)

type Adapter struct {
	counter atomic.Int64
}

func NewAdapter() *Adapter {
	return &Adapter{}
}

func (a *Adapter) nextID(prefix string) string {
	n := a.counter.Add(1)
	return fmt.Sprintf("%s_stub_%d", prefix, n)
}

func (a *Adapter) FindOrCreateCategory(_ context.Context, params ports.CategoryParams) (string, error) {
	return a.nextID("cat"), nil
}

func (a *Adapter) FindOrCreateBrand(_ context.Context, params ports.BrandParams) (string, error) {
	return a.nextID("brand"), nil
}

func (a *Adapter) CreateProduct(_ context.Context, params ports.ProductParams) (string, error) {
	return a.nextID("prod"), nil
}

func (a *Adapter) CreateSKU(_ context.Context, params ports.SKUParams) (string, error) {
	return a.nextID("sku"), nil
}

func (a *Adapter) AttachSpecsAndImages(_ context.Context, params ports.SpecsImagesParams) error {
	return nil
}

func (a *Adapter) AssociateTradePolicy(_ context.Context, params ports.TradePolicyParams) error {
	return nil
}

func (a *Adapter) SetPrice(_ context.Context, params ports.PriceParams) error {
	return nil
}

func (a *Adapter) SetStock(_ context.Context, params ports.StockParams) error {
	return nil
}

func (a *Adapter) ActivateProduct(_ context.Context, params ports.ActivateParams) error {
	return nil
}

func (a *Adapter) GetProduct(_ context.Context, vtexAccount, vtexID string) (ports.ProductData, error) {
	return ports.ProductData{VTEXID: vtexID, Name: "Stub Product", Active: true}, nil
}

func (a *Adapter) GetSKU(_ context.Context, vtexAccount, vtexID string) (ports.SKUData, error) {
	return ports.SKUData{VTEXID: vtexID, Name: "Stub SKU", EAN: "7891234567890", Active: true}, nil
}

func (a *Adapter) GetCategory(_ context.Context, vtexAccount, vtexID string) (ports.CategoryData, error) {
	return ports.CategoryData{VTEXID: vtexID, Name: "Stub Category"}, nil
}

func (a *Adapter) GetBrand(_ context.Context, vtexAccount, vtexID string) (ports.BrandData, error) {
	return ports.BrandData{VTEXID: vtexID, Name: "Stub Brand"}, nil
}
