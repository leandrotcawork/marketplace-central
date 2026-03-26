# Marketplace Fixes — V1 Code Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 issues found in the V1 Marketplace Integration code review: a publish-route bug that uses hardcoded seed data, duplicate commission fields on `MarketplaceChannel`, an insecure crypto key fallback, a logic error in base-rule editing, and stale dead code.

**Architecture:** All 5 fixes are independent. Tasks 1, 3, and 4 touch separate files with no overlap — dispatch in **parallel** via Codex. Task 2 + Task 5 both modify `types/index.ts` and supporting files — run **sequentially** as Batch B after Batch A merges.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zustand v5, Node.js crypto (built-in)

---

## Execution Strategy

```
Batch A — Parallel (dispatch 3 Codex agents simultaneously):
  ├── Task 1  app/api/marketplace-publish/route.ts   (bug fix)
  ├── Task 3  lib/marketplace-crypto.ts              (security)
  └── Task 4  stores/marketplaceStore.ts             (logic)

[Review Batch A — Claude validates all 3 outputs]

Batch B — Sequential (one Codex agent):
  └── Task 2+5  types/index.ts + seed + components   (type cleanup + dead code)

[Review Batch B — Claude validates output]
```

---

## File Map

| Task | File | Change |
|------|------|--------|
| 1 | `app/api/marketplace-publish/route.ts` | Add `executionMode` + `publishCapability` to `PublishItem`; remove seed lookup from `derivePublishStatus` |
| 2 | `types/index.ts` | Remove `commission`, `fixedFee`, `freightFixed` from `MarketplaceChannel` |
| 2 | `lib/marketplace-seed.ts` | Remove top-level commission fields from all 6 channel objects |
| 2 | `stores/marketplaceStore.ts` | Remove `syncMarketplaceCommercialFields` sync; read only from `commercialProfile` |
| 2 | `components/marketplaces/MarketplaceCard.tsx` | Replace `marketplace.commission` → `marketplace.commercialProfile.commissionPercent` etc. |
| 2 | `components/marketplaces/MarketplaceCommercialMatrix.tsx` | Same field access update |
| 3 | `lib/marketplace-crypto.ts` | Throw in production if `MARKETPLACE_SECRET_KEY` is not set |
| 4 | `stores/marketplaceStore.ts` | `updateCommissionRule`: auto-promote `base` → `group_override` on numeric edits |
| 5 | `types/index.ts` | Remove `SidebarStatus` interface (lines 228–236); keep `StatusValue` |

---

## BATCH A — Dispatch in parallel

---

### Task 1: Fix publish endpoint — use request-time state, not seed data

**Problem:** `derivePublishStatus` calls `getMarketplaceSeedById(channelId)` to read `executionMode` and `capabilities.publish`. This means UI changes to those fields (e.g., promoting a channel from `planned` → `live`) are silently ignored — the API always uses the hardcoded seed.

**Fix:** Add `executionMode` and `publishCapability` to the `PublishItem` payload so the caller sends the current state. Remove the seed lookup entirely.

**File:** `app/api/marketplace-publish/route.ts`

- [ ] **Step 1: Extend `PublishItem` with the two new fields**

```typescript
type PublishItem = {
  publicationId: string
  productId: string
  productName: string
  sku: string
  stock: number
  channelId: string
  price: number
  productGroupId?: string
  commissionPercent: number
  fixedFeeAmount: number
  freightFixedAmount: number
  ruleType: MarketplaceRuleType
  reviewStatus: MarketplaceReviewStatus
  sourceType: MarketplaceRuleSourceType
  // NEW — caller sends current configured state, not hardcoded seed
  executionMode: MarketplaceExecutionMode
  publishCapability: MarketplaceCapabilityStatus
}
```

Also add the imports at the top:

```typescript
import type {
  MarketplaceCapabilityStatus,
  MarketplaceExecutionMode,
  MarketplaceRuleSourceType,
  MarketplaceReviewStatus,
  MarketplaceRuleType,
  MarketplaceSyncStatus,
} from '@/types'
```

- [ ] **Step 2: Rewrite `derivePublishStatus` to use passed-in values**

Remove the `getMarketplaceSeedById` import and the function body that uses it. Replace with:

```typescript
function derivePublishStatus(
  item: Pick<PublishItem, 'channelId' | 'executionMode' | 'publishCapability'>,
  hasConnectedAccount: boolean
): {
  status: MarketplaceSyncStatus
  errorMessage?: string
} {
  if (item.executionMode === 'blocked') {
    return {
      status: 'failed',
      errorMessage: 'Canal bloqueado até validação de documentação e regras.',
    }
  }

  if (item.executionMode === 'planned') {
    return {
      status: 'queued',
      errorMessage: 'Canal previsto para segunda onda; job criado para acompanhamento.',
    }
  }

  if (!hasConnectedAccount) {
    return {
      status: 'failed',
      errorMessage: 'Canal sem conexão ativa no servidor.',
    }
  }

  if (item.publishCapability === 'blocked') {
    return {
      status: 'failed',
      errorMessage: 'Canal conectado, mas sem capability de publicação liberada.',
    }
  }

  if (item.publishCapability === 'partial') {
    return {
      status: 'partial',
      errorMessage: 'Canal publicou parcialmente; revisar o job e a listagem remota.',
    }
  }

  return { status: 'published' }
}
```

- [ ] **Step 3: Update the call site inside the `for` loop**

Replace:
```typescript
const lifecycle = derivePublishStatus(
  item.channelId,
  connection?.status === 'connected'
)
```
With:
```typescript
const lifecycle = derivePublishStatus(item, connection?.status === 'connected')
```

- [ ] **Step 4: Remove the now-unused import**

Delete the line:
```typescript
import { getMarketplaceSeedById } from '@/lib/marketplace-seed'
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
cd c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors in `marketplace-publish/route.ts`.

---

### Task 3: Enforce MARKETPLACE_SECRET_KEY in production

**Problem:** `getSecretKeyMaterial()` falls back to `PGPASSWORD`, then `MS_DATABASE_URL`, then a hardcoded dev string. In production any of these could silently become the encryption key, making it impossible to rotate secrets safely.

**Fix:** In `NODE_ENV === 'production'`, throw immediately if `MARKETPLACE_SECRET_KEY` is absent. In dev/test, keep the fallback but log a warning.

**File:** `lib/marketplace-crypto.ts`

- [ ] **Step 1: Replace `getSecretKeyMaterial`**

```typescript
function getSecretKeyMaterial(): string {
  const explicit = process.env.MARKETPLACE_SECRET_KEY
  if (explicit) return explicit

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'MARKETPLACE_SECRET_KEY is required in production. ' +
        'Set it to a random 32-byte hex string.'
    )
  }

  // Dev/test only — warn loudly so this is never missed
  console.warn(
    '[marketplace-crypto] MARKETPLACE_SECRET_KEY not set. ' +
      'Using insecure dev fallback — do NOT use in production.'
  )
  return 'marketplace-central-dev-key'
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors in `marketplace-crypto.ts`.

---

### Task 4: Fix `updateCommissionRule` — auto-promote base rules on numeric edits

**Problem:** When a user edits commission numbers on a rule with `ruleType: 'base'`, `updateCommissionRule` overwrites their changes with the values from `marketplace.commercialProfile`. The edit is silently discarded. The intent (editing numbers) implies wanting a group-level override.

**Fix:** If the partial contains any of `commissionPercent`, `fixedFeeAmount`, `freightFixedAmount` and the current rule is `base`, auto-promote to `group_override` so the edit is preserved.

**File:** `stores/marketplaceStore.ts`

- [ ] **Step 1: Replace the `updateCommissionRule` action**

Find the existing action (starts at line ~220) and replace its inner logic:

```typescript
updateCommissionRule: (id, partial) =>
  set((state) => ({
    commissionRules: state.commissionRules.map((rule) => {
      if (rule.id !== id) return rule

      const nextRule = { ...rule, ...partial }

      // If the user edited numeric commission fields on a base rule,
      // promote to group_override so the edit is not overwritten.
      const hasNumericEdit =
        'commissionPercent' in partial ||
        'fixedFeeAmount' in partial ||
        'freightFixedAmount' in partial

      if (nextRule.ruleType === 'base' && hasNumericEdit) {
        return { ...nextRule, ruleType: 'group_override' as const }
      }

      // Base rule with no numeric edit: sync commercial fields from marketplace
      if (nextRule.ruleType === 'base') {
        const marketplace = state.marketplaces.find(
          (candidate) => candidate.id === nextRule.channelId
        )
        if (!marketplace) return nextRule

        return {
          ...nextRule,
          commissionPercent: marketplace.commercialProfile.commissionPercent,
          fixedFeeAmount: marketplace.commercialProfile.fixedFeeAmount,
          freightFixedAmount: marketplace.commercialProfile.freightFixedAmount,
          sourceType: marketplace.commercialProfile.sourceType,
          sourceRef: marketplace.commercialProfile.sourceRef,
          evidenceDate: marketplace.commercialProfile.evidenceDate,
          reviewStatus: marketplace.commercialProfile.reviewStatus,
          notes: marketplace.commercialProfile.notes,
        }
      }

      return nextRule
    }),
  })),
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors in `marketplaceStore.ts`.

---

## BATCH B — After Batch A is merged

---

### Task 2 + Task 5: Remove duplicate commission fields + dead SidebarStatus

**Problem A (Task 2):** `MarketplaceChannel` has `commission`, `fixedFee`, `freightFixed` at the top level that duplicate `commercialProfile.commissionPercent`, `commercialProfile.fixedFeeAmount`, `commercialProfile.freightFixedAmount`. The store's `syncMarketplaceCommercialFields` exists solely to keep them in sync. Two sources of truth = divergence bugs.

**Problem B (Task 5):** `SidebarStatus` interface in `types/index.ts` (lines 228–236) is dead code. `Sidebar.tsx` defines its own `SidebarStatusMap` locally and only imports `StatusValue` (the union type at line 226 — keep that).

**Fix A:** Remove the 3 top-level fields from `MarketplaceChannel`, delete `syncMarketplaceCommercialFields`, update the 2 components that read them.

**Fix B:** Delete the `SidebarStatus` interface block from `types/index.ts`.

---

#### Step 1 (Task 5 first — smallest change, clears the dead code): Remove `SidebarStatus` from types

**File:** `types/index.ts`

Delete lines 228–236:
```typescript
export interface SidebarStatus {
  catalogo: StatusValue
  marketplaces: StatusValue
  simulador: StatusValue
  concorrencia: StatusValue
  analiseIa: StatusValue
  dashboard: StatusValue
  publicar: StatusValue
}
```

Keep `StatusValue` at line 226 — it is imported by `Sidebar.tsx`.

- [ ] **Grep to confirm no other file imports `SidebarStatus`**

```bash
grep -r "SidebarStatus" c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central/components c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central/app c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central/stores c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central/lib
```

Expected: zero results.

---

#### Step 2 (Task 2): Remove top-level fields from `MarketplaceChannel`

**File:** `types/index.ts`

Remove the three lines from `MarketplaceChannel`:
```typescript
  commission: number      // DELETE
  fixedFee: number        // DELETE
  freightFixed: number    // DELETE
```

Result — `MarketplaceChannel` becomes:
```typescript
export interface MarketplaceChannel {
  id: string
  name: string
  active: boolean
  rolloutStage: MarketplaceRolloutStage
  executionMode: MarketplaceExecutionMode
  authStrategy: MarketplaceAuthStrategy
  connectionStatus: MarketplaceConnectionStatus
  notes?: string
  capabilities: MarketplaceCapabilityProfile
  commercialProfile: MarketplaceCommercialProfile
}
```

- [ ] **Run tsc to find all broken callsites**

```bash
npx tsc --noEmit 2>&1 | grep "commission\|fixedFee\|freightFixed"
```

Use the compiler output to locate every file that needs updating.

---

#### Step 3: Update `lib/marketplace-seed.ts`

Remove the three redundant fields from every channel object (6 objects). Example diff for `mercado-livre`:

```typescript
// BEFORE
{
  id: 'mercado-livre',
  name: 'Mercado Livre',
  active: true,
  rolloutStage: 'v1',
  executionMode: 'live',
  authStrategy: 'oauth2',
  connectionStatus: 'disconnected',
  commission: 0.16,      // DELETE
  fixedFee: 0,           // DELETE
  freightFixed: 0,       // DELETE
  notes: '...',
  capabilities: { ... },
  commercialProfile: { commissionPercent: 0.16, ... },
}

// AFTER
{
  id: 'mercado-livre',
  name: 'Mercado Livre',
  active: true,
  rolloutStage: 'v1',
  executionMode: 'live',
  authStrategy: 'oauth2',
  connectionStatus: 'disconnected',
  notes: '...',
  capabilities: { ... },
  commercialProfile: { commissionPercent: 0.16, ... },
}
```

Apply the same removal to all 6 channels: `mercado-livre`, `amazon`, `magalu`, `leroy`, `madeira`, `shopee`.

---

#### Step 4: Update `stores/marketplaceStore.ts`

**4a. Delete `syncMarketplaceCommercialFields`** (lines 17–29). This function only existed to copy commercialProfile values into top-level fields.

**4b. Delete the 3 lines inside `updateMarketplace`** that built `nextCommercialProfile` to sync from `partial.commission` etc. Replace the entire `updateMarketplace` action:

```typescript
updateMarketplace: (id, partial) =>
  set((state) => ({
    marketplaces: state.marketplaces.map((marketplace) =>
      marketplace.id === id ? { ...marketplace, ...partial } : marketplace
    ),
  })),
```

**4c. Update `buildCustomMarketplace`** — remove the 3 top-level fields:

```typescript
function buildCustomMarketplace(name: string): Marketplace {
  const id = generateId()
  return {
    id,
    name,
    active: false,
    rolloutStage: 'blocked',
    executionMode: 'blocked',
    authStrategy: 'unknown',
    connectionStatus: 'disconnected',
    notes: 'Canal customizado. Defina capabilities, conexão e regras comerciais antes de usar.',
    capabilities: {
      publish: 'planned',
      priceSync: 'planned',
      stockSync: 'planned',
      orders: 'planned',
      messages: 'planned',
      questions: 'planned',
      freightQuotes: 'planned',
      webhooks: 'planned',
      sandbox: 'planned',
    },
    commercialProfile: {
      commissionPercent: 0,
      fixedFeeAmount: 0,
      freightFixedAmount: 0,
      sourceType: 'manual_assumption',
      sourceRef: 'Canal customizado',
      reviewStatus: 'missing',
      notes: 'Preencha as regras comerciais manualmente.',
    },
  }
}
```

**4d. Update `updateMarketplaceCommercialProfile`** — remove the 3-field sync into `commissionRules`. The action already updates `commercialProfile` correctly; just remove the block that mapped `commissionPercent`/`fixedFeeAmount`/`freightFixedAmount` up to the old top-level fields (those were inside the `commissionRules.map` — that logic is still correct, keep it).

**4e. Update the v1 migration** — remove references to `legacyMarketplace.commission` and `legacyMarketplace.fixedFee`. Use `commercialProfile` values only:

```typescript
const mergedCommercialProfile = {
  ...marketplace.commercialProfile,
  commissionPercent:
    legacyMarketplace.commission ?? marketplace.commercialProfile.commissionPercent,
  fixedFeeAmount:
    legacyMarketplace.fixedFee ?? marketplace.commercialProfile.fixedFeeAmount,
  notes: legacyMarketplace.notes ?? marketplace.commercialProfile.notes,
}

return {
  ...marketplace,
  active: legacyMarketplace.active ?? marketplace.active,
  notes: legacyMarketplace.notes ?? marketplace.notes,
  commercialProfile: mergedCommercialProfile,
}
```

(Remove the `syncMarketplaceCommercialFields(...)` call — use the spread directly as above.)

---

#### Step 5: Update `components/marketplaces/MarketplaceCard.tsx`

Two locations reference top-level fields. Replace:

```typescript
// BEFORE (line 188)
{formatPercent(marketplace.commission * 100, 0)}

// AFTER
{formatPercent(marketplace.commercialProfile.commissionPercent * 100, 0)}
```

```typescript
// BEFORE (lines 191–192)
{marketplace.fixedFee > 0
  ? `${formatBRL(marketplace.fixedFee)} fixo`
  : 'Sem taxa fixa'}

// AFTER
{marketplace.commercialProfile.fixedFeeAmount > 0
  ? `${formatBRL(marketplace.commercialProfile.fixedFeeAmount)} fixo`
  : 'Sem taxa fixa'}
```

```typescript
// BEFORE (lines 196–197)
{marketplace.freightFixed > 0
  ? `${formatBRL(marketplace.freightFixed)} frete`
  : 'Frete por grupo'}

// AFTER
{marketplace.commercialProfile.freightFixedAmount > 0
  ? `${formatBRL(marketplace.commercialProfile.freightFixedAmount)} frete`
  : 'Frete por grupo'}
```

---

#### Step 6: Update `components/marketplaces/MarketplaceCommercialMatrix.tsx`

One location (line 107):

```typescript
// BEFORE
Base {formatPercent(marketplace.commission * 100, 0)} / {formatBRL(marketplace.fixedFee)}

// AFTER
Base {formatPercent(marketplace.commercialProfile.commissionPercent * 100, 0)} / {formatBRL(marketplace.commercialProfile.fixedFeeAmount)}
```

---

#### Step 7: Final compile check

```bash
npx tsc --noEmit 2>&1
```

Expected: **zero errors**. If any remain, they will all reference `commission`, `fixedFee`, or `freightFixed` — search for them and apply the same `.commercialProfile.*` replacement.

- [ ] **Step 8: Commit**

```bash
git add types/index.ts lib/marketplace-seed.ts stores/marketplaceStore.ts \
        components/marketplaces/MarketplaceCard.tsx \
        components/marketplaces/MarketplaceCommercialMatrix.tsx
git commit -m "refactor: remove duplicate top-level commission fields from MarketplaceChannel

All commission data now lives exclusively in commercialProfile.
Removes syncMarketplaceCommercialFields sync helper.
Also removes dead SidebarStatus interface from types."
```

---

## Review Checklist — Batch A (Claude)

After Codex completes Tasks 1, 3, 4, verify:

**Task 1 (Bug):**
- [ ] `PublishItem` has `executionMode: MarketplaceExecutionMode` and `publishCapability: MarketplaceCapabilityStatus`
- [ ] `derivePublishStatus` no longer calls `getMarketplaceSeedById`
- [ ] `@/lib/marketplace-seed` import removed from the route file
- [ ] All branches of the old function are preserved in the new one
- [ ] `MarketplaceExecutionMode` and `MarketplaceCapabilityStatus` are imported from `@/types`

**Task 3 (Security):**
- [ ] In `production`, throws if `MARKETPLACE_SECRET_KEY` is absent
- [ ] In dev/test, logs a warning and continues
- [ ] No fallback to `PGPASSWORD` or `MS_DATABASE_URL`
- [ ] No hardcoded key string remains in the fallback path

**Task 4 (Logic):**
- [ ] When `partial` contains numeric commission fields AND rule is `base`, rule is promoted to `group_override`
- [ ] When `partial` contains only non-numeric fields on a `base` rule, marketplace values are still synced
- [ ] `group_override` rules are never touched by the marketplace-sync branch

---

## Review Checklist — Batch B (Claude)

After Codex completes Task 2+5, verify:

- [ ] `SidebarStatus` interface is gone from `types/index.ts`
- [ ] `StatusValue` remains (still used by Sidebar)
- [ ] `MarketplaceChannel` no longer has `commission`, `fixedFee`, `freightFixed`
- [ ] `syncMarketplaceCommercialFields` is deleted from `marketplaceStore.ts`
- [ ] `buildCustomMarketplace` no longer sets top-level commission fields
- [ ] All 6 seed channel objects no longer set top-level commission fields
- [ ] `MarketplaceCard.tsx` uses `commercialProfile.*` in all 3 display locations
- [ ] `MarketplaceCommercialMatrix.tsx` uses `commercialProfile.*`
- [ ] `npx tsc --noEmit` exits with 0 errors
- [ ] No `.commission` / `.fixedFee` / `.freightFixed` property accesses remain on marketplace objects (grep to confirm)
