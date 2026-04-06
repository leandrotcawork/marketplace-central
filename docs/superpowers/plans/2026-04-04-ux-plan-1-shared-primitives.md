# UX Redesign — Plan 1: Shared UI Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create two reusable UI primitives — `PaginatedTable` and `DetailPanel` — in `packages/ui/` that will be used by all three redesigned pages.

**Architecture:** Both components are pure, stateless-except-for-page-index primitives added to `packages/ui/src/`. `PaginatedTable` handles client-side pagination for any array of items via render props. `DetailPanel` is a fixed right-side slide-over drawer. Both are exported from `packages/ui/src/index.ts`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest + Testing Library, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-04-ux-redesign-products-vtex-simulator.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/ui/src/PaginatedTable.tsx` | Generic paginated table wrapper (render props) |
| Create | `packages/ui/src/PaginatedTable.test.tsx` | Unit tests for PaginatedTable |
| Create | `packages/ui/src/DetailPanel.tsx` | Right-side slide-over panel |
| Create | `packages/ui/src/DetailPanel.test.tsx` | Unit tests for DetailPanel |
| Modify | `packages/ui/src/index.ts` | Export both new components |

---

### Task 1: PaginatedTable Component

**Files:**
- Create: `packages/ui/src/PaginatedTable.tsx`
- Create: `packages/ui/src/PaginatedTable.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/PaginatedTable.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaginatedTable } from "./PaginatedTable";

const items = Array.from({ length: 60 }, (_, i) => ({ id: `item-${i}`, name: `Item ${i}` }));

describe("PaginatedTable", () => {
  it("renders only first pageSize items by default", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    expect(screen.getByText("Item 0")).toBeInTheDocument();
    expect(screen.getByText("Item 24")).toBeInTheDocument();
    expect(screen.queryByText("Item 25")).not.toBeInTheDocument();
  });

  it("shows correct page count", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
  });

  it("navigates to next page on Next click", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByText("Item 0")).not.toBeInTheDocument();
    expect(screen.getByText("Item 25")).toBeInTheDocument();
    expect(screen.getByText("Item 49")).toBeInTheDocument();
    expect(screen.getByText(/page 2 of 3/i)).toBeInTheDocument();
  });

  it("disables Prev button on first page", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
  });

  it("disables Next button on last page", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("shows total count", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    expect(screen.getByText(/showing 1–25 of 60/i)).toBeInTheDocument();
  });

  it("renders custom empty state when items is empty", () => {
    render(
      <PaginatedTable
        items={[]}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item: any) => <tr key={item.id}><td>{item.name}</td></tr>}
        emptyState={<p>Nothing here</p>}
      />
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("resets to page 1 when items change", () => {
    const { rerender } = render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/page 2 of 3/i)).toBeInTheDocument();

    const newItems = items.slice(0, 10);
    rerender(
      <PaginatedTable
        items={newItems}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    expect(screen.getByText(/page 1 of 1/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npx vitest run packages/ui/src/PaginatedTable.test.tsx
```

Expected: FAIL — `PaginatedTable` module not found.

- [ ] **Step 3: Implement PaginatedTable**

Create `packages/ui/src/PaginatedTable.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginatedTableProps<T> {
  items: T[];
  pageSize?: number;
  renderHeader: () => React.ReactNode;
  renderRow: (item: T, index: number) => React.ReactNode;
  emptyState?: React.ReactNode;
  loading?: boolean;
}

export function PaginatedTable<T>({
  items,
  pageSize = 25,
  renderHeader,
  renderRow,
  emptyState,
  loading = false,
}: PaginatedTableProps<T>) {
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the items array identity or length changes
  useEffect(() => {
    setPage(1);
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, items.length);
  const pageItems = items.slice(start, end);

  const handlePrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const handleNext = useCallback(() => setPage((p) => Math.min(totalPages, p + 1)), [totalPages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-blue-600 mr-3" />
        Loading...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-400">
        {emptyState ?? <p>No items found.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            {renderHeader()}
          </thead>
          <tbody>
            {pageItems.map((item, i) => renderRow(item, start + i))}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-slate-500">
          Showing {start + 1}–{end} of {items.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            aria-label="Prev page"
            onClick={handlePrev}
            disabled={safePage === 1}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          <span className="text-xs text-slate-600 font-medium min-w-[80px] text-center">
            Page {safePage} of {totalPages}
          </span>
          <button
            aria-label="Next page"
            onClick={handleNext}
            disabled={safePage === totalPages}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/ui/src/PaginatedTable.test.tsx
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/PaginatedTable.tsx packages/ui/src/PaginatedTable.test.tsx
git commit -m "feat(ui): add PaginatedTable shared component"
```

---

### Task 2: DetailPanel Component

**Files:**
- Create: `packages/ui/src/DetailPanel.tsx`
- Create: `packages/ui/src/DetailPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/DetailPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DetailPanel } from "./DetailPanel";

describe("DetailPanel", () => {
  it("renders nothing when open is false", () => {
    render(
      <DetailPanel open={false} onClose={vi.fn()} title="Edit Product">
        <p>Panel content</p>
      </DetailPanel>
    );
    expect(screen.queryByText("Edit Product")).not.toBeInTheDocument();
    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();
  });

  it("renders title and children when open is true", () => {
    render(
      <DetailPanel open={true} onClose={vi.fn()} title="Edit Product">
        <p>Panel content</p>
      </DetailPanel>
    );
    expect(screen.getByText("Edit Product")).toBeInTheDocument();
    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(
      <DetailPanel open={true} onClose={vi.fn()} title="Edit Product" subtitle="SKU-001">
        <p>content</p>
      </DetailPanel>
    );
    expect(screen.getByText("SKU-001")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <DetailPanel open={true} onClose={onClose} title="Edit Product">
        <p>content</p>
      </DetailPanel>
    );
    fireEvent.click(screen.getByLabelText("Close panel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape key pressed", () => {
    const onClose = vi.fn();
    render(
      <DetailPanel open={true} onClose={onClose} title="Edit Product">
        <p>content</p>
      </DetailPanel>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose on Escape when panel is closed", () => {
    const onClose = vi.fn();
    render(
      <DetailPanel open={false} onClose={onClose} title="Edit Product">
        <p>content</p>
      </DetailPanel>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders footer when provided", () => {
    render(
      <DetailPanel open={true} onClose={vi.fn()} title="Edit Product" footer={<button>Save</button>}>
        <p>content</p>
      </DetailPanel>
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/ui/src/DetailPanel.test.tsx
```

Expected: FAIL — `DetailPanel` module not found.

- [ ] **Step 3: Implement DetailPanel**

Create `packages/ui/src/DetailPanel.tsx`:

```tsx
import { useEffect } from "react";
import { X } from "lucide-react";

export interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

export function DetailPanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 380,
}: DetailPanelProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="complementary"
      aria-label={title}
      style={{ width }}
      className="fixed right-0 top-0 bottom-0 bg-white border-l border-slate-200 shadow-xl flex flex-col z-40"
    >
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500 truncate">{subtitle}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="ml-3 shrink-0 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          {footer}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/ui/src/DetailPanel.test.tsx
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/DetailPanel.tsx packages/ui/src/DetailPanel.test.tsx
git commit -m "feat(ui): add DetailPanel slide-over component"
```

---

### Task 3: Export from packages/ui

**Files:**
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Add exports**

Replace the contents of `packages/ui/src/index.ts` with:

```ts
export * from "./Button";
export * from "./SurfaceCard";
export * from "./Badge";
export * from "./StatCard";
export * from "./PaginatedTable";
export * from "./DetailPanel";
export { ProductPicker } from "./ProductPicker";
export type { ProductPickerProps, CatalogProduct, TaxonomyNode, Classification } from "./ProductPicker";
```

- [ ] **Step 2: Verify all tests still pass**

```bash
npx vitest run packages/ui/
```

Expected: All tests PASS (PaginatedTable × 8, DetailPanel × 7, ProductPicker × 6).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "feat(ui): export PaginatedTable and DetailPanel"
```
