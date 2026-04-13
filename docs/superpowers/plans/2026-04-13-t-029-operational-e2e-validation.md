# T-029 Operational E2E Validation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objective:** Validate the live integrations runtime end-to-end for OAuth connect flows, auth status, reauth/disconnect, fee-sync queueing, and tenant isolation against the currently implemented endpoints and runtime hub.

**Architecture:** Treat the existing `apps/server_core` handlers, `packages/sdk-runtime`, and `packages/feature-integrations` UI as the system under test. Validation is operator-style: use the browser for runtime actions, `curl.exe` for API confirmation, and server logs for evidence. Do not invent new endpoints or behaviors; this plan only exercises what is already implemented in the repository.

**Tech Stack:** Go server, PostgreSQL, React runtime hub, SDK runtime client, PowerShell, `curl.exe`, browser devtools

---

## Reference Surface

Validate only the endpoints and UI that already exist in the current branch:

- `POST /integrations/installations/{id}/auth/authorize`
- `GET /integrations/auth/callback?code=...&state=...`
- `POST /integrations/installations/{id}/auth/credentials`
- `GET /integrations/installations/{id}/auth/status`
- `POST /integrations/installations/{id}/reauth/authorize`
- `POST /integrations/installations/{id}/disconnect`
- `POST /integrations/installations/{id}/fee-sync`
- `GET /integrations/installations/{id}/operations`
- UI entry point: `/integrations`

The plan assumes the current transport logs the standard handler fields required by AGENTS:
`action`, `result`, `duration_ms`.

---

## Scope

In scope:

- OAuth authorize/callback/connect for Mercado Livre and Magalu
- Auth status checks after connect, reauth, disconnect, and fee-sync
- Reauth and disconnect lifecycle
- Fee-sync queueing and operation timeline progression
- Tenant isolation guard checks across two tenant contexts
- Shopee validation as the non-OAuth control provider using credentials connect

Out of scope:

- Adding new endpoints
- Changing response schemas
- Fixing bugs found during validation
- Reworking UI or backend behavior

This is a validation plan, not an implementation plan.

---

## Prerequisites

Before starting, confirm all of the following:

- Current branch is `feat/t-029-operational-e2e-validation`
- Database migrations are applied
- Server starts successfully from `apps/server_core/cmd/server`
- Web starts successfully from `apps/web`
- The runtime hub at `/integrations` loads without errors
- The following environment variables are set:
  - `MC_DATABASE_URL`
  - `MC_DEFAULT_TENANT_ID`
  - `MPC_ENCRYPTION_KEY`
  - `MPC_OAUTH_HMAC_SECRET`
  - Mercado Livre OAuth client credentials, if live OAuth is being exercised
  - Magalu OAuth client credentials, if live OAuth is being exercised
  - Shopee credential fixture or test credential values
- A provider sandbox or test account is available for Mercado Livre and Magalu
- A second tenant context is available for isolation checks

Recommended local defaults:

- API base URL: `http://localhost:8080`
- Web base URL: `http://localhost:5173`

Evidence capture rules:

- Save one log snippet per scenario showing handler `action`, `result`, `duration_ms`
- Save one API transcript per scenario
- Save one browser screenshot per scenario where UI evidence is required
- Do not mark a scenario complete if the only proof is a single successful HTTP status code

---

## Provider Matrix

| Provider | Connect path | Reauth path | Disconnect | Fee-sync | Notes |
|---|---|---|---|---|---|
| `mercado_livre` | OAuth authorize/callback/connect | Yes | Yes | Yes | Primary OAuth path |
| `magalu` | OAuth authorize/callback/connect | Yes | Yes | Yes | Secondary OAuth path |
| `shopee` | Credentials submit via `auth/credentials` | No OAuth reauth path in this validation set | Yes | Yes | Use as the non-OAuth control provider |

Validation rule:

- Run the OAuth scenario on `mercado_livre` and `magalu`
- Run the auth status, disconnect, and fee-sync scenarios on all three providers
- Run the credential connect scenario on `shopee` instead of OAuth authorize/callback

---

## Sandbox Blocked Constraints

If a provider sandbox, browser flow, or local callback path is blocked:

- Stop at the last verifiable hop
- Capture the blocker explicitly in the evidence notes
- Do not substitute a fake success response
- Do not mark the scenario done unless the actual server response and UI state were observed

Acceptable fallback behavior:

- If OAuth consent cannot be completed, validate the server-side authorize response and the callback contract separately, then mark the scenario blocked until the sandbox is available
- If the browser cannot follow the provider redirect, use the copied callback URL and replay it against `/integrations/auth/callback` only if it came from a real provider or a recorded successful run
- If the fee-sync worker is not running, validate queue creation only and mark timeline progression blocked

Tenant isolation has its own special constraint:

- Because tenant selection is process-scoped through `MC_DEFAULT_TENANT_ID`, isolation checks must use two separate server processes or two separately started environments sharing the same database

---

## Validation Scenarios

### Task 1: OAuth Authorize, Callback, And Connect

**Providers:** `mercado_livre`, `magalu`

**Command or action steps:**

1. Start the server and the web app with the prerequisites above.
2. Open `http://localhost:5173/integrations`.
3. Select a draft or pending installation for `mercado_livre`. Copy the installation ID from the drawer header into `$installationId` before running the API confirmation command.
4. Click the runtime hub action that triggers `POST /integrations/installations/{id}/auth/authorize`.
5. In browser devtools, confirm the request payload and response body.
6. Complete the provider consent screen.
7. Confirm the browser returns through `GET /integrations/auth/callback?code=...&state=...`.
8. Confirm the post-callback redirect lands on the current success path used by the server: `/connections/{installationId}?status=connected` on success or `/connections?status=failed` on error, then return to `/integrations`.
9. Run:

```powershell
$baseUrl = "http://localhost:8080"
curl.exe -sS "$baseUrl/integrations/installations/$installationId/auth/status"
```

10. Repeat the same flow for `magalu`. Reassign `$installationId` to the Magalu installation before reusing the status command.

**Expected API/UI evidence:**

- `POST /integrations/installations/{id}/auth/authorize` returns `200`
- Response JSON contains:
  - `installation_id`
  - `provider_code`
  - `state`
  - `auth_url`
  - `expires_in`
- Browser navigates to the provider consent page
- `GET /integrations/auth/callback` returns `302`
- The runtime hub shows the installation as connected after refresh
- `GET /integrations/installations/{id}/auth/status` returns `200`
- Auth status JSON shows:
  - `installation_id`
  - `status: connected`
  - `health_status: healthy` or `warning` depending on provider state
  - the correct `provider_code`
  - the correct `external_account_id`
- Server logs include `integrations.auth.start` and `integrations.auth.callback` entries with `action`, `result`, and `duration_ms`

**Failure signals:**

- Any `4xx` or `5xx` response on authorize or callback
- Missing `auth_url` or `state` in the authorize response
- Callback does not return `302`
- Callback lands on the wrong URL or fails to update the runtime hub
- Auth status remains stale after a successful callback
- Server logs are missing the required structured fields
- The callback resolves an installation from the wrong tenant

---

### Task 2: Shopee Credentials Connect

**Providers:** `shopee`

**Endpoint:** `POST /integrations/installations/{id}/auth/credentials`

**Command or action steps:**

1. Open `http://localhost:5173/integrations`.
2. Select a draft or pending `shopee` installation and copy the installation ID into `$installationId`.
3. Open the runtime hub credentials form for that installation.
4. Submit the credentials payload that the current UI and SDK expect, which triggers `POST /integrations/installations/{id}/auth/credentials`.
5. In browser devtools, confirm the request body includes the credentials map and the response returns successfully.
6. Refresh the runtime hub after the request completes.
7. Run:

```powershell
$baseUrl = "http://localhost:8080"
curl.exe -sS "$baseUrl/integrations/installations/$installationId/auth/status"
```

8. Confirm the connected installation appears in the operations surface and the status panel reflects the new state.

**Expected API/UI evidence:**

- `POST /integrations/installations/{id}/auth/credentials` returns `200`
- Response JSON matches the runtime contract and includes the installation status after connect
- The runtime hub shows the `shopee` installation as connected or otherwise authenticated according to the current backend state
- `GET /integrations/installations/{id}/auth/status` returns `200`
- Auth status JSON shows:
  - `installation_id`
  - `status`
  - `health_status`
  - the correct `provider_code: shopee`
  - the correct `external_account_id` if the backend assigns one
- Server logs include `integrations.auth.credentials` with `action`, `result`, and `duration_ms`

**Failure signals:**

- Credentials submit returns `4xx` or `5xx`
- The request body is not accepted by the current runtime contract
- The runtime hub does not refresh after a successful submit
- `auth/status` still shows the installation as disconnected after a successful submit
- The response leaks secrets or omits the status fields required by the contract
- Logs are missing the required structured fields

---

### Task 3: Auth Status Checks

**Providers:** `mercado_livre`, `magalu`, `shopee`

**Command or action steps:**

1. For each provider, open the runtime hub and select a connected installation. Copy the installation ID into `$installationId` before running the API checks.
2. Use the UI status panel to read the auth state.
3. Run:

```powershell
$baseUrl = "http://localhost:8080"
curl.exe -sS "$baseUrl/integrations/installations/$installationId/auth/status"
```

4. Cross-check the API result with the UI drawer for the same installation.
5. After disconnecting one installation, repeat the status check to confirm the transition is reflected everywhere.

**Expected API/UI evidence:**

- `GET /integrations/installations/{id}/auth/status` returns `200`
- Response JSON matches the OpenAPI contract:
  - `installation_id`
  - `status`
  - `health_status`
  - `provider_code`
  - `external_account_id`
- The runtime hub drawer shows the same status as the API
- Status changes after disconnect or reauth are visible without a page reload if the UI refresh action is used
- Logs include `integrations.auth.status` with `action`, `result`, and `duration_ms`

**Failure signals:**

- UI and API disagree on status
- Status endpoint leaks secret material
- Status is readable for the wrong installation
- Status response omits required fields
- Logs do not identify the status action

---

### Task 4: Reauth And Disconnect

**Providers:** `mercado_livre`, `magalu`, plus a reauth-capable connected installation

**Command or action steps:**

1. Use an installation that is currently marked `requires_reauth`. Copy that installation ID into `$installationId` before running the API checks.
2. Open `/integrations` and select that installation.
3. Click the reauthorize action that triggers `POST /integrations/installations/{id}/reauth/authorize`.
4. Complete the provider consent flow.
5. Confirm the install returns to a connected state.
6. Run:

```powershell
$baseUrl = "http://localhost:8080"
curl.exe -sS -X POST "$baseUrl/integrations/installations/$installationId/disconnect" -H "Content-Type: application/json" -d "{}"
curl.exe -sS "$baseUrl/integrations/installations/$installationId/auth/status"
```

7. Repeat disconnect on the same installation a second time to confirm idempotency.
8. Repeat the same reauth/disconnect checks for `magalu` if a sandbox account is available.

**Expected API/UI evidence:**

- `POST /integrations/installations/{id}/reauth/authorize` returns `200`
- Response JSON contains:
  - `installation_id`
  - `provider_code`
  - `state`
  - `auth_url`
  - `expires_in`
- Successful reauth returns the installation to `connected`
- `POST /integrations/installations/{id}/disconnect` returns `200`
- Disconnect response matches the runtime contract and the installation becomes `disconnected`
- A second disconnect returns a safe no-op result, not a crash or duplicate side effect
- The runtime hub shows the disconnected state and disables actions that are no longer valid
- Logs include `integrations.auth.reauth` and `integrations.auth.disconnect` entries with `action`, `result`, and `duration_ms`

**Failure signals:**

- Reauth starts from the wrong state
- Reauth completes but the installation stays stuck in `requires_reauth`
- Disconnect is not idempotent
- Disconnect leaves the installation visible as connected
- Reauth or disconnect affect a different tenant's installation
- Logs are missing the required fields

---

### Task 5: Fee-Sync Queue And Operation Run Timeline

**Providers:** `mercado_livre`, `magalu`, `shopee`

**Command or action steps:**

1. Open the runtime hub for a connected installation. Copy the installation ID from the drawer header into `$installationId` before running the API command.
2. Trigger fee sync from the UI or call:

```powershell
$baseUrl = "http://localhost:8080"
curl.exe -sS -X POST "$baseUrl/integrations/installations/$installationId/fee-sync" -H "Content-Type: application/json" -d "{}"
```

3. Confirm the response returns `202`.
4. Confirm the response body contains `installation_id`, `operation_run_id`, and `status: queued`.
5. Call the timeline endpoint:

```powershell
curl.exe -sS "$baseUrl/integrations/installations/$installationId/operations"
```

6. Refresh the runtime hub and verify the operation timeline shows the queued run.
7. Keep polling the operations endpoint until the run advances to `running`, `succeeded`, or `failed`.
8. Repeat the same flow for `magalu` and `shopee`.

**Expected API/UI evidence:**

- `POST /integrations/installations/{id}/fee-sync` returns `202`
- Response JSON contains:
  - `installation_id`
  - `operation_run_id`
  - `status: queued`
- `GET /integrations/installations/{id}/operations` returns `200`
- The newest operation run appears in the returned `items`
- The runtime hub timeline shows the same run ID and status progression
- At least one terminal state is visible if the worker is running long enough:
  - `succeeded`
  - `failed`
- Logs include `integrations.fee_sync.start` and `integrations.operations.list` with `action`, `result`, and `duration_ms`

**Failure signals:**

- Fee-sync returns anything other than `202` for a valid connected installation
- Missing `operation_run_id`
- Operation never appears in the timeline
- The UI timeline shows stale data after a refresh
- The worker advances a run for the wrong installation or tenant
- A queued operation appears without a matching log entry

If the fee-sync worker is not running in the current sandbox, stop after the queued response and mark the timeline progression as blocked.

---

### Task 6: Tenant Isolation Guard Checks

**Providers:** `mercado_livre`, `magalu`, `shopee`

**Command or action steps:**

1. Start one server process with `MC_DEFAULT_TENANT_ID=tenant_alpha` and `API_PORT=8080`.
2. Seed or create a known installation under `tenant_alpha`.
3. Start a second server process against the same database with `MC_DEFAULT_TENANT_ID=tenant_beta` and `API_PORT=8081`.
4. From the `tenant_beta` process, call:

```powershell
$baseUrlBeta = "http://localhost:8081"
curl.exe -sS "$baseUrlBeta/integrations/installations/$installationId/auth/status"
curl.exe -sS "$baseUrlBeta/integrations/installations/$installationId/operations"
curl.exe -sS -X POST "$baseUrlBeta/integrations/installations/$installationId/fee-sync" -H "Content-Type: application/json" -d "{}"
```

5. Open the runtime hub on the `tenant_beta` instance and confirm the `tenant_alpha` installation is absent.
6. Query the database directly for both tenants to confirm the rows are partitioned by `tenant_id`.
7. Run a read-only SQL check against the shared database to confirm tenant scoping without mutating anything:

```sql
SELECT installation_id, tenant_id, provider_code, status
FROM integration_installations
WHERE tenant_id IN ('tenant_alpha', 'tenant_beta')
ORDER BY tenant_id, installation_id;
```

**Expected API/UI evidence:**

- `tenant_beta` cannot read `tenant_alpha` installation state
- `tenant_beta` cannot start fee-sync on `tenant_alpha` data
- The UI for `tenant_beta` does not show `tenant_alpha` installations
- Database rows remain tenant-scoped, with separate `tenant_id` values
- Any denial is a structured JSON error, not a leaked record

**Failure signals:**

- Any cross-tenant visibility in API, UI, or logs
- A response body includes `tenant_alpha` data while running under `tenant_beta`
- A tenant beta request mutates tenant alpha rows
- A query or endpoint behaves like a global lookup instead of a tenant-scoped lookup

This check is mandatory because the repository rule requires every business query to include `tenant_id`.

---

## Done-Gate Checklist

Do not call T-029 complete until all of the following are true:

- OAuth connect has been validated for `mercado_livre`
- OAuth connect has been validated for `magalu`
- Shopee connect has been validated through the credentials path
- Auth status checks have been validated for all three providers
- Reauth has been validated for at least one OAuth provider
- Disconnect has been validated and revalidated for idempotency
- Fee-sync queueing has been validated for all three providers
- The operations timeline has shown the queued run and at least one later state where the worker is available
- Tenant isolation has been proven with separate tenant contexts
- Every scenario has API evidence, UI evidence when applicable, and server log evidence
- Any sandbox block has been explicitly recorded, with the blocked sub-step named
- No scenario is marked passed based only on assumptions or a single HTTP status code

Final operator outcome:

- `DONE` only if every required scenario is complete and unblocked
- `DONE_WITH_CONCERNS` if the plan ran but a non-blocking evidence gap remains documented
- `BLOCKED` if any required provider, callback, worker, or tenant isolation check could not be completed
- `NEEDS_CONTEXT` only if the environment does not yet expose the stated endpoints or runtime hub


