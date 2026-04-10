# ADR-003: Split integrations implementation into operational specs after foundation

**Date:** 2026-04-10
**Status:** accepted

## Context
Integrations foundation is implemented (canonical module, lifecycle, storage, APIs, SDK), but provider operations are still broad and mixed in scope. The next phase needs clearer execution slices for OAuth, fee sync, and UX delivery.

## Decision
After foundation, implementation is split into three operational specs: (1) OAuth + credential lifecycle, (2) fee sync architecture, (3) frontend connection/sync UX. Execution order is strictly 1 -> 2 -> 3.

## Rationale
OAuth is a hard dependency for authenticated provider calls and must be stabilized first. Fee sync depends on valid auth/session state. UX should follow backend behavior to avoid rework and placeholder flows.

## Consequences
Planning and delivery move from one large integration stream to three bounded streams with explicit dependencies. Review and QA become simpler per spec. Roadmap phases now track operational readiness instead of only platform scaffolding.

## Alternatives Considered
- Keep one combined spec: rejected - high coupling and unclear acceptance boundaries.
- Start from UX first: rejected - backend/auth contracts are not final enough.
