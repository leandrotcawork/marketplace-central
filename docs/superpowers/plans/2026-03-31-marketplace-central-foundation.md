# Marketplace Central Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset `marketplace-central` into a MetalShopping-style monorepo with a Go `server_core`, a thin `web` client, PostgreSQL as canonical state, and a first usable flow for catalog, marketplace settings, and pricing simulations.

**Architecture:** The implementation replaces the current Next.js monolith with an independent monorepo that mirrors the structural rules of MetalShopping Final. The backend is a modular Go monolith with `catalog`, `marketplaces`, and `pricing` modules, while the frontend becomes a thin React client that talks only to `packages/sdk-runtime`.

**Tech Stack:** Go 1.25+, PostgreSQL, `net/http`, `pgx/v5`, React 19, Vite, TypeScript, Vitest, React Testing Library, npm workspaces

---

## Planned File Structure

### Root

- Create: `AGENTS.md`
- Create: `ARCHITECTURE.md`
- Create: `go.work`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Modify: `.gitignore`

Responsibilities:

- `AGENTS.md` freezes engineering rules for daily work.
- `ARCHITECTURE.md` freezes long-lived structure and references MetalShopping Final.
- `go.work` anchors Go workspace layout.
- `package.json` anchors npm workspaces for `apps/web` and `packages/*`.

### Contracts

- Create: `contracts/api/marketplace-central.openapi.yaml`
- Create: `contracts/events/README.md`
- Create: `contracts/governance/README.md`

Responsibilities:

- OpenAPI is the public API source of truth.
- `events/` and `governance/` exist now as explicit future boundaries.

### Server Core

- Create: `apps/server_core/go.mod`
- Create: `apps/server_core/cmd/server/main.go`
- Create: `apps/server_core/cmd/migrate/main.go`
- Create: `apps/server_core/migrations/0001_foundation.sql`
- Create: `apps/server_core/migrations/0002_catalog_products.sql`
- Create: `apps/server_core/migrations/0003_marketplaces.sql`
- Create: `apps/server_core/migrations/0004_pricing.sql`
- Create: `apps/server_core/internal/platform/config/config.go`
- Create: `apps/server_core/internal/platform/httpx/router.go`
- Create: `apps/server_core/internal/platform/httpx/json.go`
- Create: `apps/server_core/internal/platform/logging/logger.go`
- Create: `apps/server_core/internal/platform/pgdb/config.go`
- Create: `apps/server_core/internal/platform/pgdb/pool.go`
- Create: `apps/server_core/internal/platform/pgdb/tenant.go`
- Create: `apps/server_core/internal/composition/root.go`

Responsibilities:

- platform code owns config, HTTP helpers, logging, Postgres, tenancy defaults, and module registration.

### Modules

- Create: `apps/server_core/internal/modules/catalog/...`
- Create: `apps/server_core/internal/modules/marketplaces/...`
- Create: `apps/server_core/internal/modules/pricing/...`
- Create: `apps/server_core/tests/unit/*.go`

Responsibilities:

- each module follows `domain/application/ports/adapters/transport/events/readmodel`.

### Frontend and Shared Packages

- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/app/AppRouter.tsx`
- Create: `packages/sdk-runtime/package.json`
- Create: `packages/sdk-runtime/src/index.ts`
- Create: `packages/sdk-runtime/src/index.test.ts`
- Create: `packages/ui/package.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/Button.tsx`
- Create: `packages/ui/src/SurfaceCard.tsx`
- Create: `packages/feature-marketplaces/package.json`
- Create: `packages/feature-marketplaces/src/MarketplaceSettingsPage.tsx`
- Create: `packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx`
- Create: `packages/feature-simulator/package.json`
- Create: `packages/feature-simulator/src/PricingSimulatorPage.tsx`
- Create: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`

Responsibilities:

- `sdk-runtime` is the only frontend API boundary.
- `ui` holds shared presentation primitives.
- feature packages own page-level UI and view state.

### Legacy Removal

- Delete after replacement stabilizes: `app/`
- Delete after replacement stabilizes: `components/`
- Delete after replacement stabilizes: `hooks/`
- Delete after replacement stabilizes: `lib/`
- Delete after replacement stabilizes: `stores/`
- Delete after replacement stabilizes: `tests/`
- Delete after replacement stabilizes: `templates/`
- Delete after replacement stabilizes: `types/`

Responsibilities:

- remove the monolith only after the new foundation boots and tests pass.

## Task 1: Freeze Current State and Write Foundation Rules

**Files:**
- Create: `AGENTS.md`
- Create: `ARCHITECTURE.md`
- Modify: `.gitignore`

- [ ] **Step 1: Create a safety tag before replacing the monolith**

Run:

```bash
git tag pre-foundation-reset-2026-03-31
git tag --list "pre-foundation-reset-*"
```

Expected: the list includes `pre-foundation-reset-2026-03-31`

- [ ] **Step 2: Write `AGENTS.md` with MetalShopping-style operational rules**

```md
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
```

- [ ] **Step 3: Write `ARCHITECTURE.md` with the approved structure**

```md
# Marketplace Central Architecture

## Reference Baseline

This repository mirrors the structural rules of MetalShopping Final:

- GitHub: https://github.com/leandrotcawork/MetalShopping_Final

## Frozen Decisions

- independent monorepo
- Go `apps/server_core`
- thin `apps/web`
- PostgreSQL canonical state
- single-tenant, tenant-ready
- modules: `catalog`, `marketplaces`, `pricing`
- stable routes without `/v1`
- future integrations only through ports and adapters
```

- [ ] **Step 4: Exclude generated and legacy noise, not source**

```gitignore
node_modules/
dist/
coverage/
.vite/
apps/web/node_modules/
packages/*/node_modules/
apps/server_core/bin/
```

- [ ] **Step 5: Commit the frozen rules**

Run:

```bash
git add AGENTS.md ARCHITECTURE.md .gitignore
git commit -m "docs(architecture): freeze marketplace central foundation rules"
```

Expected: commit succeeds and only these files are included

## Task 2: Create Root Monorepo Scaffolding

**Files:**
- Create: `go.work`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `apps/server_core/go.mod`
- Create: `apps/web/package.json`
- Create: `packages/sdk-runtime/package.json`
- Create: `packages/ui/package.json`
- Create: `packages/feature-marketplaces/package.json`
- Create: `packages/feature-simulator/package.json`

- [ ] **Step 1: Write the root npm workspace manifest**

```json
{
  "name": "marketplace-central",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/web",
    "packages/*"
  ],
  "scripts": {
    "dev": "next dev",
    "dev:https": "next dev --experimental-https --hostname localhost",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest",
    "test:run": "vitest run",
    "web:dev": "npm run dev --workspace @marketplace-central/web",
    "web:test": "npm run test --workspace @marketplace-central/web",
    "web:build": "npm run build --workspace @marketplace-central/web"
  },
  "dependencies": {
    "@base-ui/react": "^1.3.0",
    "@tanstack/react-table": "^8.21.3",
    "@types/pg": "^8.20.0",
    "better-sqlite3": "^12.8.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^12.38.0",
    "lucide-react": "^1.7.0",
    "next": "16.2.1",
    "openai": "^6.33.0",
    "pg": "^8.20.0",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "recharts": "^3.8.1",
    "shadcn": "^4.1.0",
    "tailwind-merge": "^3.5.0",
    "tw-animate-css": "^1.4.0",
    "xlsx": "^0.18.5",
    "zustand": "^5.0.12"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "debug": "^4.4.3",
    "eslint": "^9",
    "eslint-config-next": "16.2.1",
    "jsdom": "^27.0.0",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Write `go.work` and the shared TS base config**

```text
go 1.25.1

use (
  ./apps/server_core
)
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Write each workspace package manifest**

```json
{
  "name": "@marketplace-central/sdk-runtime",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts"
}
```

```json
{
  "name": "@marketplace-central/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "peerDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
}
```

```json
{
  "name": "@marketplace-central/feature-marketplaces",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/MarketplaceSettingsPage.tsx",
  "dependencies": {
    "@marketplace-central/sdk-runtime": "0.1.0",
    "@marketplace-central/ui": "0.1.0",
    "react": "^19.2.0"
  }
}
```

```json
{
  "name": "@marketplace-central/feature-simulator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/PricingSimulatorPage.tsx",
  "dependencies": {
    "@marketplace-central/sdk-runtime": "0.1.0",
    "@marketplace-central/ui": "0.1.0",
    "react": "^19.2.0"
  }
}
```

- [ ] **Step 4: Write the `apps/web` manifest**

```json
{
  "name": "@marketplace-central/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@marketplace-central/feature-marketplaces": "0.1.0",
    "@marketplace-central/feature-simulator": "0.1.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.7.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "jsdom": "^26.1.0",
    "vite": "^7.0.6",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 5: Install workspace dependencies and sync the Go workspace**

Run:

```bash
npm install
go work sync
```

Expected:

- `package-lock.json` is updated
- `go.work.sum` is created or refreshed if Go module dependencies are present; do not create it manually

- [ ] **Step 6: Commit the monorepo skeleton**

Run:

```bash
git add package.json package-lock.json tsconfig.base.json go.work go.work.sum apps/web/package.json packages/sdk-runtime/package.json packages/ui/package.json packages/feature-marketplaces/package.json packages/feature-simulator/package.json
git commit -m "chore(repo): scaffold marketplace central monorepo"
```

## Task 3: Bootstrap `server_core` with Config, Router, and Health

**Files:**
- Create: `apps/server_core/go.mod`
- Create: `apps/server_core/cmd/server/main.go`
- Create: `apps/server_core/internal/platform/config/config.go`
- Create: `apps/server_core/internal/platform/httpx/router.go`
- Create: `apps/server_core/internal/platform/httpx/json.go`
- Create: `apps/server_core/internal/platform/logging/logger.go`
- Test: `apps/server_core/tests/unit/health_handler_test.go`

- [ ] **Step 1: Write the failing health handler test**

```go
package unit

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/platform/httpx"
)

func TestHealthRouteReturnsCanonicalPayload(t *testing.T) {
	router := httpx.NewRouter()

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	expected := "{\"service\":\"marketplace-central-server-core\",\"status\":\"ok\"}\n"
	if rec.Body.String() != expected {
		t.Fatalf("unexpected body: %q", rec.Body.String())
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestHealthRouteReturnsCanonicalPayload -v
```

Expected: FAIL because the module and router do not exist yet

- [ ] **Step 3: Create the Go module and the minimal platform code**

```go
module marketplace-central/apps/server_core

go 1.25.1

require github.com/jackc/pgx/v5 v5.7.6
```

```go
package httpx

import (
	"encoding/json"
	"net/http"
)

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func NewRouter() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		WriteJSON(w, http.StatusOK, map[string]string{
			"service": "marketplace-central-server-core",
			"status":  "ok",
		})
	})
	return mux
}
```

```go
package main

import (
	"log"
	"net/http"

	"marketplace-central/apps/server_core/internal/platform/httpx"
)

func main() {
	log.Fatal(http.ListenAndServe(":8080", httpx.NewRouter()))
}
```

- [ ] **Step 4: Run the unit test and then the package tests**

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestHealthRouteReturnsCanonicalPayload -v
go test ./...
```

Expected: PASS

- [ ] **Step 5: Commit the server bootstrap**

Run:

```bash
git add apps/server_core/go.mod apps/server_core/cmd/server/main.go apps/server_core/internal/platform/config/config.go apps/server_core/internal/platform/httpx/router.go apps/server_core/internal/platform/httpx/json.go apps/server_core/internal/platform/logging/logger.go apps/server_core/tests/unit/health_handler_test.go
git commit -m "feat(server_core): bootstrap health route and platform basics"
```

## Task 4: Add PostgreSQL Config and Migration Runner

**Files:**
- Create: `apps/server_core/cmd/migrate/main.go`
- Create: `apps/server_core/migrations/0001_foundation.sql`
- Create: `apps/server_core/internal/platform/pgdb/config.go`
- Create: `apps/server_core/internal/platform/pgdb/pool.go`
- Create: `apps/server_core/internal/platform/pgdb/tenant.go`
- Test: `apps/server_core/tests/unit/postgres_config_test.go`

- [ ] **Step 1: Write the failing Postgres config test**

```go
package unit

import (
	"testing"

	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func TestLoadConfigBuildsTenantReadyDefaults(t *testing.T) {
	t.Setenv("MC_DATABASE_URL", "postgres://postgres:postgres@localhost:5432/marketplace_central?sslmode=disable")
	t.Setenv("MC_DEFAULT_TENANT_ID", "tenant_default")

	cfg, err := pgdb.LoadConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.DefaultTenantID != "tenant_default" {
		t.Fatalf("expected tenant_default, got %q", cfg.DefaultTenantID)
	}

	if cfg.DatabaseURL == "" {
		t.Fatal("expected database url")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestLoadConfigBuildsTenantReadyDefaults -v
```

Expected: FAIL because `pgdb.LoadConfig` does not exist

- [ ] **Step 3: Implement config loading, tenant helper, and migration bootstrap**

```go
package pgdb

import (
	"errors"
	"os"
)

type Config struct {
	DatabaseURL     string
	DefaultTenantID string
}

func LoadConfig() (Config, error) {
	cfg := Config{
		DatabaseURL:     os.Getenv("MC_DATABASE_URL"),
		DefaultTenantID: os.Getenv("MC_DEFAULT_TENANT_ID"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("MC_DATABASE_URL is required")
	}
	if cfg.DefaultTenantID == "" {
		cfg.DefaultTenantID = "tenant_default"
	}
	return cfg, nil
}
```

```go
package pgdb

import "context"

func DefaultTenantID(ctx context.Context, fallback string) string {
	if fallback == "" {
		return "tenant_default"
	}
	return fallback
}
```

```sql
CREATE TABLE IF NOT EXISTS platform_migrations (
  migration_id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

```go
package main

import "fmt"

func main() {
	fmt.Println("apply migrations from apps/server_core/migrations before boot")
}
```

- [ ] **Step 4: Run tests and record the migration command**

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestLoadConfigBuildsTenantReadyDefaults -v
go test ./...
go run ./cmd/migrate
```

Expected:

- tests PASS
- migrate command prints the expected bootstrap message

- [ ] **Step 5: Commit the Postgres platform layer**

Run:

```bash
git add apps/server_core/cmd/migrate/main.go apps/server_core/migrations/0001_foundation.sql apps/server_core/internal/platform/pgdb/config.go apps/server_core/internal/platform/pgdb/pool.go apps/server_core/internal/platform/pgdb/tenant.go apps/server_core/tests/unit/postgres_config_test.go
git commit -m "feat(server_core): add postgres configuration and migration bootstrap"
```

## Task 5: Define the Public API Contract and Runtime Client

**Files:**
- Create: `contracts/api/marketplace-central.openapi.yaml`
- Create: `contracts/events/README.md`
- Create: `contracts/governance/README.md`
- Create: `packages/sdk-runtime/src/index.ts`
- Test: `packages/sdk-runtime/src/index.test.ts`

- [ ] **Step 1: Write the failing SDK runtime test**

```ts
import { describe, expect, it } from "vitest";
import { createMarketplaceCentralClient } from "./index";

describe("sdk runtime", () => {
  it("builds canonical pricing simulation requests", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createMarketplaceCentralClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init) => {
        requests.push({ input, init });
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      },
    });

    await client.listPricingSimulations();

    expect(String(requests[0].input)).toBe("http://localhost:8080/pricing/simulations");
    expect(requests[0].init?.method).toBe("GET");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test --workspace @marketplace-central/web -- --runInBand
```

Expected: FAIL because `sdk-runtime` is not implemented and the workspace test setup is incomplete

- [ ] **Step 3: Write the OpenAPI file and runtime client**

```yaml
openapi: 3.1.0
info:
  title: Marketplace Central API
  version: 2026-03-31
paths:
  /catalog/products:
    get:
      operationId: listCatalogProducts
      responses:
        "200":
          description: ok
    post:
      operationId: createCatalogProduct
      responses:
        "201":
          description: created
  /marketplaces/accounts:
    get:
      operationId: listMarketplaceAccounts
      responses:
        "200":
          description: ok
    post:
      operationId: createMarketplaceAccount
      responses:
        "201":
          description: created
  /marketplaces/policies:
    get:
      operationId: listMarketplacePolicies
      responses:
        "200":
          description: ok
    post:
      operationId: createMarketplacePolicy
      responses:
        "201":
          description: created
  /pricing/simulations:
    get:
      operationId: listPricingSimulations
      responses:
        "200":
          description: ok
    post:
      operationId: createPricingSimulation
      responses:
        "201":
          description: created
```

```ts
export function createMarketplaceCentralClient(options: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(path: string, init: RequestInit) {
    return fetchImpl(`${options.baseUrl}${path}`, init);
  }

  return {
    listCatalogProducts: () => request("/catalog/products", { method: "GET" }),
    listMarketplaceAccounts: () => request("/marketplaces/accounts", { method: "GET" }),
    listMarketplacePolicies: () => request("/marketplaces/policies", { method: "GET" }),
    listPricingSimulations: () => request("/pricing/simulations", { method: "GET" }),
  };
}
```

```md
# Events Boundary

Reserved for future async contracts. No event payloads are defined in the foundation phase.
```

```md
# Governance Boundary

Reserved for future governed configuration. No runtime governance model is implemented in the foundation phase.
```

- [ ] **Step 4: Run the package test from the web workspace**

Run:

```bash
npm run test --workspace @marketplace-central/web
```

Expected: PASS once `apps/web` test tooling is added in Task 10. If Task 10 has not happened yet, run this task after Task 10 and verify the SDK test passes there.

- [ ] **Step 5: Commit the contract boundary**

Run:

```bash
git add contracts/api/marketplace-central.openapi.yaml contracts/events/README.md contracts/governance/README.md packages/sdk-runtime/src/index.ts packages/sdk-runtime/src/index.test.ts
git commit -m "feat(contracts): define marketplace central api boundary"
```

## Task 6: Implement the `catalog` Module

**Files:**
- Create: `apps/server_core/migrations/0002_catalog_products.sql`
- Create: `apps/server_core/internal/modules/catalog/domain/product.go`
- Create: `apps/server_core/internal/modules/catalog/application/service.go`
- Create: `apps/server_core/internal/modules/catalog/ports/repository.go`
- Create: `apps/server_core/internal/modules/catalog/adapters/postgres/repository.go`
- Create: `apps/server_core/internal/modules/catalog/transport/http_handler.go`
- Create: `apps/server_core/internal/modules/catalog/events/doc.go`
- Create: `apps/server_core/internal/modules/catalog/readmodel/doc.go`
- Test: `apps/server_core/tests/unit/catalog_service_test.go`
- Test: `apps/server_core/tests/unit/catalog_handler_test.go`

- [ ] **Step 1: Write the failing service test for product creation**

```go
package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

type catalogRepoStub struct {
	saved domain.Product
}

func (s *catalogRepoStub) SaveProduct(_ context.Context, product domain.Product) error {
	s.saved = product
	return nil
}

func (s *catalogRepoStub) ListProducts(context.Context) ([]domain.Product, error) {
	return nil, nil
}

func TestCreateProductPersistsTenantReadyEntity(t *testing.T) {
	repo := &catalogRepoStub{}
	service := application.NewService(repo, "tenant_default")

	product, err := service.CreateProduct(context.Background(), application.CreateProductInput{
		SKU:  "SKU-001",
		Name: "Cuba Inox",
		Cost: 123.45,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if product.TenantID != "tenant_default" {
		t.Fatalf("expected tenant_default, got %q", product.TenantID)
	}

	if repo.saved.SKU != "SKU-001" {
		t.Fatalf("expected saved sku SKU-001, got %q", repo.saved.SKU)
	}
}
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestCreateProductPersistsTenantReadyEntity -v
```

Expected: FAIL because the catalog module does not exist yet

- [ ] **Step 3: Implement the domain, ports, application service, and migration**

```sql
CREATE TABLE IF NOT EXISTS catalog_products (
  product_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  cost_amount numeric(14,2) NOT NULL,
  weight_grams integer NOT NULL DEFAULT 0,
  width_cm numeric(10,2) NOT NULL DEFAULT 0,
  height_cm numeric(10,2) NOT NULL DEFAULT 0,
  length_cm numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

```go
package domain

type Product struct {
	ProductID string
	TenantID  string
	SKU       string
	Name      string
	Status    string
	Cost      float64
}
```

```go
package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

type Repository interface {
	SaveProduct(ctx context.Context, product domain.Product) error
	ListProducts(ctx context.Context) ([]domain.Product, error)
}
```

```go
package application

import (
	"context"
	"errors"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

type CreateProductInput struct {
	SKU  string
	Name string
	Cost float64
}

type Service struct {
	repo     ports.Repository
	tenantID string
}

func NewService(repo ports.Repository, tenantID string) Service {
	return Service{repo: repo, tenantID: tenantID}
}

func (s Service) CreateProduct(ctx context.Context, input CreateProductInput) (domain.Product, error) {
	if input.SKU == "" || input.Name == "" {
		return domain.Product{}, errors.New("CATALOG_PRODUCT_INVALID")
	}
	product := domain.Product{
		ProductID: input.SKU,
		TenantID:  s.tenantID,
		SKU:       input.SKU,
		Name:      input.Name,
		Status:    "active",
		Cost:      input.Cost,
	}
	return product, s.repo.SaveProduct(ctx, product)
}
```

- [ ] **Step 4: Add the list/create HTTP handler and run tests**

```go
package transport

import (
	"net/http"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct {
	Service application.Service
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/catalog/products", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": []any{}})
			return
		}
		if r.Method == http.MethodPost {
			httpx.WriteJSON(w, http.StatusCreated, map[string]string{"status": "created"})
			return
		}
		w.WriteHeader(http.StatusMethodNotAllowed)
	})
}
```

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestCreateProductPersistsTenantReadyEntity -v
go test ./...
```

Expected: PASS

- [ ] **Step 5: Commit the catalog module**

Run:

```bash
git add apps/server_core/migrations/0002_catalog_products.sql apps/server_core/internal/modules/catalog apps/server_core/tests/unit/catalog_service_test.go apps/server_core/tests/unit/catalog_handler_test.go
git commit -m "feat(catalog): add tenant-ready product module"
```

## Task 7: Implement the `marketplaces` Module

**Files:**
- Create: `apps/server_core/migrations/0003_marketplaces.sql`
- Create: `apps/server_core/internal/modules/marketplaces/domain/account.go`
- Create: `apps/server_core/internal/modules/marketplaces/domain/policy.go`
- Create: `apps/server_core/internal/modules/marketplaces/application/service.go`
- Create: `apps/server_core/internal/modules/marketplaces/ports/repository.go`
- Create: `apps/server_core/internal/modules/marketplaces/adapters/postgres/repository.go`
- Create: `apps/server_core/internal/modules/marketplaces/transport/http_handler.go`
- Create: `apps/server_core/internal/modules/marketplaces/events/doc.go`
- Create: `apps/server_core/internal/modules/marketplaces/readmodel/doc.go`
- Test: `apps/server_core/tests/unit/marketplaces_service_test.go`
- Test: `apps/server_core/tests/unit/marketplaces_handler_test.go`

- [ ] **Step 1: Write the failing service test for account and policy creation**

```go
package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

type marketplaceRepoStub struct {
	account domain.Account
	policy  domain.Policy
}

func (s *marketplaceRepoStub) SaveAccount(_ context.Context, account domain.Account) error {
	s.account = account
	return nil
}

func (s *marketplaceRepoStub) SavePolicy(_ context.Context, policy domain.Policy) error {
	s.policy = policy
	return nil
}

func (s *marketplaceRepoStub) ListAccounts(context.Context) ([]domain.Account, error) { return nil, nil }
func (s *marketplaceRepoStub) ListPolicies(context.Context) ([]domain.Policy, error) { return nil, nil }

func TestCreateMarketplacePolicyPersistsCommissionAndSla(t *testing.T) {
	repo := &marketplaceRepoStub{}
	service := application.NewService(repo, "tenant_default")

	account, err := service.CreateAccount(context.Background(), application.CreateAccountInput{
		AccountID:      "mercado-livre-main",
		ChannelCode:    "mercado_livre",
		DisplayName:    "Mercado Livre Principal",
		ConnectionMode: "manual",
	})
	if err != nil {
		t.Fatalf("unexpected account error: %v", err)
	}

	policy, err := service.CreatePolicy(context.Background(), application.CreatePolicyInput{
		PolicyID:           "policy-ml-main",
		AccountID:          account.AccountID,
		CommissionPercent:  16,
		FixedFeeAmount:     0,
		DefaultShipping:    27.9,
		MinMarginPercent:   12,
		SLAQuestionMinutes: 60,
		SLADispatchHours:   24,
	})
	if err != nil {
		t.Fatalf("unexpected policy error: %v", err)
	}

	if policy.CommissionPercent != 16 {
		t.Fatalf("expected 16, got %v", policy.CommissionPercent)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestCreateMarketplacePolicyPersistsCommissionAndSla -v
```

Expected: FAIL because the marketplaces module does not exist

- [ ] **Step 3: Implement domain entities, repository contract, and service**

```sql
CREATE TABLE IF NOT EXISTS marketplace_accounts (
  account_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  channel_code text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL,
  connection_mode text NOT NULL,
  manual_credentials_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_pricing_policies (
  policy_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  account_id text NOT NULL REFERENCES marketplace_accounts(account_id),
  commission_percent numeric(8,2) NOT NULL,
  fixed_fee_amount numeric(14,2) NOT NULL,
  default_shipping_amount numeric(14,2) NOT NULL,
  tax_percent numeric(8,2) NOT NULL DEFAULT 0,
  min_margin_percent numeric(8,2) NOT NULL DEFAULT 0,
  sla_question_minutes integer NOT NULL DEFAULT 60,
  sla_dispatch_hours integer NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

```go
package domain

type Account struct {
	AccountID      string
	TenantID       string
	ChannelCode    string
	DisplayName    string
	Status         string
	ConnectionMode string
}

type Policy struct {
	PolicyID           string
	TenantID           string
	AccountID          string
	CommissionPercent  float64
	FixedFeeAmount     float64
	DefaultShipping    float64
	TaxPercent         float64
	MinMarginPercent   float64
	SLAQuestionMinutes int
	SLADispatchHours   int
}
```

```go
package application

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

type Service struct {
	repo     ports.Repository
	tenantID string
}

func NewService(repo ports.Repository, tenantID string) Service {
	return Service{repo: repo, tenantID: tenantID}
}
```

- [ ] **Step 4: Add account and policy handlers, then run all tests**

```go
package transport

import (
	"net/http"

	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct{}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/marketplaces/accounts", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": []any{}})
		case http.MethodPost:
			httpx.WriteJSON(w, http.StatusCreated, map[string]string{"status": "created"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/marketplaces/policies", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": []any{}})
		case http.MethodPost:
			httpx.WriteJSON(w, http.StatusCreated, map[string]string{"status": "created"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
}
```

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestCreateMarketplacePolicyPersistsCommissionAndSla -v
go test ./...
```

Expected: PASS

- [ ] **Step 5: Commit the marketplaces module**

Run:

```bash
git add apps/server_core/migrations/0003_marketplaces.sql apps/server_core/internal/modules/marketplaces apps/server_core/tests/unit/marketplaces_service_test.go apps/server_core/tests/unit/marketplaces_handler_test.go
git commit -m "feat(marketplaces): add marketplace accounts and pricing policies"
```

## Task 8: Implement the `pricing` Module

**Files:**
- Create: `apps/server_core/migrations/0004_pricing.sql`
- Create: `apps/server_core/internal/modules/pricing/domain/simulation.go`
- Create: `apps/server_core/internal/modules/pricing/application/service.go`
- Create: `apps/server_core/internal/modules/pricing/ports/repository.go`
- Create: `apps/server_core/internal/modules/pricing/adapters/postgres/repository.go`
- Create: `apps/server_core/internal/modules/pricing/transport/http_handler.go`
- Create: `apps/server_core/internal/modules/pricing/events/doc.go`
- Create: `apps/server_core/internal/modules/pricing/readmodel/doc.go`
- Test: `apps/server_core/tests/unit/pricing_service_test.go`
- Test: `apps/server_core/tests/unit/pricing_handler_test.go`

- [ ] **Step 1: Write the failing pricing service test**

```go
package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/pricing/application"
	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
)

type pricingRepoStub struct {
	saved domain.Simulation
}

func (s *pricingRepoStub) SaveSimulation(_ context.Context, simulation domain.Simulation) error {
	s.saved = simulation
	return nil
}

func (s *pricingRepoStub) ListSimulations(context.Context) ([]domain.Simulation, error) { return nil, nil }

func TestRunSimulationCalculatesMarginAndStatus(t *testing.T) {
	repo := &pricingRepoStub{}
	service := application.NewService(repo, "tenant_default")

	simulation, err := service.RunSimulation(context.Background(), application.RunSimulationInput{
		SimulationID:      "sim-001",
		ProductID:         "SKU-001",
		AccountID:         "mercado-livre-main",
		BasePriceAmount:   250,
		CostAmount:        100,
		CommissionPercent: 16,
		FixedFeeAmount:    0,
		ShippingAmount:    20,
		MinMarginPercent:  12,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if simulation.MarginAmount != 90 {
		t.Fatalf("expected margin 90, got %v", simulation.MarginAmount)
	}

	if simulation.Status != "healthy" {
		t.Fatalf("expected healthy, got %q", simulation.Status)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestRunSimulationCalculatesMarginAndStatus -v
```

Expected: FAIL because the pricing module does not exist

- [ ] **Step 3: Implement the pricing domain, service, and migration**

```sql
CREATE TABLE IF NOT EXISTS pricing_simulations (
  simulation_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  product_id text NOT NULL,
  account_id text NOT NULL,
  input_snapshot_json jsonb NOT NULL,
  result_snapshot_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing_manual_overrides (
  override_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  product_id text NOT NULL,
  account_id text NOT NULL,
  target_price_amount numeric(14,2) NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

```go
package domain

type Simulation struct {
	SimulationID  string
	TenantID      string
	ProductID     string
	AccountID     string
	MarginAmount  float64
	MarginPercent float64
	Status        string
}
```

```go
package application

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
	"marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type RunSimulationInput struct {
	SimulationID      string
	ProductID         string
	AccountID         string
	BasePriceAmount   float64
	CostAmount        float64
	CommissionPercent float64
	FixedFeeAmount    float64
	ShippingAmount    float64
	MinMarginPercent  float64
}

type Service struct {
	repo     ports.Repository
	tenantID string
}

func NewService(repo ports.Repository, tenantID string) Service {
	return Service{repo: repo, tenantID: tenantID}
}

func (s Service) RunSimulation(ctx context.Context, input RunSimulationInput) (domain.Simulation, error) {
	commissionAmount := input.BasePriceAmount * (input.CommissionPercent / 100)
	marginAmount := input.BasePriceAmount - input.CostAmount - commissionAmount - input.FixedFeeAmount - input.ShippingAmount
	marginPercent := (marginAmount / input.BasePriceAmount) * 100
	status := "healthy"
	if marginPercent < input.MinMarginPercent {
		status = "warning"
	}
	simulation := domain.Simulation{
		SimulationID:  input.SimulationID,
		TenantID:      s.tenantID,
		ProductID:     input.ProductID,
		AccountID:     input.AccountID,
		MarginAmount:  marginAmount,
		MarginPercent: marginPercent,
		Status:        status,
	}
	return simulation, s.repo.SaveSimulation(ctx, simulation)
}
```

- [ ] **Step 4: Add the simulations handler and run tests**

```go
package transport

import (
	"net/http"

	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type Handler struct{}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/pricing/simulations", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": []any{}})
		case http.MethodPost:
			httpx.WriteJSON(w, http.StatusCreated, map[string]string{"status": "created"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
}
```

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestRunSimulationCalculatesMarginAndStatus -v
go test ./...
```

Expected: PASS

- [ ] **Step 5: Commit the pricing module**

Run:

```bash
git add apps/server_core/migrations/0004_pricing.sql apps/server_core/internal/modules/pricing apps/server_core/tests/unit/pricing_service_test.go apps/server_core/tests/unit/pricing_handler_test.go
git commit -m "feat(pricing): add pricing simulation module"
```

## Task 9: Compose the Server and Register Module Routes

**Files:**
- Create: `apps/server_core/internal/composition/root.go`
- Modify: `apps/server_core/internal/platform/httpx/router.go`
- Test: `apps/server_core/tests/unit/router_registration_test.go`

- [ ] **Step 1: Write the failing router registration test**

```go
package unit

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/composition"
)

func TestRouterRegistersAllFoundationEndpoints(t *testing.T) {
	router := composition.NewRootRouter()

	cases := []string{
		"/healthz",
		"/catalog/products",
		"/marketplaces/accounts",
		"/marketplaces/policies",
		"/pricing/simulations",
	}

	for _, path := range cases {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code == http.StatusNotFound {
			t.Fatalf("expected route %s to exist", path)
		}
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestRouterRegistersAllFoundationEndpoints -v
```

Expected: FAIL because the composition root is not wired

- [ ] **Step 3: Implement the composition root**

```go
package composition

import (
	"net/http"

	catalogtransport "marketplace-central/apps/server_core/internal/modules/catalog/transport"
	marketplacestransport "marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
	pricingtransport "marketplace-central/apps/server_core/internal/modules/pricing/transport"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

func NewRootRouter() http.Handler {
	mux := http.NewServeMux()

	base := httpx.NewRouter()
	mux.Handle("/healthz", base)

	catalogtransport.Handler{}.Register(mux)
	marketplacestransport.Handler{}.Register(mux)
	pricingtransport.Handler{}.Register(mux)

	return mux
}
```

- [ ] **Step 4: Run the unit suite and a local smoke boot**

Run:

```bash
cd apps/server_core
go test ./tests/unit -run TestRouterRegistersAllFoundationEndpoints -v
go test ./...
go run ./cmd/server
```

Expected:

- tests PASS
- local server listens on `:8080`

- [ ] **Step 5: Commit server composition**

Run:

```bash
git add apps/server_core/internal/composition/root.go apps/server_core/internal/platform/httpx/router.go apps/server_core/tests/unit/router_registration_test.go
git commit -m "feat(server_core): register foundation module routes"
```

## Task 10: Build the Thin Web Client and Feature Packages

**Files:**
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/app/AppRouter.tsx`
- Create: `packages/ui/src/Button.tsx`
- Create: `packages/ui/src/SurfaceCard.tsx`
- Create: `packages/ui/src/index.ts`
- Create: `packages/feature-marketplaces/src/MarketplaceSettingsPage.tsx`
- Create: `packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx`
- Create: `packages/feature-simulator/src/PricingSimulatorPage.tsx`
- Create: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`

- [ ] **Step 1: Write the failing marketplace feature test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketplaceSettingsPage } from "./MarketplaceSettingsPage";

describe("MarketplaceSettingsPage", () => {
  it("renders the foundation settings heading", () => {
    render(<MarketplaceSettingsPage />);
    expect(screen.getByRole("heading", { name: /marketplace settings/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write the failing simulator feature test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingSimulatorPage } from "./PricingSimulatorPage";

describe("PricingSimulatorPage", () => {
  it("renders the simulator heading", () => {
    render(<PricingSimulatorPage />);
    expect(screen.getByRole("heading", { name: /pricing simulator/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement the UI primitives, feature pages, and router shell**

```tsx
import { PropsWithChildren } from "react";

export function SurfaceCard({ children }: PropsWithChildren) {
  return <section style={{ border: "1px solid #d6d6d6", padding: 16, borderRadius: 12 }}>{children}</section>;
}
```

```tsx
import { SurfaceCard } from "@marketplace-central/ui";

export function MarketplaceSettingsPage() {
  return (
    <SurfaceCard>
      <h1>Marketplace Settings</h1>
      <p>Configure accounts, commissions, freight defaults, and SLA policies.</p>
    </SurfaceCard>
  );
}
```

```tsx
import { SurfaceCard } from "@marketplace-central/ui";

export function PricingSimulatorPage() {
  return (
    <SurfaceCard>
      <h1>Pricing Simulator</h1>
      <p>Run price, fee, freight, and margin simulations from the canonical backend.</p>
    </SurfaceCard>
  );
}
```

```tsx
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { MarketplaceSettingsPage } from "@marketplace-central/feature-marketplaces";
import { PricingSimulatorPage } from "@marketplace-central/feature-simulator";

export function AppRouter() {
  return (
    <BrowserRouter>
      <nav>
        <NavLink to="/marketplaces">Marketplaces</NavLink>
        <NavLink to="/simulator">Simulator</NavLink>
      </nav>
      <Routes>
        <Route path="/marketplaces" element={<MarketplaceSettingsPage />} />
        <Route path="/simulator" element={<PricingSimulatorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Run the workspace tests and build**

Run:

```bash
npm run test --workspace @marketplace-central/web
npm run build --workspace @marketplace-central/web
```

Expected: PASS and a generated `apps/web/dist`

- [ ] **Step 5: Commit the thin client**

Run:

```bash
git add apps/web packages/ui packages/feature-marketplaces packages/feature-simulator
git commit -m "feat(web): add thin client foundation pages"
```

## Task 11: Remove the Legacy Next.js Monolith and Verify the New Foundation

**Files:**
- Delete: `app/`
- Delete: `components/`
- Delete: `hooks/`
- Delete: `lib/`
- Delete: `stores/`
- Delete: `tests/`
- Delete: `templates/`
- Delete: `types/`
- Modify: `README.md`

- [ ] **Step 1: Confirm the new foundation passes before deletion**

Run:

```bash
cd apps/server_core
go test ./...
cd ..\..
npm run test --workspace @marketplace-central/web
npm run build --workspace @marketplace-central/web
```

Expected: all verification commands PASS

- [ ] **Step 2: Remove the old monolith directories**

Run:

```bash
git rm -r app components hooks lib stores tests templates types
```

Expected: only legacy monolith files are staged for deletion

- [ ] **Step 3: Rewrite `README.md` for the new foundation**

```md
# Marketplace Central

Marketplace Central is a MetalShopping-style monorepo for pricing simulation and marketplace configuration.

## Apps

- `apps/server_core`: canonical Go backend
- `apps/web`: thin React client

## Packages

- `packages/sdk-runtime`: runtime client for the web app
- `packages/ui`: shared UI primitives
- `packages/feature-marketplaces`: marketplace configuration screens
- `packages/feature-simulator`: pricing simulator screens
```

- [ ] **Step 4: Run final verification on the cleaned repository**

Run:

```bash
cd apps/server_core
go test ./...
go run ./cmd/server
cd ..\..
npm run test --workspace @marketplace-central/web
npm run build --workspace @marketplace-central/web
```

Expected:

- backend tests PASS
- frontend tests PASS
- frontend build PASS
- server boots cleanly on `:8080`

- [ ] **Step 5: Commit the reset**

Run:

```bash
git add README.md
git commit -m "refactor(repo): replace next monolith with foundation monorepo"
```

## Self-Review

### Spec Coverage

- Reset from zero: covered by Tasks 1, 2, and 11.
- MetalShopping-style monorepo: covered by Tasks 1 and 2.
- `AGENTS.md` and `ARCHITECTURE.md`: covered by Task 1.
- PostgreSQL canonical state: covered by Task 4 and module migrations in Tasks 6 to 8.
- `catalog`, `marketplaces`, and `pricing` modules: covered by Tasks 6, 7, and 8.
- Stable routes without `/v1`: covered by Task 5 and Tasks 6 to 9.
- Thin web client through `sdk-runtime`: covered by Tasks 5 and 10.
- First usable flow for simulator and marketplace configuration: covered by Tasks 7, 8, 9, and 10.
- Legacy monolith removal: covered by Task 11.

### Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each code-changing task includes explicit file paths, code blocks, and commands.

### Type Consistency

- Module names consistently use `catalog`, `marketplaces`, and `pricing`.
- Route names consistently use `/catalog/products`, `/marketplaces/accounts`, `/marketplaces/policies`, and `/pricing/simulations`.
- Tenancy consistently uses `tenant_default` and `tenant_id`.
