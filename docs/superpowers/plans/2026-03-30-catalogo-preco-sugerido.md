# Catalogo Preco Sugerido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show live MetalShopping suggested price in the Catalogo product panel and allow manual local override per product.

**Architecture:** Add a single-SKU GET route handler that returns the MetalShopping suggestion, fetch it when the product panel opens, and persist any manual suggested price in a new Zustand+sqliteStorage store used only by the panel.

**Tech Stack:** Next.js App Router Route Handlers, React client components, Zustand + sqliteStorage, TypeScript, Vitest + Testing Library.

---

## File Structure

- Create: `app/api/metalshopping/price-suggestion/[sku]/route.ts` — GET route for single SKU suggestion.
- Create: `stores/productSuggestedPriceStore.ts` — local persisted manual suggested prices per product.
- Modify: `components/catalogo/ProductDimensionsPanel.tsx` — fetch live suggestion, render new section, save manual override.
- Create: `vitest.config.ts` — test runner configuration.
- Create: `tests/setup.ts` — Testing Library + jest-dom setup.
- Create: `stores/__tests__/productSuggestedPriceStore.test.ts` — unit test for store.
- Create: `components/catalogo/__tests__/ProductDimensionsPanel.test.tsx` — component test for suggestion rendering and manual save.
- Modify: `package.json` — add test script + dev deps.

---

### Task 1: Add single-SKU suggestion API route

**Files:**
- Create: `app/api/metalshopping/price-suggestion/[sku]/route.ts`

- [ ] **Step 1: Write failing test**

Create `app/api/metalshopping/price-suggestion/[sku]/route.test.ts` with a minimal unit test stub that calls the handler and expects a structured response.

```ts
import { GET } from './route'

function mockRequest(url: string) {
  return new Request(url)
}

test('GET returns success with null data for missing sku', async () => {
  const res = await GET(mockRequest('http://localhost/api/metalshopping/price-suggestion/'))
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/api/metalshopping/price-suggestion/[sku]/route.test.ts`

Expected: FAIL because test runner/config does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `app/api/metalshopping/price-suggestion/[sku]/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { fetchPriceSuggestionsBySKUs } from '@/lib/metalshopping-client'
import type { MetalshoppingPriceSuggestion } from '@/types'

type RouteContext = { params: Promise<{ sku: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { sku } = await context.params
    const normalized = String(sku || '').trim()
    if (!normalized) {
      return NextResponse.json(
        { success: false, error: 'SKU param is required' },
        { status: 400 }
      )
    }

    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const rows = await fetchPriceSuggestionsBySKUs([normalized], tenantId)
    const first = rows[0]

    if (!first) {
      return NextResponse.json({ success: true, data: null })
    }

    const data: MetalshoppingPriceSuggestion = {
      sku: String(first.sku),
      minPrice: Number(first.min_price),
      ...(first.observed_at ? { observedAt: String(first.observed_at) } : {}),
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/api/metalshopping/price-suggestion/[sku]/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/metalshopping/price-suggestion/[sku]/route.ts app/api/metalshopping/price-suggestion/[sku]/route.test.ts

git commit -m "feat: add single-sku metalshopping price suggestion"
```

---

### Task 2: Add manual suggested price store

**Files:**
- Create: `stores/productSuggestedPriceStore.ts`
- Create: `stores/__tests__/productSuggestedPriceStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { act } from 'react'
import { useProductSuggestedPriceStore } from '../productSuggestedPriceStore'

test('set/get/delete manual suggested price', () => {
  act(() => {
    useProductSuggestedPriceStore.getState().setSuggestedPrice('p1', 123.45)
  })
  expect(useProductSuggestedPriceStore.getState().getSuggestedPrice('p1')).toBe(123.45)

  act(() => {
    useProductSuggestedPriceStore.getState().deleteSuggestedPrice('p1')
  })
  expect(useProductSuggestedPriceStore.getState().getSuggestedPrice('p1')).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run stores/__tests__/productSuggestedPriceStore.test.ts`

Expected: FAIL because store does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/lib/sqlite-storage'

interface ProductSuggestedPriceState {
  suggestedPrices: Record<string, number>
  setSuggestedPrice: (productId: string, price: number) => void
  getSuggestedPrice: (productId: string) => number | undefined
  deleteSuggestedPrice: (productId: string) => void
  clearAll: () => void
}

export const useProductSuggestedPriceStore = create<ProductSuggestedPriceState>()(
  persist(
    (set, get) => ({
      suggestedPrices: {},

      setSuggestedPrice: (productId, price) =>
        set((state) => ({
          suggestedPrices: { ...state.suggestedPrices, [productId]: price },
        })),

      getSuggestedPrice: (productId) => get().suggestedPrices[productId],

      deleteSuggestedPrice: (productId) =>
        set((state) => {
          const { [productId]: _removed, ...rest } = state.suggestedPrices
          return { suggestedPrices: rest }
        }),

      clearAll: () => set({ suggestedPrices: {} }),
    }),
    { name: 'mc-product-suggested-prices', storage: createJSONStorage(() => sqliteStorage) }
  )
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run stores/__tests__/productSuggestedPriceStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stores/productSuggestedPriceStore.ts stores/__tests__/productSuggestedPriceStore.test.ts

git commit -m "feat: add manual suggested price store"
```

---

### Task 3: Render live suggestion and manual input in panel

**Files:**
- Modify: `components/catalogo/ProductDimensionsPanel.tsx`
- Create: `components/catalogo/__tests__/ProductDimensionsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProductDimensionsPanel } from '../ProductDimensionsPanel'

const product = {
  id: 'p1',
  sku: 'SKU-1',
  name: 'Produto 1',
  category: 'Outros',
  cost: 10,
  basePrice: 20,
  stock: 1,
  unit: 'un',
}

test('renders live suggestion and saves manual price', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { sku: 'SKU-1', minPrice: 99.9 } }),
  }) as any

  render(<ProductDimensionsPanel product={product as any} onClose={() => {}} />)

  await waitFor(() => expect(screen.getByText('MS 99,90')).toBeInTheDocument())

  const input = screen.getByLabelText('Preço sugerido manual (R$)')
  fireEvent.change(input, { target: { value: '120.00' } })
  fireEvent.blur(input)
  expect((input as HTMLInputElement).value).toBe('120.00')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run components/catalogo/__tests__/ProductDimensionsPanel.test.tsx`

Expected: FAIL because UI and test harness are not set up yet.

- [ ] **Step 3: Write minimal implementation**

Update `components/catalogo/ProductDimensionsPanel.tsx` to:

```tsx
import { useProductSuggestedPriceStore } from '@/stores/productSuggestedPriceStore'
import { formatBRL } from '@/lib/formatters'

// inside component
const { getSuggestedPrice, setSuggestedPrice, deleteSuggestedPrice } = useProductSuggestedPriceStore()
const [liveSuggestion, setLiveSuggestion] = useState<number | null>(null)
const [suggestionError, setSuggestionError] = useState<string | null>(null)
const [manualSuggestion, setManualSuggestion] = useState('')

useEffect(() => {
  const stored = getSuggestedPrice(product.id)
  setManualSuggestion(stored != null ? String(stored.toFixed(2)) : '')
}, [product.id, getSuggestedPrice])

useEffect(() => {
  let alive = true
  setLiveSuggestion(null)
  setSuggestionError(null)

  if (!product.sku) return

  fetch(`/api/metalshopping/price-suggestion/${encodeURIComponent(product.sku)}`)
    .then(async (res) => {
      if (!res.ok) throw new Error('fetch_failed')
      const payload = await res.json()
      if (!alive) return
      if (payload?.success && payload?.data?.minPrice) {
        setLiveSuggestion(Number(payload.data.minPrice))
      } else {
        setLiveSuggestion(null)
      }
    })
    .catch(() => {
      if (!alive) return
      setSuggestionError('Preço Sugerido indisponível')
    })

  return () => { alive = false }
}, [product.sku])

function saveManualSuggestion(value: string) {
  setManualSuggestion(value)
  const num = Number(value.replace(',', '.'))
  if (Number.isFinite(num) && num > 0) setSuggestedPrice(product.id, num)
  else deleteSuggestedPrice(product.id)
}
```

Add a new UI section inside the panel body:

```tsx
<div className="space-y-2">
  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Preço Sugerido</p>
  {suggestionError ? (
    <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>{suggestionError}</p>
  ) : liveSuggestion != null ? (
    <p className="text-xs font-mono" style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
      MS {formatBRL(liveSuggestion)}
    </p>
  ) : null}
  <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
    Preço sugerido manual (R$)
  </label>
  <input
    aria-label="Preço sugerido manual (R$)"
    type="text"
    value={manualSuggestion}
    onChange={(e) => saveManualSuggestion(e.target.value)}
    className="w-full rounded-md px-3 py-2 text-sm outline-none"
    style={inputStyle}
    placeholder="—"
  />
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run components/catalogo/__tests__/ProductDimensionsPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/catalogo/ProductDimensionsPanel.tsx components/catalogo/__tests__/ProductDimensionsPanel.test.tsx

git commit -m "feat: show live suggested price in catalog panel"
```

---

### Task 4: Add Vitest + Testing Library setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`

- [ ] **Step 1: Write the failing test**

Run: `npm test`

Expected: FAIL because test runner is not configured.

- [ ] **Step 2: Write minimal implementation**

Update `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.2",
    "@testing-library/react": "^16.3.0",
    "jsdom": "^26.1.0",
    "vitest": "^2.1.2"
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
})
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm install`

Expected: packages installed with no errors.

Run: `npm test -- --run stores/__tests__/productSuggestedPriceStore.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts

git commit -m "test: add vitest and testing library"
```

---

## Spec Coverage Check
- Live API per product: Task 1 + Task 3.
- Manual local suggested price: Task 2 + Task 3.
- Empty when no suggestion: Task 3.
- Error handling: Task 3.
- Testing: Task 2 + Task 3 + Task 4.

## Placeholder Scan
- No TODO/TBD placeholders.

## Type Consistency
- `MetalshoppingPriceSuggestion` matches `types/index.ts`.
- Manual store uses `number` consistent with pricing fields.
