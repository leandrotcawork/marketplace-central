# OAuth + Credential Lifecycle Design

## Goal

Implement the complete OAuth authorization and credential lifecycle for the integrations module — from initial marketplace connection through ongoing token management to disconnection — at production SaaS grade.

### In Scope

- OAuth2 authorization flow (authorize URL, callback, token exchange) for OAuth providers (Mercado Livre, Magalu)
- API key validation flow for non-OAuth providers (Shopee)
- Hybrid token refresh (proactive background ticker + lazy fallback with singleflight)
- Credential versioning with cutover strategy (dual-activation window)
- Envelope encryption via `EncryptionService` port (local-key adapter now, KMS later)
- Failure-state policy engine (retry classes, backoff, terminal thresholds)
- Disconnect flow with best-effort provider token revocation
- Reauth flow preserving installation record
- Auth-aware capability gating (auth health drives capability state transitions)
- OAuth security hardening (PKCE, state binding, redirect URI allowlist, replay protection)

### Out of Scope

- Webhook-based token invalidation notifications
- Multi-region OAuth
- Custom OAuth grant types (no device flow, no SAML)
- Event infrastructure / outbox pattern
- Operational SLOs / runbooks / alerting
- Provider contract test harness framework
- Frontend UX for connection/reauth (SPEC #3)

---

## Architecture

### Approach: Provider-Specific OAuth Adapters

Each provider implements a common `AuthProvider` port interface. An `AuthFlowService` orchestrates the lifecycle — authorize, callback, refresh, reauth, disconnect — but delegates provider-specific behavior to adapters.

This follows the existing ports/adapters pattern used throughout the codebase and matches the `MarketplaceConnector` pattern defined in AGENTS.md.

### AuthProvider Port Interface

```go
type AuthProvider interface {
    AuthStrategy() AuthStrategy
    BuildAuthorizeURL(state, redirectURI string, codeChallenge string) (string, error)
    ExchangeCode(ctx context.Context, code string, redirectURI string, codeVerifier string) (*TokenResult, error)
    RefreshToken(ctx context.Context, refreshToken string) (*TokenResult, error)
    RevokeToken(ctx context.Context, accessToken string) error
    ValidateCredentials(ctx context.Context, creds map[string]string) error
}
```

- Shopee's adapter implements `ValidateCredentials` and returns `ErrNotSupported` for OAuth methods
- ML and Magalu implement the OAuth methods
- Each adapter handles its own quirks internally (extra response fields, custom headers, etc.)

### EncryptionService Port Interface

```go
type EncryptionService interface {
    Encrypt(ctx context.Context, plaintext []byte) (ciphertext []byte, keyID string, err error)
    Decrypt(ctx context.Context, ciphertext []byte, keyID string) ([]byte, error)
    RotateKey(ctx context.Context) (newKeyID string, err error)
}
```

Initial implementation: local symmetric key adapter (AES-256-GCM). Future: swap to KMS adapter without touching business logic.

---

## Components

### Domain Layer (no new tables — extends behavior on existing entities)

#### Entity Responsibilities

| Entity | Role in OAuth + Credential Lifecycle |
|---|---|
| **Installation** | Lifecycle anchor. Status state machine drives everything. Owns `active_credential_id` FK. |
| **Credential** | Versioned, encrypted token/key storage. Immutable once created — new version on every rotation/reauth. |
| **AuthSession** | OAuth session state tracker. One per installation. Tracks token expiry, refresh health, consecutive failures. |
| **CapabilityState** | Downstream consumer of auth health. Auth degradation cascades into capability degradation. |
| **OperationRun** | Audit log for every auth lifecycle action (connect, refresh, reauth, disconnect, revoke). |

#### New Value Objects

**OAuthState** — CSRF/replay protection token for OAuth flow:

```go
type OAuthState struct {
    InstallationID string
    TenantID       string
    Nonce          string    // crypto/rand, 32 bytes, hex-encoded
    ExpiresAt      time.Time // 10 min TTL
    CodeVerifier   string    // PKCE — stored server-side, never sent to provider
}
```

Stored in `integration_oauth_states` table (new). Validated on callback — nonce consumed once, expired states rejected.

**TokenResult** — Normalized response from any provider's token exchange:

```go
type TokenResult struct {
    AccessToken       string
    RefreshToken      string
    ExpiresIn         int
    TokenType         string
    Scopes            []string
    ProviderAccountID string
    RawExtras         map[string]any
}
```

**RefreshPolicy** — Deterministic failure handling:

```go
type RefreshPolicy struct {
    MaxConsecutiveFailures int           // 5 → terminal
    BackoffBase            time.Duration // 30s
    BackoffMax             time.Duration // 15min
    TransientCodes         []string      // "timeout", "rate_limited", "server_error"
    TerminalCodes          []string      // "invalid_grant", "account_suspended"
    CooldownAfterTerminal  time.Duration // 1h before allowing manual reauth
}
```

#### Installation Status Transitions (extended)

```
draft → pending_connection     (user initiates OAuth/API key flow)
pending_connection → connected (callback success + credential stored)
pending_connection → failed    (callback error or timeout)
connected → requires_reauth   (refresh terminal failure or manual trigger)
connected → disconnected      (user-initiated disconnect)
requires_reauth → pending_connection (user initiates reauth — same installation)
requires_reauth → disconnected      (user gives up, disconnects)
disconnected → [terminal]           (reconnect = new installation)
```

#### Credential Cutover Strategy

During reauth/refresh:

1. New credential version created with `is_active = true` (temporarily two active)
2. Validate new credential (lightweight provider API call)
3. On success: update `active_credential_id` to new version, deactivate old — same transaction
4. On failure: revoke new credential, old remains active, installation unchanged
5. Dual-active window < 5 seconds

#### Auth → Capability Cascade Rules

| Auth State | Installation Health | Capability Effect |
|---|---|---|
| `valid` | `healthy` | All capabilities `enabled` |
| `expiring` | `warning` | Capabilities remain `enabled` (proactive refresh in progress) |
| `refresh_failed` (transient) | `warning` | Capabilities `degraded` — reads allowed, writes blocked |
| `refresh_failed` (terminal) | `critical` | Capabilities `requires_reauth` |
| `invalid` | `critical` | Capabilities `disabled` |

### Application Layer

**AuthFlowService** — orchestrates the entire lifecycle:

- `StartAuthorize(installationID)` → generates OAuthState, calls adapter.BuildAuthorizeURL, returns URL
- `HandleCallback(code, state)` → validates state, exchanges code, encrypts tokens, creates credential, transitions installation
- `SubmitAPIKey(installationID, credentials)` → validates via adapter, encrypts, stores, transitions installation
- `RefreshCredential(installationID)` → singleflight + advisory lock, refresh via adapter, cutover
- `Disconnect(installationID)` → revoke (best-effort), deactivate credentials, cascade state changes
- `StartReauth(installationID)` → same as StartAuthorize but validates cooldown and preserves installation

### Adapter Layer

**Provider adapters** (one per marketplace):

- `adapters/mercadolivre/auth.go` — OAuth2, handles ML-specific token response fields
- `adapters/magalu/auth.go` — OAuth2, Magalu-specific endpoints and scopes
- `adapters/shopee/auth.go` — API key validation, no OAuth methods

**Encryption adapter:**

- `adapters/crypto/local_key.go` — AES-256-GCM with envelope encryption, KEK from env var

**State store adapter:**

- `adapters/postgres/oauth_state_repo.go` — CRUD for `integration_oauth_states`

### Transport Layer

New HTTP handlers registered in the integrations module. No business logic — delegates to `AuthFlowService`.

---

## Data Flow

### OAuth Connect Flow (Mercado Livre / Magalu)

```
Frontend                    Backend                         Provider
   │                           │                               │
   ├─ POST /installations/     │                               │
   │  :id/auth/authorize       │                               │
   │                           ├─ Validate installation        │
   │                           │  (status=pending_connection)  │
   │                           ├─ Generate OAuthState          │
   │                           │  (nonce + PKCE verifier)      │
   │                           ├─ Store OAuthState in DB       │
   │                           ├─ adapter.BuildAuthorizeURL    │
   │                           │  (state, redirectURI,         │
   │                           │   codeChallenge)              │
   │◄─ 200 { authorize_url }  │                               │
   │                           │                               │
   ├─ window.location =        │                               │
   │  authorize_url ──────────────────────────────────────────►│
   │                           │                               │
   │                    Provider redirects to callback          │
   │                           │                               │
   │              GET /auth/callback?code=X&state=Y            │
   │                           │                               │
   │                           ├─ Decode & verify state        │
   │                           │  (HMAC + nonce + TTL +        │
   │                           │   tenant binding)             │
   │                           ├─ Mark nonce consumed          │
   │                           ├─ adapter.ExchangeCode         │
   │                           │  (code, redirectURI,          │
   │                           │   codeVerifier)               │
   │                           │          ├──► Provider        │
   │                           │          ◄──┘ TokenResult     │
   │                           ├─ Encrypt tokens               │
   │                           ├─ Create Credential v1         │
   │                           ├─ Set active_credential_id     │
   │                           ├─ Upsert AuthSession (valid)   │
   │                           ├─ Installation → connected     │
   │                           ├─ Resolve capabilities         │
   │                           ├─ Record OperationRun          │
   │                           ├─ Delete OAuthState            │
   │                           │                               │
   │◄──────────────────────── 302 /connections/:id?status=ok   │
```

**Security invariant**: On callback, before token exchange, the handler must:

1. Decode state param → extract `installation_id`
2. Load OAuthState record by nonce
3. Verify `OAuthState.tenant_id` matches the installation's `tenant_id`
4. Verify `OAuthState.installation_id` matches the decoded value
5. Consume nonce atomically
6. Only then proceed with token exchange
7. Credential write scoped to same `tenant_id + installation_id` in one transaction

### API Key Connect Flow (Shopee)

```
Frontend                    Backend                         Provider
   │                           │                               │
   ├─ POST /installations/     │                               │
   │  :id/auth/credentials     │                               │
   │  { api_key, shop_id }     │                               │
   │                           ├─ adapter.ValidateCredentials  │
   │                           │  (test API call)              │
   │                           ├─ Encrypt & store credential   │
   │                           ├─ Installation → connected     │
   │                           ├─ AuthSession (valid, no exp)  │
   │                           ├─ Resolve capabilities         │
   │                           ├─ Record OperationRun          │
   │◄─ 200 { status:connected }│                               │
```

### Hybrid Token Refresh

**Proactive** (ticker every 5 min):

```
Query: auth_sessions WHERE expires_at < now() + 10min
       AND state IN (valid, expiring)
       AND (next_retry_at IS NULL OR next_retry_at <= now())

For each:
  → Acquire singleflight lock (tenant_id:installation_id)
  → Acquire Postgres advisory lock
  → Decrypt refresh_token
  → adapter.RefreshToken()
  → Create new credential version
  → Cutover (validate → activate new → deactivate old)
  → Update AuthSession (new expiry, reset failures)
  → Record OperationRun
```

**Lazy** (on 401 or expired token):

```
ConnectorAdapter detects 401/expired
  → Call AuthFlowService.RefreshCredential()
  → Same singleflight key deduplicates with proactive
  → Wait for result → retry original API call
```

**Concurrency control**:

- In-process: `sync.Singleflight` keyed by `refresh:{tenant_id}:{installation_id}`
- Cross-process: `pg_try_advisory_xact_lock(hash(tenant_id + installation_id))`
- Singleflight wraps advisory lock acquisition — one goroutine per process competes

### Refresh Failure Handling

```
RefreshToken() fails
  │
  ├─ Terminal code? (invalid_grant, account_suspended)
  │    YES → auth_session.state = refresh_failed
  │          installation.status = requires_reauth
  │          installation.health = critical
  │          capabilities → requires_reauth
  │          Record OperationRun (failed, terminal)
  │          NO MORE RETRIES
  │
  │    NO (transient: timeout, rate_limited, server_error)
  │          consecutive_failures++
  │          next_retry_at = now() + exponential_backoff(30s base, 15min max)
  │          If consecutive_failures >= 5 → same as terminal
  │          Else: auth_session.state = expiring, health = warning
  │                capabilities → degraded
  │                Record OperationRun (failed, transient)
```

### Reauth Flow

Same as OAuth connect flow but:

- Installation stays the same record
- Transition: `requires_reauth → pending_connection`
- On success: new credential version, old deactivated, capabilities re-resolved
- `provider_account_id` validated: if different account → `INTEGRATIONS_REAUTH_ACCOUNT_MISMATCH`
- 1h cooldown after terminal failure (checked via OperationRun timestamps)

### Disconnect Flow

```
POST /installations/:id/disconnect
  → Validate status (connected or requires_reauth)
  → Decrypt access_token
  → adapter.RevokeToken() — best-effort, log failure
  → Deactivate all credentials (is_active=false, revoked_at=now)
  → AuthSession.state = invalid
  → Installation.status = disconnected
  → Capabilities → disabled
  → Cancel in-flight operations
  → Record OperationRun
  → 200 { status: disconnected, revocation_result }
```

Idempotent — second call on `disconnected` returns 200 no-op.

---

## Error Handling

### Error Code Taxonomy

All codes prefixed with `INTEGRATIONS_`. Format: `MODULE_ENTITY_REASON`.

#### Authorization Flow

| Code | HTTP | When |
|---|---|---|
| `INTEGRATIONS_AUTH_PROVIDER_NOT_OAUTH` | 400 | OAuth flow on API key provider |
| `INTEGRATIONS_AUTH_STATE_INVALID` | 400 | State param fails HMAC verification |
| `INTEGRATIONS_AUTH_STATE_EXPIRED` | 400 | Nonce older than 10 min |
| `INTEGRATIONS_AUTH_STATE_CONSUMED` | 400 | Nonce already used (replay) |
| `INTEGRATIONS_AUTH_CODE_EXCHANGE_FAILED` | 502 | Provider rejected auth code |
| `INTEGRATIONS_AUTH_PROVIDER_UNREACHABLE` | 502 | Provider timeout/network error |
| `INTEGRATIONS_AUTH_SCOPES_INSUFFICIENT` | 400 | Fewer scopes than required |

#### Installation State

| Code | HTTP | When |
|---|---|---|
| `INTEGRATIONS_INSTALLATION_INVALID_TRANSITION` | 409 | State transition not allowed |
| `INTEGRATIONS_INSTALLATION_NOT_FOUND` | 404 | ID doesn't exist for tenant |
| `INTEGRATIONS_INSTALLATION_WRONG_STATUS` | 409 | Operation requires different status |
| `INTEGRATIONS_INSTALLATION_ALREADY_CONNECTED` | 409 | Provider account already connected |

#### Reauth

| Code | HTTP | When |
|---|---|---|
| `INTEGRATIONS_REAUTH_ACCOUNT_MISMATCH` | 409 | Different provider_account_id |
| `INTEGRATIONS_REAUTH_COOLDOWN_ACTIVE` | 429 | Terminal cooldown not elapsed |

#### Credentials

| Code | HTTP | When |
|---|---|---|
| `INTEGRATIONS_CREDENTIAL_VALIDATION_FAILED` | 502 | New credential failed provider test |
| `INTEGRATIONS_CREDENTIAL_ENCRYPTION_FAILED` | 500 | EncryptionService error |
| `INTEGRATIONS_CREDENTIAL_DECRYPTION_FAILED` | 500 | Decryption error (key mismatch) |
| `INTEGRATIONS_CREDENTIAL_NOT_FOUND` | 404 | No active credential |

#### Refresh (internal — no HTTP status)

| Code | When |
|---|---|
| `INTEGRATIONS_REFRESH_TOKEN_INVALID` | Provider returned `invalid_grant` |
| `INTEGRATIONS_REFRESH_RATE_LIMITED` | Provider rate-limited |
| `INTEGRATIONS_REFRESH_PROVIDER_ERROR` | Provider 5xx |
| `INTEGRATIONS_REFRESH_MAX_FAILURES` | Consecutive failures exceeded |
| `INTEGRATIONS_REFRESH_LOCK_CONTENTION` | Singleflight already running |

#### Disconnect

| Code | When |
|---|---|
| `INTEGRATIONS_DISCONNECT_REVOCATION_FAILED` | Provider revoke failed (logged, not blocking) |
| `INTEGRATIONS_DISCONNECT_ALREADY_DISCONNECTED` | Idempotent no-op |

#### API Key

| Code | HTTP | When |
|---|---|---|
| `INTEGRATIONS_APIKEY_VALIDATION_FAILED` | 400 | Provider rejected API key |
| `INTEGRATIONS_APIKEY_MISSING_FIELDS` | 400 | Required fields not provided |

### Error Response Shape

```json
{
  "error": {
    "code": "INTEGRATIONS_AUTH_STATE_EXPIRED",
    "message": "OAuth authorization state has expired. Please restart the connection flow.",
    "details": {
      "installation_id": "inst_abc123",
      "expired_at": "2026-04-09T14:30:00Z"
    }
  }
}
```

- `code`: machine-readable, stable, documented in OpenAPI
- `message`: human-readable, can change
- `details`: optional contextual data
- 500 errors: generic message, details logged server-side only

### Error Classification

```go
type ErrorClass int

const (
    ErrorClassTransient ErrorClass = iota
    ErrorClassTerminal
    ErrorClassClient
)

func ClassifyRefreshError(code string) ErrorClass {
    switch code {
    case "INTEGRATIONS_REFRESH_RATE_LIMITED",
         "INTEGRATIONS_REFRESH_PROVIDER_ERROR":
        return ErrorClassTransient
    case "INTEGRATIONS_REFRESH_TOKEN_INVALID",
         "INTEGRATIONS_REFRESH_MAX_FAILURES":
        return ErrorClassTerminal
    default:
        return ErrorClassTransient
    }
}
```

Lives in domain layer. Adapters map provider errors to codes; policy engine consumes the classification.

---

## API Contract

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/integrations/installations/:id/auth/authorize` | Start OAuth flow |
| `GET` | `/integrations/auth/callback` | OAuth callback (browser redirect) |
| `POST` | `/integrations/installations/:id/auth/credentials` | Submit API key |
| `POST` | `/integrations/installations/:id/disconnect` | Disconnect integration |
| `POST` | `/integrations/installations/:id/reauth/authorize` | Start reauth flow |
| `GET` | `/integrations/installations/:id/auth/status` | Auth health status |

### Request/Response Shapes

#### POST /installations/:id/auth/authorize

Request: empty body

Response 200:
```json
{
  "authorize_url": "https://auth.mercadolivre.com.br/authorization?...",
  "expires_in": 600
}
```

Errors: 409 `INSTALLATION_WRONG_STATUS`, 400 `AUTH_PROVIDER_NOT_OAUTH`

#### GET /auth/callback

302 redirect — no JSON response:
- Success: `→ /connections/:id?status=connected`
- Failure: `→ /connections/:id?status=failed&error=<ERROR_CODE>`

#### POST /installations/:id/auth/credentials

Request:
```json
{
  "credentials": {
    "api_key": "sk_live_...",
    "shop_id": "shop-456"
  }
}
```

Response 200:
```json
{
  "installation_id": "inst_abc123",
  "status": "connected",
  "provider_account_id": "shop-456",
  "connected_at": "2026-04-09T15:00:00Z"
}
```

Errors: 400 `APIKEY_VALIDATION_FAILED`, 400 `APIKEY_MISSING_FIELDS`

#### POST /installations/:id/disconnect

Request: empty body

Response 200:
```json
{
  "installation_id": "inst_abc123",
  "status": "disconnected",
  "revocation_result": "succeeded",
  "disconnected_at": "2026-04-09T15:30:00Z"
}
```

`revocation_result`: `"succeeded"` | `"failed"` | `"not_supported"`. Idempotent.

#### POST /installations/:id/reauth/authorize

Request: empty body

Response 200:
```json
{
  "authorize_url": "https://auth.mercadolivre.com.br/authorization?...",
  "expires_in": 600
}
```

Errors: 409 `INSTALLATION_WRONG_STATUS`, 429 `REAUTH_COOLDOWN_ACTIVE`

#### GET /installations/:id/auth/status

Response 200:
```json
{
  "installation_id": "inst_abc123",
  "auth_strategy": "oauth2",
  "auth_state": "valid",
  "health_status": "healthy",
  "access_token_expires_at": "2026-04-09T16:00:00Z",
  "last_refresh_at": "2026-04-09T15:45:00Z",
  "consecutive_failures": 0,
  "refresh_failure_code": null,
  "provider_account_id": "seller-123",
  "credential_version": 3,
  "capabilities": [
    { "code": "catalog_sync", "status": "enabled" },
    { "code": "order_read", "status": "enabled" }
  ]
}
```

No secrets exposed — metadata only.

---

## Security Requirements

### OAuth Hardening

| Requirement | Implementation |
|---|---|
| PKCE | `code_verifier` (43-128 chars, `crypto/rand`). `code_challenge = BASE64URL(SHA256(verifier))`. Verifier stored server-side only. |
| State binding | `base64(installation_id \| nonce)` + HMAC-SHA256 signature. Validated before any processing. |
| Nonce consumption | Stored in DB with `consumed_at`. Marked consumed atomically on first use. Second use rejected. |
| State TTL | 10 min. Background cleanup deletes expired states after 1h retention. |
| Redirect URI allowlist | Pre-registered per provider. Exact match only — no patterns, no wildcards. |
| Callback replay | Nonce consumption + TTL + HTTPS-only. |
| Callback tenant binding | On callback: verify OAuthState.tenant_id matches installation.tenant_id. Verify installation_id matches. All in one transaction. |

### Secret Handling

| Rule | Enforcement |
|---|---|
| Client secrets never in code | Env vars: `MPC_PROVIDER_{NAME}_CLIENT_ID`, `_CLIENT_SECRET` |
| Tokens never logged | Logger strips `*token*`, `*secret*`, `*key*`, `*password*` patterns |
| Tokens never in URLs | All exchanges via POST body |
| Tokens never in responses | Auth status returns metadata only |
| Encrypted at rest | All payloads via EncryptionService before DB write |
| Memory hygiene | Token strings zeroed after use where Go allows |

### Encryption Standards

| Parameter | Value |
|---|---|
| Algorithm | AES-256-GCM |
| DEK size | 256 bits, `crypto/rand` |
| Nonce size | 96 bits, `crypto/rand`, unique per encryption |
| KEK | 256 bits, from environment or KMS |
| Payload format | `nonce(12) \|\| encrypted_DEK(48) \|\| nonce(12) \|\| encrypted_data(variable)` |

### Least Privilege

- OAuth scopes: minimum required per provider. Fewer returned → reject.
- DB user: SELECT/INSERT/UPDATE only. No DELETE, no DDL.
- Provider API: only endpoints required for declared capabilities.
- KEK access: only EncryptionService adapter.

### Tenant Isolation

- Every query: `WHERE tenant_id = $1`
- OAuthState carries tenant_id, validated at callback
- Singleflight keys: `tenant_id:installation_id`
- Advisory locks: `hash(tenant_id + installation_id)`

### Transport Security

- HTTPS only on callback route
- Rate limiting: 10 authorize/min, 5 credential submissions/min per tenant
- Request body limit: 16KB on credential submission

---

## Credential Lifecycle

### Versioning Rules

| Event | Action |
|---|---|
| Initial connection | Credential v1 created, set as active |
| Proactive refresh | v(N+1) created, cutover, v(N) deactivated |
| Reauth | v(N+1) created, validated, cutover, v(N) deactivated |
| API key rotation | Same as reauth |
| Disconnect | All versions deactivated, `revoked_at` set |

### Credential Payload Schema

OAuth2:
```json
{
  "type": "oauth2",
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "scopes": ["read", "write"],
  "provider_account_id": "seller-123",
  "extras": { "ml_user_id": 12345 }
}
```

API Key:
```json
{
  "type": "api_key",
  "api_key": "...",
  "shop_id": "shop-456",
  "provider_account_id": "shop-456",
  "extras": {}
}
```

### Key Rotation Workflow (Admin)

1. Provision new KEK
2. Query active credentials with old `encryption_key_id`
3. For each: decrypt with old KEK → re-encrypt with new KEK → update row
4. Batch in transactions of 100
5. Record OperationRun
6. Old KEK retained read-only for inactive credential audit access

### Audit Trail

Every lifecycle event recorded via OperationRun:

| Operation Type | Trigger | Key Fields |
|---|---|---|
| `auth_connect` | Initial OAuth/API key | actor, provider, credential_version |
| `auth_refresh` | Proactive or lazy | version_from → to, trigger_type |
| `auth_reauth` | User-initiated | version_from → to |
| `auth_disconnect` | User-initiated | revocation_result |
| `credential_rotation` | Cutover | version_from → to, validation_result |
| `key_rotation` | Admin KEK rotation | key_id_from → to, credentials_affected |

---

## Operational Model

### Retry Policy

| Operation | Strategy | Max Attempts | Backoff |
|---|---|---|---|
| Token exchange | No retry, user retries manually | 1 | — |
| Token refresh (proactive) | Exponential backoff, transient only | 5 consecutive | 30s → 15m |
| Token refresh (lazy) | Singleflight dedup with proactive | Shared | Shared |
| Provider revocation | Fire-and-forget + 1 retry | 2 | 5s |
| Credential validation | Single attempt, rollback on failure | 1 | — |
| Key rotation | Per-credential retry | 3 | 1s |

### Background Jobs

**Proactive Token Refresh** (every 5 min):
- Query expiring auth sessions (expires_at < now + 10min, next_retry_at elapsed)
- Worker pool: up to 10 installations in parallel
- Timeout: 30s per refresh attempt

**OAuth State Cleanup** (every 15 min):
- Delete states expired > 1 hour ago
- Hard delete (no audit value in expired nonces)

### Observability

Structured log entry on every auth operation:
```json
{
  "action": "auth_refresh",
  "tenant_id": "tenant_abc",
  "installation_id": "inst_123",
  "provider": "mercado_livre",
  "result": "succeeded",
  "duration_ms": 342,
  "credential_version_from": 2,
  "credential_version_to": 3,
  "trigger": "proactive"
}
```

Key metrics (future Prometheus):

| Metric | Type | Labels |
|---|---|---|
| `integrations_auth_refresh_total` | Counter | provider, result, trigger |
| `integrations_auth_refresh_duration_ms` | Histogram | provider |
| `integrations_auth_session_state` | Gauge | provider, state |
| `integrations_credential_version` | Gauge | installation_id |
| `integrations_auth_consecutive_failures` | Gauge | installation_id |
| `integrations_oauth_flow_total` | Counter | provider, result |
| `integrations_disconnect_total` | Counter | provider, revocation_result |

---

## Testing Approach

### Unit Tests

| Area | Key Cases |
|---|---|
| Installation state machine | Every valid/invalid transition |
| RefreshPolicy | Terminal → no retry. Transient → backoff. Max failures → terminal |
| OAuthState | Valid passes. Tampered HMAC rejected. Expired rejected. Consumed rejected |
| Credential cutover | Version increment. Rollback on failure. Dual-active semantics |
| AuthFlowService | Happy path connect. Reauth account mismatch. Disconnect idempotent |
| Auth → capability cascade | Each auth state → correct capability effects |
| EncryptionService | Roundtrip. Wrong key → error. Corrupted data → error |
| Error classification | All codes map correctly. Unknown → transient default |

### Integration Tests (with Postgres)

| Area | Key Cases |
|---|---|
| Credential versioning | Create v1, rotate to v2, verify v1 deactivated. Active constraint trigger |
| Auth session upsert | ON CONFLICT behavior. No duplicate rows |
| OAuthState lifecycle | Store, consume, expire, cleanup |
| Full connect flow | Draft → authorize → callback → connected |
| Full reauth flow | requires_reauth → authorize → callback → connected (same installation) |
| Full disconnect flow | Credentials deactivated → auth invalid → capabilities disabled |
| Refresh with advisory lock | Two concurrent refreshes → one executes |
| Tenant isolation | Cross-tenant queries return nothing |
| Cutover rollback | Validation fails → old credential preserved |

### Adapter Contract Tests

```go
func RunAuthProviderContractTests(t *testing.T, adapter AuthProvider) {
    t.Run("AuthStrategy returns non-empty", ...)
    t.Run("BuildAuthorizeURL includes state and redirect", ...)
    t.Run("BuildAuthorizeURL includes PKCE challenge for OAuth2", ...)
    t.Run("ExchangeCode returns TokenResult with required fields", ...)
    t.Run("RefreshToken returns new access token", ...)
    t.Run("RevokeToken does not error on valid token", ...)
    t.Run("ValidateCredentials returns ErrNotSupported for OAuth2", ...)
    t.Run("ValidateCredentials succeeds for API key provider", ...)
}
```

Provider-specific tests use recorded HTTP fixtures (golden files).

### Transport Tests

| Endpoint | Validates |
|---|---|
| POST authorize | Returns URL. 409 wrong status. 400 non-OAuth |
| GET callback | 302 success. 302 error. Invalid state → error |
| POST credentials | 200 valid key. 400 missing fields. 400 validation fail |
| POST disconnect | 200 with result. Idempotent |
| POST reauth/authorize | 200 URL. 409 wrong status. 429 cooldown |
| GET auth/status | Full health. No secrets. 404 missing |

### Security Tests

| Test | Expected |
|---|---|
| Tampered state | `STATE_INVALID` |
| Replayed callback | `STATE_CONSUMED` |
| Expired state | `STATE_EXPIRED` |
| Cross-tenant state | Rejected (tenant mismatch) |
| Credential in response | No `*token*`/`*secret*`/`*key*` fields |
| Oversized payload | 413 or 400 |
| Brute-force API keys | Rate limited |

### Test Infrastructure

- Test database: testcontainers-go or transaction rollback
- Stubbed providers: in-memory AuthProvider
- HTTP fixtures: golden files in `testdata/` per provider
- Encryption: deterministic test KEK
- Clock control: `Clock` interface for expiry/TTL/backoff

---

## Database Migration

Single migration: `0017_oauth_credential_lifecycle.sql`

### New Table: integration_oauth_states

```sql
CREATE TABLE integration_oauth_states (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    installation_id UUID NOT NULL REFERENCES integration_installations(id),
    nonce       VARCHAR(64) NOT NULL UNIQUE,
    code_verifier VARCHAR(128) NOT NULL,
    hmac_signature VARCHAR(128) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_states_nonce ON integration_oauth_states(nonce);
CREATE INDEX idx_oauth_states_expires ON integration_oauth_states(expires_at);
```

### Alter: integration_auth_sessions

```sql
ALTER TABLE integration_auth_sessions
    ADD COLUMN next_retry_at TIMESTAMPTZ;
```

### New Index: provider account uniqueness

```sql
CREATE UNIQUE INDEX idx_unique_active_provider_account
    ON integration_installations(tenant_id, provider_slug, provider_account_id)
    WHERE status NOT IN ('disconnected', 'failed')
    AND provider_account_id IS NOT NULL;
```

---

## Open Questions — Resolved

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | OAuthState storage | New `integration_oauth_states` table | Clean separation from business entities |
| 2 | Provider client credentials | Environment variables | Low-change data, simple, secrets-manager-ready |
| 3 | Proactive refresh hosting | In-process ticker (goroutine) | Single-instance now, advisory locks enable future migration |
| 4 | Auth session cardinality | One per installation | Tracks connection health, not individual tokens |
| 5 | Reauth cooldown enforcement | Query OperationRun timestamps | No new column, existing audit trail |
| 6 | Backoff tracking | `next_retry_at` column on auth_sessions | Clean query predicate |
| 7 | Disconnect confirmation | Single POST (no two-step) | Not destructive (soft delete), UX is frontend concern |
| 8 | Duplicate provider account | Unique partial index per tenant per provider | Prevents double-polling, conflicting credentials |
| 9 | Migration strategy | Single `0017_oauth_credential_lifecycle.sql` | Small DDL surface, no data migration |

---

## Definition of Done

### Code

- [ ] `AuthProvider` port interface in `integrations/ports/`
- [ ] Mercado Livre OAuth adapter
- [ ] Magalu OAuth adapter
- [ ] Shopee API key adapter
- [ ] `AuthFlowService` (authorize, callback, refresh, reauth, disconnect)
- [ ] `EncryptionService` port + local-key adapter
- [ ] `RefreshPolicy` with error classification in domain
- [ ] Proactive refresh ticker with singleflight + advisory lock
- [ ] Lazy refresh fallback
- [ ] Credential cutover with validation and rollback
- [ ] OAuth state management (generate, validate, consume, cleanup)
- [ ] Auth → capability cascade in `CapabilityService`
- [ ] All services wired in `composition/root.go`

### Transport

- [ ] POST authorize handler
- [ ] GET callback handler with 302 redirects
- [ ] POST credentials handler
- [ ] POST disconnect handler
- [ ] POST reauth/authorize handler
- [ ] GET auth/status handler
- [ ] Structured JSON errors on all endpoints
- [ ] Rate limiting on auth endpoints

### Database

- [ ] Migration `0017_oauth_credential_lifecycle.sql`
- [ ] `integration_oauth_states` table
- [ ] `next_retry_at` on auth_sessions
- [ ] Unique partial index for provider account dedup

### Security

- [ ] PKCE on all OAuth flows
- [ ] State HMAC-signed and validated
- [ ] Nonce single-use
- [ ] State TTL (10 min)
- [ ] Redirect URI allowlist
- [ ] No secrets in logs/URLs/responses
- [ ] Encryption roundtrip verified
- [ ] Tenant isolation in every query

### OpenAPI

- [ ] All endpoints in `marketplace-central.openapi.yaml`
- [ ] Request/response schemas as components
- [ ] Error codes per endpoint

### Tests

- [ ] Unit: state machine, policy, OAuth state, cutover, cascade, encryption
- [ ] Integration: connect, reauth, disconnect, concurrency, tenant isolation
- [ ] Contract: all AuthProvider adapters
- [ ] Transport: all handlers
- [ ] Security: replay, tampering, cross-tenant, brute-force
- [ ] Existing tests pass

### Observability

- [ ] Structured logging on all auth operations
- [ ] OperationRun for every lifecycle event
