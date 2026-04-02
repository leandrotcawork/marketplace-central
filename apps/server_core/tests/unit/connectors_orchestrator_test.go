package unit

import (
	"context"
	"fmt"
	"testing"
	"time"

	app "marketplace-central/apps/server_core/internal/modules/connectors/application"
	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
)

func TestBatchOrchestratorPreflightRejectsMissingFields(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		{
			ProductID:     "prod_1",
			Name:          "Valid Product",
			Description:   "A valid product",
			SKUName:       "Valid SKU",
			EAN:           "1111111111111",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          50.0,
			BasePrice:     99.90,
			ImageURLs:     []string{},
			Specs:         map[string]string{},
			StockQty:      10,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
		{
			ProductID:     "prod_2",
			Name:          "", // missing name
			Description:   "Missing name product",
			SKUName:       "SKU 2",
			EAN:           "2222222222222",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          30.0,
			BasePrice:     59.90,
			ImageURLs:     []string{},
			Specs:         map[string]string{},
			StockQty:      5,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
		{
			ProductID:     "prod_3",
			Name:          "Missing SKU Product",
			Description:   "Missing SKU product",
			SKUName:       "", // missing SKU
			EAN:           "3333333333333",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          20.0,
			BasePrice:     39.90,
			ImageURLs:     []string{},
			Specs:         map[string]string{},
			StockQty:      3,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
	}

	result, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("expected no error from CreateBatch, got %v", err)
	}

	if result.TotalProducts != 3 {
		t.Errorf("expected TotalProducts=3, got %d", result.TotalProducts)
	}
	if result.Validated != 1 {
		t.Errorf("expected Validated=1, got %d", result.Validated)
	}
	if len(result.Rejections) != 2 {
		t.Fatalf("expected 2 rejections, got %d", len(result.Rejections))
	}

	// prod_2 is the missing-name one, should appear first
	if result.Rejections[0].ProductID != "prod_2" {
		t.Errorf("expected first rejection ProductID=prod_2, got %s", result.Rejections[0].ProductID)
	}
}

func TestBatchOrchestratorRejectsActiveOperation(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	// Pre-seed an active operation for prod_1
	repo.operations["existing_op"] = domain.PublicationOperation{
		OperationID: "existing_op",
		BatchID:     "old_batch",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		ProductID:   "prod_1",
		Status:      domain.OperationStatusInProgress,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		{
			ProductID:     "prod_1",
			Name:          "Already Active",
			Description:   "This product has an active operation",
			SKUName:       "Active SKU",
			EAN:           "4444444444444",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          50.0,
			BasePrice:     99.90,
			ImageURLs:     []string{},
			Specs:         map[string]string{},
			StockQty:      5,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
	}

	result, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("expected no error from CreateBatch, got %v", err)
	}

	if result.Validated != 0 {
		t.Errorf("expected Validated=0, got %d", result.Validated)
	}
	if len(result.Rejections) != 1 {
		t.Fatalf("expected 1 rejection, got %d", len(result.Rejections))
	}
	if result.Rejections[0].ErrorCode != "CONNECTORS_PUBLISH_ALREADY_IN_PROGRESS" {
		t.Errorf("expected error code CONNECTORS_PUBLISH_ALREADY_IN_PROGRESS, got %s", result.Rejections[0].ErrorCode)
	}
}

func TestBatchOrchestratorExecutesBatchSuccessfully(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		{
			ProductID:     "prod_bosch",
			Name:          "Bosch Drill",
			Description:   "A Bosch drill",
			SKUName:       "Bosch Drill SKU",
			EAN:           "5555555555555",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          200.0,
			BasePrice:     399.90,
			ImageURLs:     []string{"https://example.com/bosch.jpg"},
			Specs:         map[string]string{"voltage": "220V"},
			StockQty:      10,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
		{
			ProductID:     "prod_dewalt",
			Name:          "DeWalt Saw",
			Description:   "A DeWalt saw",
			SKUName:       "DeWalt Saw SKU",
			EAN:           "6666666666666",
			Category:      "Ferramentas",
			Brand:         "DeWalt",
			Cost:          300.0,
			BasePrice:     599.90,
			ImageURLs:     []string{"https://example.com/dewalt.jpg"},
			Specs:         map[string]string{"voltage": "110V"},
			StockQty:      5,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
	}

	createResult, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("CreateBatch error: %v", err)
	}
	if createResult.Validated != 2 {
		t.Fatalf("expected Validated=2, got %d", createResult.Validated)
	}

	err = orch.ExecuteBatch(context.Background(), createResult.BatchID, "mystore", products)
	if err != nil {
		t.Fatalf("ExecuteBatch error: %v", err)
	}

	batch, ops, err := orch.GetBatchStatus(context.Background(), createResult.BatchID)
	if err != nil {
		t.Fatalf("GetBatchStatus error: %v", err)
	}
	if batch.SucceededCount != 2 {
		t.Errorf("expected SucceededCount=2, got %d", batch.SucceededCount)
	}
	if batch.FailedCount != 0 {
		t.Errorf("expected FailedCount=0, got %d", batch.FailedCount)
	}

	// Verify each individual operation reached succeeded status.
	for _, op := range ops {
		if op.Status != domain.OperationStatusSucceeded {
			t.Errorf("expected op %s to be succeeded, got %q", op.ProductID, op.Status)
		}
	}

	// Verify category and brand mappings were saved
	if repo.mappings["mystore|category|Ferramentas"] == nil {
		t.Error("expected mapping for mystore|category|Ferramentas to exist")
	}
	if repo.mappings["mystore|brand|Bosch"] == nil {
		t.Error("expected mapping for mystore|brand|Bosch to exist")
	}
	if repo.mappings["mystore|brand|DeWalt"] == nil {
		t.Error("expected mapping for mystore|brand|DeWalt to exist")
	}
}

func TestBatchOrchestratorCreateBatchUsesTransaction(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		{
			ProductID:     "prod_tx_1",
			Name:          "Product One",
			Description:   "First product",
			SKUName:       "SKU One",
			EAN:           "8888888888881",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          100.0,
			BasePrice:     199.90,
			ImageURLs:     []string{"https://example.com/one.jpg"},
			Specs:         map[string]string{"voltage": "220V"},
			StockQty:      10,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
	}

	_, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("CreateBatch error: %v", err)
	}

	if repo.withTxCalls != 1 {
		t.Fatalf("expected CreateBatch to call WithTx once, got %d", repo.withTxCalls)
	}
}

func TestBatchOrchestratorCountsExecutorSystemError(t *testing.T) {
	repo := newConnectorsRepoStub()
	repo.updateOperationStatusAlwaysFail = true
	repo.updateOperationStatusErr = fmt.Errorf("db down")
	vtex := &vtexCatalogStub{}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		{
			ProductID:     "prod_bosch",
			Name:          "Bosch Drill",
			Description:   "A Bosch drill",
			SKUName:       "Bosch Drill SKU",
			EAN:           "5555555555555",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          200.0,
			BasePrice:     399.90,
			ImageURLs:     []string{"https://example.com/bosch.jpg"},
			Specs:         map[string]string{"voltage": "220V"},
			StockQty:      10,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
	}

	createResult, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("CreateBatch error: %v", err)
	}

	err = orch.ExecuteBatch(context.Background(), createResult.BatchID, "mystore", products)
	if err != nil {
		t.Fatalf("ExecuteBatch error: %v", err)
	}

	batch, _, err := orch.GetBatchStatus(context.Background(), createResult.BatchID)
	if err != nil {
		t.Fatalf("GetBatchStatus error: %v", err)
	}
	if batch.Status != domain.BatchStatusFailed {
		t.Fatalf("expected batch status %q, got %q", domain.BatchStatusFailed, batch.Status)
	}
	if batch.FailedCount != 1 {
		t.Fatalf("expected FailedCount=1, got %d", batch.FailedCount)
	}
	if batch.SucceededCount != 0 {
		t.Fatalf("expected SucceededCount=0, got %d", batch.SucceededCount)
	}
}

func TestBatchOrchestratorHaltsOnAuthError(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{
		failOnStep: domain.StepProduct,
		failError:  fmt.Errorf("auth: %w", domain.ErrVTEXAuth),
	}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		{
			ProductID:     "prod_1",
			Name:          "Product One",
			Description:   "First product",
			SKUName:       "SKU One",
			EAN:           "7777777777771",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          100.0,
			BasePrice:     199.90,
			ImageURLs:     []string{"https://example.com/one.jpg"},
			Specs:         map[string]string{"voltage": "220V"},
			StockQty:      10,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
		{
			ProductID:     "prod_2",
			Name:          "Product Two",
			Description:   "Second product",
			SKUName:       "SKU Two",
			EAN:           "7777777777772",
			Category:      "Ferramentas",
			Brand:         "Bosch",
			Cost:          120.0,
			BasePrice:     249.90,
			ImageURLs:     []string{"https://example.com/two.jpg"},
			Specs:         map[string]string{"voltage": "110V"},
			StockQty:      8,
			WarehouseID:   "warehouse_1",
			TradePolicyID: "1",
		},
	}

	createResult, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("CreateBatch error: %v", err)
	}

	err = orch.ExecuteBatch(context.Background(), createResult.BatchID, "mystore", products)
	if err != nil {
		t.Fatalf("ExecuteBatch error: %v", err)
	}

	batch, ops, err := orch.GetBatchStatus(context.Background(), createResult.BatchID)
	if err != nil {
		t.Fatalf("GetBatchStatus error: %v", err)
	}

	if batch.Status != domain.BatchStatusFailed {
		t.Fatalf("expected batch status %q, got %q", domain.BatchStatusFailed, batch.Status)
	}

	if len(ops) != 2 {
		t.Fatalf("expected 2 operations, got %d", len(ops))
	}

	for _, op := range ops {
		if op.Status != domain.OperationStatusFailed {
			t.Fatalf("expected operation %s status %q, got %q", op.ProductID, domain.OperationStatusFailed, op.Status)
		}
		if op.ErrorCode != "CONNECTORS_VTEX_AUTH" {
			t.Fatalf("expected operation %s error code CONNECTORS_VTEX_AUTH, got %q", op.ProductID, op.ErrorCode)
		}
	}

	startedPipelines := 0
	for _, stepResults := range repo.steps {
		if len(stepResults) > 0 {
			startedPipelines++
		}
	}
	if startedPipelines != 1 {
		t.Fatalf("expected exactly 1 started pipeline before auth halt, got %d", startedPipelines)
	}
}
