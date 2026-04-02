//go:build integration

package integration

import (
	"context"
	"os"
	"testing"

	vtexhttp "marketplace-central/apps/server_core/internal/modules/connectors/adapters/vtex/http"
	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

func newTestAdapter(t *testing.T) *vtexhttp.Adapter {
	t.Helper()

	appKey := os.Getenv("VTEX_APP_KEY")
	appToken := os.Getenv("VTEX_APP_TOKEN")
	vtexAccount := os.Getenv("VTEX_ACCOUNT")
	if appKey == "" || appToken == "" || vtexAccount == "" {
		t.Skip("VTEX_APP_KEY, VTEX_APP_TOKEN, VTEX_ACCOUNT not set - skipping integration test")
	}

	creds, err := vtexhttp.NewEnvCredentialProvider()
	if err != nil {
		t.Fatalf("credential provider: %v", err)
	}

	return vtexhttp.NewAdapter(creds)
}

func TestStep01_CreateCategory(t *testing.T) {
	adapter := newTestAdapter(t)

	vtexID, err := adapter.FindOrCreateCategory(context.Background(), ports.CategoryParams{
		VTEXAccount:  os.Getenv("VTEX_ACCOUNT"),
		CategoryName: "MPC Test Category",
		LocalID:      "test_cat_001",
	})
	if err != nil {
		t.Fatalf("FindOrCreateCategory failed: %v", err)
	}

	t.Logf("SUCCESS - category VTEX ID: %s  (set TEST_VTEX_CATEGORY_ID=%s)", vtexID, vtexID)
}

func TestStep02_CreateBrand(t *testing.T) {
	adapter := newTestAdapter(t)

	vtexID, err := adapter.FindOrCreateBrand(context.Background(), ports.BrandParams{
		VTEXAccount: os.Getenv("VTEX_ACCOUNT"),
		BrandName:   "MPC Test Brand",
		LocalID:     "test_brand_001",
	})
	if err != nil {
		t.Fatalf("FindOrCreateBrand failed: %v", err)
	}

	t.Logf("SUCCESS - brand VTEX ID: %s  (set TEST_VTEX_BRAND_ID=%s)", vtexID, vtexID)
}

func TestStep03_CreateProduct(t *testing.T) {
	adapter := newTestAdapter(t)

	categoryID := os.Getenv("TEST_VTEX_CATEGORY_ID")
	brandID := os.Getenv("TEST_VTEX_BRAND_ID")
	if categoryID == "" || brandID == "" {
		t.Skip("Set TEST_VTEX_CATEGORY_ID and TEST_VTEX_BRAND_ID from previous steps")
	}

	vtexID, err := adapter.CreateProduct(context.Background(), ports.ProductParams{
		VTEXAccount:    os.Getenv("VTEX_ACCOUNT"),
		VTEXCategoryID: categoryID,
		VTEXBrandID:    brandID,
		Name:           "MPC Test Product",
		Description:    "Integration test product created by Marketplace Central",
		LocalID:        "test_prod_001",
	})
	if err != nil {
		t.Fatalf("CreateProduct failed: %v", err)
	}

	t.Logf("SUCCESS - product VTEX ID: %s  (set TEST_VTEX_PRODUCT_ID=%s)", vtexID, vtexID)
}

func TestStep04_CreateSKU(t *testing.T) {
	adapter := newTestAdapter(t)

	productID := os.Getenv("TEST_VTEX_PRODUCT_ID")
	if productID == "" {
		t.Skip("Set TEST_VTEX_PRODUCT_ID from TestStep03")
	}

	vtexID, err := adapter.CreateSKU(context.Background(), ports.SKUParams{
		VTEXAccount:   os.Getenv("VTEX_ACCOUNT"),
		VTEXProductID: productID,
		Name:          "MPC Test SKU",
		EAN:           "7891234567890",
		LocalID:       "test_sku_001",
	})
	if err != nil {
		t.Fatalf("CreateSKU failed: %v", err)
	}

	t.Logf("SUCCESS - SKU VTEX ID: %s  (set TEST_VTEX_SKU_ID=%s)", vtexID, vtexID)
}

func TestStep05_AttachImages(t *testing.T) {
	adapter := newTestAdapter(t)

	skuID := os.Getenv("TEST_VTEX_SKU_ID")
	if skuID == "" {
		t.Skip("Set TEST_VTEX_SKU_ID from TestStep04")
	}

	err := adapter.AttachSpecsAndImages(context.Background(), ports.SpecsImagesParams{
		VTEXAccount: os.Getenv("VTEX_ACCOUNT"),
		VTEXSKUID:   skuID,
		ImageURLs:   []string{"https://via.placeholder.com/500x500.png"},
		Specs:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("AttachSpecsAndImages failed: %v", err)
	}

	t.Log("SUCCESS - image attached")
}

func TestStep06_AssociateTradePolicy(t *testing.T) {
	adapter := newTestAdapter(t)

	productID := os.Getenv("TEST_VTEX_PRODUCT_ID")
	if productID == "" {
		t.Skip("Set TEST_VTEX_PRODUCT_ID from TestStep03")
	}

	err := adapter.AssociateTradePolicy(context.Background(), ports.TradePolicyParams{
		VTEXAccount:   os.Getenv("VTEX_ACCOUNT"),
		VTEXProductID: productID,
		TradePolicyID: "1",
	})
	if err != nil {
		t.Fatalf("AssociateTradePolicy failed: %v", err)
	}

	t.Log("SUCCESS - trade policy associated")
}

func TestStep07_SetPrice(t *testing.T) {
	adapter := newTestAdapter(t)

	skuID := os.Getenv("TEST_VTEX_SKU_ID")
	if skuID == "" {
		t.Skip("Set TEST_VTEX_SKU_ID from TestStep04")
	}

	err := adapter.SetPrice(context.Background(), ports.PriceParams{
		VTEXAccount: os.Getenv("VTEX_ACCOUNT"),
		VTEXSKUID:   skuID,
		BasePrice:   99.90,
	})
	if err != nil {
		t.Fatalf("SetPrice failed: %v", err)
	}

	t.Log("SUCCESS - price set to 99.90")
}

func TestStep08_SetStock(t *testing.T) {
	adapter := newTestAdapter(t)

	skuID := os.Getenv("TEST_VTEX_SKU_ID")
	if skuID == "" {
		t.Skip("Set TEST_VTEX_SKU_ID from TestStep04")
	}

	err := adapter.SetStock(context.Background(), ports.StockParams{
		VTEXAccount: os.Getenv("VTEX_ACCOUNT"),
		VTEXSKUID:   skuID,
		WarehouseID: "1_1",
		Quantity:    10,
	})
	if err != nil {
		t.Fatalf("SetStock failed: %v", err)
	}

	t.Log("SUCCESS - stock set to 10 units")
}

func TestStep09_ActivateProduct(t *testing.T) {
	adapter := newTestAdapter(t)

	productID := os.Getenv("TEST_VTEX_PRODUCT_ID")
	skuID := os.Getenv("TEST_VTEX_SKU_ID")
	if productID == "" || skuID == "" {
		t.Skip("Set TEST_VTEX_PRODUCT_ID and TEST_VTEX_SKU_ID from previous steps")
	}

	err := adapter.ActivateProduct(context.Background(), ports.ActivateParams{
		VTEXAccount:   os.Getenv("VTEX_ACCOUNT"),
		VTEXProductID: productID,
		VTEXSKUID:     skuID,
	})
	if err != nil {
		t.Fatalf("ActivateProduct failed: %v", err)
	}

	t.Log("SUCCESS - product activated")
}

func TestStep10_GetProduct(t *testing.T) {
	adapter := newTestAdapter(t)

	productID := os.Getenv("TEST_VTEX_PRODUCT_ID")
	if productID == "" {
		t.Skip("Set TEST_VTEX_PRODUCT_ID from TestStep03")
	}

	data, err := adapter.GetProduct(context.Background(), os.Getenv("VTEX_ACCOUNT"), productID)
	if err != nil {
		t.Fatalf("GetProduct failed: %v", err)
	}

	t.Logf("SUCCESS - product: ID=%s Name=%s Active=%v", data.VTEXID, data.Name, data.Active)
}
