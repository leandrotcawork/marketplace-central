# Marketplace Integration Layer — Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Real OAuth connections, credential storage, per-category fee syncing, connection lifecycle

---

## 1. Problem Statement

Marketplace Central currently has a UI that creates marketplace accounts and policies, but nothing is real:

1. **No authentication** — accounts are created as "active" with no credential validation. No OAuth flow exists.
2. **Fake commissions** — the policy form assumes a single flat commission rate, but Mercado Livre charges per-category fees that vary by listing type. Magalu has a flat rate. Shopee has price tiers.
3. **No connection verification** — status is always "active" regardless of whether credentials work.
4. **Credential schema gap** — the backend returns `credential_schema` from the database, but the frontend SDK TypeScript type doesn't include it, so credential fields never render.

This spec makes marketplace connections real: OAuth flows that actually authenticate, commission data fetched from marketplace APIs, and a connection lifecycle that reflects the true state of each integration.

---

## 2. Goals

1. A seller can connect their Mercado Livre account via OAuth2 — click "Connect", log into ML, authorize, done.
2. After connecting, the system fetches real per-category commission rates from ML's API and stores them.
3. The Pricing Simulator uses real marketplace fees instead of flat policy guesses.
4. Each marketplace plugin defines its own fee model (API sync, static table, price tiers).
5. The architecture supports adding Magalu, Shopee, and other marketplaces without changing core code.

---

## 3. Out of Scope

- Messaging module (reading/replying to marketplace messages)
- Orders module (tracking marketplace orders)
- Alerts / SLA monitoring
- VTEX integration changes (VTEX is the hub, not a marketplace in this context)
- Webhook-based real-time sync (scheduler-only for now, per ARCHITECTURE.md)
- Frontend Pricing Simulator UI changes (it already reads from `marketplace_fee_schedules`)

---

## 4. OAuth Infrastructure

### 4.1 Connection Flow (Seller Experience)

1. Seller clicks "Connect Mercado Livre" in the Marketplaces page
2. Panel detects `auth_strategy: "oauth2"` from the marketplace definition
3. Instead of credential input fields, panel shows an **"Authorize with Mercado Livre"** button
4. Clicking it: backend creates the account record (status `created`), generates a CSRF `state` token, returns the ML authorization URL
5. Seller is redirected to ML's login page → logs in with their normal ML seller account → clicks "Allow"
6. ML redirects back to `{REDIRECT_BASE_URL}/api/v1/marketplaces/oauth/callback/mercado_livre?code=XXX&state=YYY`
7. Backend validates the `state` token, exchanges the `code` for tokens (server-to-server call to ML)
8. Backend calls ML's `/users/me` to verify tokens work and get the seller's ML user ID
9. Account status changes to `active`. Credentials stored encrypted. Card shows green badge.

### 4.2 Account Status State Machine

```
CREATED → AUTHORIZING → ACTIVE → TOKEN_EXPIRING → ACTIVE (refreshed)
                ↓                       ↓
           AUTH_FAILED          REFRESH_FAILED → REQUIRES_REAUTH
                                                        ↓
                                                   AUTHORIZING (re-auth)
```

Valid statuses: `created`, `authorizing`, `active`, `requires_reauth`, `auth_failed`, `suspended`, `disconnected`

Status transition rules:
- `created` → `authorizing` (OAuth redirect initiated)
- `authorizing` → `active` (tokens received and verified)
- `authorizing` → `auth_failed` (user denied or error occurred)
- `active` → `requires_reauth` (refresh token expired or revoked)
- `active` → `suspended` (admin disabled)
- `active` → `disconnected` (user removed)
- `requires_reauth` → `authorizing` (user re-initiates OAuth)
- `auth_failed` → `authorizing` (user retries)

### 4.3 Token Storage

- New table `marketplace_credentials` stores encrypted token blobs
- Encryption: AES-256-GCM with envelope encryption
- Application service layer is the only code path that decrypts — transport layer never sees raw tokens
- Each decrypt is logged: `action=credential_access, account_id=X, reason=Y`

### 4.4 Token Refresh

- Background goroutine runs every 30 minutes
- Checks for tokens where `token_expires_at` is within the next 2 hours
- For ML (6h token TTL): refresh at the 4h mark (proactive, not on 401)
- If refresh fails 3 consecutive times → status becomes `requires_reauth`
- Seller sees amber warning badge in UI with "Re-authorize" button

### 4.5 Configuration (Environment Variables)

| Variable | Description | Example |
|----------|-------------|---------|
| `ML_CLIENT_ID` | Mercado Livre app client ID | `1234567890` |
| `ML_CLIENT_SECRET` | Mercado Livre app client secret | `abc...xyz` |
| `ML_REDIRECT_BASE_URL` | Base URL for OAuth callback | `https://abc123.ngrok.io` (dev) or `https://app.marketplace-central.com` (prod) |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256 key for credential encryption | 32-byte hex string |
| `FEE_SYNC_INTERVAL_HOURS` | Background fee sync interval | `24` |
| `ML_API_RATE_LIMIT_PER_SEC` | ML API rate limit | `10` |

### 4.6 Mercado Livre OAuth2 Specifics

- Authorization URL: `https://auth.mercadolivre.com.br/authorization`
- Token endpoint: `POST https://api.mercadolibre.com/oauth/token`
- Access token TTL: 6 hours (21600 seconds)
- Refresh token TTL: 6 months
- Refresh token is **single-use** — each refresh returns a new refresh_token. Only the latest is valid.
- Scopes: `offline_access`, `read`, `write`
- `state` parameter required for CSRF protection

---

## 5. Plugin Fee Architecture

### 5.1 Extended Plugin Interface

The existing `MarketplacePlugin` interface is extended with three new methods:

```go
type MarketplacePlugin interface {
    Code() string
    Definition() domain.MarketplaceDefinition
    SeedFees(ctx context.Context, pool *pgxpool.Pool) error                    // existing
    FeeMode() string                                                            // NEW: "api_sync" | "static_table" | "price_tiered"
    SyncFees(ctx context.Context, pool *pgxpool.Pool, account MarketplaceAccount, creds *Credentials) error  // NEW
    AuthProvider() (MarketplaceAuthProvider, error)                             // NEW: returns ErrNotImplemented for non-OAuth
}
```

### 5.2 Three Fee Modes

| Mode | Marketplaces | How it works |
|------|-------------|-------------|
| `api_sync` | Mercado Livre | Calls ML API per product category (category discovery → listing_prices → freight). Requires valid OAuth tokens. |
| `static_table` | Magalu | Inserts fixed rates from hardcoded table (14.8% + R$5). Shipping from weight table with discount tiers. No auth needed. |
| `price_tiered` | Shopee | Calculates commission from price ranges (20% under R$80, 14% above, varying fixed fees). No auth needed. |

### 5.3 Mercado Livre `SyncFees()` Flow

1. Load all products linked to this tenant (from catalog)
2. For each product: call `GET /sites/MLB/domain_discovery/search?q={title}` → get `category_id` (public, no auth)
3. Cache category results per sync run — if 50 products share the same category, `listing_prices` is called once
4. For each unique category + listing type: call `GET /sites/MLB/listing_prices?price={X}&category_id={Y}&listing_type_id={Z}` → get commission % + fixed fee (authenticated)
5. If product has dimensions: call `GET /users/{userId}/shipping_options/free` with dimensions → get freight cost (authenticated)
6. Upsert results into `marketplace_fee_schedules` with `source = 'api_sync'` and `synced_at = now()`

Rate limiting: `time.Ticker` at 100ms intervals (10 req/sec). For 500 products with category caching, expect ~30-60 seconds.

### 5.4 Magalu `SyncFees()` Flow

1. Insert flat rates into `marketplace_fee_schedules`: 14.8% commission, R$5 fixed fee, `source = 'seeded'`
2. Shipping: calculate from static weight table based on product dimensions + seller's discount tier
3. Weight table: 500g→R$35.90, 1kg→R$40.80, 5kg→R$52.90, 25kg→R$117.90, etc.
4. Cubic weight formula: `H(m) × W(m) × L(m) × 167`. Billable = max(actual, cubic).
5. Discount tiers: none (<87% on-time), 25% (87-97%), 50% (>97%)
6. No API call, no auth needed

### 5.5 Shopee `SyncFees()` Flow

1. For each product: look up price tier from static table:
   - ≤ R$79.99: 20% + R$4.00 fixed fee
   - R$80-99.99: 14% + R$16 fixed fee
   - R$100-199.99: 14% + R$20 fixed fee
   - R$200-499.99: 14% + R$26 fixed fee
   - ≥ R$500: 14% + R$26 fixed fee
2. Upsert into `marketplace_fee_schedules` with `source = 'seeded'`
3. No API call, no auth needed

### 5.6 Pricing Simulator Lookup Cascade (Unchanged)

```
CommissionOverride (per-product manual override)
  → FeeSchedule (per-category from API/table — now with REAL data)
    → Policy default (flat fallback)
```

The Pricing Simulator already reads from `marketplace_fee_schedules` via this cascade. No simulator code changes needed — once real fees are synced, it automatically uses them.

---

## 6. Scheduled Sync + Manual Trigger

### 6.1 Background Sync Job

- Goroutine started at server boot (alongside existing `registry.SeedAll`)
- Runs on configurable interval (default: every 24 hours via `FEE_SYNC_INTERVAL_HOURS`)
- For each marketplace account with status `active`:
  1. Check if `last_synced_at` is older than the sync interval
  2. Decrypt account credentials
  3. Call the plugin's `SyncFees()` with account + credentials
  4. Update `last_synced_at` and `sync_status = 'synced'` on success
  5. If auth fails (401 from ML) → mark account as `requires_reauth`
  6. Log: `action=fee_sync, marketplace=mercado_livre, account_id=X, products_synced=N, duration_ms=Y`

### 6.2 Manual Sync Trigger

- Endpoint: `POST /api/v1/marketplaces/accounts/{account_id}/sync-fees`
- Calls the same `SyncFees()` immediately
- Sets `sync_status = 'syncing'` during execution
- Returns sync result: `{ status, products_synced, errors, duration_ms }`

### 6.3 Sync Status Polling

- Endpoint: `GET /api/v1/marketplaces/accounts/{account_id}/sync-status`
- Returns: `{ status: "syncing" | "synced" | "never" | "error", last_synced_at, progress, total }`
- Frontend polls this every 3 seconds while `status = 'syncing'`

### 6.4 Rate Limiting

- ML API: 10 requests/second (configurable via `ML_API_RATE_LIMIT_PER_SEC`)
- Category discovery results cached per sync run (avoid redundant calls for same product titles)
- For 500 products with category caching: ~30-60 seconds

---

## 7. Frontend Changes

### 7.1 SDK Type Fix

The `MarketplaceDefinition` type in `packages/sdk-runtime/src/index.ts` is missing `credential_schema`. Fix:

```typescript
export interface MarketplaceDefinition {
    code: string;
    display_name: string;
    auth_strategy: 'oauth2' | 'lwa' | 'api_key' | 'token' | 'unknown';
    is_active: boolean;
    capability_profile: CapabilityProfile;
    metadata: PluginMetadata;
    credential_schema: Array<{ key: string; label: string; secret: boolean }>;  // ADD THIS
}
```

### 7.2 New SDK Client Methods

```typescript
getOAuthAuthorizeURL: (marketplaceCode: string) => Promise<{ url: string; account_id: string }>;
triggerFeeSync: (accountId: string) => Promise<{ status: string }>;
getSyncStatus: (accountId: string) => Promise<{ status: string; last_synced_at?: string; progress?: number; total?: number }>;
```

### 7.3 Connection Flow UI Changes

For OAuth marketplaces (`auth_strategy: "oauth2"`):
- Create panel hides credential input fields
- Shows a single **"Authorize with Mercado Livre"** button (blue primary, ML brand color)
- Clicking it: calls `getOAuthAuthorizeURL("mercado_livre")`, then `window.location.href = url`
- After ML callback, seller lands back on Marketplaces page with account showing `active`

For API key marketplaces (`auth_strategy: "api_key"` or `"token"`):
- Current credential fields flow stays as-is

### 7.4 Account Card Changes

- Status badge reflects real state:
  - `active` → green badge (existing)
  - `authorizing` → yellow pulsing badge
  - `requires_reauth` → amber badge with warning icon
  - `auth_failed` → red badge
  - `created` → gray badge
- New line under policy snapshot: `Synced 3h ago` or `Never synced` in `text-xs text-slate-400`

### 7.5 Account Panel Changes (View Mode)

- Connection section shows: `Last fee sync: April 9, 2026 at 3:00 PM`
- New **"Sync Fees Now"** button (secondary style) triggers manual sync
- Shows sync progress: `Syncing... 42/150 products` (polled via `getSyncStatus`)
- If `requires_reauth`: amber banner with **"Re-authorize"** button that restarts OAuth flow

---

## 8. Database Changes

### 8.1 New Table: `marketplace_credentials`

```sql
CREATE TABLE marketplace_credentials (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL,
    account_id         TEXT NOT NULL REFERENCES marketplace_accounts(account_id),
    auth_type          TEXT NOT NULL CHECK (auth_type IN ('oauth2', 'api_key', 'token', 'hmac')),
    encrypted_data     BYTEA NOT NULL,
    encryption_key_id  TEXT NOT NULL,
    token_expires_at   TIMESTAMPTZ,
    refresh_expires_at TIMESTAMPTZ,
    last_refreshed_at  TIMESTAMPTZ,
    ml_user_id         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_id)
);
```

### 8.2 New Table: `marketplace_oauth_states`

```sql
CREATE TABLE marketplace_oauth_states (
    state            TEXT PRIMARY KEY,
    tenant_id        UUID NOT NULL,
    marketplace_code TEXT NOT NULL,
    account_id       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '10 minutes'
);
```

### 8.3 Alter: `marketplace_accounts`

```sql
-- Expand status values for connection lifecycle
ALTER TABLE marketplace_accounts
  DROP CONSTRAINT IF EXISTS marketplace_accounts_status_check;

ALTER TABLE marketplace_accounts
  ADD CONSTRAINT marketplace_accounts_status_check
  CHECK (status IN ('created', 'authorizing', 'active', 'requires_reauth', 'auth_failed', 'suspended', 'disconnected'));

-- Add sync tracking columns
ALTER TABLE marketplace_accounts
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'never'
    CHECK (sync_status IN ('never', 'syncing', 'synced', 'error'));
```

### 8.4 Alter: `marketplace_fee_schedules`

```sql
-- Link fees to specific seller account + add freight + per-product support
ALTER TABLE marketplace_fee_schedules
  ADD COLUMN IF NOT EXISTS account_id TEXT,
  ADD COLUMN IF NOT EXISTS freight_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_id TEXT;
```

### 8.5 Migration File

All changes in a single migration: `0016_marketplace_oauth_and_credentials.sql`

---

## 9. Module Structure

### 9.1 New Files

```
apps/server_core/internal/modules/marketplaces/
├── domain/
│   ├── credentials.go              — Credentials, OAuthTokens, OAuthState entities
│   └── connection_status.go        — Status constants + transition validation
├── application/
│   ├── oauth_service.go            — AuthorizationURL, ExchangeCode, RefreshTokens
│   ├── credential_service.go       — Encrypt, Decrypt, Store, Retrieve
│   └── fee_sync_service.go         — (extend existing) SyncAccountFees, ScheduledSync
├── ports/
│   ├── auth_provider.go            — MarketplaceAuthProvider interface
│   └── credential_store.go         — CredentialStore interface
├── adapters/
│   ├── oauth/
│   │   └── mercado_livre.go        — ML OAuth2 (authorize URL, exchange, refresh, /users/me)
│   └── postgres/
│       ├── credential_repo.go      — CredentialStore implementation
│       └── oauth_state_repo.go     — OAuthState CRUD
├── registry/
│   └── plugin.go                   — Extended interface (FeeMode, SyncFees, AuthProvider)
│   └── mercado_livre.go            — Updated: SyncFees calls ML API, AuthProvider returns ML adapter
│   └── magalu.go                   — Updated: SyncFees inserts flat table
│   └── shopee.go                   — Updated: SyncFees calculates price tiers
└── transport/
    ├── oauth_handler.go            — /oauth/authorize/{code}, /oauth/callback/{code}
    └── sync_handler.go             — POST /accounts/{id}/sync-fees, GET /accounts/{id}/sync-status
```

### 9.2 New API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/marketplaces/oauth/authorize/{marketplace_code}` | Returns ML authorization URL + creates account + OAuth state |
| GET | `/api/v1/marketplaces/oauth/callback/{marketplace_code}` | Handles ML redirect, exchanges code for tokens |
| POST | `/api/v1/marketplaces/accounts/{account_id}/sync-fees` | Triggers manual fee sync |
| GET | `/api/v1/marketplaces/accounts/{account_id}/sync-status` | Returns sync progress for polling |

All four endpoints must be added to `contracts/api/marketplace-central.openapi.yaml`.

### 9.3 Composition Changes (`root.go`)

- Register OAuth HTTP handlers on the mux
- Start scheduled fee sync goroutine (like existing `registry.SeedAll`)
- Load new env vars: `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_BASE_URL`, `CREDENTIAL_ENCRYPTION_KEY`

---

## 10. Mercado Livre API Reference

### 10.1 OAuth Endpoints

- Authorization: `GET https://auth.mercadolivre.com.br/authorization?response_type=code&client_id={APP_ID}&redirect_uri={URI}&state={STATE}`
- Token exchange: `POST https://api.mercadolibre.com/oauth/token` with `grant_type=authorization_code`, `client_id`, `client_secret`, `code`, `redirect_uri`
- Token refresh: `POST https://api.mercadolibre.com/oauth/token` with `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`
- User info: `GET https://api.mercadolibre.com/users/me` with `Authorization: Bearer {access_token}`

### 10.2 Fee Discovery Endpoints

- Category discovery: `GET https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q={product_title}` (public, no auth)
- Commission lookup: `GET https://api.mercadolibre.com/sites/MLB/listing_prices?price={X}&category_id={Y}&listing_type_id={Z}` (authenticated)
- Freight calculation: `GET https://api.mercadolibre.com/users/{userId}/shipping_options/free` with params: `dimensions={HxWxL,weight_grams}`, `item_price`, `listing_type_id`, `mode=me2` (authenticated)

### 10.3 Key Response Shapes

**listing_prices response (commission data):**
- `sale_fee_amount` — total fee
- `percentage_fee` or `meli_percentage_fee` — commission percentage
- `sale_fee_details.fixed_fee` — fixed fee amount
- `category_id`, `listing_type_id` — for reference

**shipping_options response (freight data):**
- `list_cost` — what seller pays for shipping
- Discount info if applicable

### 10.4 Rate Limits

- ~10 requests/second for authenticated endpoints
- Category discovery (public) is less restricted but should still be rate-limited to be respectful

---

## 11. Security Considerations

- **Credential encryption**: AES-256-GCM with envelope encryption. DEK per credential, KEK from env var (`CREDENTIAL_ENCRYPTION_KEY`).
- **CSRF protection**: OAuth `state` parameter stored in `marketplace_oauth_states` with 10-minute TTL. Validated on callback.
- **Token isolation**: Each tenant's credentials are tenant-scoped. RLS or application-level filtering ensures no cross-tenant access.
- **Minimal exposure**: Transport layer never sees decrypted tokens. Only `credential_service.go` calls decrypt.
- **Audit logging**: Every credential access logged with `action`, `account_id`, `reason`.
- **Refresh token handling**: ML refresh tokens are single-use. Each refresh stores the new refresh_token immediately. If storage fails after refresh, the old token is already invalidated — this is a known edge case that requires re-authorization.

---

## 12. Component Breakdown

| Component | Location | Notes |
|-----------|----------|-------|
| ML OAuth adapter | `adapters/oauth/mercado_livre.go` | Implements `MarketplaceAuthProvider` for ML |
| Credential service | `application/credential_service.go` | Encrypt/decrypt/store credentials |
| OAuth service | `application/oauth_service.go` | Orchestrates OAuth flow |
| Fee sync service | `application/fee_sync_service.go` | Extended: scheduled sync + manual trigger |
| Credential repo | `adapters/postgres/credential_repo.go` | Database operations for credentials |
| OAuth handler | `transport/oauth_handler.go` | HTTP endpoints for OAuth flow |
| Sync handler | `transport/sync_handler.go` | HTTP endpoints for fee sync |
| ML plugin update | `registry/mercado_livre.go` | SyncFees calls ML API |
| Magalu plugin update | `registry/magalu.go` | SyncFees inserts flat table |
| Shopee plugin update | `registry/shopee.go` | SyncFees calculates price tiers |
| SDK type fix | `packages/sdk-runtime/src/index.ts` | Add `credential_schema` to `MarketplaceDefinition` |
| Panel OAuth UI | `packages/feature-marketplaces/src/AccountPanel.tsx` | Show "Authorize" button for OAuth marketplaces |
| Card sync status | `packages/feature-marketplaces/src/AccountCard.tsx` | Show sync timestamp + status badge colors |
| Migration | `migrations/0016_marketplace_oauth_and_credentials.sql` | All database changes |
| OpenAPI contract | `contracts/api/marketplace-central.openapi.yaml` | 4 new endpoints |
