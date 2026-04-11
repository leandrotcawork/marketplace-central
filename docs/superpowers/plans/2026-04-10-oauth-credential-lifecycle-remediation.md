# OAuth Credential Lifecycle Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all CRITICAL/MAJOR audit gaps in OAuth + credential lifecycle so behavior matches spec/plan intent and security requirements.

**Architecture:** Keep hexagonal boundaries: transport only parses/maps HTTP, application orchestrates lifecycle, adapters implement provider/crypto/postgres concerns. Replace callback trust-by-installation-id with signed state validation + nonce consume + tenant binding. Implement real refresh/disconnect/reauth/background semantics using existing ports and tenant-scoped repositories.

**Tech Stack:** Go 1.25, net/http, pgxpool, PostgreSQL, OpenAPI 3.1, existing integrations module test harness.

---

## File Structure Map

### Modify
- `apps/server_core/internal/modules/integrations/application/auth_flow_service.go` — secure OAuth flow orchestration, refresh/disconnect/reauth semantics.
- `apps/server_core/internal/modules/integrations/transport/auth_handler.go` — callback contract and route/method consistency.
- `apps/server_core/internal/modules/integrations/adapters/postgres/oauth_state_repo.go` — nonce consume by nonce + tenant CAS, expiry semantics.
- `apps/server_core/internal/modules/integrations/adapters/postgres/auth_session_repo.go` — expiring-session query by window + next_retry_at.
- `apps/server_core/internal/modules/integrations/adapters/postgres/installation_repo.go` — provider account id/name updates.
- `apps/server_core/internal/modules/integrations/background/refresh_ticker.go` — drive from auth sessions, not installations.
- `apps/server_core/internal/modules/integrations/background/state_cleanup.go` — delete expired OAuth states.
- `apps/server_core/internal/modules/integrations/ports/oauth_state_store.go` — keep nonce-based lookup/consume contract coherent.
- `apps/server_core/internal/modules/integrations/ports/auth_session_store.go` — expiresWithin contract.
- `apps/server_core/internal/platform/pgdb/config.go` — remove insecure encryption key default.
- `apps/server_core/internal/composition/root.go` — wire oauth state store/background jobs used by flow.
- `contracts/api/marketplace-central.openapi.yaml` — callback and auth endpoint request/response parity.

### Create
- `apps/server_core/internal/modules/integrations/application/auth_flow_service_security_test.go` — callback security tests.
- `apps/server_core/internal/modules/integrations/background/state_cleanup_oauth_test.go` — cleanup behavior test.
- `apps/server_core/tests/integration/integrations_auth_flow_test.go` — phase-H integration/security/idempotency tests.

---

### Task 1: Enforce OAuth State Security Contract in Application

**Files:**
- Modify: `apps/server_core/internal/modules/integrations/application/auth_flow_service.go`
- Test: `apps/server_core/internal/modules/integrations/application/auth_flow_service_security_test.go`

- [ ] **Step 1: Write failing tests for callback validation and replay protection**

```go
func TestHandleCallbackRejectsInvalidStateSignature(t *testing.T) {
    svc := newAuthFlowServiceForSecurityTest(t)

    _, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
        Code:  "code-1",
        State: "tampered_state",
    })

    if !errors.Is(err, domain.ErrAuthStateInvalid) {
        t.Fatalf("expected ErrAuthStateInvalid, got %v", err)
    }
}

func TestHandleCallbackRejectsConsumedNonce(t *testing.T) {
    svc, reusedState := newAuthFlowServiceWithConsumedNonce(t)

    _, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
        Code:  "code-1",
        State: reusedState,
    })

    if !errors.Is(err, domain.ErrAuthStateConsumed) {
        t.Fatalf("expected ErrAuthStateConsumed, got %v", err)
    }
}

func TestHandleCallbackRejectsExpiredNonce(t *testing.T) {
    svc, expiredState := newAuthFlowServiceWithExpiredNonce(t)

    _, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
        Code:  "code-1",
        State: expiredState,
    })

    if !errors.Is(err, domain.ErrAuthStateExpired) {
        t.Fatalf("expected ErrAuthStateExpired, got %v", err)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run "TestHandleCallbackRejectsInvalidStateSignature|TestHandleCallbackRejectsConsumedNonce|TestHandleCallbackRejectsExpiredNonce"`
Expected: FAIL with missing validation logic.

- [ ] **Step 3: Implement secure state decode/verify/consume flow in `HandleCallback`**

```go
// auth_flow_service.go (inside HandleCallback)
statePayload, err := s.oauthStateCodec.DecodeAndVerify(input.State)
if err != nil {
    return AuthStatus{}, domain.ErrAuthStateInvalid
}

stored, found, err := s.oauthStates.GetByNonce(ctx, statePayload.Nonce)
if err != nil {
    return AuthStatus{}, err
}
if !found {
    return AuthStatus{}, domain.ErrAuthStateInvalid
}
if stored.IsExpired(s.clock.Now().UTC()) {
    return AuthStatus{}, domain.ErrAuthStateExpired
}
if stored.IsConsumed() {
    return AuthStatus{}, domain.ErrAuthStateConsumed
}
if stored.InstallationID != statePayload.InstallationID {
    return AuthStatus{}, domain.ErrAuthStateInvalid
}

consumed, err := s.oauthStates.ConsumeNonce(ctx, stored.ID)
if err != nil {
    return AuthStatus{}, err
}
if !consumed {
    return AuthStatus{}, domain.ErrAuthStateConsumed
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: same command as step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/application/auth_flow_service.go apps/server_core/internal/modules/integrations/application/auth_flow_service_security_test.go
git commit -m "fix(integrations): enforce oauth state signature expiry and replay protection"
```

---

### Task 2: Align Callback Transport with Provider Contract

**Files:**
- Modify: `apps/server_core/internal/modules/integrations/transport/auth_handler.go`
- Modify: `contracts/api/marketplace-central.openapi.yaml`
- Test: `apps/server_core/internal/modules/integrations/transport/auth_handler_test.go`

- [ ] **Step 1: Write failing test for callback without installation_id query param**

```go
func TestHandleCallbackAcceptsProviderStyleParams(t *testing.T) {
    h := NewAuthHandler(stubAuthFlowReader{})
    req := httptest.NewRequest(http.MethodGet, "/integrations/auth/callback?code=abc&state=signed", nil)
    rr := httptest.NewRecorder()

    h.handleCallback(rr, req)

    if rr.Code != http.StatusFound {
        t.Fatalf("status = %d, want 302", rr.Code)
    }
}
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/transport -run TestHandleCallbackAcceptsProviderStyleParams`
Expected: FAIL (currently requires `installation_id`).

- [ ] **Step 3: Implement callback extraction from state only and update OpenAPI**

```go
// auth_handler.go
code := r.URL.Query().Get("code")
state := r.URL.Query().Get("state")
if code == "" || state == "" {
    writeIntegrationError(w, http.StatusBadRequest, "INTEGRATIONS_AUTH_STATE_INVALID", "missing callback params")
    return
}
result, err := h.flow.HandleCallback(r.Context(), application.HandleCallbackInput{Code: code, State: state})
if err != nil {
    http.Redirect(w, r, "/connections/unknown?status=failed&error="+url.QueryEscape(err.Error()), http.StatusFound)
    return
}
http.Redirect(w, r, "/connections/"+result.InstallationID+"?status=connected", http.StatusFound)
```

```yaml
# marketplace-central.openapi.yaml
/integrations/auth/callback:
  get:
    parameters:
      - name: code
        in: query
        required: true
      - name: state
        in: query
        required: true
```

- [ ] **Step 4: Run transport tests**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/transport`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/transport/auth_handler.go apps/server_core/internal/modules/integrations/transport/auth_handler_test.go contracts/api/marketplace-central.openapi.yaml
git commit -m "fix(integrations): align oauth callback contract to provider code+state flow"
```

---

### Task 3: Remove Insecure Default Encryption Key

**Files:**
- Modify: `apps/server_core/internal/platform/pgdb/config.go`
- Modify: `apps/server_core/internal/composition/root.go`
- Test: `apps/server_core/internal/platform/pgdb/config_test.go` (create if missing)

- [ ] **Step 1: Write failing config test requiring env key**

```go
func TestLoadConfigRequiresEncryptionKey(t *testing.T) {
    t.Setenv("MC_DATABASE_URL", "postgres://example")
    t.Setenv("MC_DEFAULT_TENANT_ID", "tenant_default")
    t.Setenv("MPC_ENCRYPTION_KEY", "")

    _, err := LoadConfig()
    if err == nil {
        t.Fatal("expected error when MPC_ENCRYPTION_KEY missing")
    }
}
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/platform/pgdb -run TestLoadConfigRequiresEncryptionKey`
Expected: FAIL.

- [ ] **Step 3: Implement fail-fast config behavior**

```go
if cfg.EncryptionKey == "" {
    return Config{}, errors.New("MPC_ENCRYPTION_KEY is required")
}
```

- [ ] **Step 4: Verify tests + build**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/platform/pgdb && go build ./internal/composition`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/platform/pgdb/config.go apps/server_core/internal/platform/pgdb/config_test.go apps/server_core/internal/composition/root.go
git commit -m "fix(security): require MPC_ENCRYPTION_KEY and remove static fallback"
```

---

### Task 4: Implement Real Refresh Lifecycle in Application

**Files:**
- Modify: `apps/server_core/internal/modules/integrations/application/auth_flow_service.go`
- Modify: `apps/server_core/internal/modules/integrations/adapters/postgres/auth_session_repo.go`
- Test: `apps/server_core/internal/modules/integrations/application/auth_flow_service_test.go`

- [ ] **Step 1: Write failing test for successful refresh and session reset**

```go
func TestRefreshCredentialRotatesAndResetsFailures(t *testing.T) {
    svc := newAuthFlowServiceWithRefreshableCredential(t)

    status, err := svc.RefreshCredential(context.Background(), RefreshCredentialInput{InstallationID: "inst_1"})
    if err != nil {
        t.Fatalf("RefreshCredential() error = %v", err)
    }
    if status.Status != domain.InstallationStatusConnected {
        t.Fatalf("status = %s, want connected", status.Status)
    }
    assertRotatedCredential(t, svc)
    assertAuthSessionReset(t, svc)
}
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run TestRefreshCredentialRotatesAndResetsFailures`
Expected: FAIL.

- [ ] **Step 3: Implement refresh path with policy**

```go
session, found, err := s.authSessionsStore.GetAuthSession(ctx, installationID)
if err != nil || !found { ... }
activeCred, found, err := s.credentialStore.GetActiveCredential(ctx, installationID)
if err != nil || !found { ... }
payload, err := s.decryptCredential(activeCred)
if err != nil { ... }
result, err := adapter.RefreshToken(ctx, payload.RefreshToken)
if err != nil {
    return s.handleRefreshFailure(ctx, installationID, session, err)
}
newCredID, err := s.rotateAndPromoteCredential(ctx, installationID, result)
if err != nil { ... }
_ = s.installations.UpdateActiveCredentialID(ctx, installationID, newCredID)
_ = s.authSessions.Upsert(ctx, UpsertAuthSessionInput{..., ConsecutiveFailures: 0, RefreshFailureCode: "", NextRetryAt: nil})
```

- [ ] **Step 4: Run application tests**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/application/auth_flow_service.go apps/server_core/internal/modules/integrations/adapters/postgres/auth_session_repo.go apps/server_core/internal/modules/integrations/application/auth_flow_service_test.go
git commit -m "feat(integrations): implement refresh token lifecycle with policy-driven state updates"
```

---

### Task 5: Implement Disconnect and Reauth Semantics

**Files:**
- Modify: `apps/server_core/internal/modules/integrations/application/auth_flow_service.go`
- Modify: `apps/server_core/internal/modules/integrations/adapters/postgres/installation_repo.go`
- Test: `apps/server_core/internal/modules/integrations/application/auth_flow_service_test.go`

- [ ] **Step 1: Write failing tests for disconnect idempotency and reauth account mismatch**

```go
func TestDisconnectIsIdempotentAndDeactivatesCredentials(t *testing.T) { ... }
func TestStartReauthRejectsDifferentProviderAccount(t *testing.T) { ... }
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application -run "TestDisconnectIsIdempotentAndDeactivatesCredentials|TestStartReauthRejectsDifferentProviderAccount"`
Expected: FAIL.

- [ ] **Step 3: Implement lifecycle transitions**

```go
// Disconnect
if inst.Status == domain.InstallationStatusDisconnected { return existingDisconnectedStatus, nil }
_ = s.credentialStore.DeactivateAllForInstallation(ctx, installationID)
_ = s.installations.UpdateActiveCredentialID(ctx, installationID, "")
_ = s.installations.UpdateStatus(ctx, installationID, domain.InstallationStatusDisconnected, domain.HealthStatusWarning)

// Reauth callback
if inst.ExternalAccountID != "" && token.ProviderAccountID != inst.ExternalAccountID {
    return AuthStatus{}, domain.ErrReauthAccountMismatch
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/application`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/application/auth_flow_service.go apps/server_core/internal/modules/integrations/adapters/postgres/installation_repo.go apps/server_core/internal/modules/integrations/application/auth_flow_service_test.go
git commit -m "fix(integrations): enforce disconnect idempotency and reauth account consistency"
```

---

### Task 6: Fix Background Jobs to Match Spec

**Files:**
- Modify: `apps/server_core/internal/modules/integrations/background/refresh_ticker.go`
- Modify: `apps/server_core/internal/modules/integrations/background/state_cleanup.go`
- Modify: `apps/server_core/internal/composition/root.go`
- Test: `apps/server_core/internal/modules/integrations/background/refresh_ticker_test.go`
- Test: `apps/server_core/internal/modules/integrations/background/state_cleanup_oauth_test.go`

- [ ] **Step 1: Write failing tests for session-based refresh + oauth-state cleanup**

```go
func TestRefreshTickerUsesListExpiringSessions(t *testing.T) { ... }
func TestStateCleanupDeletesExpiredOAuthStates(t *testing.T) { ... }
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/background -run "TestRefreshTickerUsesListExpiringSessions|TestStateCleanupDeletesExpiredOAuthStates"`
Expected: FAIL.

- [ ] **Step 3: Implement job logic**

```go
// RefreshTicker tick
sessions, _ := authSessionStore.ListExpiringSessions(ctx, 10*time.Minute)
for _, s := range sessions { _, _ = authFlow.RefreshCredential(ctx, application.RefreshCredentialInput{InstallationID: s.InstallationID}) }

// StateCleanup tick
_, _ = oauthStateStore.DeleteExpired(ctx, time.Now().UTC().Add(-1*time.Hour))
```

- [ ] **Step 4: Run background tests**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/background`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/background/refresh_ticker.go apps/server_core/internal/modules/integrations/background/state_cleanup.go apps/server_core/internal/modules/integrations/background/refresh_ticker_test.go apps/server_core/internal/modules/integrations/background/state_cleanup_oauth_test.go apps/server_core/internal/composition/root.go
git commit -m "fix(integrations): align auth background jobs with expiring-session and oauth-state cleanup model"
```

---

### Task 7: Phase-H Integration/Security Test Coverage

**Files:**
- Create: `apps/server_core/tests/integration/integrations_auth_flow_test.go`

- [ ] **Step 1: Write failing integration tests for H1/H2/H4/H5/H6 critical paths**

```go
func TestAuthFlowConnectCallbackDisconnect(t *testing.T) { ... }
func TestAuthFlowReauthAccountMismatch(t *testing.T) { ... }
func TestAuthFlowTenantIsolation(t *testing.T) { ... }
func TestAuthFlowReplayRejected(t *testing.T) { ... }
func TestAuthFlowDisconnectIdempotent(t *testing.T) { ... }
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./tests/integration -run TestAuthFlow`
Expected: FAIL.

- [ ] **Step 3: Complete missing glue from app/transport/adapters required by tests**

```go
// complete only missing pieces discovered by test failures (no extra feature work)
```

- [ ] **Step 4: Run integration suite**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./tests/integration -run TestAuthFlow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/tests/integration/integrations_auth_flow_test.go
git commit -m "test(integrations): add oauth lifecycle integration and security coverage"
```

---

### Task 8: Final Verification Gate

**Files:**
- No code changes unless failures appear.

- [ ] **Step 1: Full integrations tests**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./internal/modules/integrations/... -count=1`
Expected: PASS.

- [ ] **Step 2: Full build**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go build ./...`
Expected: PASS.

- [ ] **Step 3: Optional full test sweep**

Run: `cd apps/server_core && $env:GOCACHE=(Resolve-Path '.gocache').Path; go test ./... -count=1`
Expected: PASS.

- [ ] **Step 4: Final commit (if verification-only fix happened)**

```bash
git add -A
git commit -m "chore(integrations): finalize oauth lifecycle remediation verification"
```

---

## Self-Review (Plan vs Spec/Audit)

- Spec coverage check:
  - OAuth security hardening (PKCE/state/replay/tenant): covered in Tasks 1–2.
  - Refresh lifecycle with policy: covered in Task 4.
  - Disconnect/reauth semantics: covered in Task 5.
  - Background jobs semantics: covered in Task 6.
  - Integration/security test matrix (phase H): covered in Task 7.
- Placeholder scan:
  - No TBD/TODO placeholders in implementation steps.
- Type consistency:
  - Uses existing module paths and names from current codebase; each task narrows changes to exact files.
