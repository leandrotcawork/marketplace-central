# Taxonomy Groups & Classifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename user-defined "Grupos" to "Classificações" (with AI context), and import MetalShopping taxonomy leaf nodes as the new read-only "Grupos" that scope products in analysis screens.

**Architecture:** Three-phase change: (1) create new Classification infrastructure alongside existing Group files without deleting anything yet; (2) do one atomic swap — update all imports and usages from groupStore to classificationStore, then delete the old files; (3) create the new taxonomy-based Group system and wire it into the analysis screens. The product `category` field is also fixed to come from `catalog_taxonomy_nodes.name` via `primary_taxonomy_node_id`.

**Tech Stack:** PostgreSQL (`catalog_taxonomy_nodes`, `catalog_taxonomy_level_defs`), Next.js API routes, Zustand v5 + localStorage persist, React 19

---

## DB Schema Reference

```
catalog_taxonomy_nodes:
  taxonomy_node_id  text   -- e.g. "tx_11"
  name              text   -- e.g. "ASSENTO PLASTICO"
  level             int    -- 0 = Grupo (99 nodes), 1 = Categoria (1 node)
  parent_taxonomy_node_id  text (null = root)
  is_active         bool

catalog_taxonomy_level_defs:
  level       int
  label       text   -- 0 → "Grupo", 1 → "Categoria", 2 → "Subgrupo"
  tenant_id   text

catalog_products:
  primary_taxonomy_node_id  text  -- FK → catalog_taxonomy_nodes
```

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `types/index.ts` | Rename `Group` → `Classification`; add new taxonomy `Group` type |
| Create | `stores/classificationStore.ts` | Renamed groupStore with `mc-classifications` key |
| Create | `components/classificacoes/ClassificationList.tsx` | Renamed GroupList |
| Create | `components/classificacoes/ClassificationForm.tsx` | Renamed GroupForm |
| Create | `components/classificacoes/ProductSelector.tsx` | Copy of components/grupos/ProductSelector.tsx |
| Create | `app/classificacoes/page.tsx` | Renamed /grupos page |
| Modify | `components/layout/Sidebar.tsx` | Swap groupStore→classificationStore; add "Classificações" item |
| Modify | `app/grupos/page.tsx` | Swap groupStore→classificationStore (temp); replaced in Task 10 |
| Modify | `app/simulador/page.tsx` | classificationStore for scoping |
| Modify | `components/simulador/MarginTable.tsx` | classificationId prop |
| Modify | `app/concorrencia/page.tsx` | classificationStore for scoping |
| Modify | `app/analise-ia/page.tsx` | classificationStore for scoping + AI context |
| Delete | `stores/groupStore.ts` | Deleted after all references updated |
| Delete | `components/grupos/GroupList.tsx`, `GroupForm.tsx` | Old files |
| Modify | `lib/metalshopping-client.ts` | Join taxonomy nodes for category + add `fetchTaxonomyGroups()` |
| Modify | `lib/product-mapper.ts` | `category` from `taxonomy_group` column |
| Create | `app/api/taxonomy/route.ts` | GET endpoint returning `Group[]` |
| Create | `stores/groupStore.ts` | New: taxonomy groups, `fetchGroups()`, `mc-taxonomy-groups` |
| Create | `components/grupos/GroupCard.tsx` | Read-only taxonomy group card |
| Modify | `app/grupos/page.tsx` | Full rewrite: taxonomy groups + import button |
| Modify | `app/simulador/page.tsx` | groupStore for scoping (replaces classificationStore) |
| Modify | `components/simulador/MarginTable.tsx` | groupId prop (replaces classificationId) |
| Modify | `app/concorrencia/page.tsx` | groupStore for scoping |
| Modify | `app/analise-ia/page.tsx` | groupStore for scoping + classificationStore for AI context |

---

## Task 1: Update types/index.ts

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Replace `Group` with `Classification` and add new taxonomy `Group`**

Open `types/index.ts`. Find the `Group` interface (currently has `id, name, aiContext, productIds, createdAt, updatedAt`) and replace it with two interfaces:

```typescript
export interface Classification {
  id: string
  name: string
  aiContext: string
  productIds: string[]
  createdAt: string
  updatedAt: string
}

export interface Group {
  id: string           // taxonomy_node_id e.g. "tx_11"
  name: string         // e.g. "ASSENTO PLASTICO"
  level: number        // 0 = Grupo, 1 = Categoria, 2 = Subgrupo
  levelLabel: string   // from catalog_taxonomy_level_defs.label
  productIds: string[] // product_ids where primary_taxonomy_node_id = this node
  syncedAt: string     // ISO timestamp of last import
}
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
git add types/index.ts
git commit -m "refactor: rename Group→Classification type; add taxonomy Group type"
```

---

## Task 2: Create classificationStore

**Files:**
- Create: `stores/classificationStore.ts`

This is `stores/groupStore.ts` renamed — same logic, different type names, different localStorage key.

- [ ] **Step 1: Create `stores/classificationStore.ts`**

```typescript
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Classification } from '@/types'

interface ClassificationState {
  classifications: Classification[]
  selectedClassificationId: string | null
  addClassification: (c: Classification) => void
  updateClassification: (id: string, partial: Partial<Classification>) => void
  deleteClassification: (id: string) => void
  selectClassification: (id: string | null) => void
  getClassificationById: (id: string) => Classification | undefined
  toggleProductInClassification: (classificationId: string, productId: string) => void
  clearAll: () => void
}

export const useClassificationStore = create<ClassificationState>()(
  persist(
    (set, get) => ({
      classifications: [],
      selectedClassificationId: null,

      addClassification: (c) =>
        set((state) => ({ classifications: [...state.classifications, c] })),

      updateClassification: (id, partial) =>
        set((state) => ({
          classifications: state.classifications.map((c) =>
            c.id === id ? { ...c, ...partial, updatedAt: new Date().toISOString() } : c
          ),
        })),

      deleteClassification: (id) =>
        set((state) => ({
          classifications: state.classifications.filter((c) => c.id !== id),
          selectedClassificationId:
            state.selectedClassificationId === id ? null : state.selectedClassificationId,
        })),

      selectClassification: (id) => set({ selectedClassificationId: id }),

      getClassificationById: (id) => get().classifications.find((c) => c.id === id),

      toggleProductInClassification: (classificationId, productId) =>
        set((state) => ({
          classifications: state.classifications.map((c) => {
            if (c.id !== classificationId) return c
            const included = c.productIds.includes(productId)
            return {
              ...c,
              productIds: included
                ? c.productIds.filter((id) => id !== productId)
                : [...c.productIds, productId],
              updatedAt: new Date().toISOString(),
            }
          }),
        })),

      clearAll: () => set({ classifications: [], selectedClassificationId: null }),
    }),
    { name: 'mc-classifications' }
  )
)
```

- [ ] **Step 2: Commit**

```bash
git add stores/classificationStore.ts
git commit -m "feat: add classificationStore (replaces groupStore, key mc-classifications)"
```

---

## Task 3: Create components/classificacoes/

**Files:**
- Create: `components/classificacoes/ClassificationList.tsx`
- Create: `components/classificacoes/ClassificationForm.tsx`
- Create: `components/classificacoes/ProductSelector.tsx`

- [ ] **Step 1: Create `components/classificacoes/ClassificationList.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Edit2, Trash2, Plus, Users } from 'lucide-react'
import { useClassificationStore } from '@/stores/classificationStore'
import { useProductStore } from '@/stores/productStore'
import type { Classification } from '@/types'

interface ClassificationListProps {
  onEditClassification?: (c: Classification) => void
  onNewClassification?: () => void
}

export function ClassificationList({ onEditClassification, onNewClassification }: ClassificationListProps) {
  const { classifications, deleteClassification } = useClassificationStore()
  const { products } = useProductStore()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleDelete = (id: string) => {
    deleteClassification(id)
    setConfirmDeleteId(null)
  }

  if (classifications.length === 0) {
    return (
      <div className="text-center py-16">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
        >
          <Users size={24} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Nenhuma classificação criada ainda
        </p>
        <button
          onClick={onNewClassification}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        >
          <Plus size={16} />
          Criar Primeira Classificação
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {classifications.map((c) => {
        const productCount = c.productIds.length
        const inStockCount = products.filter(
          (p) => c.productIds.includes(p.id) && p.stock > 0
        ).length

        return (
          <div
            key={c.id}
            className="flex items-start justify-between p-4 rounded-lg border"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="flex-1 min-w-0 mr-4">
              <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                {c.name}
              </h3>
              {c.aiContext && (
                <p className="text-xs mb-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                  {c.aiContext}
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
                onClick={() => onEditClassification?.(c)}
                className="p-2 rounded-lg"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                title="Editar classificação"
              >
                <Edit2 size={15} />
              </button>

              {confirmDeleteId === c.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => handleDelete(c.id)}
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
                  onClick={() => setConfirmDeleteId(c.id)}
                  className="p-2 rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--accent-danger)'
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  title="Excluir classificação"
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

- [ ] **Step 2: Create `components/classificacoes/ClassificationForm.tsx`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { useClassificationStore } from '@/stores/classificationStore'
import { ProductSelector } from './ProductSelector'
import type { Classification } from '@/types'

interface ClassificationFormProps {
  classification?: Classification | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ClassificationForm({ classification, open, onOpenChange }: ClassificationFormProps) {
  const { addClassification, updateClassification } = useClassificationStore()
  const [name, setName] = useState('')
  const [aiContext, setAiContext] = useState('')
  const [productIds, setProductIds] = useState<string[]>([])
  const [showSelector, setShowSelector] = useState(false)

  useEffect(() => {
    if (open) {
      setName(classification?.name ?? '')
      setAiContext(classification?.aiContext ?? '')
      setProductIds(classification?.productIds ?? [])
      setShowSelector(false)
    }
  }, [classification, open])

  const handleSave = () => {
    if (!name.trim()) return
    const now = new Date().toISOString()
    if (classification) {
      updateClassification(classification.id, { name: name.trim(), aiContext, productIds, updatedAt: now })
    } else {
      addClassification({
        id: `cls-${Date.now()}`,
        name: name.trim(),
        aiContext,
        productIds,
        createdAt: now,
        updatedAt: now,
      })
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
            {classification ? 'Editar Classificação' : 'Nova Classificação'}
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
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Nome da Classificação *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Premium Banheiro, Alta Rotatividade, Lançamentos"
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
                  Contexto para IA
                </span>
              </label>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Descreva o que esta classificação representa. A IA lerá este texto para calibrar as
                recomendações de preço. Inclua segmento de mercado, perfil do comprador, posicionamento.
              </p>
              <textarea
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                placeholder="Ex: Produtos premium de acabamento para banheiros de alto padrão. Comprador típico: construtoras de luxo e arquitetos. Posicionamento: qualidade sobre preço. Alta margem aceitável."
                className="w-full px-3 py-2 rounded-lg border resize-none"
                rows={5}
                style={{
                  borderColor: 'var(--accent-primary)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              />
              <p
                className="text-xs mt-1"
                style={{ color: aiContext.length > 600 ? 'var(--accent-warning)' : 'var(--text-secondary)' }}
              >
                {aiContext.length}/800 caracteres
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Produtos ({productIds.length} selecionados)
              </label>
              <button
                onClick={() => setShowSelector(true)}
                className="w-full px-4 py-2 rounded-lg border-2 border-dashed text-sm"
                style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
              >
                {productIds.length > 0 ? 'Alterar seleção de produtos' : 'Selecionar produtos'}
              </button>
            </div>

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
                {classification ? 'Salvar Classificação' : 'Criar Classificação'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Copy ProductSelector**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
cp components/grupos/ProductSelector.tsx components/classificacoes/ProductSelector.tsx
```

- [ ] **Step 4: Commit**

```bash
git add components/classificacoes/
git commit -m "feat: add classificacoes components (ClassificationList, ClassificationForm, ProductSelector)"
```

---

## Task 4: Create app/classificacoes/page.tsx

**Files:**
- Create: `app/classificacoes/page.tsx`

- [ ] **Step 1: Create `app/classificacoes/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ClassificationList } from '@/components/classificacoes/ClassificationList'
import { ClassificationForm } from '@/components/classificacoes/ClassificationForm'
import { useProductStore } from '@/stores/productStore'
import { useClassificationStore } from '@/stores/classificationStore'
import type { Classification } from '@/types'

export default function ClassificacoesPage() {
  const [openForm, setOpenForm] = useState(false)
  const [editingClassification, setEditingClassification] = useState<Classification | null>(null)
  const { products, fetchFromMetalShopping, isLoading, error } = useProductStore()
  const { classifications } = useClassificationStore()

  const handleEdit = (c: Classification) => {
    setEditingClassification(c)
    setOpenForm(true)
  }

  const handleNew = () => {
    setEditingClassification(null)
    setOpenForm(true)
  }

  const handleFormClose = (open: boolean) => {
    setOpenForm(open)
    if (!open) setEditingClassification(null)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Classificações"
        subtitle={
          classifications.length > 0
            ? `${classifications.length} classificaç${classifications.length !== 1 ? 'ões' : 'ão'} criada${classifications.length !== 1 ? 's' : ''}`
            : 'Crie classificações personalizadas com contexto para análise IA'
        }
        actions={
          <button
            onClick={handleNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Plus size={16} />
            Nova Classificação
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-6">
          {products.length === 0 && (
            <div
              className="p-5 rounded-lg border"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
            >
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Catálogo não carregado
              </p>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Carregue os produtos do MetalShopping antes de criar classificações.
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

          <ClassificationList onNewClassification={handleNew} onEditClassification={handleEdit} />
        </div>
      </div>

      <ClassificationForm
        classification={editingClassification}
        open={openForm}
        onOpenChange={handleFormClose}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/classificacoes/
git commit -m "feat: add /classificacoes page"
```

---

## Task 5: Atomic swap — update ALL groupStore references + delete old files

**This is the critical task.** All files that import `@/stores/groupStore` must be updated in one shot before the old file can be deleted. The files are: `Sidebar.tsx`, `app/grupos/page.tsx`, `app/simulador/page.tsx`, `components/simulador/MarginTable.tsx`, `app/concorrencia/page.tsx`, `app/analise-ia/page.tsx`.

**Files:**
- Modify: `components/layout/Sidebar.tsx`
- Modify: `app/grupos/page.tsx` (temporary classificationStore wiring; replaced in Task 10)
- Modify: `app/simulador/page.tsx`
- Modify: `components/simulador/MarginTable.tsx`
- Modify: `app/concorrencia/page.tsx`
- Modify: `app/analise-ia/page.tsx`
- Delete: `stores/groupStore.ts`
- Delete: `components/grupos/GroupList.tsx`
- Delete: `components/grupos/GroupForm.tsx`

### 5a: Update `components/layout/Sidebar.tsx`

- [ ] **Step 1: Replace groupStore import and update SidebarStatusMap**

Replace:
```typescript
import { useGroupStore } from '@/stores/groupStore'
```
with:
```typescript
import { useClassificationStore } from '@/stores/classificationStore'
import { Tag } from 'lucide-react'
```
(Add `Tag` to the existing `lucide-react` import line.)

Replace the full `SidebarStatusMap` type:
```typescript
type SidebarStatusMap = {
  catalogo: StatusValue
  marketplaces: StatusValue
  simulador: StatusValue
  concorrencia: StatusValue
  grupos: StatusValue
  classificacoes: StatusValue
  analiseIa: StatusValue
  dashboard: StatusValue
  publicar: StatusValue
}
```

Replace `useSidebarStatus`:
```typescript
function useSidebarStatus(): SidebarStatusMap {
  const { products, isLoaded } = useProductStore()
  const { marketplaces } = useMarketplaceStore()
  const { competitorPrices, aiAnalyses, publications } = useAnalysisStore()
  const { classifications } = useClassificationStore()

  const hasProducts = products.length > 0
  const activeMarketplaces = marketplaces.filter((m) => m.active).length
  const hasCompetitors = competitorPrices.length > 0
  const hasAnalyses = aiAnalyses.length > 0
  const hasPublications = publications.length > 0
  const publishedCount = publications.filter((p) => p.status === 'published').length

  return {
    catalogo: !isLoaded ? 'idle' : hasProducts ? 'complete' : 'progress',
    marketplaces: activeMarketplaces === 0 ? 'idle' : activeMarketplaces < 3 ? 'progress' : 'complete',
    simulador: !hasProducts ? 'idle' : 'complete',
    concorrencia: !hasProducts ? 'idle' : hasCompetitors ? 'complete' : 'progress',
    grupos: 'idle',                                                    // updated in Task 9
    classificacoes: classifications.length === 0 ? 'idle' : 'complete',
    analiseIa: !hasProducts ? 'idle' : hasAnalyses ? 'complete' : 'progress',
    dashboard: !hasProducts ? 'idle' : hasAnalyses ? 'complete' : 'progress',
    publicar: !hasPublications ? 'idle' : publishedCount > 0 ? 'complete' : 'progress',
  }
}
```

Replace `NAV_ITEMS` (add Classificações at 6, renumber 6→7, 7→8, 8→9):
```typescript
const NAV_ITEMS: NavItem[] = [
  { number: 1, icon: Package,    label: 'Catálogo',       href: '/catalogo',       statusKey: 'catalogo' },
  { number: 2, icon: Store,      label: 'Marketplaces',   href: '/marketplaces',   statusKey: 'marketplaces' },
  { number: 3, icon: DollarSign, label: 'Simulador',      href: '/simulador',      statusKey: 'simulador' },
  { number: 4, icon: Search,     label: 'Concorrência',   href: '/concorrencia',   statusKey: 'concorrencia' },
  { number: 5, icon: Grid3x3,    label: 'Grupos',         href: '/grupos',         statusKey: 'grupos' },
  { number: 6, icon: Tag,        label: 'Classificações', href: '/classificacoes', statusKey: 'classificacoes' },
  { number: 7, icon: Bot,        label: 'Análise IA',     href: '/analise-ia',     statusKey: 'analiseIa' },
  { number: 8, icon: BarChart3,  label: 'Dashboard',      href: '/dashboard',      statusKey: 'dashboard' },
  { number: 9, icon: Rocket,     label: 'Publicar',       href: '/publicar',       statusKey: 'publicar' },
]
```

### 5b: Update `app/grupos/page.tsx` (temporary — points to classificationStore until Task 10 rewrites it)

- [ ] **Step 2: Update `app/grupos/page.tsx`**

Replace all `group`/`Group` references with `classification`/`Classification`, all store imports with classificationStore, all component imports with the new `components/classificacoes/` paths. This is a temporary state so it compiles — Task 10 replaces this file entirely.

The file should look exactly like `app/classificacoes/page.tsx` but with title "Grupos (→ ver Classificações)" — actually, the cleanest temporary state is just to make it redirect or show a placeholder. Use this minimal version:

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GruposRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/classificacoes') }, [router])
  return null
}
```

This avoids any Group/Classification confusion in the temporary state and will be replaced in Task 10.

### 5c: Update `app/simulador/page.tsx`

- [ ] **Step 3: Replace groupStore with classificationStore in `app/simulador/page.tsx`**

```typescript
// Replace import:
import { useClassificationStore } from '@/stores/classificationStore'

// Replace in component body:
const { classifications } = useClassificationStore()
const [selectedClassificationId, setSelectedClassificationId] = useState<string | null>(null)

const scopedProducts = selectedClassificationId
  ? products.filter((p) => {
      const c = classifications.find((c) => c.id === selectedClassificationId)
      return c?.productIds.includes(p.id)
    })
  : products

const selectedClassificationName =
  selectedClassificationId && classifications.find((c) => c.id === selectedClassificationId)
    ? classifications.find((c) => c.id === selectedClassificationId)!.name
    : 'Todos os Produtos'
```

Update the subtitle to use `scopedProducts.length`. Update the JSX dropdown (label "Classificação:", options from `classifications`). Pass `classificationId={selectedClassificationId}` to `<MarginTable>`.

Full updated JSX for the selector section:
```tsx
{/* Classification Selector */}
<div className="mb-6 flex items-center gap-4">
  <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
    Classificação:
  </label>
  <select
    value={selectedClassificationId || ''}
    onChange={(e) => setSelectedClassificationId(e.target.value || null)}
    className="px-3 py-2 rounded-lg border transition-colors"
    style={{
      borderColor: 'var(--border-color)',
      backgroundColor: 'var(--bg-tertiary)',
      color: 'var(--text-primary)',
    }}
  >
    <option value="">Todos os Produtos</option>
    {classifications.map((c) => (
      <option key={c.id} value={c.id}>{c.name}</option>
    ))}
  </select>
  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
    {selectedClassificationName}
  </span>
</div>

<MarginTable classificationId={selectedClassificationId} />
```

### 5d: Update `components/simulador/MarginTable.tsx`

- [ ] **Step 4: Replace groupStore with classificationStore in MarginTable**

```typescript
// Replace import:
import { useClassificationStore } from '@/stores/classificationStore'

// Replace interface:
interface MarginTableProps {
  classificationId?: string | null
}

export function MarginTable({ classificationId }: MarginTableProps) {
  const allProducts = useProductStore((s) => s.products)
  const marketplaces = useMarketplaceStore((s) => s.marketplaces)
  const classifications = useClassificationStore((s) => s.classifications)

  const products = useMemo(() => {
    if (!classificationId) return allProducts
    const c = classifications.find((c) => c.id === classificationId)
    return allProducts.filter((p) => c?.productIds.includes(p.id))
  }, [allProducts, classificationId, classifications])
```

### 5e: Update `app/concorrencia/page.tsx`

- [ ] **Step 5: Replace groupStore with classificationStore in `app/concorrencia/page.tsx`**

Replace:
```typescript
import { useGroupStore } from '@/stores/groupStore'
const { groups } = useGroupStore()
const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
const products = selectedGroupId
  ? allProducts.filter((p) => { const group = groups.find((g) => g.id === selectedGroupId); return group?.productIds.includes(p.id) })
  : allProducts
```

With:
```typescript
import { useClassificationStore } from '@/stores/classificationStore'
const { classifications } = useClassificationStore()
const [selectedClassificationId, setSelectedClassificationId] = useState<string | null>(null)
const products = selectedClassificationId
  ? allProducts.filter((p) => {
      const c = classifications.find((c) => c.id === selectedClassificationId)
      return c?.productIds.includes(p.id)
    })
  : allProducts
```

Update JSX dropdown label to "Classificação:", options from `classifications`, onChange sets `selectedClassificationId`.

### 5f: Update `app/analise-ia/page.tsx`

- [ ] **Step 6: Update `app/analise-ia/page.tsx`**

The file already imports `useGroupStore` and uses `groups`/`selectedGroupId`. The classification selector here is the full scoping + AI context in one. After this task it uses classificationStore for both scoping AND AI context (same as before, just renamed).

Replace:
```typescript
import { useGroupStore } from '@/stores/groupStore'
const { groups } = useGroupStore()
const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
const selectedGroup = groups.find((g) => g.id === selectedGroupId)
const products = selectedGroupId ? allProducts.filter((p) => selectedGroup?.productIds.includes(p.id)) : allProducts
```

With:
```typescript
import { useClassificationStore } from '@/stores/classificationStore'
const { classifications } = useClassificationStore()
const [selectedClassificationId, setSelectedClassificationId] = useState<string | null>(null)
const selectedClassification = classifications.find((c) => c.id === selectedClassificationId)
const products = selectedClassificationId
  ? allProducts.filter((p) => selectedClassification?.productIds.includes(p.id))
  : allProducts
```

In the fetch body, keep `groupAiContext` field name, just update the source:
```typescript
body: JSON.stringify({
  product,
  margins: productMargins,
  competitors,
  groupAiContext: selectedClassification?.aiContext ?? null,
}),
```

Update JSX dropdown: label "Classificação:", options from `classifications`, onChange sets `selectedClassificationId` and resets `selectedIds`.

### 5g: Delete old files

- [ ] **Step 7: Delete old groupStore and old components/grupos list+form**

```bash
rm stores/groupStore.ts
rm components/grupos/GroupList.tsx
rm components/grupos/GroupForm.tsx
```

(Keep `components/grupos/ProductSelector.tsx` — it's still used by ClassificationForm via the copy in classificacoes, and will be deleted later when replaced by the taxonomy grupos page in Task 10.)

- [ ] **Step 8: Verify build**

```bash
bun run build 2>&1 | tail -20
```

Expected: ✓ Compiled successfully. Routes include `/grupos` (redirect), `/classificacoes`, `/analise-ia`, `/simulador`, `/concorrencia`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: swap Group→Classification across all analysis screens + sidebar; delete old groupStore"
```

---

## Task 6: Add taxonomy join to product query + populate category

**Files:**
- Modify: `lib/metalshopping-client.ts`
- Modify: `lib/product-mapper.ts`

- [ ] **Step 1: Update `RawProductRow` in `lib/metalshopping-client.ts`**

Add `taxonomy_group` field:
```typescript
export interface RawProductRow {
  product_id: string
  sku: string
  name: string
  status: string
  cost?: number
  base_price?: number
  stock?: number
  referencia?: string
  ean?: string
  taxonomy_group?: string   // catalog_taxonomy_nodes.name via primary_taxonomy_node_id
}
```

- [ ] **Step 2: Update `BASE_SELECT` to join catalog_taxonomy_nodes**

Replace the current `BASE_SELECT`:
```typescript
const BASE_SELECT = `
  SELECT
    cp.product_id,
    cp.sku,
    cp.name,
    cp.status,
    COALESCE(ppp.replacement_cost_amount, ppp.average_cost_amount, 0) as cost,
    COALESCE(ppp.price_amount, 0) as base_price,
    COALESCE(ipp.on_hand_quantity, 0) as stock,
    MAX(CASE WHEN pi.identifier_type = 'reference' THEN pi.identifier_value END) as referencia,
    MAX(CASE WHEN pi.identifier_type = 'ean' THEN pi.identifier_value END) as ean,
    MAX(ctn.name) as taxonomy_group
  FROM catalog_products cp
  LEFT JOIN pricing_product_prices ppp ON cp.product_id = ppp.product_id
    AND ppp.pricing_status = 'active'
    AND ppp.effective_to IS NULL
  LEFT JOIN inventory_product_positions ipp ON cp.product_id = ipp.product_id
    AND ipp.position_status = 'active'
    AND ipp.effective_to IS NULL
  LEFT JOIN catalog_product_identifiers pi ON cp.product_id = pi.product_id
  LEFT JOIN catalog_taxonomy_nodes ctn ON cp.primary_taxonomy_node_id = ctn.taxonomy_node_id
`
```

- [ ] **Step 3: Update `BASE_GROUP_BY` to include `ctn.name`**

```typescript
const BASE_GROUP_BY = `
  GROUP BY
    cp.product_id,
    cp.sku,
    cp.name,
    cp.status,
    ppp.replacement_cost_amount,
    ppp.average_cost_amount,
    ppp.price_amount,
    ipp.on_hand_quantity,
    ctn.name
`
```

- [ ] **Step 4: Add `fetchTaxonomyGroups` to `lib/metalshopping-client.ts`**

Append at the end of the file:

```typescript
export interface RawTaxonomyGroupRow {
  taxonomy_node_id: string
  name: string
  level: number
  level_label: string
  product_ids: string[]
}

/**
 * Fetch all active taxonomy nodes with their associated active product IDs
 */
export async function fetchTaxonomyGroups(tenantId?: string): Promise<RawTaxonomyGroupRow[]> {
  const sql = `
    SELECT
      n.taxonomy_node_id,
      n.name,
      n.level,
      COALESCE(ld.label, 'Grupo') as level_label,
      COALESCE(
        array_agg(cp.product_id ORDER BY cp.product_id) FILTER (WHERE cp.product_id IS NOT NULL),
        '{}'::text[]
      ) as product_ids
    FROM catalog_taxonomy_nodes n
    LEFT JOIN catalog_taxonomy_level_defs ld
      ON ld.level = n.level AND ld.tenant_id = n.tenant_id
    LEFT JOIN catalog_products cp
      ON cp.primary_taxonomy_node_id = n.taxonomy_node_id
      AND cp.status = 'active'
    WHERE n.is_active = true
    GROUP BY n.taxonomy_node_id, n.name, n.level, ld.label
    ORDER BY n.level, n.name
  `
  const result = await query(sql, [], tenantId)
  return result.rows as RawTaxonomyGroupRow[]
}
```

- [ ] **Step 5: Update `lib/product-mapper.ts` — category from taxonomy**

Change:
```typescript
category: 'Uncategorized', // TODO: fetch from catalog_categories if available
```
to:
```typescript
category: row.taxonomy_group || 'Sem Grupo',
```

- [ ] **Step 6: Verify build**

```bash
bun run build 2>&1 | tail -20
```

Expected: ✓ Compiled successfully. No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add lib/metalshopping-client.ts lib/product-mapper.ts
git commit -m "feat: populate product.category from taxonomy; add fetchTaxonomyGroups()"
```

---

## Task 7: Create /api/taxonomy endpoint

**Files:**
- Create: `app/api/taxonomy/route.ts`

- [ ] **Step 1: Create `app/api/taxonomy/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { fetchTaxonomyGroups, type RawTaxonomyGroupRow } from '@/lib/metalshopping-client'
import type { Group } from '@/types'

function mapRow(row: RawTaxonomyGroupRow): Group {
  return {
    id: row.taxonomy_node_id,
    name: row.name,
    level: row.level,
    levelLabel: row.level_label,
    productIds: row.product_ids,
    syncedAt: new Date().toISOString(),
  }
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get('tenantId') ?? undefined
    const rows = await fetchTaxonomyGroups(tenantId)
    return NextResponse.json(rows.map(mapRow))
  } catch (error) {
    console.error('Failed to fetch taxonomy groups:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/taxonomy/
git commit -m "feat: add /api/taxonomy endpoint"
```

---

## Task 8: Create taxonomy groupStore

**Files:**
- Create: `stores/groupStore.ts`

- [ ] **Step 1: Create `stores/groupStore.ts`**

```typescript
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Group } from '@/types'

interface GroupState {
  groups: Group[]
  selectedGroupId: string | null
  isLoading: boolean
  error: string | null
  fetchGroups: (tenantId?: string) => Promise<void>
  selectGroup: (groupId: string | null) => void
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set) => ({
      groups: [],
      selectedGroupId: null,
      isLoading: false,
      error: null,

      fetchGroups: async (tenantId?: string) => {
        set({ isLoading: true, error: null })
        try {
          const url = tenantId ? `/api/taxonomy?tenantId=${tenantId}` : '/api/taxonomy'
          const res = await fetch(url)
          if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error ?? 'Failed to fetch taxonomy groups')
          }
          const groups: Group[] = await res.json()
          set({ groups, isLoading: false })
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Unknown error',
            isLoading: false,
          })
        }
      },

      selectGroup: (groupId) => set({ selectedGroupId: groupId }),
    }),
    { name: 'mc-taxonomy-groups' }
  )
)
```

- [ ] **Step 2: Update sidebar to use groupStore for `grupos` status**

In `components/layout/Sidebar.tsx`, add the groupStore import:
```typescript
import { useGroupStore } from '@/stores/groupStore'
```

In `useSidebarStatus`, add:
```typescript
const { groups } = useGroupStore()
```

Change:
```typescript
grupos: 'idle',  // was placeholder
```
to:
```typescript
grupos: groups.length === 0 ? 'idle' : 'complete',
```

- [ ] **Step 3: Commit**

```bash
git add stores/groupStore.ts components/layout/Sidebar.tsx
git commit -m "feat: add taxonomy groupStore; wire grupos status in sidebar"
```

---

## Task 9: Create /grupos page (taxonomy groups)

**Files:**
- Create: `components/grupos/GroupCard.tsx`
- Modify: `app/grupos/page.tsx` (full rewrite — replaces the temporary redirect)
- Delete: `components/grupos/ProductSelector.tsx` (no longer needed here)

- [ ] **Step 1: Create `components/grupos/GroupCard.tsx`**

```typescript
'use client'

import type { Group } from '@/types'

interface GroupCardProps {
  group: Group
}

export function GroupCard({ group }: GroupCardProps) {
  const count = group.productIds.length

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-lg border"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
    >
      <div className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {group.name}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {count} produto{count !== 1 ? 's' : ''}
        </span>
      </div>
      <span
        className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full ml-4"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-color)',
        }}
      >
        {group.levelLabel}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `app/grupos/page.tsx`**

```typescript
'use client'

import { PageHeader } from '@/components/layout/PageHeader'
import { GroupCard } from '@/components/grupos/GroupCard'
import { useGroupStore } from '@/stores/groupStore'

export default function GruposPage() {
  const { groups, fetchGroups, isLoading, error } = useGroupStore()

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Grupos"
        subtitle={
          groups.length > 0
            ? `${groups.length} grupo${groups.length !== 1 ? 's' : ''} importado${groups.length !== 1 ? 's' : ''} do MetalShopping`
            : 'Importe os grupos de produtos da taxonomia MetalShopping'
        }
        actions={
          <button
            onClick={() => fetchGroups()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            {isLoading
              ? 'Importando...'
              : groups.length > 0
              ? 'Reimportar do MetalShopping'
              : 'Importar do MetalShopping'}
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-2">
          {error && (
            <p
              className="text-sm p-3 rounded-lg"
              style={{ color: 'var(--accent-danger)', backgroundColor: 'rgba(239,68,68,0.08)' }}
            >
              {error}
            </p>
          )}

          {groups.length === 0 && !isLoading && !error && (
            <div className="text-center py-16">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Clique em "Importar do MetalShopping" para carregar os grupos de produtos da taxonomia.
              </p>
            </div>
          )}

          {groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Delete old ProductSelector from components/grupos (no longer needed there)**

```bash
rm components/grupos/ProductSelector.tsx
```

- [ ] **Step 4: Verify build**

```bash
bun run build 2>&1 | tail -20
```

Expected: ✓ Compiled. Routes include `/grupos`, `/classificacoes`, `/api/taxonomy`.

- [ ] **Step 5: Commit**

```bash
git add app/grupos/ components/grupos/
git commit -m "feat: /grupos page shows taxonomy groups with import button"
```

---

## Task 10: Wire taxonomy Groups into analysis screens

Analysis screens currently use `classificationStore` for product scoping. Replace with `groupStore` (taxonomy) for scoping. In Análise IA only, add a second dropdown for `classificationStore` to provide AI context.

**Files:**
- Modify: `app/simulador/page.tsx`
- Modify: `components/simulador/MarginTable.tsx`
- Modify: `app/concorrencia/page.tsx`
- Modify: `app/analise-ia/page.tsx`

### 10a: Update `app/simulador/page.tsx`

- [ ] **Step 1: Replace classificationStore with groupStore**

```typescript
// Replace:
import { useClassificationStore } from '@/stores/classificationStore'
const { classifications } = useClassificationStore()
const [selectedClassificationId, setSelectedClassificationId] = useState<string | null>(null)

const scopedProducts = selectedClassificationId
  ? products.filter((p) => {
      const c = classifications.find((c) => c.id === selectedClassificationId)
      return c?.productIds.includes(p.id)
    })
  : products
const selectedClassificationName = ...

// With:
import { useGroupStore } from '@/stores/groupStore'
const { groups } = useGroupStore()
const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

const scopedProducts = selectedGroupId
  ? products.filter((p) => {
      const group = groups.find((g) => g.id === selectedGroupId)
      return group?.productIds.includes(p.id)
    })
  : products
const selectedGroupName =
  selectedGroupId && groups.find((g) => g.id === selectedGroupId)
    ? groups.find((g) => g.id === selectedGroupId)!.name
    : 'Todos os Produtos'
```

Update JSX dropdown:
```tsx
{/* Group Selector */}
<div className="mb-6 flex items-center gap-4">
  <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
    Grupo:
  </label>
  <select
    value={selectedGroupId || ''}
    onChange={(e) => setSelectedGroupId(e.target.value || null)}
    className="px-3 py-2 rounded-lg border transition-colors"
    style={{
      borderColor: 'var(--border-color)',
      backgroundColor: 'var(--bg-tertiary)',
      color: 'var(--text-primary)',
    }}
  >
    <option value="">Todos os Produtos</option>
    {groups.map((g) => (
      <option key={g.id} value={g.id}>{g.name}</option>
    ))}
  </select>
  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
    {selectedGroupName}
  </span>
</div>
<MarginTable groupId={selectedGroupId} />
```

### 10b: Update `components/simulador/MarginTable.tsx`

- [ ] **Step 2: Replace classificationStore with groupStore**

```typescript
import { useGroupStore } from '@/stores/groupStore'

interface MarginTableProps {
  groupId?: string | null
}

export function MarginTable({ groupId }: MarginTableProps) {
  const allProducts = useProductStore((s) => s.products)
  const marketplaces = useMarketplaceStore((s) => s.marketplaces)
  const groups = useGroupStore((s) => s.groups)

  const products = useMemo(() => {
    if (!groupId) return allProducts
    const group = groups.find((g) => g.id === groupId)
    return allProducts.filter((p) => group?.productIds.includes(p.id))
  }, [allProducts, groupId, groups])
```

### 10c: Update `app/concorrencia/page.tsx`

- [ ] **Step 3: Replace classificationStore with groupStore**

```typescript
import { useGroupStore } from '@/stores/groupStore'

// In component:
const { groups } = useGroupStore()
const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
const products = selectedGroupId
  ? allProducts.filter((p) => {
      const group = groups.find((g) => g.id === selectedGroupId)
      return group?.productIds.includes(p.id)
    })
  : allProducts
```

Update JSX: label "Grupo:", options from `groups`, onChange sets `selectedGroupId` and resets `selectedProductId`.

### 10d: Update `app/analise-ia/page.tsx`

- [ ] **Step 4: Two selectors — Group (scope) + Classification (AI context)**

```typescript
import { useGroupStore } from '@/stores/groupStore'
import { useClassificationStore } from '@/stores/classificationStore'

// In component:
const { groups } = useGroupStore()
const { classifications } = useClassificationStore()
const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
const [selectedClassificationId, setSelectedClassificationId] = useState<string | null>(null)

const selectedClassification = classifications.find((c) => c.id === selectedClassificationId)

const products = selectedGroupId
  ? allProducts.filter((p) => {
      const group = groups.find((g) => g.id === selectedGroupId)
      return group?.productIds.includes(p.id)
    })
  : allProducts
```

In the fetch body:
```typescript
body: JSON.stringify({
  product,
  margins: productMargins,
  competitors,
  groupAiContext: selectedClassification?.aiContext ?? null,
}),
```

Replace the single selector JSX with two selectors:
```tsx
{/* Group Selector (product scoping) */}
<div className="flex items-center gap-4">
  <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
    Grupo:
  </label>
  <select
    value={selectedGroupId || ''}
    onChange={(e) => { setSelectedGroupId(e.target.value || null); setSelectedIds(new Set()) }}
    className="px-3 py-2 rounded-lg border transition-colors"
    style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
  >
    <option value="">Todos os Produtos</option>
    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
  </select>
</div>

{/* Classification Selector (AI context only) */}
<div className="flex items-center gap-4">
  <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
    <span className="inline-flex items-center gap-1">
      Contexto IA:
    </span>
  </label>
  <select
    value={selectedClassificationId || ''}
    onChange={(e) => setSelectedClassificationId(e.target.value || null)}
    className="px-3 py-2 rounded-lg border transition-colors"
    style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
  >
    <option value="">Sem contexto adicional</option>
    {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
</div>
```

- [ ] **Step 5: Final build verification**

```bash
bun run build 2>&1 | tail -30
```

Expected: ✓ Compiled successfully. Routes visible: `/grupos`, `/classificacoes`, `/api/taxonomy`, all existing routes.

- [ ] **Step 6: Commit**

```bash
git add app/simulador/page.tsx components/simulador/MarginTable.tsx app/concorrencia/page.tsx app/analise-ia/page.tsx
git commit -m "feat: analysis screens scope by taxonomy Group; Análise IA adds Classification AI context"
```

---

## Self-Review

**Spec coverage:**
- ✅ "taxonomy.leaf label that are our groups" → Tasks 6+7+8+9 — `fetchTaxonomyGroups()` queries `catalog_taxonomy_nodes`, `/api/taxonomy` returns 99 nodes, `/grupos` page + import button
- ✅ "import for us as group" → Task 8+9 — `useGroupStore.fetchGroups()` fetches from `/api/taxonomy`, caches in `mc-taxonomy-groups`
- ✅ "what we use as group today, will be classification" → Tasks 1–5 — full rename Group→Classification in types, store (`mc-classifications`), components, pages, sidebar
- ✅ "AI reads description" → Task 10 — `selectedClassification?.aiContext` injected as `groupAiContext` into GPT-4o prompt in Análise IA
- ✅ Product `category` from taxonomy — Task 6 — `taxonomy_group` column from taxonomy join, mapped to `product.category`
- ✅ Sidebar updated — Task 5 — "Grupos" stays at 5, "Classificações" added at 6, rest renumbered to 7–9

**Placeholder scan:** None found.

**Type consistency:**
- `Classification` fields (`id, name, aiContext, productIds, createdAt, updatedAt`) consistent across `classificationStore`, `ClassificationForm`, `ClassificationList`, `ClassificacoesPage`
- `Group` fields (`id, name, level, levelLabel, productIds, syncedAt`) from `RawTaxonomyGroupRow` mapper → `groupStore` → analysis screen selectors
- `groupAiContext` field in `/api/analyze` receives `selectedClassification?.aiContext` — field name unchanged so no route edits needed
- `classificationId` prop on `MarginTable` (Task 5d) replaced by `groupId` (Task 10b) — both are `string | null`
