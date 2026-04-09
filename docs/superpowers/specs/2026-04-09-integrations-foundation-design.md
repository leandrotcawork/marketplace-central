# Integrations Foundation Design

**Date:** 2026-04-09  
**Status:** Approved for planning  
**Scope:** Platform foundation for tenant-installed external integrations, limited to the `marketplace` family in the first implementation

---

## 1. Purpose

Marketplace Central needs a professional integration platform, not a collection of marketplace-specific connection hacks.

The current repository has useful building blocks in `marketplaces` and `connectors`, but connection lifecycle, credentials, provider behavior, and business configuration are not separated cleanly enough to support long-term growth. If additional marketplaces are added on top of the current shape, the system will accumulate provider-specific branching inside core modules and the architecture will degrade quickly.

This design establishes `integrations` as a top-level platform module that owns:

- provider definitions
- tenant installations
- credential lifecycle
- auth session lifecycle
- connection verification
- health and status reporting
- capability exposure to consuming modules

The first supported integration family is `marketplace`. Mercado Livre, Magalu, Shopee, Amazon, and future marketplace providers will all plug into the same foundation. Other families may be added later, but they are explicitly out of scope for this phase.

---

## 2. Goals

1. Introduce `integrations` as the canonical backend module for external platform connections.
2. Make provider definitions, tenant installations, credentials, auth state, and health first-class platform concepts.
3. Support multiple installations per tenant for the same provider from day one.
4. Expose provider functionality through capability-specific contracts rather than one monolithic provider interface.
5. Keep marketplace business concerns in `marketplaces`, while moving connection/auth concerns out of it.
6. Make future provider additions incremental: add a provider adapter and register it, without rewriting consuming modules.
7. Preserve compatibility with the repository's frozen architectural rules and future MetalShopping merge strategy.

---

## 3. Non-Goals

This document does not define:

- provider-specific OAuth flows
- marketplace fee-sync behavior
- messaging or order ingestion behavior
- webhook ingestion architecture
- frontend page design for install/connect flows
- migration details for any one provider

Those belong in follow-on specs that depend on this foundation.

---

## 4. Architectural Position

### 4.1 Canonical module

A new backend module will be introduced:

```text
apps/server_core/internal/modules/integrations/
```

`integrations` is the platform authority for external connections.

It owns:

- provider registry
- installation lifecycle
- credential storage boundary
- auth orchestration
- connection verification
- capability resolution
- operational health
- integration operation tracking

It does not own:

- marketplace pricing policy
- marketplace-specific business read models
- pricing simulation logic
- message inbox behavior
- order lifecycle behavior

Those remain separate business modules.

### 4.2 Relationship to existing modules

- `integrations` becomes the canonical owner of connection lifecycle.
- `marketplaces` becomes a consumer of `integrations` for marketplace-related installations.
- existing `connectors` code is treated as legacy or transitional infrastructure and should be absorbed into, or bridged by, `integrations` over time.
- business modules such as `pricing`, `orders`, and `messaging` must depend on capability contracts published by `integrations`, never on provider HTTP clients directly.

### 4.3 Naming

Platform language:

- module: `integrations`
- family: `marketplace`
- tenant-connected record: `integration installation`
- concrete implementation: `provider adapter`

Product/UI language may use:

- "Marketplace Integrations"
- "Connected Marketplace"
- "Installation"

The backend canonical model remains installation-based even if specific screens present marketplace-friendly wording.

---

## 5. Domain Model

### 5.1 ProviderDefinition

`ProviderDefinition` is the system-owned description of one supported provider.

Examples:

- `mercado_livre`
- `magalu`
- `shopee`
- `amazon`

Responsibilities:

- identify provider code and family
- declare supported auth strategy
- declare install mode
- declare possible capabilities
- declare provider metadata required for UX and operations

Characteristics:

- static or code-seeded
- not tenant-owned
- versioned by application releases and migrations
- never mutated by tenants

### 5.2 IntegrationInstallation

`IntegrationInstallation` is the tenant-owned record representing one installed provider connection.

Example:

- tenant `acme`
- provider `mercado_livre`
- installation `inst_01H...`

Responsibilities:

- link tenant to provider definition
- own lifecycle state
- hold external account identity summary
- point to active credential version
- summarize auth and health state
- expose installation-specific capability status

Characteristics:

- multiple installations per tenant per provider are allowed
- created before full connection is complete
- canonical reference for downstream business modules

### 5.3 IntegrationCredential

`IntegrationCredential` stores encrypted secret configuration required by a provider.

Examples:

- client secret
- API key
- signing secret
- partner key
- static token

Responsibilities:

- store encrypted secret material
- support versioning and rotation
- support explicit revocation
- provide auditable history of secret changes

Characteristics:

- not embedded in installations
- not used as a generic runtime auth session store
- active credential version is referenced by installation

### 5.4 IntegrationAuthSession

`IntegrationAuthSession` stores runtime auth state derived from credentials and provider flows.

Examples:

- access token expiry
- refresh metadata
- provider-side seller/shop/account ID
- last successful verification timestamp
- consecutive auth failure count
- reauth requirement markers

Responsibilities:

- separate frequently changing auth runtime from durable secret configuration
- support refresh and verification flows
- capture provider identity discovered during verification

### 5.5 InstallationCapabilityState

`InstallationCapabilityState` captures the effective capability status of one installation.

Example:

- provider declares `pricing_fee_sync` as supported
- installation resolves it as `enabled`, `degraded`, or `requires_reauth`

Responsibilities:

- convert provider-declared possibilities into tenant-specific effective states
- prevent consumers from guessing capability readiness based on provider code alone

### 5.6 Operation tracking

`integrations` should also own a platform-level record for asynchronous or long-running operations.

Recommended concept:

- `IntegrationOperationRun`

Examples:

- verify installation
- refresh auth session
- sync marketplace fees
- disconnect installation

This gives the platform a durable place to store progress, result, failure code, attempt count, timestamps, and actor metadata.

---

## 6. Capability Model

### 6.1 Why capability contracts exist

The system must not expose provider-specific behavior directly to business modules. Mature SaaS integration platforms hide provider implementation details behind stable platform contracts.

`integrations` will therefore expose capability-specific ports instead of one large provider interface with optional methods.

### 6.2 Capability declaration levels

Capability modeling has two levels:

1. Declared capability
   - lives on `ProviderDefinition`
   - answers: "what can this provider support in principle?"

2. Effective capability
   - lives on `InstallationCapabilityState`
   - answers: "what is actually usable for this tenant installation right now?"

### 6.3 Marketplace capability set

Initial marketplace capability taxonomy:

- `catalog_import`
- `catalog_publish`
- `pricing_fee_sync`
- `inventory_sync`
- `order_read`
- `message_read`
- `message_reply`
- `shipment_tracking`
- `webhook_receive`

This list may evolve, but the platform must model capabilities explicitly instead of relying on undocumented provider assumptions.

### 6.4 Effective states

Recommended effective states:

- `enabled`
- `degraded`
- `disabled`
- `requires_reauth`
- `unsupported`

These states are capability-specific, not installation-global.

### 6.5 Consumer contract rule

Consumers must request capabilities from `integrations`, not branch on provider code.

Examples:

- `pricing` resolves a `pricing_fee_sync` capability
- `orders` resolves an `order_read` capability
- `messaging` resolves `message_read` and `message_reply` capabilities

Hard rule:

- no consumer module may switch on values such as `mercado_livre` or `magalu` to choose logic paths
- provider adapters implement platform ports defined by `integrations`
- business modules depend only on those ports

---

## 7. Installation Lifecycle

### 7.1 Lifecycle principles

A professional integration platform does not collapse connection lifecycle, auth validity, capability readiness, and sync health into one overloaded status field.

This design separates:

- installation lifecycle
- auth session validity
- effective capability state
- health summary

Each of these concepts must be modeled independently, even if the UI later projects them into a simplified badge.

### 7.2 Installation lifecycle states

Recommended canonical installation states:

- `draft`
- `pending_connection`
- `connected`
- `degraded`
- `requires_reauth`
- `disconnected`
- `suspended`
- `failed`

### 7.3 State meanings

- `draft`
  - installation record exists but connection has not started or was not yet submitted

- `pending_connection`
  - user has initiated connect/auth flow and platform is waiting for completion or verification

- `connected`
  - installation is active, verified, and operational at platform level

- `degraded`
  - installation remains connected, but health or one or more capabilities are impaired

- `requires_reauth`
  - installation exists, but user action is required to restore auth validity

- `disconnected`
  - installation was intentionally removed or disabled by the tenant

- `suspended`
  - installation is blocked administratively

- `failed`
  - installation creation or recovery failed in a non-operational state

### 7.4 Canonical flow

Recommended base flow:

```text
draft -> pending_connection -> connected
connected -> degraded
connected -> requires_reauth
degraded -> connected
requires_reauth -> pending_connection
connected -> disconnected
connected -> suspended
pending_connection -> failed
failed -> draft
```

The actual transition matrix should be enforced in application services, not in HTTP handlers.

### 7.5 Related status concepts

Separate platform state projections should exist for:

- auth session state
  - example: `valid`, `expiring`, `invalid`, `refresh_failed`

- health summary
  - example: `healthy`, `warning`, `critical`

- capability state
  - example: `enabled`, `degraded`, `requires_reauth`

This prevents status ambiguity and produces better operator visibility.

---

## 8. Security And Secret Boundary

### 8.1 Security model

All secret and auth handling belongs to `integrations`.

Business modules must never own:

- raw credentials
- access tokens
- refresh tokens
- provider secret rotation logic

### 8.2 Record split

The canonical split is:

- `IntegrationInstallation`
  - product-facing connection record

- `IntegrationCredential`
  - encrypted durable secret material

- `IntegrationAuthSession`
  - runtime auth state and verification metadata

This split is required. A single credentials blob on a business record is not acceptable for the long-term platform.

### 8.3 Security rules

- transport handlers never persist decrypted secrets directly to installation rows
- secret reads and writes must go through explicit `integrations` ports
- decrypted secret material must only exist inside the minimum application/adaptor flow that needs it
- auth refresh logic must be idempotent and retry-safe
- credential rotation must create a new versioned record, not mutate history in place
- every secret access path must be audit logged with structured metadata
- provider-specific token semantics belong in provider adapters, not in generic transport code

### 8.4 Tenant isolation

Every business-facing and security-sensitive table in this platform must carry `tenant_id`.

All reads and writes must be tenant-scoped.

No installation, credential, auth session, capability state, or operation record may be queried without `tenant_id` filtering in repository code.

---

## 9. Module Structure

Recommended module shape:

```text
apps/server_core/internal/modules/integrations/
  domain/
    provider_definition.go
    installation.go
    credential.go
    auth_session.go
    capability_state.go
    operation_run.go
    lifecycle.go
  application/
    installation_service.go
    credential_service.go
    auth_service.go
    verification_service.go
    capability_service.go
    operation_service.go
  ports/
    provider_registry.go
    credential_store.go
    auth_session_store.go
    installation_repository.go
    capability_resolver.go
    installation_verifier.go
    marketplace_capabilities.go
  adapters/
    postgres/
      installation_repo.go
      credential_repo.go
      auth_session_repo.go
      capability_state_repo.go
      operation_run_repo.go
    providers/
      mercado_livre/
      magalu/
      shopee/
      amazon/
  transport/
    http_handler.go
    install_handler.go
    status_handler.go
  events/
  readmodel/
```

Notes:

- provider-specific code belongs under `adapters/providers/<provider>`
- provider adapters implement contracts owned by `integrations`
- database persistence stays under `adapters/postgres`
- transport remains thin and delegates all lifecycle logic to application services

---

## 10. Database Direction

### 10.1 Canonical ownership

The following conceptual tables become canonical platform records:

- `integration_provider_definitions`
- `integration_installations`
- `integration_credentials`
- `integration_auth_sessions`
- `integration_capability_states`
- `integration_operation_runs`

Optional later:

- `integration_events`

### 10.2 Relationship to current marketplace tables

This design explicitly rejects `marketplace_accounts` as the long-term owner of:

- credentials
- auth state
- connection lifecycle
- provider account identity

`marketplaces` may continue to own marketplace business configuration, but it should reference the canonical installation record instead of duplicating connection state.

### 10.3 Migration strategy direction

Implementation may be incremental, but the design must keep canonical ownership explicit.

Allowed migration patterns:

- projection from `integrations` into marketplace-facing read models
- compatibility adapter that reads old shapes while new records are introduced
- staged cutover from `marketplace_accounts` to `integration_installations`

Not allowed:

- keeping both models as equal long-term authorities
- storing new auth/session state back into business tables as the permanent solution

---

## 11. API Direction

### 11.1 API style

OpenAPI and runtime routes must remain aligned with repository architecture:

- stable URLs without `/v1` prefixes in route paths
- structured JSON errors
- method validation in every handler
- transport logic limited to validation, delegation, and response mapping

### 11.2 Platform API categories

The API should distinguish:

- provider catalog endpoints
- installation lifecycle endpoints
- installation status and health endpoints
- capability operation endpoints
- operation-run inspection endpoints

Examples of the shape, not final path commitments:

- list provider definitions
- create installation draft
- begin connection flow
- complete connection callback or verification
- inspect installation health
- disconnect or reconnect installation
- inspect operation progress

Provider-specific behavior should not leak into generic route structure unless a provider flow genuinely requires a provider-specific callback path.

---

## 12. Observability And Operations

`integrations` must operate like a platform module, not a hidden adapter layer.

Minimum observability expectations:

- every handler logs `action`, `result`, `duration_ms`
- application services log meaningful lifecycle transitions
- provider verification failures are logged with structured error codes
- operation runs record attempts, start time, completion time, result, and failure code
- auth refresh and credential rotation are auditable

Recommended examples of operation types:

- `installation_connect`
- `installation_verify`
- `auth_refresh`
- `installation_disconnect`
- `capability_sync`

This is necessary to support operator debugging once multiple providers and multiple installations per tenant exist.

---

## 13. Testing Direction

The first implementation plan derived from this spec must include tests for:

- lifecycle transition validation
- tenant-scoped repository behavior
- credential rotation semantics
- auth session update and refresh semantics
- capability resolution from declared + effective state
- transport method validation and structured errors
- provider adapter contract conformance through tests against integration ports

Testing principles:

- domain tests validate lifecycle and state rules
- application tests validate orchestration and idempotency
- adapter tests validate persistence and provider contract mapping
- transport tests validate HTTP behavior only

---

## 14. Follow-On Spec Sequence

This foundation spec must be followed by narrower specs before implementation planning for provider behavior:

1. `Marketplace Capability Contracts`
   - concrete marketplace capability interfaces and resolution model

2. `Marketplace Fee Sync Architecture`
   - fee-specific sync behavior, projection rules, operation model, pricing integration points

3. `Marketplace Integrations UX`
   - install/connect flows, status presentation, reconnect/disconnect experience, sync status UX

Provider-specific specs such as Mercado Livre OAuth should only be written after these platform and family-level specs are settled.

---

## 15. Decisions Captured

This design freezes the following decisions for the upcoming planning work:

1. `integrations` is a new top-level platform module.
2. Only the `marketplace` integration family is in scope for the first implementation.
3. Provider implementations are internal first-party adapters compiled into the backend, not runtime-installable plugins.
4. The canonical tenant-connected record is an `integration installation`.
5. Multiple installations per tenant per provider are supported from day one.
6. Capability modeling uses both declared provider capabilities and effective installation capabilities.
7. Credentials, auth sessions, and installations are separate canonical records.
8. Installations are created first in `draft` or `pending_connection`, then completed through connection flows.
9. Business modules consume capability contracts from `integrations`, never provider HTTP clients directly.
10. Marketplace-specific business configuration does not own connection lifecycle.

---

## 16. Supersession Note

This document supersedes the platform direction implied by `docs/superpowers/specs/2026-04-09-marketplace-integration-layer-design.md`.

That earlier document mixed provider-specific behavior, marketplace business behavior, and connection-platform concerns into one spec. Future planning should treat this document as the canonical foundation for the split design sequence.
