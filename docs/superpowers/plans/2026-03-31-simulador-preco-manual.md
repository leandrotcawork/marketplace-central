# Simulador Preco Manual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the simulador, prefer the manual suggested price when applying “Usar sugestão MS”.

**Architecture:** Read manual suggested prices from `useProductSuggestedPriceStore` and use them as the first choice when applying suggestions, falling back to `product.msPriceSuggestion` only when manual is absent.

**Tech Stack:** Next.js App Router, React client components, Zustand.

---

## File Structure
- Modify: `components/simulador/MarginTable.tsx` — apply manual suggestion preference for global and per-product actions.
- (Optional) Create: `components/simulador/__tests__/MarginTable.test.tsx` — verify manual > MS priority.

---

### Task 1: Prefer manual suggested prices in Simulador actions

**Files:**
- Modify: `components/simulador/MarginTable.tsx`

- [ ] **Step 1: Write failing test**

Create `components/simulador/__tests__/MarginTable.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MarginTable } from '../MarginTable'
import { useProductSuggestedPriceStore } from '@/stores/productSuggestedPriceStore'

const product = {
  id: 'p1',
  sku: 'SKU-1',
  name: 'Produto 1',
  category: 'Outros',
  cost: 10,
  basePrice: 20,
  stock: 1,
  unit: 'un',
  msPriceSuggestion: 99,
}

test('uses manual suggestion over MS when applying suggestions', () => {
  useProductSuggestedPriceStore.getState().setSuggestedPrice('p1', 120)

  render(<MarginTable />)

  const button = screen.getByText('Usar sugestão MS')
  fireEvent.click(button)

  // Expect price cell to reflect 120 instead of 99
  expect(screen.getByText('R$ 120,00')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest --run components/simulador/__tests__/MarginTable.test.tsx`

Expected: FAIL because manual override is not applied.

- [ ] **Step 3: Write minimal implementation**

Update `components/simulador/MarginTable.tsx`:

1) Import store:
```tsx
import { useProductSuggestedPriceStore } from '@/stores/productSuggestedPriceStore'
```

2) Inside component, read store:
```tsx
const manualSuggestedPrices = useProductSuggestedPriceStore((s) => s.suggestedPrices)
```

3) Add helper to pick suggestion:
```tsx
function getPreferredSuggestion(product: (typeof allProducts)[number]) {
  const manual = manualSuggestedPrices[product.id]
  if (manual != null && manual > 0) return manual
  return product.msPriceSuggestion ?? null
}
```

4) Apply in `applyAllMsSuggestions`:
```tsx
function applyAllMsSuggestions() {
  const updates: Record<string, number> = {}
  for (const product of filteredProducts) {
    const suggestion = getPreferredSuggestion(product)
    if (!suggestion) continue
    for (const m of activeMarketplaces) {
      updates[cellKey(product.id, m.id)] = suggestion
    }
  }
  setSellingPrices((prev) => ({ ...prev, ...updates }))
}
```

5) Apply in `applyMsSuggestion`:
```tsx
function applyMsSuggestion(product: (typeof allProducts)[number]) {
  const suggestion = getPreferredSuggestion(product)
  if (!suggestion) return
  const updates: Record<string, number> = {}
  for (const m of activeMarketplaces) {
    updates[cellKey(product.id, m.id)] = suggestion
  }
  setSellingPrices((prev) => ({ ...prev, ...updates }))
}
```

6) Update `isMsActive` to compare against preferred suggestion:
```tsx
function isMsActive(product: (typeof allProducts)[number]): boolean {
  const suggestion = getPreferredSuggestion(product)
  if (!suggestion) return false
  return activeMarketplaces.every(
    (m) => (sellingPrices[cellKey(product.id, m.id)] ?? product.basePrice) === suggestion
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest --run components/simulador/__tests__/MarginTable.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/simulador/MarginTable.tsx components/simulador/__tests__/MarginTable.test.tsx

git commit -m "feat: prefer manual suggestion in simulador"
```

---

## Spec Coverage Check
- Global apply uses manual first: Task 1.
- Per-product apply uses manual first: Task 1.
- No UI changes: Task 1 only modifies logic.

## Placeholder Scan
- No TODO/TBD placeholders.

## Type Consistency
- Uses existing `Product` type and store shape.
