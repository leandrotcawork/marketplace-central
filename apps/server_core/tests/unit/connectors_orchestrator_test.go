package unit

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	app "marketplace-central/apps/server_core/internal/modules/connectors/application"
	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
)

func makeProductForPublish(productID string) app.ProductForPublish {
	return app.ProductForPublish{
		ProductID:     productID,
		Name:          "Product " + productID,
		Description:   "Description " + productID,
		SKUName:       "SKU " + productID,
		EAN:           "ean-" + productID,
		Category:      "Ferramentas",
		Brand:         "Bosch",
		Cost:          100.0,
		BasePrice:     199.90,
		ImageURLs:     []string{"https://example.com/" + productID + ".jpg"},
		Specs:         map[string]string{"voltage": "220V"},
		StockQty:      10,
		WarehouseID:   "warehouse_1",
		TradePolicyID: "1",
	}
}

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
	releaseAuthFailure := make(chan struct{})
	releaseCreateProduct := make(chan struct{})
	vtex := &vtexCatalogStub{
		failCreateProductByLocalID: map[string]error{
			"prod_1": fmt.Errorf("auth: %w", domain.ErrVTEXAuth),
		},
		createProductWaitByLocalID: map[string]<-chan struct{}{
			"prod_1": releaseAuthFailure,
		},
		createProductRelease: releaseCreateProduct,
	}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		makeProductForPublish("prod_1"),
		makeProductForPublish("prod_2"),
		makeProductForPublish("prod_3"),
		makeProductForPublish("prod_4"),
		makeProductForPublish("prod_5"),
		makeProductForPublish("prod_6"),
	}

	createResult, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("CreateBatch error: %v", err)
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- orch.ExecuteBatch(context.Background(), createResult.BatchID, "mystore", products)
	}()

	deadline := time.Now().Add(500 * time.Millisecond)
	for repo.startedOperationsCount() < 5 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if repo.startedOperationsCount() != 5 {
		close(releaseCreateProduct)
		close(releaseAuthFailure)
		if execErr := <-errCh; execErr != nil {
			t.Fatalf("ExecuteBatch error: %v", execErr)
		}
		t.Fatalf("expected 5 in-flight pipelines before auth halt, got %d", repo.startedOperationsCount())
	}

	close(releaseAuthFailure)

	prod6OperationID := fmt.Sprintf("op_%s_prod_6", createResult.BatchID)
	deadline = time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		op := repo.operation(prod6OperationID)
		if op.Status == domain.OperationStatusFailed && op.ErrorCode == "CONNECTORS_VTEX_AUTH" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	close(releaseCreateProduct)

	if err := <-errCh; err != nil {
		t.Fatalf("ExecuteBatch error: %v", err)
	}

	batch, ops, err := orch.GetBatchStatus(context.Background(), createResult.BatchID)
	if err != nil {
		t.Fatalf("GetBatchStatus error: %v", err)
	}

	if batch.Status != domain.BatchStatusFailed {
		t.Fatalf("expected batch status %q, got %q", domain.BatchStatusFailed, batch.Status)
	}

	if len(ops) != 6 {
		t.Fatalf("expected 6 operations, got %d", len(ops))
	}

	if batch.SucceededCount != 4 {
		t.Fatalf("expected SucceededCount=4, got %d", batch.SucceededCount)
	}
	if batch.FailedCount != 2 {
		t.Fatalf("expected FailedCount=2, got %d", batch.FailedCount)
	}

	statusByProduct := make(map[string]domain.PublicationOperation)
	for _, op := range ops {
		statusByProduct[op.ProductID] = op
	}

	for _, productID := range []string{"prod_2", "prod_3", "prod_4", "prod_5"} {
		op := statusByProduct[productID]
		if op.Status != domain.OperationStatusSucceeded {
			t.Fatalf("expected in-flight operation %s to succeed, got %q", productID, op.Status)
		}
	}

	for _, productID := range []string{"prod_1", "prod_6"} {
		op := statusByProduct[productID]
		if op.Status != domain.OperationStatusFailed {
			t.Fatalf("expected halted operation %s to fail, got %q", productID, op.Status)
		}
		if op.ErrorCode != "CONNECTORS_VTEX_AUTH" {
			t.Fatalf("expected halted operation %s error code CONNECTORS_VTEX_AUTH, got %q", productID, op.ErrorCode)
		}
	}

	if repo.startedOperationsCount() != 5 {
		t.Fatalf("expected 5 started pipelines, got %d", repo.startedOperationsCount())
	}
	if steps, _ := repo.ListStepResultsByOperation(context.Background(), prod6OperationID); len(steps) != 0 {
		t.Fatalf("expected queued halted operation to have no step results, got %d", len(steps))
	}
}

func TestBatchOrchestratorExecutesBatchWithBoundedConcurrency(t *testing.T) {
	repo := newConnectorsRepoStub()
	releaseCreateProduct := make(chan struct{})
	vtex := &vtexCatalogStub{
		createProductRelease: releaseCreateProduct,
	}

	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	products := []app.ProductForPublish{
		makeProductForPublish("prod_1"),
		makeProductForPublish("prod_2"),
		makeProductForPublish("prod_3"),
		makeProductForPublish("prod_4"),
		makeProductForPublish("prod_5"),
		makeProductForPublish("prod_6"),
		makeProductForPublish("prod_7"),
		makeProductForPublish("prod_8"),
	}

	createResult, err := orch.CreateBatch(context.Background(), "mystore", products)
	if err != nil {
		t.Fatalf("CreateBatch error: %v", err)
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- orch.ExecuteBatch(context.Background(), createResult.BatchID, "mystore", products)
	}()

	deadline := time.Now().Add(500 * time.Millisecond)
	for vtex.maxConcurrentCreateProducts.Load() < 5 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}

	close(releaseCreateProduct)

	if err := <-errCh; err != nil {
		t.Fatalf("ExecuteBatch error: %v", err)
	}

	if got := vtex.maxConcurrentCreateProducts.Load(); got != 5 {
		t.Fatalf("expected max concurrent product pipelines to be 5, got %d", got)
	}

	batch, _, err := orch.GetBatchStatus(context.Background(), createResult.BatchID)
	if err != nil {
		t.Fatalf("GetBatchStatus error: %v", err)
	}
	if batch.SucceededCount != 8 {
		t.Fatalf("expected SucceededCount=8, got %d", batch.SucceededCount)
	}
	if batch.FailedCount != 0 {
		t.Fatalf("expected FailedCount=0, got %d", batch.FailedCount)
	}
}

func TestRetryBatchMissingProductReturnsError(t *testing.T) {
	repo := newConnectorsRepoStub()
	vtex := &vtexCatalogStub{}
	orch := app.NewBatchOrchestrator(repo, vtex, "tenant_default")

	batchID := "batch_retry_missing_product"
	repo.batches[batchID] = domain.PublicationBatch{
		BatchID:      batchID,
		TenantID:     "tenant_default",
		VTEXAccount:  "mystore",
		Status:       domain.BatchStatusFailed,
		CreatedAt:    time.Now(),
		TotalProducts: 1,
	}
	repo.operations["op_"+batchID+"_prod_1"] = domain.PublicationOperation{
		OperationID: "op_" + batchID + "_prod_1",
		BatchID:     batchID,
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		ProductID:   "prod_1",
		Status:      domain.OperationStatusFailed,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	_, err := orch.RetryBatch(context.Background(), batchID, []app.ProductForPublish{})
	if err == nil {
		t.Fatal("expected error when failed operation product is missing from supplemental products")
	}
	if !strings.Contains(err.Error(), "CONNECTORS_RETRY_MISSING_PRODUCT") {
		t.Fatalf("expected CONNECTORS_RETRY_MISSING_PRODUCT error, got %v", err)
	}
}
