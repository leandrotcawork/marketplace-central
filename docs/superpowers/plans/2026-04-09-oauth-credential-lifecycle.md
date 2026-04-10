# OAuth + Credential Lifecycle — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-04-09-oauth-credential-lifecycle-design.md`
**Date:** 2026-04-09
**Scope:** OAuth authorization flow, credential lifecycle, hybrid token refresh, encryption, disconnect/reauth

---

## File Structure Map

### New files to create

```
apps/server_core/internal/modules/integrations/
  domain/
    oauth_state.go              — OAuthState value object
    token_result.go             — TokenResult value object
    refresh_policy.go           — RefreshPolicy + ErrorClass + classification
    errors.go                   — structured error codes
  ports/
    auth_provider.go            — AuthProvider interface
    encryption_service.go       — EncryptionService interface
    oauth_state_store.go        — OAuthStateStore interface
  adapters/
    crypto/
      local_key.go              — AES-256-GCM local-key EncryptionService adapter
      local_key_test.go         — encrypt/decrypt roundtrip, wrong key, corruption
    postgres/
      oauth_state_repo.go       — OAuthStateStore postgres implementation
      oauth_state_repo_test.go  — store, consume, expire, cleanup tests
    mercadolivre/
      auth.go                   — ML OAuth2 AuthProvider adapter
      auth_test.go              — contract tests + ML-specific fixture tests
    magalu/
      auth.go                   — Magalu OAuth2 AuthProvider adapter
      auth_test.go              — contract tests + Magalu-specific fixture tests
    shopee/
      auth.go                   — Shopee API key AuthProvider adapter
      auth_test.go              — contract tests + Shopee-specific tests
  application/
    auth_flow_service.go        — AuthFlowService orchestrator
    auth_flow_service_test.go   — unit tests with stubbed ports
  transport/
    auth_handler.go             — OAuth/credential HTTP handlers
    auth_handler_test.go        — transport tests

apps/server_core/internal/modules/integrations/
  background/
    refresh_ticker.go           — proactive token refresh job
    state_cleanup.go            — OAuth state cleanup job

apps/server_core/migrations/
  0017_oauth_credential_lifecycle.sql
```

### Existing files to modify

```
apps/server_core/internal/modules/integrations/
  domain/lifecycle.go                    — add requires_reauth → disconnected transition
  domain/lifecycle_test.go               — add test for new transition
  domain/auth_session.go                 — add NextRetryAt field
  ports/credential_store.go              — add DeactivateAll, GetActiveCredential, UpdateActiveCredentialID
  ports/auth_session_store.go            — add GetAuthSession
  ports/installation_repository.go       — add UpdateActiveCredentialID, GetByProviderAccount
  ports/operation_run_store.go           — add ListByInstallation (for cooldown check)
  adapters/postgres/credential_repo.go   — implement new port methods
  adapters/postgres/auth_session_repo.go — implement new port methods + next_retry_at
  adapters/postgres/installation_repo.go — implement new port methods
  adapters/postgres/operation_run_repo.go — implement ListByInstallation
  transport/http_handler.go              — extend Register() with new routes, inject AuthFlowService

apps/server_core/internal/composition/root.go — wire AuthFlowService, encryption, adapters, handlers
apps/server_core/internal/platform/pgdb/config.go — add EncryptionKey field
contracts/api/marketplace-central.openapi.yaml — add auth endpoints
```

---

## Tasks

### Phase A — Domain Foundations

#### Task A1: Migration 0017

**File:** `apps/server_core/migrations/0017_oauth_credential_lifecycle.sql`

**Test command:**
```bash
cd apps/server_core && GOCACHE=.gocache go run cmd/migrate/main.go
```
**Expected:** Migration applies without errors. `integration_oauth_states` table exists, `next_retry_at` column on `integration_auth_sessions`, unique partial index on installations.

**Implementation:**

Create `apps/server_core/migrations/0017_oauth_credential_lifecycle.sql`:

```sql
-- OAuth state for CSRF/replay protection during authorization flow
CREATE TABLE integration_oauth_states (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    installation_id UUID NOT NULL REFERENCES integration_installations(id),
    nonce           VARCHAR(64) NOT NULL,
    code_verifier   VARCHAR(128) NOT NULL,
    hmac_signature  VARCHAR(128) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    consumed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_oauth_states_tenant_nonce UNIQUE (tenant_id, nonce)
);

-- Tenant-scoped nonce lookup (callback hot path)
CREATE INDEX idx_oauth_states_tenant_nonce ON integration_oauth_states(tenant_id, nonce);
CREATE INDEX idx_oauth_states_expires ON integration_oauth_states(expires_at);

-- Add next_retry_at for backoff scheduling on refresh failures
ALTER TABLE integration_auth_sessions
    ADD COLUMN next_retry_at TIMESTAMPTZ;

-- Prevent duplicate active connections to same provider account per tenant
CREATE UNIQUE INDEX idx_unique_active_provider_account
    ON integration_installations(tenant_id, provider_slug, provider_account_id)
    WHERE status NOT IN ('disconnected', 'failed')
    AND provider_account_id IS NOT NULL;
```

**Important:** The column on `integration_installations` is `provider_code` (not `provider_slug`). The index must use `provider_code`. The SQL above should read:

```sql
CREATE UNIQUE INDEX idx_unique_active_provider_account
    ON integration_installations(tenant_id, provider_code, provider_account_id)
    WHERE status NOT IN ('disconnected', 'failed')
    AND provider_account_id IS NOT NULL;
```

Also verify that `provider_account_id` column exists on `integration_installations`. If the column is `external_account_id`, use that instead. Check migration 0016 before applying.

---

#### Task A2: Extend installation status transitions

**Files:**
- `apps/server_core/internal/modules/integrations/domain/lifecycle.go`
- `apps/server_core/internal/modules/integrations/domain/lifecycle_test.go`

**Test first** — add to `lifecycle_test.go`:

```go
func TestRequiresReauthToDisconnected(t *testing.T) {
    if !CanTransitionInstallationStatus(InstallationStatusRequiresReauth, InstallationStatusDisconnected) {
        t.Fatal("requires_reauth → disconnected should be allowed")
    }
}
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go test ./internal/modules/integrations/domain/ -run TestRequiresReauthToDisconnected`
**Expected:** FAIL (transition not in map yet)

**Implementation** — in `lifecycle.go`, add to the `installationTransitions` map:

```go
InstallationStatusRequiresReauth: {
    InstallationStatusPendingConnection: true,
    InstallationStatusDisconnected:      true, // user gives up, disconnects
},
```

**Run test again.** Expected: PASS.

---

#### Task A3: Add NextRetryAt to AuthSession domain entity

**File:** `apps/server_core/internal/modules/integrations/domain/auth_session.go`

Add `NextRetryAt *time.Time` field to the `AuthSession` struct, after `ConsecutiveFailures`.

No test needed — this is a data field addition.

---

#### Task A4: Domain error codes

**File:** `apps/server_core/internal/modules/integrations/domain/errors.go` (new)

```go
package domain

import "errors"

// Authorization flow errors
var (
    ErrAuthProviderNotOAuth    = errors.New("INTEGRATIONS_AUTH_PROVIDER_NOT_OAUTH")
    ErrAuthStateInvalid        = errors.New("INTEGRATIONS_AUTH_STATE_INVALID")
    ErrAuthStateExpired        = errors.New("INTEGRATIONS_AUTH_STATE_EXPIRED")
    ErrAuthStateConsumed       = errors.New("INTEGRATIONS_AUTH_STATE_CONSUMED")
    ErrAuthCodeExchangeFailed  = errors.New("INTEGRATIONS_AUTH_CODE_EXCHANGE_FAILED")
    ErrAuthProviderUnreachable = errors.New("INTEGRATIONS_AUTH_PROVIDER_UNREACHABLE")
    ErrAuthScopesInsufficient  = errors.New("INTEGRATIONS_AUTH_SCOPES_INSUFFICIENT")
)

// Installation state errors
var (
    ErrInstallationInvalidTransition = errors.New("INTEGRATIONS_INSTALLATION_INVALID_TRANSITION")
    ErrInstallationNotFound          = errors.New("INTEGRATIONS_INSTALLATION_NOT_FOUND")
    ErrInstallationWrongStatus       = errors.New("INTEGRATIONS_INSTALLATION_WRONG_STATUS")
    ErrInstallationAlreadyConnected  = errors.New("INTEGRATIONS_INSTALLATION_ALREADY_CONNECTED")
)

// Reauth errors
var (
    ErrReauthAccountMismatch = errors.New("INTEGRATIONS_REAUTH_ACCOUNT_MISMATCH")
    ErrReauthCooldownActive  = errors.New("INTEGRATIONS_REAUTH_COOLDOWN_ACTIVE")
)

// Credential errors
var (
    ErrCredentialValidationFailed = errors.New("INTEGRATIONS_CREDENTIAL_VALIDATION_FAILED")
    ErrCredentialEncryptionFailed = errors.New("INTEGRATIONS_CREDENTIAL_ENCRYPTION_FAILED")
    ErrCredentialDecryptionFailed = errors.New("INTEGRATIONS_CREDENTIAL_DECRYPTION_FAILED")
    ErrCredentialNotFound         = errors.New("INTEGRATIONS_CREDENTIAL_NOT_FOUND")
)

// Refresh errors (internal — drive state transitions, not HTTP responses)
var (
    ErrRefreshTokenInvalid  = errors.New("INTEGRATIONS_REFRESH_TOKEN_INVALID")
    ErrRefreshRateLimited   = errors.New("INTEGRATIONS_REFRESH_RATE_LIMITED")
    ErrRefreshProviderError = errors.New("INTEGRATIONS_REFRESH_PROVIDER_ERROR")
    ErrRefreshMaxFailures   = errors.New("INTEGRATIONS_REFRESH_MAX_FAILURES")
    ErrRefreshLockContention = errors.New("INTEGRATIONS_REFRESH_LOCK_CONTENTION")
)

// API key errors
var (
    ErrAPIKeyValidationFailed = errors.New("INTEGRATIONS_APIKEY_VALIDATION_FAILED")
    ErrAPIKeyMissingFields    = errors.New("INTEGRATIONS_APIKEY_MISSING_FIELDS")
)

// Disconnect
var (
    ErrDisconnectAlreadyDisconnected = errors.New("INTEGRATIONS_DISCONNECT_ALREADY_DISCONNECTED")
)

// ErrNotSupported is returned by adapters for operations they don't support
// (e.g., Shopee's adapter returning this for OAuth methods).
var ErrNotSupported = errors.New("INTEGRATIONS_OPERATION_NOT_SUPPORTED")
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/domain/`
**Expected:** Compiles.

---

#### Task A5: OAuthState value object

**File:** `apps/server_core/internal/modules/integrations/domain/oauth_state.go` (new)

```go
package domain

import "time"

type OAuthState struct {
    ID             string
    TenantID       string
    InstallationID string
    Nonce          string
    CodeVerifier   string
    HMACSignature  string
    ExpiresAt      time.Time
    ConsumedAt     *time.Time
    CreatedAt      time.Time
}

func (s OAuthState) IsExpired(now time.Time) bool {
    return now.After(s.ExpiresAt)
}

func (s OAuthState) IsConsumed() bool {
    return s.ConsumedAt != nil
}
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/domain/`
**Expected:** Compiles.

---

#### Task A6: TokenResult value object

**File:** `apps/server_core/internal/modules/integrations/domain/token_result.go` (new)

```go
package domain

type TokenResult struct {
    AccessToken       string
    RefreshToken      string
    ExpiresIn         int    // seconds
    TokenType         string // "Bearer"
    Scopes            []string
    ProviderAccountID string
    RawExtras         map[string]any
}
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/domain/`
**Expected:** Compiles.

---

#### Task A7: RefreshPolicy and error classification

**File:** `apps/server_core/internal/modules/integrations/domain/refresh_policy.go` (new)

**Test first** — create `apps/server_core/internal/modules/integrations/domain/refresh_policy_test.go`:

```go
package domain

import (
    "testing"
    "time"
)

func TestClassifyRefreshError(t *testing.T) {
    tests := []struct {
        err  error
        want ErrorClass
    }{
        {ErrRefreshTokenInvalid, ErrorClassTerminal},
        {ErrRefreshMaxFailures, ErrorClassTerminal},
        {ErrRefreshRateLimited, ErrorClassTransient},
        {ErrRefreshProviderError, ErrorClassTransient},
        {errors.New("unknown"), ErrorClassTransient},
    }
    for _, tt := range tests {
        if got := ClassifyRefreshError(tt.err); got != tt.want {
            t.Errorf("ClassifyRefreshError(%v) = %v, want %v", tt.err, got, tt.want)
        }
    }
}

func TestDefaultRefreshPolicy(t *testing.T) {
    p := DefaultRefreshPolicy()
    if p.MaxConsecutiveFailures != 5 {
        t.Fatalf("expected 5 max failures, got %d", p.MaxConsecutiveFailures)
    }
    if p.BackoffBase != 30*time.Second {
        t.Fatalf("expected 30s base, got %v", p.BackoffBase)
    }
}

func TestRefreshPolicyBackoffDuration(t *testing.T) {
    p := DefaultRefreshPolicy()
    // attempt 0 → 30s, attempt 1 → 60s, attempt 4 → capped at 15min
    if d := p.BackoffDuration(0); d != 30*time.Second {
        t.Fatalf("attempt 0: got %v", d)
    }
    if d := p.BackoffDuration(4); d != p.BackoffMax {
        t.Fatalf("attempt 4: expected cap at %v, got %v", p.BackoffMax, d)
    }
}
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go test ./internal/modules/integrations/domain/ -run TestClassifyRefreshError`
**Expected:** FAIL (types don't exist yet)

**Implementation** — `refresh_policy.go`:

```go
package domain

import (
    "errors"
    "math"
    "time"
)

type ErrorClass int

const (
    ErrorClassTransient ErrorClass = iota
    ErrorClassTerminal
    ErrorClassClient
)

type RefreshPolicy struct {
    MaxConsecutiveFailures int
    BackoffBase            time.Duration
    BackoffMax             time.Duration
    CooldownAfterTerminal  time.Duration
}

func DefaultRefreshPolicy() RefreshPolicy {
    return RefreshPolicy{
        MaxConsecutiveFailures: 5,
        BackoffBase:            30 * time.Second,
        BackoffMax:             15 * time.Minute,
        CooldownAfterTerminal:  1 * time.Hour,
    }
}

func (p RefreshPolicy) BackoffDuration(attempt int) time.Duration {
    d := time.Duration(float64(p.BackoffBase) * math.Pow(2, float64(attempt)))
    if d > p.BackoffMax {
        return p.BackoffMax
    }
    return d
}

func ClassifyRefreshError(err error) ErrorClass {
    switch {
    case errors.Is(err, ErrRefreshTokenInvalid),
         errors.Is(err, ErrRefreshMaxFailures):
        return ErrorClassTerminal
    default:
        return ErrorClassTransient
    }
}
```

**Run tests again.** Expected: PASS.

---

### Phase B — Port Interfaces

#### Task B1: AuthProvider port

**File:** `apps/server_core/internal/modules/integrations/ports/auth_provider.go` (new)

```go
package ports

import (
    "context"

    "marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type AuthProvider interface {
    ProviderCode() string
    AuthStrategy() domain.AuthStrategy
    BuildAuthorizeURL(state, redirectURI, codeChallenge string) (string, error)
    ExchangeCode(ctx context.Context, code, redirectURI, codeVerifier string) (*domain.TokenResult, error)
    RefreshToken(ctx context.Context, refreshToken string) (*domain.TokenResult, error)
    RevokeToken(ctx context.Context, accessToken string) error
    ValidateCredentials(ctx context.Context, creds map[string]string) (*domain.TokenResult, error)
}
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/ports/`
**Expected:** Compiles.

---

#### Task B2: EncryptionService port

**File:** `apps/server_core/internal/modules/integrations/ports/encryption_service.go` (new)

```go
package ports

import "context"

type EncryptionService interface {
    Encrypt(ctx context.Context, plaintext []byte) (ciphertext []byte, keyID string, err error)
    Decrypt(ctx context.Context, ciphertext []byte, keyID string) ([]byte, error)
}
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/ports/`
**Expected:** Compiles.

---

#### Task B3: OAuthStateStore port

**File:** `apps/server_core/internal/modules/integrations/ports/oauth_state_store.go` (new)

```go
package ports

import (
    "context"

    "marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type OAuthStateStore interface {
    Save(ctx context.Context, state domain.OAuthState) error
    GetByNonce(ctx context.Context, nonce string) (domain.OAuthState, bool, error)
    ConsumeNonce(ctx context.Context, id string) (bool, error) // atomic CAS: returns false if already consumed
    DeleteExpired(ctx context.Context, olderThan time.Time) (int64, error)
}
```

Note: add `"time"` import.

**Tenant scoping:** All methods are tenant-scoped via the repository constructor (same pattern as all other repos). `GetByNonce` queries with `AND tenant_id = r.tenantID`. `ConsumeNonce` uses atomic CAS: `UPDATE ... SET consumed_at = now() WHERE id = $1 AND tenant_id = $2 AND consumed_at IS NULL` — returns `false` if no row affected (already consumed or wrong tenant).

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/ports/`
**Expected:** Compiles.

---

#### Task B4: Extend existing port interfaces

**File:** `apps/server_core/internal/modules/integrations/ports/credential_store.go`

Add methods:

```go
type CredentialStore interface {
    NextCredentialVersion(ctx context.Context, installationID string) (int, error)
    SaveCredentialVersion(ctx context.Context, cred domain.Credential) error
    GetActiveCredential(ctx context.Context, installationID string) (domain.Credential, bool, error)
    DeactivateCredential(ctx context.Context, credentialID string) error
    DeactivateAllForInstallation(ctx context.Context, installationID string) error
}
```

**File:** `apps/server_core/internal/modules/integrations/ports/auth_session_store.go`

Add method:

```go
type AuthSessionStore interface {
    UpsertAuthSession(ctx context.Context, session domain.AuthSession) error
    GetAuthSession(ctx context.Context, installationID string) (domain.AuthSession, bool, error)
    ListExpiringSessions(ctx context.Context, expiresWithin time.Duration) ([]domain.AuthSession, error)
}
```

Note: add `"time"` import.

**File:** `apps/server_core/internal/modules/integrations/ports/installation_repository.go`

Add methods:

```go
type InstallationRepository interface {
    CreateInstallation(ctx context.Context, inst domain.Installation) error
    GetInstallation(ctx context.Context, installationID string) (domain.Installation, bool, error)
    ListInstallations(ctx context.Context) ([]domain.Installation, error)
    UpdateInstallationStatus(ctx context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error
    UpdateActiveCredentialID(ctx context.Context, installationID, credentialID string) error
    SetProviderAccountID(ctx context.Context, installationID, providerAccountID, providerAccountName string) error
}
```

**File:** `apps/server_core/internal/modules/integrations/ports/operation_run_store.go`

Add method:

```go
type OperationRunStore interface {
    SaveOperationRun(ctx context.Context, run domain.OperationRun) error
    ListByInstallation(ctx context.Context, installationID string, limit int) ([]domain.OperationRun, error)
}
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/ports/`
**Expected:** Compiles.

Note: existing adapter implementations will fail to compile since they don't implement new methods yet. This is expected — we fix them in Phase C.

---

### Phase C — Adapters

#### Task C1: Local-key encryption adapter

**File:** `apps/server_core/internal/modules/integrations/adapters/crypto/local_key.go` (new)

**Test first** — create `local_key_test.go`:

```go
package crypto

import "testing"

func TestEncryptDecryptRoundtrip(t *testing.T) {
    svc, err := NewLocalKeyService("test-key-32-bytes-long-exactly!!")
    if err != nil {
        t.Fatal(err)
    }
    plaintext := []byte(`{"access_token":"abc123","refresh_token":"def456"}`)
    ciphertext, keyID, err := svc.Encrypt(context.Background(), plaintext)
    if err != nil {
        t.Fatal(err)
    }
    if keyID == "" {
        t.Fatal("keyID should not be empty")
    }
    decrypted, err := svc.Decrypt(context.Background(), ciphertext, keyID)
    if err != nil {
        t.Fatal(err)
    }
    if string(decrypted) != string(plaintext) {
        t.Fatalf("roundtrip failed: got %q", decrypted)
    }
}

func TestDecryptWrongKeyID(t *testing.T) {
    svc, _ := NewLocalKeyService("test-key-32-bytes-long-exactly!!")
    ciphertext, _, _ := svc.Encrypt(context.Background(), []byte("secret"))
    _, err := svc.Decrypt(context.Background(), ciphertext, "wrong-key-id")
    if err == nil {
        t.Fatal("expected error for wrong keyID")
    }
}

func TestDecryptCorruptedData(t *testing.T) {
    svc, _ := NewLocalKeyService("test-key-32-bytes-long-exactly!!")
    _, err := svc.Decrypt(context.Background(), []byte("garbage"), "any-key")
    if err == nil {
        t.Fatal("expected error for corrupted data")
    }
}

func TestNewLocalKeyServiceRejectsShortKey(t *testing.T) {
    _, err := NewLocalKeyService("short")
    if err == nil {
        t.Fatal("expected error for short key")
    }
}

func TestKeyRotationCompatibility(t *testing.T) {
    // Encrypt with key A, create service with key B
    // Decrypt with key B using key A's keyID → error (different key)
    // This proves keyID is tied to the KEK and prevents silent wrong-key decryption
    svcA, _ := NewLocalKeyService("key-A-32-bytes-long-exactly-now!")
    svcB, _ := NewLocalKeyService("key-B-32-bytes-long-exactly-now!")
    ciphertext, keyIDA, _ := svcA.Encrypt(context.Background(), []byte("secret"))
    _, err := svcB.Decrypt(context.Background(), ciphertext, keyIDA)
    if err == nil {
        t.Fatal("expected error: different KEK should fail decryption")
    }
}

func TestKeyIDDeterministic(t *testing.T) {
    // Same KEK → same keyID (for credential→key mapping)
    svc1, _ := NewLocalKeyService("test-key-32-bytes-long-exactly!!")
    svc2, _ := NewLocalKeyService("test-key-32-bytes-long-exactly!!")
    _, id1, _ := svc1.Encrypt(context.Background(), []byte("a"))
    _, id2, _ := svc2.Encrypt(context.Background(), []byte("b"))
    if id1 != id2 {
        t.Fatalf("same KEK should produce same keyID: %s vs %s", id1, id2)
    }
}
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go test ./internal/modules/integrations/adapters/crypto/ -run Test`
**Expected:** FAIL (package doesn't exist)

**Implementation** — `local_key.go`:

Envelope encryption with AES-256-GCM:
- Constructor takes KEK as string (32 bytes), derives keyID as `hex(SHA256(kek)[:8])` — deterministic, allows matching credentials to their KEK
- `Encrypt`: generate 32-byte DEK via `crypto/rand`, encrypt plaintext with DEK via AES-256-GCM, encrypt DEK with KEK via AES-256-GCM, return `dek_nonce(12) || encrypted_dek(48) || data_nonce(12) || encrypted_data`
- `Decrypt`: validate keyID matches `hex(SHA256(kek)[:8])`, split payload, decrypt DEK with KEK, decrypt data with DEK
- Zero DEK bytes after use
- Credential payload carries `encryption_key_id` (from `Encrypt` return) — this links each credential version to the KEK that encrypted it, enabling selective re-encryption during key rotation

**Run tests.** Expected: All PASS.

---

#### Task C2: OAuthState postgres repository

**File:** `apps/server_core/internal/modules/integrations/adapters/postgres/oauth_state_repo.go` (new)

**Implementation:**

```go
type OAuthStateRepository struct {
    pool     *pgxpool.Pool
    tenantID string
}

func NewOAuthStateRepository(pool *pgxpool.Pool, tenantID string) *OAuthStateRepository

func (r *OAuthStateRepository) Save(ctx context.Context, state domain.OAuthState) error
// INSERT INTO integration_oauth_states (...) VALUES ($1, $2, ...)
// WHERE tenant_id = r.tenantID

func (r *OAuthStateRepository) GetByNonce(ctx context.Context, nonce string) (domain.OAuthState, bool, error)
// SELECT ... FROM integration_oauth_states WHERE nonce = $1 AND tenant_id = $2

func (r *OAuthStateRepository) ConsumeNonce(ctx context.Context, id string) (bool, error)
// Atomic CAS:
// UPDATE integration_oauth_states SET consumed_at = now()
// WHERE id = $1 AND tenant_id = $2 AND consumed_at IS NULL
// Check rows affected: 1 → true (consumed), 0 → false (already consumed or wrong tenant)

func (r *OAuthStateRepository) DeleteExpired(ctx context.Context, olderThan time.Time) (int64, error)
// DELETE FROM integration_oauth_states WHERE expires_at < $1
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/adapters/postgres/`
**Expected:** Compiles.

---

#### Task C3: Extend credential postgres repository

**File:** `apps/server_core/internal/modules/integrations/adapters/postgres/credential_repo.go`

Add three new methods to satisfy the extended `CredentialStore` interface:

```go
func (r *CredentialRepository) GetActiveCredential(ctx context.Context, installationID string) (domain.Credential, bool, error)
// SELECT ... FROM integration_credentials
// WHERE installation_id = $1 AND tenant_id = $2 AND is_active = true
// ORDER BY version DESC LIMIT 1

func (r *CredentialRepository) DeactivateCredential(ctx context.Context, credentialID string) error
// UPDATE integration_credentials SET is_active = false, revoked_at = now(), updated_at = now()
// WHERE credential_id = $1 AND tenant_id = $2

func (r *CredentialRepository) DeactivateAllForInstallation(ctx context.Context, installationID string) error
// UPDATE integration_credentials SET is_active = false, revoked_at = now(), updated_at = now()
// WHERE installation_id = $1 AND tenant_id = $2 AND is_active = true
```

**Cutover transaction semantics** (used by AuthFlowService.RefreshCredential):

The cutover is NOT a single repo method — it's orchestrated by AuthFlowService using existing repo methods in a single DB transaction:

```
BEGIN
  0. SELECT ... FROM integration_installations WHERE id=$1 FOR UPDATE  -- row lock
  1. SaveCredentialVersion(v_new, is_active=true)     -- temporarily 2 active
  2. [validate new credential via provider API call]
  3a. IF valid:  UPDATE installations SET active_credential_id=v_new.id
                 WHERE active_credential_id=v_old.id   -- CAS: assert 1 row
                 DeactivateCredential(v_old.id)
  3b. IF invalid OR CAS=0: DeactivateCredential(v_new.id) -- rollback
COMMIT
```

The row lock (step 0) prevents concurrent disconnect/reauth from racing the cutover. The CAS in step 3a ensures no lost update if a second writer somehow reaches this point. Steps use existing repo methods within `pgx.BeginTx`. The DB trigger `prevent_deactivating_or_revoking_referenced_credential` ensures step ordering correctness.

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/adapters/postgres/`
**Expected:** Compiles.

---

#### Task C4: Extend auth session postgres repository

**File:** `apps/server_core/internal/modules/integrations/adapters/postgres/auth_session_repo.go`

Update `UpsertAuthSession` to include `next_retry_at` in the INSERT/UPDATE.

Add two new methods:

```go
func (r *AuthSessionRepository) GetAuthSession(ctx context.Context, installationID string) (domain.AuthSession, bool, error)
// SELECT ... FROM integration_auth_sessions
// WHERE installation_id = $1 AND tenant_id = $2

func (r *AuthSessionRepository) ListExpiringSessions(ctx context.Context, expiresWithin time.Duration) ([]domain.AuthSession, error)
// SELECT ... FROM integration_auth_sessions
// WHERE state IN ('valid', 'expiring')
// AND access_token_expires_at < now() + $1
// AND (next_retry_at IS NULL OR next_retry_at <= now())
// AND tenant_id = $2
```

Also update the `scanAuthSession` helper to handle the new `next_retry_at` column.

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/adapters/postgres/`
**Expected:** Compiles.

---

#### Task C5: Extend installation postgres repository

**File:** `apps/server_core/internal/modules/integrations/adapters/postgres/installation_repo.go`

Add two new methods:

```go
func (r *InstallationRepository) UpdateActiveCredentialID(ctx context.Context, installationID, credentialID string) error
// UPDATE integration_installations SET active_credential_id = $1, updated_at = now()
// WHERE id = $2 AND tenant_id = $3

func (r *InstallationRepository) SetProviderAccountID(ctx context.Context, installationID, providerAccountID, providerAccountName string) error
// UPDATE integration_installations SET external_account_id = $1, external_account_name = $2, updated_at = now()
// WHERE id = $3 AND tenant_id = $4
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/adapters/postgres/`
**Expected:** Compiles.

---

#### Task C6: Extend operation run postgres repository

**File:** `apps/server_core/internal/modules/integrations/adapters/postgres/operation_run_repo.go`

Add:

```go
func (r *OperationRunRepository) ListByInstallation(ctx context.Context, installationID string, limit int) ([]domain.OperationRun, error)
// SELECT ... FROM integration_operation_runs
// WHERE installation_id = $1 AND tenant_id = $2
// ORDER BY created_at DESC LIMIT $3
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/adapters/postgres/`
**Expected:** Compiles.

---

#### Task C7: Verify all adapters compile together

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./internal/modules/integrations/...`
**Expected:** All packages compile. No unimplemented interface errors.

---

#### Task C8: Mercado Livre auth adapter

**File:** `apps/server_core/internal/modules/integrations/adapters/mercadolivre/auth.go` (new)

**Test first** — create `auth_test.go` with contract tests:

```go
package mercadolivre

import (
    "testing"

    "marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

func TestAuthStrategy(t *testing.T) {
    a := NewAuthAdapter("client-id", "client-secret")
    if a.AuthStrategy() != domain.AuthStrategyOAuth2 {
        t.Fatal("expected oauth2")
    }
}

func TestBuildAuthorizeURL(t *testing.T) {
    a := NewAuthAdapter("client-id", "client-secret")
    url, err := a.BuildAuthorizeURL("state123", "http://localhost/callback", "challenge456")
    if err != nil {
        t.Fatal(err)
    }
    // Must contain ML auth endpoint, client_id, redirect_uri, state, code_challenge
    if !strings.Contains(url, "auth.mercadolivre.com.br") {
        t.Fatalf("URL missing ML auth domain: %s", url)
    }
    if !strings.Contains(url, "client-id") {
        t.Fatalf("URL missing client_id: %s", url)
    }
    if !strings.Contains(url, "state123") {
        t.Fatalf("URL missing state: %s", url)
    }
}

func TestValidateCredentialsReturnsNotSupported(t *testing.T) {
    a := NewAuthAdapter("client-id", "client-secret")
    _, err := a.ValidateCredentials(context.Background(), map[string]string{})
    if !errors.Is(err, domain.ErrNotSupported) {
        t.Fatalf("expected ErrNotSupported, got %v", err)
    }
}
```

**Run:** `cd apps/server_core && GOCACHE=.gocache go test ./internal/modules/integrations/adapters/mercadolivre/ -run TestAuth`
**Expected:** FAIL (package doesn't exist)

**Implementation** — `auth.go`:

```go
package mercadolivre

const (
    mlAuthURL  = "https://auth.mercadolivre.com.br/authorization"
    mlTokenURL = "https://api.mercadolibre.com/oauth/token"
)

type AuthAdapter struct {
    clientID     string
    clientSecret string
    httpClient   *http.Client
}

func NewAuthAdapter(clientID, clientSecret string) *AuthAdapter

func (a *AuthAdapter) ProviderCode() string { return "mercado_livre" }
func (a *AuthAdapter) AuthStrategy() domain.AuthStrategy { return domain.AuthStrategyOAuth2 }
func (a *AuthAdapter) BuildAuthorizeURL(state, redirectURI, codeChallenge string) (string, error)
func (a *AuthAdapter) ExchangeCode(ctx context.Context, code, redirectURI, codeVerifier string) (*domain.TokenResult, error)
func (a *AuthAdapter) RefreshToken(ctx context.Context, refreshToken string) (*domain.TokenResult, error)
func (a *AuthAdapter) RevokeToken(ctx context.Context, accessToken string) error
func (a *AuthAdapter) ValidateCredentials(ctx context.Context, creds map[string]string) (*domain.TokenResult, error)
```

- `ExchangeCode`: POST to `mlTokenURL` with `grant_type=authorization_code`, parse ML response (includes `user_id` → put in `RawExtras`)
- `RefreshToken`: POST to `mlTokenURL` with `grant_type=refresh_token`
- `RevokeToken`: ML doesn't have a revoke endpoint — log and return nil (best-effort)
- `ValidateCredentials`: return `domain.ErrNotSupported`
- HTTP client timeout: 10s

**Run tests.** Expected: All PASS.

---

#### Task C9: Magalu auth adapter

**File:** `apps/server_core/internal/modules/integrations/adapters/magalu/auth.go` (new)

Same pattern as ML adapter. Differences:

- Auth URL: Magalu OAuth endpoint (from docs/marketplaces/magalu.md or env config)
- Token URL: Magalu token endpoint
- No `user_id` extra field
- `RevokeToken`: Magalu has revoke endpoint — implement it

**Test first** with same contract test pattern as C8.

**Run:** `cd apps/server_core && GOCACHE=.gocache go test ./internal/modules/integrations/adapters/magalu/ -run TestAuth`
**Expected:** All PASS after implementation.

---

#### Task C10: Shopee auth adapter

**File:** `apps/server_core/internal/modules/integrations/adapters/shopee/auth.go` (new)

**Test first:**

```go
func TestAuthStrategy(t *testing.T) {
    a := NewAuthAdapter()
    if a.AuthStrategy() != domain.AuthStrategyAPIKey {
        t.Fatal("expected api_key")
    }
}

func TestBuildAuthorizeURLReturnsNotSupported(t *testing.T) {
    a := NewAuthAdapter()
    _, err := a.BuildAuthorizeURL("state", "uri", "challenge")
    if !errors.Is(err, domain.ErrNotSupported) {
        t.Fatal("expected ErrNotSupported")
    }
}

func TestValidateCredentialsRequiresFields(t *testing.T) {
    a := NewAuthAdapter()
    _, err := a.ValidateCredentials(context.Background(), map[string]string{})
    if !errors.Is(err, domain.ErrAPIKeyMissingFields) {
        t.Fatalf("expected ErrAPIKeyMissingFields, got %v", err)
    }
}
```

**Implementation:**

- `ProviderCode()`: `"shopee"`
- `AuthStrategy()`: `domain.AuthStrategyAPIKey`
- `BuildAuthorizeURL`, `ExchangeCode`, `RefreshToken`, `RevokeToken`: all return `domain.ErrNotSupported`
- `ValidateCredentials`: requires `api_key` and `shop_id` in map. Makes a test API call to Shopee to verify the key works. Returns `TokenResult` with `ProviderAccountID = shop_id`.

**Run tests.** Expected: All PASS.

---

### Phase D — Application Layer

#### Task D1: AuthFlowService — StartAuthorize + HandleCallback

**File:** `apps/server_core/internal/modules/integrations/application/auth_flow_service.go` (new)

This is the largest task. Split into sub-steps.

**Dependencies (injected via constructor):**
- `ports.InstallationRepository`
- `ports.CredentialStore`
- `ports.AuthSessionStore`
- `ports.CapabilityStateStore`
- `ports.OperationRunStore`
- `ports.OAuthStateStore`
- `ports.EncryptionService`
- `map[string]ports.AuthProvider` (keyed by provider_code)
- `tenantID string`
- HMAC secret (`[]byte`)
- Callback redirect URI (`string`)
- Frontend base URL for redirect (`string`)

**Test first** — create `auth_flow_service_test.go`:

Create stub implementations for all ports (in-memory maps). Test:

1. `TestStartAuthorize_HappyPath` — draft installation → pending_connection, returns authorize URL
2. `TestStartAuthorize_WrongStatus` — connected installation → ErrInstallationWrongStatus
3. `TestStartAuthorize_NonOAuthProvider` — Shopee installation → ErrAuthProviderNotOAuth
4. `TestHandleCallback_HappyPath` — valid state + code → connected, credential v1 created
5. `TestHandleCallback_InvalidState` — tampered HMAC → ErrAuthStateInvalid
6. `TestHandleCallback_ExpiredState` — expired nonce → ErrAuthStateExpired
7. `TestHandleCallback_ConsumedState` — consumed nonce → ErrAuthStateConsumed

**Run:** `cd apps/server_core && GOCACHE=.gocache go test ./internal/modules/integrations/application/ -run TestStartAuthorize`
**Expected:** FAIL (service doesn't exist)

**Implementation** — `auth_flow_service.go`:

```go
type AuthFlowService struct { ... }

func NewAuthFlowService(...) *AuthFlowService

func (s *AuthFlowService) StartAuthorize(ctx context.Context, installationID string) (authorizeURL string, expiresIn int, err error)
// 1. Get installation, validate status = pending_connection
// 2. Lookup AuthProvider by provider_code
// 3. Validate provider is OAuth2
// 4. Generate nonce (crypto/rand, 32 bytes, hex)
// 5. Generate PKCE code_verifier (43 chars, crypto/rand, base64url)
// 6. Compute code_challenge = base64url(sha256(code_verifier))
// 7. Compute HMAC-SHA256 of (installation_id | nonce) with secret
// 8. Build state param = base64(installation_id | nonce) + "." + hmac_hex
// 9. Save OAuthState to store
// 10. Call adapter.BuildAuthorizeURL(state, callbackURI, code_challenge)
// 11. Return URL + 600 (TTL seconds)

func (s *AuthFlowService) HandleCallback(ctx context.Context, code, stateParam string) (installationID string, err error)
// 1. Split stateParam on "." → payload + signature
// 2. Verify HMAC signature
// 3. Decode payload → installation_id, nonce
// 4. Load OAuthState by nonce
// 5. Verify tenant_id matches
// 6. Verify installation_id matches
// 7. Check not expired
// 8. Check not consumed
// 9. Mark consumed
// 10. Load code_verifier from OAuthState
// 11. Get installation
// 12. Lookup AuthProvider
// 13. adapter.ExchangeCode(code, callbackURI, code_verifier) → TokenResult
// 14. Encrypt credential payload (JSON serialize TokenResult → encrypt)
// 15. Create credential v1
// 16. Set installation active_credential_id
// 17. Set provider_account_id on installation
// 18. Upsert AuthSession (state=valid, expires_at from TokenResult)
// 19. Update installation status → connected, health → healthy
// 20. Resolve capabilities
// 21. Record OperationRun (auth_connect, succeeded)
// 22. Delete OAuthState
// 23. Return installationID
```

**Run tests.** Expected: All PASS.

---

#### Task D2: AuthFlowService — SubmitAPIKey

Add to `auth_flow_service.go`:

**Test first:**

1. `TestSubmitAPIKey_HappyPath` — pending_connection + valid key → connected
2. `TestSubmitAPIKey_MissingFields` — empty map → ErrAPIKeyMissingFields
3. `TestSubmitAPIKey_ValidationFailed` — adapter returns error → ErrAPIKeyValidationFailed

```go
func (s *AuthFlowService) SubmitAPIKey(ctx context.Context, installationID string, creds map[string]string) error
// 1. Get installation, validate status = pending_connection
// 2. Lookup AuthProvider
// 3. Validate provider is api_key
// 4. adapter.ValidateCredentials(creds) → TokenResult with ProviderAccountID
// 5. Encrypt credential payload
// 6. Create credential v1
// 7. Set active_credential_id, provider_account_id
// 8. Upsert AuthSession (state=valid, no expiry for API keys)
// 9. Update installation → connected, healthy
// 10. Resolve capabilities
// 11. Record OperationRun
```

**Run tests.** Expected: All PASS.

---

#### Task D3: AuthFlowService — Disconnect

Add to `auth_flow_service.go`:

**Test first:**

1. `TestDisconnect_HappyPath` — connected → disconnected, credentials deactivated
2. `TestDisconnect_RequiresReauth` — requires_reauth → disconnected (also valid)
3. `TestDisconnect_AlreadyDisconnected` — idempotent, returns nil
4. `TestDisconnect_WrongStatus` — draft → error
5. `TestDisconnect_CascadesCapabilities` — verify all capabilities move to `disabled` after disconnect

```go
func (s *AuthFlowService) Disconnect(ctx context.Context, installationID string) (revocationResult string, err error)
// 1. Get installation
// 2. If already disconnected → return "already_disconnected", nil (idempotent)
// 3. Validate status is connected or requires_reauth
// 4. Get active credential, decrypt access_token
// 5. adapter.RevokeToken() — best-effort, capture result
// 6. DeactivateAllForInstallation
// 7. Upsert AuthSession (state=invalid)
// 8. Update installation → disconnected, critical
// 9. Cascade capabilities: load all capability states for this installation,
//    set ALL to CapabilityStatusDisabled with reason_code "disconnected"
//    via CapabilityStateStore.UpsertCapabilityStates
// 10. Record OperationRun (auth_disconnect)
// 11. Return revocation result
```

**Run tests.** Expected: All PASS.

---

#### Task D4: AuthFlowService — RefreshCredential

Add to `auth_flow_service.go`:

**Test first:**

1. `TestRefreshCredential_HappyPath` — valid session → new credential version, session updated
2. `TestRefreshCredential_TerminalError` — invalid_grant → requires_reauth, capabilities set to `requires_reauth`
3. `TestRefreshCredential_TransientError` — timeout → consecutive_failures++, next_retry_at set, capabilities `degraded`
4. `TestRefreshCredential_MaxFailures` — 5th transient → terminal escalation, capabilities `requires_reauth`
5. `TestRefreshCredential_CascadesCapabilitiesOnTerminal` — verify all capabilities move to `requires_reauth`
6. `TestRefreshCredential_CascadesCapabilitiesOnTransient` — verify capabilities move to `degraded`
7. `TestRefreshCredential_CutoverRollback` — validation of new credential fails → old credential preserved, no capability change

```go
func (s *AuthFlowService) RefreshCredential(ctx context.Context, installationID string) error
// 1. Get installation, validate connected
// 2. Get active credential, decrypt refresh_token
// 3. Lookup AuthProvider
// 4. adapter.RefreshToken(refreshToken) → TokenResult
// 5. If error:
//    a. Classify error (terminal vs transient)
//    b. Terminal → update session (refresh_failed), installation (requires_reauth, critical),
//       CASCADE CAPABILITIES: load all capability states, set ALL to requires_reauth
//       with reason_code = refresh failure code, record op
//    c. Transient → increment consecutive_failures, compute next_retry_at, update session,
//       CASCADE CAPABILITIES: set ALL to degraded with reason_code = "refresh_transient_failure"
//    d. If consecutive_failures >= MaxConsecutiveFailures → treat as terminal (same cascade as 5b)
// 6. If success — CUTOVER TRANSACTION:
//    a. Encrypt new tokens
//    b. BEGIN TX:
//       i.   SELECT ... FROM integration_installations WHERE id = $1 AND tenant_id = $2 FOR UPDATE
//            (row lock prevents concurrent disconnect/reauth from racing the cutover)
//       ii.  SaveCredentialVersion(v_new, is_active=true)
//       iii. [Validate: make lightweight provider API call with new access_token — outside lock scope if possible, or with short timeout]
//       iv.  IF valid: UPDATE integration_installations SET active_credential_id = v_new.id
//            WHERE id = $1 AND active_credential_id = v_old.id (CAS — assert 1 row affected)
//            → DeactivateCredential(v_old.id)
//       v.   IF invalid OR CAS fails: DeactivateCredential(v_new.id) → return ErrCredentialValidationFailed
//    c. COMMIT TX
//    d. Update AuthSession (valid, new expiry, reset failures, reset next_retry_at)
//    e. CASCADE CAPABILITIES: re-resolve all capabilities (back to enabled)
//    f. Record OperationRun (auth_refresh, succeeded, version_from → version_to)
```

**Run tests.** Expected: All PASS.

---

#### Task D5: AuthFlowService — StartReauth

Add to `auth_flow_service.go`:

**Test first:**

1. `TestStartReauth_HappyPath` — requires_reauth → pending_connection, returns authorize URL
2. `TestStartReauth_WrongStatus` — connected → error
3. `TestStartReauth_CooldownActive` — terminal failure < 1h ago → ErrReauthCooldownActive

```go
func (s *AuthFlowService) StartReauth(ctx context.Context, installationID string) (authorizeURL string, expiresIn int, err error)
// 1. Get installation, validate status = requires_reauth
// 2. Check cooldown: query last terminal OperationRun, if < 1h → ErrReauthCooldownActive
// 3. Transition installation to pending_connection
// 4. Delegate to StartAuthorize logic (same OAuth state generation)
```

Note: `HandleCallback` already handles reauth — when it finds an existing `provider_account_id` on the installation, it validates the new one matches. If mismatch → `ErrReauthAccountMismatch`.

On successful reauth callback, capabilities are re-resolved via `CapabilityService.Resolve()` (same as initial connect in D1). This restores all capabilities from `requires_reauth` back to `enabled`.

Add test:

5. `TestHandleCallback_ReauthAccountMismatch` — existing provider_account_id doesn't match new one → error

**Run tests.** Expected: All PASS.

---

#### Task D6: AuthFlowService — GetAuthStatus

Add to `auth_flow_service.go`:

**Test first:**

1. `TestGetAuthStatus_HappyPath` — returns full auth health

```go
type AuthStatusResponse struct {
    InstallationID       string
    AuthStrategy         domain.AuthStrategy
    AuthState            domain.AuthState
    HealthStatus         domain.HealthStatus
    AccessTokenExpiresAt *time.Time
    LastRefreshAt        *time.Time
    ConsecutiveFailures  int
    RefreshFailureCode   string
    ProviderAccountID    string
    CredentialVersion    int
    Capabilities         []domain.CapabilityState
}

func (s *AuthFlowService) GetAuthStatus(ctx context.Context, installationID string) (AuthStatusResponse, error)
// 1. Get installation
// 2. Get auth session
// 3. Get active credential (version only)
// 4. List capability states
// 5. Assemble response
```

**Run tests.** Expected: All PASS.

---

### Phase E — Transport Layer

#### Task E1: Auth HTTP handlers

**File:** `apps/server_core/internal/modules/integrations/transport/auth_handler.go` (new)

**Test first** — create `auth_handler_test.go`:

```go
func TestHandleAuthorize_Returns200WithURL(t *testing.T)
func TestHandleAuthorize_409WrongStatus(t *testing.T)
func TestHandleCallback_302RedirectOnSuccess(t *testing.T)
func TestHandleCallback_302RedirectOnError(t *testing.T)
func TestHandleCredentials_200OnValidKey(t *testing.T)
func TestHandleCredentials_400MissingFields(t *testing.T)
func TestHandleDisconnect_200WithResult(t *testing.T)
func TestHandleDisconnect_IdempotentOnDisconnected(t *testing.T)
func TestHandleReauthAuthorize_200WithURL(t *testing.T)
func TestHandleReauthAuthorize_429Cooldown(t *testing.T)
func TestHandleAuthStatus_200WithHealth(t *testing.T)
func TestHandleAuthStatus_NoSecretsInResponse(t *testing.T)
```

**Implementation:**

Define `AuthFlowReader` interface (transport-local, wraps `AuthFlowService` methods):

```go
type AuthFlowReader interface {
    StartAuthorize(ctx context.Context, installationID string) (string, int, error)
    HandleCallback(ctx context.Context, code, state string) (string, error)
    SubmitAPIKey(ctx context.Context, installationID string, creds map[string]string) error
    Disconnect(ctx context.Context, installationID string) (string, error)
    StartReauth(ctx context.Context, installationID string) (string, int, error)
    GetAuthStatus(ctx context.Context, installationID string) (application.AuthStatusResponse, error)
}
```

Handler routes:

```go
func (h AuthHandler) Register(mux *http.ServeMux) {
    mux.HandleFunc("/integrations/installations/", h.handleInstallationSubroutes)
    mux.HandleFunc("/integrations/auth/callback", h.handleCallback)
}

func (h AuthHandler) handleInstallationSubroutes(w http.ResponseWriter, r *http.Request)
// Parse installation ID from path
// Route to sub-handler based on path suffix:
//   /auth/authorize → handleAuthorize (POST)
//   /auth/credentials → handleCredentials (POST)
//   /auth/status → handleAuthStatus (GET)
//   /disconnect → handleDisconnect (POST)
//   /reauth/authorize → handleReauthAuthorize (POST)
```

Each handler:
- Validates HTTP method
- Decodes body (if any)
- Calls AuthFlowService method
- Maps domain errors to HTTP status + error codes (using existing `mapIntegrationError` pattern, extended for new error codes)
- Returns JSON or 302 redirect (callback only)
- Logs `action`, `result`, `duration_ms`

**Rate limiting:** Add a simple in-memory rate limiter (per tenant, per endpoint):
- `/auth/authorize` and `/reauth/authorize`: 10 requests/min per tenant
- `/auth/credentials`: 5 requests/min per tenant
- Use `golang.org/x/time/rate` or a simple token bucket in a `sync.Map` keyed by `tenant_id`
- Return 429 with `INTEGRATIONS_AUTH_RATE_LIMITED` when exceeded

**Run tests.** Expected: All PASS.

---

#### Task E2: Extend existing handler registration

**File:** `apps/server_core/internal/modules/integrations/transport/http_handler.go`

Update `Register()` to also register the `AuthHandler`. The existing `Handler` struct continues to handle `/integrations/providers` and `/integrations/installations` (GET/POST for listing and draft creation).

The new `AuthHandler` handles the sub-routes under `/integrations/installations/:id/...`.

Note: Go's `http.ServeMux` handles longest-prefix matching, so `/integrations/installations/` (with trailing slash) will match sub-routes while `/integrations/installations` (without) matches the exact path.

Verify routing doesn't conflict. If needed, consolidate both handlers into a single handler that dispatches based on path depth.

**Run:** `cd apps/server_core && GOCACHE=.gocache go test ./internal/modules/integrations/transport/ -run Test`
**Expected:** All existing + new tests PASS.

---

### Phase F — Background Jobs

#### Task F1: Proactive refresh ticker

**File:** `apps/server_core/internal/modules/integrations/background/refresh_ticker.go` (new)

**Test first** — create `refresh_ticker_test.go`:

```go
func TestRefreshTicker_RefreshesExpiringSessions(t *testing.T)
// Stub AuthSessionStore.ListExpiringSessions → returns 1 session
// Stub AuthFlowService.RefreshCredential → verify called with correct installation_id
// Run one tick, verify refresh was attempted

func TestRefreshTicker_SkipsIfNoExpiring(t *testing.T)
// Empty list → no refresh calls
```

**Implementation:**

```go
type RefreshTicker struct {
    interval    time.Duration
    authSessions ports.AuthSessionStore
    authFlow    *application.AuthFlowService
    stop        chan struct{}
}

func NewRefreshTicker(interval time.Duration, sessions ports.AuthSessionStore, authFlow *application.AuthFlowService) *RefreshTicker

func (t *RefreshTicker) Start()
// Launch goroutine with time.Ticker
// On each tick: list expiring sessions, refresh each (up to 10 concurrent via semaphore)

func (t *RefreshTicker) Stop()
// Signal stop channel
```

Uses `sync.Singleflight` for deduplication. Advisory lock via `pool.Exec("SELECT pg_try_advisory_xact_lock($1)")`.

**Run tests.** Expected: All PASS.

---

#### Task F2: OAuth state cleanup job

**File:** `apps/server_core/internal/modules/integrations/background/state_cleanup.go` (new)

**Test first:**

```go
func TestStateCleanup_DeletesExpiredStates(t *testing.T)
// Insert 2 expired states + 1 fresh → cleanup deletes 2
```

**Implementation:**

```go
type StateCleanupJob struct {
    interval time.Duration
    store    ports.OAuthStateStore
    stop     chan struct{}
}

func NewStateCleanupJob(interval time.Duration, store ports.OAuthStateStore) *StateCleanupJob

func (j *StateCleanupJob) Start()
func (j *StateCleanupJob) Stop()
```

Runs every 15 min. Deletes states where `expires_at < now() - 1 hour`.

**Run tests.** Expected: All PASS.

---

### Phase G — Wiring

#### Task G1: Add encryption key to config

**File:** `apps/server_core/internal/platform/pgdb/config.go`

Add `EncryptionKey string` field to `Config`. Load from `MPC_ENCRYPTION_KEY` env var. No validation required at config level (adapter validates key length).

---

#### Task G2: Wire everything in composition root

**File:** `apps/server_core/internal/composition/root.go`

Replace the `_ = credentialSvc` / `_ = authSvc` / etc. block with full wiring:

```go
// Encryption
encryptionSvc, err := integrationscrypto.NewLocalKeyService(cfg.EncryptionKey)
if err != nil {
    log.Fatalf("encryption service: %v", err)
}

// OAuth state store
oauthStateRepo := integrationspostgres.NewOAuthStateRepository(pool, cfg.DefaultTenantID)

// Provider auth adapters
mlClientID := os.Getenv("MPC_PROVIDER_MERCADOLIVRE_CLIENT_ID")
mlClientSecret := os.Getenv("MPC_PROVIDER_MERCADOLIVRE_CLIENT_SECRET")
magaluClientID := os.Getenv("MPC_PROVIDER_MAGALU_CLIENT_ID")
magaluClientSecret := os.Getenv("MPC_PROVIDER_MAGALU_CLIENT_SECRET")

authProviders := map[string]ports.AuthProvider{}
if mlClientID != "" {
    authProviders["mercado_livre"] = integrationsml.NewAuthAdapter(mlClientID, mlClientSecret)
}
if magaluClientID != "" {
    authProviders["magalu"] = integrationsmagalu.NewAuthAdapter(magaluClientID, magaluClientSecret)
}
authProviders["shopee"] = integrationsshopee.NewAuthAdapter()

// HMAC secret for OAuth state
hmacSecret := []byte(os.Getenv("MPC_OAUTH_HMAC_SECRET"))
callbackURI := os.Getenv("MPC_OAUTH_CALLBACK_URI")
if callbackURI == "" {
    callbackURI = "http://localhost:8080/integrations/auth/callback"
}
frontendBaseURL := os.Getenv("MPC_FRONTEND_BASE_URL")
if frontendBaseURL == "" {
    frontendBaseURL = "http://localhost:5173"
}

// AuthFlowService
authFlowSvc := integrationsapp.NewAuthFlowService(
    installationRepo, credentialRepo, authSessionRepo,
    capabilityStateRepo, operationRunRepo, oauthStateRepo,
    encryptionSvc, authProviders, cfg.DefaultTenantID,
    hmacSecret, callbackURI, frontendBaseURL,
)

// Register transport
integrationstransport.NewHandler(providerSvc, installationSvc).Register(mux)
integrationstransport.NewAuthHandler(authFlowSvc).Register(mux)

// Background jobs
if pool != nil {
    refreshTicker := background.NewRefreshTicker(5*time.Minute, authSessionRepo, authFlowSvc)
    refreshTicker.Start()
    stateCleanup := background.NewStateCleanupJob(15*time.Minute, oauthStateRepo)
    stateCleanup.Start()
}
```

Add necessary import aliases:
- `integrationscrypto` for `adapters/crypto`
- `integrationsml` for `adapters/mercadolivre`
- `integrationsmagalu` for `adapters/magalu`
- `integrationsshopee` for `adapters/shopee`
- `background` for `background/`

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./...`
**Expected:** Full project compiles.

---

#### Task G3: Update OpenAPI contract

**File:** `contracts/api/marketplace-central.openapi.yaml`

Add all 6 new endpoints with request/response schemas and error codes:

1. `POST /integrations/installations/{id}/auth/authorize`
2. `GET /integrations/auth/callback`
3. `POST /integrations/installations/{id}/auth/credentials`
4. `POST /integrations/installations/{id}/disconnect`
5. `POST /integrations/installations/{id}/reauth/authorize`
6. `GET /integrations/installations/{id}/auth/status`

Add component schemas:
- `AuthorizeResponse` (`authorize_url`, `expires_in`)
- `SubmitAPIKeyRequest` (`credentials` map)
- `SubmitAPIKeyResponse` (`installation_id`, `status`, `provider_account_id`, `connected_at`)
- `DisconnectResponse` (`installation_id`, `status`, `revocation_result`, `disconnected_at`)
- `AuthStatusResponse` (full shape from spec)

---

### Phase H — Integration Tests

#### Task H1: Full connect flow integration test

**File:** `apps/server_core/tests/integration/auth_flow_test.go` (new, or extend existing test directory)

Test with real Postgres (via test database):

1. Create draft installation (mercado_livre provider)
2. Call StartAuthorize → get URL, verify OAuthState in DB
3. Simulate callback (use stubbed ML adapter) → verify credential v1 created, installation connected
4. Call GetAuthStatus → verify healthy state
5. Call Disconnect → verify credentials deactivated, installation disconnected

---

#### Task H2: Reauth flow integration test

Same file. Test:

1. Start with connected installation, force to requires_reauth
2. Call StartReauth → get URL
3. Simulate callback with same provider_account_id → verify new credential version
4. Verify old credential deactivated, installation connected again

Add negative test: callback with different provider_account_id → ErrReauthAccountMismatch

---

#### Task H3: Concurrent refresh integration test

Test:

1. Create connected installation with expiring token
2. Launch 3 goroutines calling RefreshCredential simultaneously
3. Verify only 1 refresh executes (singleflight), all 3 return success

---

#### Task H4: Tenant isolation integration test

Test:

1. Create installation for tenant_A
2. Create OAuthState for tenant_A
3. Attempt to load OAuthState with tenant_B context → not found
4. Attempt to get installation with tenant_B context → not found

---

#### Task H5: Security — replay and state binding integration tests

Test with real Postgres:

1. **Replay rejection:** Complete a successful callback → same state param again → `ErrAuthStateConsumed`
2. **State expiry:** Create OAuthState, advance clock past 10min → callback → `ErrAuthStateExpired`
3. **HMAC tampering:** Modify state param payload (keep valid signature) → callback → `ErrAuthStateInvalid`
4. **PKCE mismatch:** Exchange code with wrong code_verifier → provider rejects → `ErrAuthCodeExchangeFailed`
5. **Cross-tenant state injection:** Create state for tenant_A, attempt callback in tenant_B context → state not found → error

---

#### Task H6: Operational — idempotency and logging integration tests

Test:

1. **Disconnect idempotency:** Disconnect a connected installation → 200. Disconnect again → 200 (no-op, no error)
2. **Disconnect from requires_reauth:** Also valid → 200
3. **Logging contract:** Capture log output during a connect flow. Assert every handler log entry contains `action`, `result`, `duration_ms` fields (per AGENTS.md rule)
4. **OperationRun audit trail:** After connect + refresh + disconnect, query OperationRuns for the installation → verify 3 entries with correct operation_types and results

---

### Phase I — Final Verification

#### Task I1: Run all tests

**Run:** `cd apps/server_core && GOCACHE=.gocache go test ./... -count=1`
**Expected:** All tests pass (existing + new).

#### Task I2: Build verification

**Run:** `cd apps/server_core && GOCACHE=.gocache go build ./...`
**Expected:** Clean build.

#### Task I3: Commit

```
feat(integrations): implement OAuth + credential lifecycle

Server-side OAuth callback flow with PKCE, hybrid token refresh
(proactive+lazy with singleflight), envelope encryption with
AES-256-GCM local-key adapter, credential versioning with cutover,
failure-state policy engine, disconnect/reauth lifecycle, and
auth-aware capability gating.

Migration 0017: oauth_states table, next_retry_at column,
provider account uniqueness index.
```

---

## Task Dependency Graph

```
A1 (migration) ─────────────────────────────────────────────────┐
A2 (transitions) ──┐                                            │
A3 (NextRetryAt) ──┤                                            │
A4 (errors) ───────┤                                            │
A5 (OAuthState) ───┼── B1-B4 (ports) ── C1 (encryption) ──┐    │
A6 (TokenResult) ──┤                    C2 (oauth state) ──┤    │
A7 (RefreshPolicy)─┘                    C3 (credential) ───┤    │
                                        C4 (auth session) ─┤    │
                                        C5 (installation) ─┤    │
                                        C6 (operation) ────┤    │
                                        C7 (verify) ───────┤    │
                                        C8 (ML adapter) ───┤    │
                                        C9 (Magalu) ───────┤    │
                                        C10 (Shopee) ──────┘    │
                                                │                │
                                        D1-D6 (AuthFlowService) │
                                                │                │
                                        E1-E2 (transport) ──────┤
                                        F1 (refresh ticker) ────┤
                                        F2 (state cleanup) ─────┤
                                                │                │
                                        G1-G3 (wiring + OpenAPI)─┘
                                                │
                                        H1-H4 (integration tests)
                                                │
                                        I1-I3 (verify + commit)
```

**Parallelizable groups:**
- A1-A7 can all run in parallel
- B1-B4 can all run in parallel (depend on A4-A7)
- C1-C10 can all run in parallel (depend on B1-B4)
- D1-D6 must be sequential (each builds on previous)
- E1-E2, F1-F2 can run in parallel (depend on D6)
- G1-G3 can run in parallel
- H1-H6 can run in parallel (depend on G2)

---

## Codex Hardening — Caveats

Plan reviewed by Codex (2 rounds). Final verdict: APPROVE_WITH_FIXES. All structural fixes applied except:

1. **ConsumeNonce tenant scoping at port boundary**: Codex suggested `ConsumeNonce(tenantID, id)` to make tenant explicit in the port signature. However, ALL ports in this codebase use constructor-injected `tenantID` (the repo carries it as a field, every SQL query includes `AND tenant_id = r.tenantID`). Changing this for one method would break the established pattern. The tenant enforcement is real — it's in the SQL — just not in the method signature. **Decision: keep constructor pattern for consistency. Add a test for wrong-tenant consume attempt in H5.**

2. **Multi-key backward-compat encryption test**: Codex suggested a test loading a keyring with {old, new} keys to verify old ciphertext decrypts post-rotation. The current `EncryptionService` interface takes a single KEK. Multi-key support requires a keyring adapter — this is a future concern for the KMS migration. **Decision: defer to KMS spec. The `encryption_key_id` stored per credential enables this future work. Single-key rotation tests (C1) prove the mechanism.**

3. **Concurrent cutover promotion race test**: Added `SELECT FOR UPDATE` + CAS to prevent races. A dedicated integration test for concurrent promotion should be in H3 (concurrent refresh test already covers this path via singleflight + advisory lock + row lock).
