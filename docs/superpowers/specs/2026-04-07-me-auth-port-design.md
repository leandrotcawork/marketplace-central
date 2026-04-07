# ME Auth Port + Status Connectivity Design

## Context

Task 12 wired Melhor Envio OAuth routes into connectors transport, but code review flagged two issues:
- Transport depends on a concrete adapter (`adapters/melhorenvio`) instead of a port.
- “Connected” status is a token-presence check, not a real API connectivity check.

We will correct these to align with architecture rules in `ARCHITECTURE.md` and improve correctness.

## Goals

- Keep connectors transport dependent only on ports/application, not adapters.
- Make Melhor Envio “connected” status reflect real API connectivity.
- Remove stale `/connectors/melhor-envio/auth/status` route helper and align with `/connectors/melhor-envio/status`.
- Preserve existing OAuth start/callback behavior and error envelope patterns.

## Non-Goals

- Introduce new OAuth flows or change redirect behavior.
- Add new external dependencies or change storage schema.

## Proposed Architecture

### Port Interface

Add a new port in `apps/server_core/internal/modules/connectors/ports`:

```
MEAuthPort
- HandleStart(http.ResponseWriter, *http.Request)
- HandleCallback(http.ResponseWriter, *http.Request)
- HandleStatus(http.ResponseWriter, *http.Request)
```

This port abstracts the auth/status behavior so transport no longer references adapter packages.

### Adapter Implementation

`adapters/melhorenvio.OAuthHandler` will implement `MEAuthPort` directly. Root wiring remains responsible for creating it (or nil when ME is not configured).

### Transport Changes

`connectors/transport/http_handler.go` will accept an injected `MEAuthPort` (interface), not a concrete adapter type. It will keep the same nil-guard behavior for unavailable Melhor Envio configuration.

### Connectivity Check

Update Melhor Envio connectivity logic to validate against the ME services endpoint (as called for in the plan). The status path should reflect a **live** connectivity check:
- If no token: connected=false
- If token exists but service request fails (non-2xx/auth error): connected=false
- If service request succeeds: connected=true

This same logic should be used by `Client.IsConnected` and the OAuth status handler.

### Route Alignment

Update `OAuthHandler.Register` to expose `/connectors/melhor-envio/status` only. Remove stale `/connectors/melhor-envio/auth/status` registration to avoid confusion.

## Error Handling

- Keep structured error envelopes via existing `httpx` helpers in the auth handler.
- Status endpoint returns `200` with `{ "connected": false }` for non-configured or disconnected states, not an error, consistent with existing behavior.

## Testing Strategy

- Transport unit tests should use a fake `MEAuthPort` to validate handler wiring without adapter dependency.
- Add or update Melhor Envio OAuth handler tests for:
  - status returns `connected=false` when service check fails (token exists but invalid)
  - status returns `connected=true` on successful services call
- Ensure existing OAuth start/callback tests remain unchanged.

## Migration / Rollout

No database or API contract changes. Route surface stays the same; internal helper route is removed from registration only.

## Risks

- If the services endpoint changes or rate-limits, status checks could flap. Mitigation: keep timeouts short and treat failures as disconnected.

## Open Questions

None.
