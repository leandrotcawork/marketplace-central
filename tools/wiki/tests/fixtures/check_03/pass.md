---
kind: platform
title: HTTPX
status: active
owners: [claude, leandro]
since: 2026-04-17
last_verified: 2026-04-17
depends_on: []
related: []
sources: []
---

# HTTPX

## Purpose
Router setup is centralized in platform/httpx apps/server_core/internal/platform/httpx/router.go:1-3@{sha}

## Public API
Constructor lives in apps/server_core/internal/platform/httpx/router.go:3-5@{sha}

## Consumers
Server bootstrap imports it apps/server_core/internal/platform/httpx/router.go:1-5@{sha}

## Gotchas
Return value is a lightweight placeholder apps/server_core/internal/platform/httpx/router.go:3-4@{sha}

## Related wiki
See contracts page apps/server_core/internal/platform/httpx/router.go:1-2@{sha}

## Sources
apps/server_core/internal/platform/httpx/router.go:1-5@{sha}
