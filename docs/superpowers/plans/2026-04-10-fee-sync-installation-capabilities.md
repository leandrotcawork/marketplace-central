# Fee Sync Installation Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build installation-scoped `pricing_fee_sync` operations with shared manual and scheduler orchestration, bounded retries, operation-run history, and capability-state health updates.

**Architecture:** `integrations` owns orchestration, retries, capability-state transitions, and operation-run lifecycle. `marketplaces` remains the owner of fee schedule persistence, and provider-specific runtime behavior is isolated behind a fee-sync executor port that branches between live `api_sync` execution and deterministic `seed` reseeding.

**Tech Stack:** Go 1.25, net/http, pgx/v5 with `pgxpool.Pool`, PostgreSQL, OpenAPI 3.1, `packages/sdk-runtime`.

---

## File Structure Map

### Create
- `apps/server_core/internal/modules/integrations/ports/fee_sync_executor.go`
- `apps/server_core/internal/modules/integrations/adapters/feesync/marketplace_executor.go`
- `apps/server_core/internal/modules/integrations/adapters/feesync/marketplace_executor_test.go`
- `apps/server_core/internal/modules/integrations/application/fee_sync_service.go`
- `apps/server_core/internal/modules/integrations/application/fee_sync_service_test.go`
- `apps/server_core/internal/modules/integrations/application/operation_service_test.go`
- `apps/server_core/internal/modules/integrations/background/fee_sync_scheduler.go`
- `apps/server_core/internal/modules/integrations/background/fee_sync_scheduler_test.go`
- `apps/server_core/tests/integration/integrations_fee_sync_test.go`

### Modify
- `apps/server_core/internal/modules/integrations/ports/provider_registry.go`
- `apps/server_core/internal/modules/integrations/adapters/postgres/provider_definition_repo.go`
- `apps/server_core/internal/modules/integrations/application/provider_service.go`
- `apps/server_core/internal/modules/integrations/application/provider_service_test.go`
- `apps/server_core/internal/modules/integrations/application/capability_service.go`
- `apps/server_core/internal/modules/integrations/application/capability_service_test.go`
- `apps/server_core/internal/modules/integrations/application/operation_service.go`
- `apps/server_core/internal/modules/integrations/transport/auth_handler.go`
- `apps/server_core/internal/modules/integrations/transport/auth_handler_test.go`
- `apps/server_core/internal/composition/root.go`
- `contracts/api/marketplace-central.openapi.yaml`
- `packages/sdk-runtime/src/index.ts`

### Important Constraint
- Extend `auth_handler.go` instead of adding another `/integrations/installations/` wildcard route. `ServeMux` already uses that prefix there.

---

### Task 1: Add Provider Lookup Support

**Files:**
- Modify: `apps/server_core/internal/modules/integrations/ports/provider_registry.go`
- Modify: `apps/server_core/internal/modules/integrations/adapters/postgres/provider_definition_repo.go`
- Modify: `apps/server_core/internal/modules/integrations/application/provider_service.go`
- Modify: `apps/server_core/internal/modules/integrations/application/provider_service_test.go`

- [ ] **Step 1: Write the failing test**

```go
func TestGetProviderDefinitionReturnsRequestedProvider(t *testing.T) {
	repo := &stubProviderRepo{items: []domain.ProviderDefinition{{ProviderCode: "magalu", IsActive: true}}}
	svc := NewProviderService(repo)
	got, found, err := svc.GetProviderDefinition(context.Background(), "magalu")
	if err != nil || !found || got.ProviderCode != "magalu" {
		t.Fatalf("got=%#v found=%v err=%v", got, found, err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run TestGetProviderDefinitionReturnsRequestedProvider`
Expected: FAIL because provider lookup does not exist.

- [ ] **Step 3: Write minimal implementation**

```go
// ports/provider_registry.go
GetProviderDefinition(ctx context.Context, providerCode string) (domain.ProviderDefinition, bool, error)

// application/provider_service.go
func (s *ProviderService) GetProviderDefinition(ctx context.Context, providerCode string) (domain.ProviderDefinition, bool, error) {
	providerCode = strings.TrimSpace(providerCode)
	if providerCode == "" {
		return domain.ProviderDefinition{}, false, errors.New("INTEGRATIONS_PROVIDER_INVALID")
	}
	return s.repo.GetProviderDefinition(ctx, providerCode)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run "TestGetProviderDefinitionReturnsRequestedProvider|TestListProviderDefinitions"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/ports/provider_registry.go apps/server_core/internal/modules/integrations/adapters/postgres/provider_definition_repo.go apps/server_core/internal/modules/integrations/application/provider_service.go apps/server_core/internal/modules/integrations/application/provider_service_test.go
git commit -m "feat(integrations): add provider definition lookup support"
```

---

### Task 2: Extend Capability And Operation Services

**Files:**
- Modify: `apps/server_core/internal/modules/integrations/application/capability_service.go`
- Modify: `apps/server_core/internal/modules/integrations/application/capability_service_test.go`
- Modify: `apps/server_core/internal/modules/integrations/application/operation_service.go`
- Create: `apps/server_core/internal/modules/integrations/application/operation_service_test.go`

- [ ] **Step 1: Write the failing tests**

```go
func TestUpsertCapabilityStatesPersistsInput(t *testing.T) {
	store := &stubCapabilityStateStore{}
	svc := NewCapabilityService(store, "tenant-default")
	err := svc.Upsert(context.Background(), []domain.CapabilityState{{InstallationID: "inst_001", CapabilityCode: "pricing_fee_sync"}})
	if err != nil || len(store.states) != 1 {
		t.Fatalf("states=%#v err=%v", store.states, err)
	}
}

func TestOperationServiceListByInstallationReturnsRuns(t *testing.T) {
	store := &stubOperationRunStore{listed: []domain.OperationRun{{OperationRunID: "run_001", InstallationID: "inst_001"}}}
	svc := NewOperationService(store, "tenant-default")
	runs, err := svc.ListByInstallation(context.Background(), "inst_001")
	if err != nil || len(runs) != 1 {
		t.Fatalf("runs=%#v err=%v", runs, err)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run "TestUpsertCapabilityStatesPersistsInput|TestOperationServiceListByInstallationReturnsRuns"`
Expected: FAIL because `CapabilityService.Upsert` and `OperationService.ListByInstallation` do not exist.

- [ ] **Step 3: Write minimal implementation**

```go
// application/capability_service.go
func (s *CapabilityService) Upsert(ctx context.Context, states []domain.CapabilityState) error {
	for i := range states {
		states[i].TenantID = s.tenantID
	}
	return s.store.UpsertCapabilityStates(ctx, states)
}

// application/operation_service.go
func (s *OperationService) ListByInstallation(ctx context.Context, installationID string) ([]domain.OperationRun, error) {
	installationID = strings.TrimSpace(installationID)
	if installationID == "" {
		return nil, errors.New("INTEGRATIONS_OPERATION_INVALID")
	}
	return s.store.ListByInstallation(ctx, installationID)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run "TestUpsertCapabilityStatesPersistsInput|TestOperationServiceListByInstallationReturnsRuns|TestResolveCapabilities"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/application/capability_service.go apps/server_core/internal/modules/integrations/application/capability_service_test.go apps/server_core/internal/modules/integrations/application/operation_service.go apps/server_core/internal/modules/integrations/application/operation_service_test.go
git commit -m "feat(integrations): extend capability and operation services for fee sync"
```

---

### Task 3: Add Fee-Sync Executor Runtime Split

**Files:**
- Create: `apps/server_core/internal/modules/integrations/ports/fee_sync_executor.go`
- Create: `apps/server_core/internal/modules/integrations/adapters/feesync/marketplace_executor.go`
- Create: `apps/server_core/internal/modules/integrations/adapters/feesync/marketplace_executor_test.go`

- [ ] **Step 1: Write the failing tests**

```go
func TestMarketplaceExecutorExecutesLiveSyncerForAPISource(t *testing.T) {
	repo := &stubFeeScheduleRepo{}
	syncer := &stubFeeScheduleSyncer{marketplaceCode: "mercado_livre", rows: 7}
	executor := NewMarketplaceExecutor(repo, []marketplacesports.FeeScheduleSyncer{syncer})
	result, err := executor.Execute(context.Background(), domain.Installation{ProviderCode: "mercado_livre"}, domain.ProviderDefinition{ProviderCode: "mercado_livre"})
	if err != nil || result.RowsSynced != 7 {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/adapters/feesync -run TestMarketplaceExecutorExecutesLiveSyncerForAPISource`
Expected: FAIL because the executor package does not exist.

- [ ] **Step 3: Write minimal implementation**

```go
// ports/fee_sync_executor.go
type FeeSyncResult struct {
	RowsSynced int
	ResultCode string
	FailureCode string
	Transient bool
	RequiresReauth bool
}

type FeeSyncExecutor interface {
	Execute(ctx context.Context, installation domain.Installation, provider domain.ProviderDefinition) (FeeSyncResult, error)
}
```

```go
// adapters/feesync/marketplace_executor.go
func (e *MarketplaceExecutor) Execute(ctx context.Context, installation domain.Installation, provider domain.ProviderDefinition) (ports.FeeSyncResult, error) {
	if syncer, ok := e.syncers[installation.ProviderCode]; ok {
		rows, err := syncer.Sync(ctx, e.repo)
		if err != nil {
			return ports.FeeSyncResult{ResultCode: "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR", FailureCode: "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR", Transient: true}, err
		}
		return ports.FeeSyncResult{RowsSynced: rows, ResultCode: "INTEGRATIONS_FEE_SYNC_OK"}, nil
	}
	plugin, ok := marketplacesregistry.Get(installation.ProviderCode)
	if !ok {
		return ports.FeeSyncResult{ResultCode: "INTEGRATIONS_FEE_SYNC_UNSUPPORTED", FailureCode: "INTEGRATIONS_FEE_SYNC_UNSUPPORTED"}, nil
	}
	rows, err := seedPluginFees(ctx, plugin, e.repo)
	if err != nil {
		return ports.FeeSyncResult{ResultCode: "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR", FailureCode: "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR", Transient: true}, err
	}
	return ports.FeeSyncResult{RowsSynced: rows, ResultCode: "INTEGRATIONS_FEE_SYNC_OK"}, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/adapters/feesync`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/ports/fee_sync_executor.go apps/server_core/internal/modules/integrations/adapters/feesync/marketplace_executor.go apps/server_core/internal/modules/integrations/adapters/feesync/marketplace_executor_test.go
git commit -m "feat(integrations): add installation fee sync executor"
```

---

### Task 4: Implement Fee-Sync Application Service

**Files:**
- Create: `apps/server_core/internal/modules/integrations/application/fee_sync_service.go`
- Create: `apps/server_core/internal/modules/integrations/application/fee_sync_service_test.go`

- [ ] **Step 1: Write the failing tests**

```go
func TestStartSyncQueuesRunAndExecutesAsync(t *testing.T) {
	h := newFeeSyncHarness(t)
	accepted, err := h.service.StartSync(context.Background(), StartFeeSyncInput{InstallationID: "inst_001", ActorType: "user", ActorID: "user_123"})
	if err != nil || accepted.Status != domain.OperationRunStatusQueued || len(h.asyncCalls) != 1 {
		t.Fatalf("accepted=%#v async=%d err=%v", accepted, len(h.asyncCalls), err)
	}
}

func TestExecuteSyncMarksCapabilityRequiresReauthOnAuthFailure(t *testing.T) {
	h := newFeeSyncHarness(t)
	h.executor.result = ports.FeeSyncResult{ResultCode: "INTEGRATIONS_FEE_SYNC_REQUIRES_REAUTH", FailureCode: "INTEGRATIONS_FEE_SYNC_REQUIRES_REAUTH", RequiresReauth: true}
	h.executor.err = domain.ErrReauthAccountMismatch
	err := h.service.ExecuteSync(context.Background(), domain.OperationRun{OperationRunID: "run_001", InstallationID: "inst_001", OperationType: feeSyncOperationType, AttemptCount: 1})
	if err != nil || h.capabilityStates[0].Status != domain.CapabilityStatusRequiresReauth {
		t.Fatalf("states=%#v err=%v", h.capabilityStates, err)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run "TestStartSyncQueuesRunAndExecutesAsync|TestExecuteSyncMarksCapabilityRequiresReauthOnAuthFailure"`
Expected: FAIL because the fee-sync service does not exist.

- [ ] **Step 3: Write minimal implementation**

```go
const feeSyncOperationType = "pricing_fee_sync"

type StartFeeSyncInput struct {
	InstallationID string
	ActorType string
	ActorID string
}

type FeeSyncAccepted struct {
	InstallationID string `json:"installation_id"`
	OperationRunID string `json:"operation_run_id"`
	Status domain.OperationRunStatus `json:"status"`
}
```

```go
func (s *FeeSyncService) StartSync(ctx context.Context, input StartFeeSyncInput) (FeeSyncAccepted, error) {
	inst, _, err := s.loadEligibleInstallation(ctx, input.InstallationID)
	if err != nil {
		return FeeSyncAccepted{}, err
	}
	run, err := s.operations.Record(ctx, RecordOperationInput{
		OperationRunID: fmt.Sprintf("op_%d", s.clock.Now().UnixNano()),
		InstallationID: inst.InstallationID,
		OperationType: feeSyncOperationType,
		Status: domain.OperationRunStatusQueued,
		ResultCode: "INTEGRATIONS_FEE_SYNC_QUEUED",
		AttemptCount: 1,
		ActorType: input.ActorType,
		ActorID: input.ActorID,
	})
	if err != nil {
		return FeeSyncAccepted{}, err
	}
	s.asyncRunner(func() { _ = s.ExecuteSync(context.Background(), run) })
	return FeeSyncAccepted{InstallationID: inst.InstallationID, OperationRunID: run.OperationRunID, Status: domain.OperationRunStatusQueued}, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run "TestStartSyncQueuesRunAndExecutesAsync|TestExecuteSyncMarksCapabilityRequiresReauthOnAuthFailure|TestExecuteSyncMarksCapabilityDegradedOnTransientFailure|TestExecuteSyncMarksCapabilityEnabledOnSuccess|TestStartSyncRejectsRetryCooldown"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/application/fee_sync_service.go apps/server_core/internal/modules/integrations/application/fee_sync_service_test.go
git commit -m "feat(integrations): add installation fee sync orchestration service"
```

---

### Task 5: Add Transport, OpenAPI, And SDK Surface

**Files:**
- Modify: `apps/server_core/internal/modules/integrations/transport/auth_handler.go`
- Modify: `apps/server_core/internal/modules/integrations/transport/auth_handler_test.go`
- Modify: `contracts/api/marketplace-central.openapi.yaml`
- Modify: `packages/sdk-runtime/src/index.ts`

- [ ] **Step 1: Write the failing tests**

```go
func TestHandleInstallationFeeSyncReturnsAccepted(t *testing.T) {
	flow := &stubAuthFlow{feeSyncAccepted: application.FeeSyncAccepted{InstallationID: "inst_001", OperationRunID: "op_001", Status: domain.OperationRunStatusQueued}}
	h := NewAuthHandler(flow)
	req := httptest.NewRequest(http.MethodPost, "/integrations/installations/inst_001/fee-sync", bytes.NewReader([]byte(`{}`)))
	rr := httptest.NewRecorder()
	h.handleInstallationAuth(rr, req)
	if rr.Code != http.StatusAccepted {
		t.Fatalf("status=%d", rr.Code)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/transport -run TestHandleInstallationFeeSyncReturnsAccepted`
Expected: FAIL because fee-sync and operation endpoints are not supported by the existing route switch.

- [ ] **Step 3: Write minimal implementation**

```go
// transport/auth_handler.go
type AuthFlowReader interface {
	// existing auth methods...
	StartSync(ctx context.Context, input application.StartFeeSyncInput) (application.FeeSyncAccepted, error)
	ListOperationRuns(ctx context.Context, installationID string) ([]domain.OperationRun, error)
}

case "fee-sync":
	result, err := h.flow.StartSync(r.Context(), application.StartFeeSyncInput{InstallationID: installationID, ActorType: "user"})
	if err != nil { /* mapIntegrationError */ }
	httpx.WriteJSON(w, http.StatusAccepted, result)

case "operations":
	items, err := h.flow.ListOperationRuns(r.Context(), installationID)
	if err != nil { /* mapIntegrationError */ }
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
```

```yaml
/integrations/installations/{id}/fee-sync:
  post:
    operationId: startIntegrationFeeSync
    responses:
      "202":
        description: Fee sync accepted

/integrations/installations/{id}/operations:
  get:
    operationId: listIntegrationOperationRuns
```

```ts
export interface IntegrationOperationRun { operation_run_id: string; installation_id: string; operation_type: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; result_code: string; failure_code: string; attempt_count: number; actor_type: string; actor_id: string; started_at?: string; completed_at?: string; created_at: string; updated_at: string; }
export interface IntegrationFeeSyncAccepted { installation_id: string; operation_run_id: string; status: "queued"; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/transport`
Expected: PASS.

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go build ./...`
Expected: PASS with the updated SDK file present in the workspace.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/transport/auth_handler.go apps/server_core/internal/modules/integrations/transport/auth_handler_test.go contracts/api/marketplace-central.openapi.yaml packages/sdk-runtime/src/index.ts
git commit -m "feat(integrations): expose installation fee sync and operation run endpoints"
```

---

### Task 6: Add Background Scheduler And Composition Wiring

**Files:**
- Create: `apps/server_core/internal/modules/integrations/background/fee_sync_scheduler.go`
- Create: `apps/server_core/internal/modules/integrations/background/fee_sync_scheduler_test.go`
- Modify: `apps/server_core/internal/composition/root.go`

- [ ] **Step 1: Write the failing test**

```go
func TestFeeSyncSchedulerStartsSyncForEligibleInstallations(t *testing.T) {
	installations := schedulerInstallationLister{items: []domain.Installation{{InstallationID: "inst_connected", ProviderCode: "mercado_livre", Status: domain.InstallationStatusConnected}}}
	providers := schedulerProviderLookup{items: map[string]domain.ProviderDefinition{"mercado_livre": {ProviderCode: "mercado_livre", DeclaredCapabilities: []string{"pricing_fee_sync"}}}}
	service := &schedulerFeeSyncStarter{}
	job := NewFeeSyncScheduler(installations, providers, service, time.Minute)
	if err := job.RunOnce(context.Background()); err != nil || len(service.inputs) != 1 {
		t.Fatalf("inputs=%#v err=%v", service.inputs, err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/background -run TestFeeSyncSchedulerStartsSyncForEligibleInstallations`
Expected: FAIL because the scheduler does not exist.

- [ ] **Step 3: Write minimal implementation**

```go
func (s *FeeSyncScheduler) RunOnce(ctx context.Context) error {
	installations, err := s.installations.List(ctx)
	if err != nil {
		return err
	}
	for _, inst := range installations {
		if inst.Status != domain.InstallationStatusConnected {
			continue
		}
		provider, found, err := s.providers.GetProviderDefinition(ctx, inst.ProviderCode)
		if err != nil || !found || !declaresCapability(provider.DeclaredCapabilities, feeSyncOperationType) {
			continue
		}
		_, _ = s.flow.StartSync(ctx, application.StartFeeSyncInput{InstallationID: inst.InstallationID, ActorType: "system", ActorID: "fee_sync_scheduler"})
	}
	return nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/background`
Expected: PASS.

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go build ./internal/composition`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/background/fee_sync_scheduler.go apps/server_core/internal/modules/integrations/background/fee_sync_scheduler_test.go apps/server_core/internal/composition/root.go
git commit -m "feat(integrations): add installation fee sync scheduler"
```

---

### Task 7: Add Integration Coverage And Final Verification

**Files:**
- Create: `apps/server_core/tests/integration/integrations_fee_sync_test.go`

- [ ] **Step 1: Write the failing tests**

```go
func TestFeeSyncManualTriggerReturnsQueuedOperationAndCompletes(t *testing.T) {
	h := newIntegrationFeeSyncHarness(t)
	accepted, err := h.service.StartSync(context.Background(), application.StartFeeSyncInput{InstallationID: "inst_ml_001", ActorType: "user", ActorID: "user_001"})
	if err != nil || accepted.Status != domain.OperationRunStatusQueued {
		t.Fatalf("accepted=%#v err=%v", accepted, err)
	}
}

func TestFeeSyncSeedProviderReseedsAndEnablesCapability(t *testing.T) {
	h := newIntegrationFeeSyncHarness(t)
	_, err := h.service.StartSync(context.Background(), application.StartFeeSyncInput{InstallationID: "inst_shopee_001", ActorType: "system", ActorID: "test"})
	if err != nil {
		t.Fatalf("StartSync() error=%v", err)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./tests/integration -run TestFeeSync`
Expected: FAIL until the entire fee-sync path is wired.

- [ ] **Step 3: Complete only the missing glue surfaced by test failures**

```go
// Fix only glue surfaced by the failing integration tests:
// - transport/interface alignment after StartSync/ListOperationRuns were added
// - JSON field names for operation-run responses
// - composition wiring of executor/service/scheduler
// - provider lookup usage in scheduler/service
```

- [ ] **Step 4: Run final verification**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/... -count=1`
Expected: PASS.

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./tests/integration -run TestFeeSync -count=1`
Expected: PASS.

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go build ./...`
Expected: PASS.

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./... -count=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/tests/integration/integrations_fee_sync_test.go
git commit -m "test(integrations): add installation fee sync integration coverage"
```

---

## Self-Review

- Spec coverage: runtime split (`Task 3`), async manual API (`Task 5`), scheduler (`Task 6`), retries/state mapping (`Task 4`), integration tests (`Task 7`).
- Placeholder scan: no `TODO`/`TBD`; the only open glue step is explicitly restricted to failures surfaced by tests.
- Type consistency: path placeholder stays `{id}` to match existing OpenAPI style; `pricing_fee_sync` is reused as both capability and operation type; accepted response and operation-run names stay aligned across app, transport, contract, and SDK.
