# Fee Sync Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two MAJOR audit findings by implementing bounded transient retry policy semantics in fee-sync orchestration and enforcing compile-time transport contracts for fee-sync endpoints.

**Architecture:** Keep fee-sync business policy inside `integrations/application/fee_sync_service.go` and keep transport strictly delegating through a single service interface. Retry behavior will be derived from persisted operation history (failed runs only), while success/unsupported/requires-reauth avoid automatic retry escalation.

**Tech Stack:** Go 1.25, net/http, pgx/v5 (`pgxpool.Pool`), OpenAPI 3.1, sdk-runtime TypeScript.

---

## File Structure Map

### Modify
- `apps/server_core/internal/modules/integrations/application/fee_sync_service.go`
  - Add bounded retry policy helpers (`max attempts`, `backoff from failed history`) and use them in `StartSync`.
- `apps/server_core/internal/modules/integrations/application/fee_sync_service_test.go`
  - Add/adjust tests for retry policy behavior and attempt count progression.
- `apps/server_core/internal/modules/integrations/transport/auth_handler.go`
  - Extend `AuthFlowReader` directly with `StartSync` and `ListOperationRuns`; remove runtime type assertions.
- `apps/server_core/internal/modules/integrations/transport/auth_handler_test.go`
  - Keep handler tests green with compile-time interface contract and endpoint coverage.

### Verify-Only (no code changes expected)
- `apps/server_core/internal/composition/root.go`
  - Ensure `authFlowFacade` still satisfies updated `AuthFlowReader` contract.

---

### Task 1: Implement Bounded Transient Retry Policy In Fee Sync Service

**Files:**
- Modify: `apps/server_core/internal/modules/integrations/application/fee_sync_service.go`
- Modify: `apps/server_core/internal/modules/integrations/application/fee_sync_service_test.go`

- [ ] **Step 1: Write failing tests**

```go
func TestStartSyncDoesNotCooldownAfterSuccessfulRun(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	h.operations.history["inst_001"] = []domain.OperationRun{
		{
			OperationRunID: "run_success",
			InstallationID: "inst_001",
			OperationType:  feeSyncOperationType,
			Status:         domain.OperationRunStatusSucceeded,
			CompletedAt:    ptrTime(time.Unix(999, 0).UTC()),
			AttemptCount:   1,
		},
	}

	_, err := h.service.StartSync(context.Background(), StartFeeSyncInput{InstallationID: "inst_001", ActorType: "user", ActorID: "user_123"})
	if err != nil {
		t.Fatalf("StartSync() error = %v, want nil", err)
	}
}

func TestStartSyncRejectsAfterMaxTransientFailedAttempts(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	now := time.Unix(1000, 0).UTC()
	h.operations.history["inst_001"] = []domain.OperationRun{
		{OperationRunID: "run_fail_1", InstallationID: "inst_001", OperationType: feeSyncOperationType, Status: domain.OperationRunStatusFailed, FailureCode: feeSyncProviderErrorCode, AttemptCount: 1, CompletedAt: ptrTime(now.Add(-5 * time.Minute))},
		{OperationRunID: "run_fail_2", InstallationID: "inst_001", OperationType: feeSyncOperationType, Status: domain.OperationRunStatusFailed, FailureCode: feeSyncProviderErrorCode, AttemptCount: 2, CompletedAt: ptrTime(now.Add(-2 * time.Minute))},
		{OperationRunID: "run_fail_3", InstallationID: "inst_001", OperationType: feeSyncOperationType, Status: domain.OperationRunStatusFailed, FailureCode: feeSyncProviderErrorCode, AttemptCount: 3, CompletedAt: ptrTime(now.Add(-1 * time.Minute))},
	}

	_, err := h.service.StartSync(context.Background(), StartFeeSyncInput{InstallationID: "inst_001", ActorType: "user", ActorID: "user_123"})
	if err == nil {
		t.Fatal("StartSync() error = nil, want retry cooldown")
	}
	if got, want := err.Error(), feeSyncRetryCooldownErrorCode; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestStartSyncIncrementsAttemptCountFromRecentTransientFailures(t *testing.T) {
	t.Parallel()

	h := newFeeSyncHarness(t)
	now := time.Unix(1000, 0).UTC()
	h.operations.history["inst_001"] = []domain.OperationRun{
		{OperationRunID: "run_fail_1", InstallationID: "inst_001", OperationType: feeSyncOperationType, Status: domain.OperationRunStatusFailed, FailureCode: feeSyncProviderErrorCode, AttemptCount: 1, CompletedAt: ptrTime(now.Add(-10 * time.Minute))},
		{OperationRunID: "run_fail_2", InstallationID: "inst_001", OperationType: feeSyncOperationType, Status: domain.OperationRunStatusFailed, FailureCode: feeSyncProviderErrorCode, AttemptCount: 2, CompletedAt: ptrTime(now.Add(-5 * time.Minute))},
	}

	_, err := h.service.StartSync(context.Background(), StartFeeSyncInput{InstallationID: "inst_001", ActorType: "user", ActorID: "user_123"})
	if err != nil {
		t.Fatalf("StartSync() error = %v", err)
	}
	if got, want := h.operations.records[0].AttemptCount, 3; got != want {
		t.Fatalf("queued attempt_count = %d, want %d", got, want)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
`cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run "TestStartSyncDoesNotCooldownAfterSuccessfulRun|TestStartSyncRejectsAfterMaxTransientFailedAttempts|TestStartSyncIncrementsAttemptCountFromRecentTransientFailures"`

Expected: FAIL (current policy cools down successful runs and always records attempt `1`).

- [ ] **Step 3: Write minimal implementation**

```go
const (
	feeSyncMaxAutomaticAttempts = 3
)

func (s *FeeSyncService) StartSync(ctx context.Context, input StartFeeSyncInput) (FeeSyncAccepted, error) {
	// ...existing validation/load/provider checks...

	attemptCount, err := s.nextAttemptCount(ctx, inst.InstallationID)
	if err != nil {
		return FeeSyncAccepted{}, err
	}

	runID, err := newFeeSyncRunID()
	if err != nil {
		return FeeSyncAccepted{}, err
	}

	queuedRun, err := s.operations.Record(ctx, RecordOperationInput{
		OperationRunID: runID,
		InstallationID: inst.InstallationID,
		OperationType:  feeSyncOperationType,
		Status:         domain.OperationRunStatusQueued,
		ResultCode:     feeSyncQueuedResultCode,
		AttemptCount:   attemptCount,
		ActorType:      strings.TrimSpace(input.ActorType),
		ActorID:        strings.TrimSpace(input.ActorID),
	})
	// ...existing async dispatch...
}

func (s *FeeSyncService) nextAttemptCount(ctx context.Context, installationID string) (int, error) {
	runs, err := s.operations.ListByInstallation(ctx, installationID)
	if err != nil {
		return 0, err
	}

	now := s.clock.Now().UTC()
	lastAttempt := 0
	for _, run := range runs {
		if strings.TrimSpace(run.OperationType) != feeSyncOperationType {
			continue
		}
		if run.Status == domain.OperationRunStatusQueued || run.Status == domain.OperationRunStatusRunning {
			return 0, errors.New(feeSyncRetryCooldownErrorCode)
		}
		if run.Status != domain.OperationRunStatusFailed {
			continue
		}
		if strings.TrimSpace(run.FailureCode) != feeSyncProviderErrorCode {
			continue
		}
		if !recentOperationRun(run, now, feeSyncRetryCooldown) {
			continue
		}
		if run.AttemptCount > lastAttempt {
			lastAttempt = run.AttemptCount
		}
	}

	next := lastAttempt + 1
	if next > feeSyncMaxAutomaticAttempts {
		return 0, errors.New(feeSyncRetryCooldownErrorCode)
	}
	if next < 1 {
		next = 1
	}
	return next, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
`cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run "TestStartSyncDoesNotCooldownAfterSuccessfulRun|TestStartSyncRejectsAfterMaxTransientFailedAttempts|TestStartSyncIncrementsAttemptCountFromRecentTransientFailures|TestStartSyncQueuesRunAndExecutesAsync|TestStartSyncRejectsRetryCooldown"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/application/fee_sync_service.go apps/server_core/internal/modules/integrations/application/fee_sync_service_test.go
git commit -m "fix(integrations): implement bounded transient retry policy for fee sync"
```

---

### Task 2: Enforce Compile-Time Transport Contract For Fee Sync Endpoints

**Files:**
- Modify: `apps/server_core/internal/modules/integrations/transport/auth_handler.go`
- Modify: `apps/server_core/internal/modules/integrations/transport/auth_handler_test.go`

- [ ] **Step 1: Write failing tests**

```go
func TestAuthHandlerFeeSyncRouteRequiresPOST(t *testing.T) {
	t.Parallel()

	h := NewAuthHandler(&stubAuthFlow{})
	req := httptest.NewRequest(http.MethodGet, "/integrations/installations/inst_001/fee-sync", nil)
	rr := httptest.NewRecorder()

	h.handleInstallationAuth(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status=%d want=405", rr.Code)
	}
}

func TestAuthHandlerOperationsRouteReturnsList(t *testing.T) {
	t.Parallel()

	h := NewAuthHandler(&stubAuthFlow{})
	req := httptest.NewRequest(http.MethodGet, "/integrations/installations/inst_001/operations", nil)
	rr := httptest.NewRecorder()

	h.handleInstallationAuth(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d want=200", rr.Code)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
`cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/transport -run "TestAuthHandlerFeeSyncRouteRequiresPOST|TestAuthHandlerOperationsRouteReturnsList"`

Expected: FAIL after removing runtime assertions (temporarily) until `AuthFlowReader` is extended and stub updated.

- [ ] **Step 3: Write minimal implementation**

```go
// auth_handler.go

type AuthFlowReader interface {
	StartAuthorize(ctx context.Context, input application.StartAuthorizeInput) (application.AuthorizeStart, error)
	HandleCallback(ctx context.Context, input application.HandleCallbackInput) (application.AuthStatus, error)
	SubmitAPIKey(ctx context.Context, input application.SubmitAPIKeyInput) (application.AuthStatus, error)
	RefreshCredential(ctx context.Context, input application.RefreshCredentialInput) (application.AuthStatus, error)
	Disconnect(ctx context.Context, input application.DisconnectInput) (application.AuthStatus, error)
	StartReauth(ctx context.Context, input application.StartReauthInput) (application.AuthorizeStart, error)
	GetAuthStatus(ctx context.Context, input application.GetAuthStatusInput) (application.AuthStatus, error)
	StartSync(ctx context.Context, input application.StartFeeSyncInput) (application.FeeSyncAccepted, error)
	ListOperationRuns(ctx context.Context, installationID string) ([]domain.OperationRun, error)
}

// in fee-sync branch: remove type assertion and call directly
result, err := h.flow.StartSync(r.Context(), application.StartFeeSyncInput{InstallationID: installationID, ActorType: "user"})

// in operations branch: remove type assertion and call directly
items, err := h.flow.ListOperationRuns(r.Context(), installationID)
```

```go
// auth_handler_test.go - stubAuthFlow must satisfy the extended interface.
func (s *stubAuthFlow) StartSync(ctx context.Context, input application.StartFeeSyncInput) (application.FeeSyncAccepted, error) { /* existing stub behavior */ }
func (s *stubAuthFlow) ListOperationRuns(ctx context.Context, installationID string) ([]domain.OperationRun, error) { /* existing stub behavior */ }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
`cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/transport`

Expected: PASS.

Run:
`cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go build ./internal/composition`

Expected: PASS (`authFlowFacade` still satisfies the updated interface).

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/transport/auth_handler.go apps/server_core/internal/modules/integrations/transport/auth_handler_test.go
git commit -m "refactor(integrations): enforce compile-time fee sync transport contract"
```

---

### Task 3: Final Verification And Audit Closure

**Files:**
- Verify only (no expected edits):
  - `apps/server_core/internal/modules/integrations/application/fee_sync_service.go`
  - `apps/server_core/internal/modules/integrations/transport/auth_handler.go`
  - `apps/server_core/internal/composition/root.go`

- [ ] **Step 1: Run integrations module suite (fresh count)**

Run:
`cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/... -count=1`

Expected: PASS.

- [ ] **Step 2: Run fee-sync integration tests**

Run:
`cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./tests/integration -run TestFeeSync -count=1`

Expected: PASS.

- [ ] **Step 3: Run full build and full test suite**

Run:
`cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go build ./...`

Expected: PASS.

Run:
`cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./... -count=1`

Expected: PASS.

- [ ] **Step 4: Commit verification evidence note**

```bash
git commit --allow-empty -m "chore(integrations): verify fee sync audit remediation"
```

---

## Self-Review

- Spec coverage: retry policy intent now explicitly implemented in Task 1; compile-time transport contract fixed in Task 2.
- Placeholder scan: no TODO/TBD placeholders; every task includes concrete tests, commands, and code snippets.
- Type consistency: uses existing names (`StartSync`, `ListOperationRuns`, `RecordOperationInput`, `feeSyncProviderErrorCode`, `OperationRunStatus*`) and existing file paths.
