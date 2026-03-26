# Product Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing "Packs" concept with "Grupos" — simpler named product collections with an AI-readable context description, wired into the `/api/analyze` prompt.

**Architecture:** Rename `Pack` → `Group` throughout (types, store, components, routes, sidebar), simplify the model by removing marketplace targeting, add a prominent `aiContext` field (the description the AI reads), and inject it into the GPT-4o prompt so AI analysis is aware of what segment of products it's analyzing.

**Tech Stack:** Next.js 16 App Router, Zustand v5 + localStorage persist, Tailwind CSS v4, OpenAI GPT-4o via `/api/analyze`

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `types/index.ts` | Rename `Pack` → `Group`, drop `marketplaceIds`, rename `description` → `aiContext` |
| Rename + Modify | `stores/packStore.ts` → `stores/groupStore.ts` | Rename exports, localStorage key `mc-packs` → `mc-groups` |
| Rename + Modify | `app/packs/page.tsx` → `app/grupos/page.tsx` | Route rename + update labels |
| Rename + Modify | `components/packs/PackList.tsx` → `components/grupos/GroupList.tsx` | Rename + update labels |
| Rename + Modify | `components/packs/PackForm.tsx` → `components/grupos/GroupForm.tsx` | Remove marketplace checkboxes, make `aiContext` a prominent textarea with hint |
| Rename + Modify | `components/packs/ProductSelector.tsx` → `components/grupos/ProductSelector.tsx` | Copy as-is (no logic change) |
| Modify | `components/layout/Sidebar.tsx` | "Packs" → "Grupos", import `groupStore`, fix badge count |
| Modify | `app/simulador/page.tsx` | `pack` → `group` in state, import `groupStore` |
| Modify | `components/simulador/MarginTable.tsx` | `packId` → `groupId`, import `groupStore` |
| Modify | `app/concorrencia/page.tsx` | `pack` → `group` in state, import `groupStore` |
| Modify | `app/analise-ia/page.tsx` | `pack` → `group`, pass `groupAiContext` to fetch |
| Modify | `app/api/analyze/route.ts` | Accept `groupAiContext?: string`, inject into prompt |

---

## Task 1: Update `Group` type in `types/index.ts`

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Replace the `Pack` interface with `Group`**

Open `types/index.ts`. Replace the entire `Pack` block:

```typescript
// REMOVE this:
export interface Pack {
  id: string
  name: string
  description?: string
  marketplaceIds: string[]
  productIds: string[]
  analysis?: {
    competitorPrices?: any[]
    aiAnalyses?: any[]
    opportunities?: any[]
  }
  createdAt: string
  updatedAt: string
}

// ADD this instead:
export interface Group {
  id: string
  name: string
  aiContext: string          // read by the AI — what this group is and why it matters
  productIds: string[]
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
bun run build 2>&1 | head -40
```

Expected: errors about `Pack` being missing — that is correct, they'll be resolved in subsequent tasks. You're looking for NO errors inside `types/index.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "refactor: rename Pack → Group type, add aiContext field"
```

---

## Task 2: Create `stores/groupStore.ts` (replace packStore)

**Files:**
- Create: `stores/groupStore.ts`
- Delete: `stores/packStore.ts` (after all references removed)

- [ ] **Step 1: Create `stores/groupStore.ts`**

```typescript
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Group } from '@/types'

interface GroupState {
  groups: Group[]
  selectedGroupId: string | null
  addGroup: (group: Group) => void
  updateGroup: (id: string, partial: Partial<Group>) => void
  deleteGroup: (id: string) => void
  selectGroup: (groupId: string | null) => void
  getGroupById: (id: string) => Group | undefined
  toggleProductInGroup: (groupId: string, productId: string) => void
  clearAll: () => void
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set, get) => ({
      groups: [],
      selectedGroupId: null,

      addGroup: (group) =>
        set((state) => ({ groups: [...state.groups, group] })),

      updateGroup: (id, partial) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === id ? { ...g, ...partial, updatedAt: new Date().toISOString() } : g
          ),
        })),

      deleteGroup: (id) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
          selectedGroupId: state.selectedGroupId === id ? null : state.selectedGroupId,
        })),

      selectGroup: (groupId) => set({ selectedGroupId: groupId }),

      getGroupById: (id) => get().groups.find((g) => g.id === id),

      toggleProductInGroup: (groupId, productId) =>
        set((state) => ({
          groups: state.groups.map((g) => {
            if (g.id !== groupId) return g
            const included = g.productIds.includes(productId)
            return {
              ...g,
              productIds: included
                ? g.productIds.filter((id) => id !== productId)
                : [...g.productIds, productId],
              updatedAt: new Date().toISOString(),
            }
          }),
        })),

      clearAll: () => set({ groups: [], selectedGroupId: null }),
    }),
    { name: 'mc-groups' }
  )
)
```

- [ ] **Step 2: Verify no import errors**

```bash
bun run build 2>&1 | grep -i "groupStore\|group_store" | head -20
```

Expected: no errors about groupStore itself.

- [ ] **Step 3: Commit**

```bash
git add stores/groupStore.ts
git commit -m "feat: add groupStore (replaces packStore)"
```

---

## Task 3: Create Groups UI components

**Files:**
- Create: `components/grupos/GroupList.tsx`
- Create: `components/grupos/GroupForm.tsx`
- Create: `components/grupos/ProductSelector.tsx`

- [ ] **Step 1: Create `components/grupos/GroupList.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Edit2, Trash2, Plus, Users } from 'lucide-react'
import { useGroupStore } from '@/stores/groupStore'
import { useProductStore } from '@/stores/productStore'
import type { Group } from '@/types'

interface GroupListProps {
  onEditGroup?: (group: Group) => void
  onNewGroup?: () => void
}

export function GroupList({ onEditGroup, onNewGroup }: GroupListProps) {
  const { groups, deleteGroup } = useGroupStore()
  const { products } = useProductStore()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleDelete = (id: string) => {
    deleteGroup(id)
    setConfirmDeleteId(null)
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-16">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
        >
          <Users size={24} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Nenhum grupo criado ainda
        </p>
        <button
          onClick={onNewGroup}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        >
          <Plus size={16} />
          Criar Primeiro Grupo
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const productCount = group.productIds.length
        const inStockCount = products.filter(
          (p) => group.productIds.includes(p.id) && p.stock > 0
        ).length

        return (
          <div
            key={group.id}
            className="flex items-start justify-between p-4 rounded-lg border transition-colors"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="flex-1 min-w-0 mr-4">
              <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                {group.name}
              </h3>
              {group.aiContext && (
                <p
                  className="text-xs mb-2 line-clamp-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {group.aiContext}
                </p>
              )}
              <div className="flex gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>{productCount} produto{productCount !== 1 ? 's' : ''}</span>
                {productCount > 0 && (
                  <span style={{ color: inStockCount > 0 ? 'var(--accent-success)' : 'var(--text-secondary)' }}>
                    {inStockCount} em estoque
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => onEditGroup?.(group)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                title="Editar grupo"
              >
                <Edit2 size={15} />
              </button>

              {confirmDeleteId === group.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => handleDelete(group.id)}
                    className="px-2 py-1 text-xs rounded-lg text-white"
                    style={{ backgroundColor: 'var(--accent-danger)' }}
                  >
                    Excluir
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2 py-1 text-xs rounded-lg"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(group.id)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--accent-danger)'
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  title="Excluir grupo"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/grupos/GroupForm.tsx`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { useGroupStore } from '@/stores/groupStore'
import { ProductSelector } from './ProductSelector'
import type { Group } from '@/types'

interface GroupFormProps {
  group?: Group | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GroupForm({ group, open, onOpenChange }: GroupFormProps) {
  const { addGroup, updateGroup } = useGroupStore()
  const [name, setName] = useState('')
  const [aiContext, setAiContext] = useState('')
  const [productIds, setProductIds] = useState<string[]>([])
  const [showSelector, setShowSelector] = useState(false)

  useEffect(() => {
    if (open) {
      setName(group?.name ?? '')
      setAiContext(group?.aiContext ?? '')
      setProductIds(group?.productIds ?? [])
      setShowSelector(false)
    }
  }, [group, open])

  const handleSave = () => {
    if (!name.trim()) return
    const now = new Date().toISOString()
    if (group) {
      updateGroup(group.id, { name: name.trim(), aiContext, productIds, updatedAt: now })
    } else {
      addGroup({ id: `grp-${Date.now()}`, name: name.trim(), aiContext, productIds, createdAt: now, updatedAt: now })
    }
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {group ? 'Editar Grupo' : 'Novo Grupo'}
          </h2>
          <button onClick={() => onOpenChange(false)} style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {showSelector ? (
          <ProductSelector
            selectedProductIds={productIds}
            onSelectedChange={setProductIds}
            onDone={() => setShowSelector(false)}
          />
        ) : (
          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Nome do Grupo *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Metais Premium, Chuveiros Entrada, Porcelanato Polido"
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* AI Context — first-class field */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
                  Contexto para IA
                </span>
              </label>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Descreva o que este grupo representa. A IA lerá este texto para calibrar as recomendações de preço.
                Inclua segmento de mercado, perfil do comprador, posicionamento desejado.
              </p>
              <textarea
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                placeholder="Ex: Produtos premium de acabamento para banheiros de alto padrão. Comprador típico: construtoras de luxo e arquitetos. Posicionamento: qualidade e exclusividade sobre preço. Tolerância a margem alta. Competição com importados."
                className="w-full px-3 py-2 rounded-lg border resize-none"
                rows={5}
                style={{
                  borderColor: 'var(--accent-primary)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              />
              <p className="text-xs mt-1" style={{ color: aiContext.length > 600 ? 'var(--accent-warning)' : 'var(--text-secondary)' }}>
                {aiContext.length}/800 caracteres
              </p>
            </div>

            {/* Product selection */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Produtos ({productIds.length} selecionados)
              </label>
              <button
                onClick={() => setShowSelector(true)}
                className="w-full px-4 py-2 rounded-lg border-2 border-dashed text-sm transition-colors"
                style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
              >
                {productIds.length > 0 ? 'Alterar seleção de produtos' : 'Selecionar produtos'}
              </button>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!name.trim()}
                className="px-4 py-2 rounded-lg text-sm text-white disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {group ? 'Salvar Grupo' : 'Criar Grupo'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Copy ProductSelector to `components/grupos/ProductSelector.tsx`**

Copy the existing `components/packs/ProductSelector.tsx` verbatim to `components/grupos/ProductSelector.tsx`. No logic changes needed.

```bash
cp components/packs/ProductSelector.tsx components/grupos/ProductSelector.tsx
```

- [ ] **Step 4: Commit**

```bash
git add components/grupos/
git commit -m "feat: add GroupList, GroupForm, ProductSelector components"
```

---

## Task 4: Create `/grupos` page

**Files:**
- Create: `app/grupos/page.tsx`

- [ ] **Step 1: Create `app/grupos/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { GroupList } from '@/components/grupos/GroupList'
import { GroupForm } from '@/components/grupos/GroupForm'
import { useProductStore } from '@/stores/productStore'
import { useGroupStore } from '@/stores/groupStore'
import type { Group } from '@/types'

export default function GruposPage() {
  const [openForm, setOpenForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const { products, fetchFromMetalShopping, isLoading, error } = useProductStore()
  const { groups } = useGroupStore()

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group)
    setOpenForm(true)
  }

  const handleNew = () => {
    setEditingGroup(null)
    setOpenForm(true)
  }

  const handleFormClose = (open: boolean) => {
    setOpenForm(open)
    if (!open) setEditingGroup(null)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Grupos de Produtos"
        subtitle={
          groups.length > 0
            ? `${groups.length} grupo${groups.length !== 1 ? 's' : ''} criado${groups.length !== 1 ? 's' : ''}`
            : 'Organize produtos em grupos para análise'
        }
        actions={
          <button
            onClick={handleNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Plus size={16} />
            Novo Grupo
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-6">
          {/* Fetch products panel (shown when catalog is empty) */}
          {products.length === 0 && (
            <div
              className="p-5 rounded-lg border"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
            >
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Catálogo não carregado
              </p>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Carregue os produtos do MetalShopping antes de criar grupos.
              </p>
              <button
                onClick={() => fetchFromMetalShopping()}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {isLoading ? 'Carregando...' : 'Buscar Produtos do MetalShopping'}
              </button>
              {error && (
                <p className="text-xs mt-2" style={{ color: 'var(--accent-danger)' }}>
                  {error}
                </p>
              )}
            </div>
          )}

          <GroupList onNewGroup={handleNew} onEditGroup={handleEditGroup} />
        </div>
      </div>

      <GroupForm group={editingGroup} open={openForm} onOpenChange={handleFormClose} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/grupos/
git commit -m "feat: add /grupos page"
```

---

## Task 5: Update Sidebar

**Files:**
- Modify: `components/layout/Sidebar.tsx`

The current sidebar imports `usePackStore` and has a `packs` nav item. Replace with `groupStore`.

- [ ] **Step 1: Update imports**

In `components/layout/Sidebar.tsx`, replace:
```typescript
import { usePackStore } from '@/stores/packStore'
```
with:
```typescript
import { useGroupStore } from '@/stores/groupStore'
```

- [ ] **Step 2: Update `useSidebarStatus`**

Replace:
```typescript
const { packs } = usePackStore()
// ...
packs: packs.length === 0 ? 'idle' : 'complete',
```
with:
```typescript
const { groups } = useGroupStore()
// ...
packs: groups.length === 0 ? 'idle' : 'complete',
```

- [ ] **Step 3: Update `SidebarStatusMap` key name and nav item**

The `statusKey: 'packs'` and the nav label. In `NAV_ITEMS`, replace the Packs entry:
```typescript
{ number: 5, icon: Grid3x3, label: 'Packs', href: '/packs', statusKey: 'packs' },
```
with:
```typescript
{ number: 5, icon: Grid3x3, label: 'Grupos', href: '/grupos', statusKey: 'packs' },
```

(Keep `statusKey: 'packs'` since it maps to the `SidebarStatusMap` key — rename that too if desired, but it's cosmetic.)

- [ ] **Step 4: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: rename Packs → Grupos in sidebar navigation"
```

---

## Task 6: Update analysis screens to use groupStore

Every analysis screen that imports `usePackStore` needs to switch to `useGroupStore`.

**Files:**
- Modify: `app/simulador/page.tsx`
- Modify: `components/simulador/MarginTable.tsx`
- Modify: `app/concorrencia/page.tsx`
- Modify: `app/analise-ia/page.tsx`

- [ ] **Step 1: Update `app/simulador/page.tsx`**

Replace:
```typescript
import { usePackStore } from '@/stores/packStore'
// ...
const { packs } = usePackStore()
const [selectedPackId, setSelectedPackId] = useState<string | null>(null)

const packProducts = selectedPackId
  ? products.filter((p) => {
      const pack = packs.find((pk) => pk.id === selectedPackId)
      return pack?.productIds.includes(p.id)
    })
  : products
```

With:
```typescript
import { useGroupStore } from '@/stores/groupStore'
// ...
const { groups } = useGroupStore()
const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

const groupProducts = selectedGroupId
  ? products.filter((p) => {
      const group = groups.find((g) => g.id === selectedGroupId)
      return group?.productIds.includes(p.id)
    })
  : products
```

Also update the JSX select dropdown: `packs.map(...)` → `groups.map(...)`, `selectedPackId` → `selectedGroupId`, pass `groupId={selectedGroupId}` to `<MarginTable>`.

- [ ] **Step 2: Update `components/simulador/MarginTable.tsx`**

Change the prop name `packId` → `groupId`:
```typescript
interface MarginTableProps {
  groupId?: string | null
}

export function MarginTable({ groupId }: MarginTableProps) {
  const allProducts = useProductStore((s) => s.products)
  const groups = useGroupStore((s) => s.groups)  // import useGroupStore
  // ...
  const products = useMemo(() => {
    if (!groupId) return allProducts
    const group = groups.find((g) => g.id === groupId)
    return allProducts.filter((p) => group?.productIds.includes(p.id))
  }, [allProducts, groupId, groups])
```

- [ ] **Step 3: Update `app/concorrencia/page.tsx`**

Replace all `pack` references with `group`:
- `usePackStore` → `useGroupStore`
- `packs` → `groups`
- `selectedPackId` → `selectedGroupId`
- `setSelectedPackId` → `setSelectedGroupId`
- `packs.find(...)` → `groups.find(...)`
- Select dropdown `packs.map(...)` → `groups.map(...)`

- [ ] **Step 4: Update `app/analise-ia/page.tsx`**

Replace all `pack` references with `group`, and also capture the selected group's `aiContext` for the next task:
- `usePackStore` → `useGroupStore`
- `packs` → `groups`
- `selectedPackId` → `selectedGroupId`
- `setSelectedPackId` → `setSelectedGroupId`
- Add: `const selectedGroup = groups.find((g) => g.id === selectedGroupId)`

When calling `/api/analyze`, add the group context to the request body:
```typescript
body: JSON.stringify({
  product,
  margins: productMargins,
  competitors,
  groupAiContext: selectedGroup?.aiContext ?? null,
}),
```

- [ ] **Step 5: Commit**

```bash
git add app/simulador/page.tsx components/simulador/MarginTable.tsx app/concorrencia/page.tsx app/analise-ia/page.tsx
git commit -m "refactor: replace packStore with groupStore in all analysis screens"
```

---

## Task 7: Inject group context into AI prompt

**Files:**
- Modify: `app/api/analyze/route.ts`

- [ ] **Step 1: Extend `AnalyzeRequestBody` to accept `groupAiContext`**

In `app/api/analyze/route.ts`, update the request type and `sanitizeBody`:

```typescript
type AnalyzeRequestBody = {
  product: Product
  margins: MarginResult[]
  competitors: CompetitorPrice[]
  groupAiContext: string | null
}

// In sanitizeBody(), add:
const groupAiContext =
  typeof (raw as Record<string, unknown>).groupAiContext === 'string'
    ? ((raw as Record<string, unknown>).groupAiContext as string).slice(0, 800)
    : null

return {
  product,
  margins: margins.slice(0, 200),
  competitors: competitors.slice(0, 100),
  groupAiContext,
}
```

- [ ] **Step 2: Inject context into the prompt**

In the `POST` handler, update the prompt string to include the group context when present:

```typescript
const { product, margins, competitors, groupAiContext } = body

const groupSection = groupAiContext
  ? `\nContexto do grupo de produtos:\n${groupAiContext}\n`
  : ''

const prompt = `Você é um analista de pricing para marketplace brasileiro de acabamentos (porcelanas, metais, cerâmicas).
Analise os dados abaixo e retorne APENAS JSON válido, sem markdown, sem explicações.
${groupSection}
Produto: ${product.name}
Custo: R$${product.cost}
Preço atual: R$${product.basePrice}

Margens por marketplace:
${JSON.stringify(margins, null, 2)}

Preços de concorrentes:
${JSON.stringify(competitors.slice(0, 10), null, 2)}

Retorne este JSON exato:
{
  "recomendacao_preco": { "marketplace_id": preco_numero },
  "viabilidade": { "marketplace_id": score_1_a_10 },
  "justificativa": "texto explicativo em português",
  "estrategia": "penetracao" ou "premium" ou "competitivo",
  "alerta": ["alerta1", "alerta2"]
}`
```

- [ ] **Step 3: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "feat: inject group aiContext into GPT-4o pricing prompt"
```

---

## Task 8: Cleanup — remove old Packs files

**Files:**
- Delete: `stores/packStore.ts`
- Delete: `components/packs/` (entire folder)
- Delete: `app/packs/` (entire folder)

- [ ] **Step 1: Verify no remaining imports of packStore or old paths**

```bash
grep -r "packStore\|/packs\|usePackStore\|from '@/stores/packStore'" app/ components/ stores/ --include="*.ts" --include="*.tsx" 2>&1
```

Expected: no output (zero matches).

- [ ] **Step 2: Delete old files**

```bash
rm -rf stores/packStore.ts components/packs/ app/packs/
```

- [ ] **Step 3: Verify build passes**

```bash
bun run build 2>&1 | tail -20
```

Expected: successful build with no errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: remove deprecated packs files (replaced by grupos)"
```

---

## Self-Review

**Spec coverage:**
- ✅ "create groups" → `/grupos` page + `GroupList` + `GroupForm`
- ✅ "product groups, I only want to sort them into groups of my choosing" → `ProductSelector` multi-select in `GroupForm`
- ✅ "description available cause AI will read that" → `aiContext` field in `GroupForm`, injected into `/api/analyze` prompt
- ✅ "later for marketplace analysis AI analysis I can use it" → group selector in simulador, concorrencia, analise-ia
- ✅ After catálogo in sidebar → position 5, `/grupos` route

**Placeholder scan:** None found.

**Type consistency:**
- `Group.aiContext` (string) used consistently in `GroupForm`, `groupStore`, `route.ts`
- `groupId` prop name matches between `SimuladorPage` and `MarginTable`
- `selectedGroup?.aiContext` used in `analise-ia/page.tsx`, received as `groupAiContext` in route
