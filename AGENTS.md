# AGENTS - Marketplace Central

## Engineering Bar

Every change must preserve a MetalShopping-level structure:

- `apps/server_core` is the canonical center
- every module follows `domain/application/ports/adapters/transport/events/readmodel`
- frontend consumes only `packages/sdk-runtime`
- PostgreSQL is the only canonical state
- every business table carries `tenant_id`
- no pricing, margin, commission, or freight logic in React code
- no local persistence as source of truth
- every feature starts from contract, plan, and verification

## Daily Rules

- keep modules small and explicit
- prefer test-first changes
- use structured errors and contextual logs
- do not reintroduce monolithic Next.js API routes
- architectural reference lives in `ARCHITECTURE.md`
