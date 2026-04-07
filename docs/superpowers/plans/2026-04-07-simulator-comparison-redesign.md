# Simulator Comparison Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulator's collapsed marketplace columns with always-visible marketplace comparison cards per product row, preserving current batch simulation behavior.

**Architecture:** Keep existing data flow (`sdk-runtime` -> `PricingSimulatorPage`) and result indexing (`product_id::policy_id`). Redesign only presentation and interaction in `PricingSimulatorPage.tsx`, with test-first updates in `PricingSimulatorPage.test.tsx`. No backend, OpenAPI, or SDK contract changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest, Testing Library, `@marketplace-central/ui`.

---

## File Structure

- Modify: `packages/feature-simulator/src/PricingSimulatorPage.tsx`
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`

Responsibilities:
- `PricingSimulatorPage.tsx`: render flow before/after simulation, marketplace comparison cards, inline selling-price editing behavior, global price-reference reset behavior.
- `PricingSimulatorPage.test.tsx`: user-visible behavior verification for the redesigned comparison matrix and interaction rules.

---

### Task 1: Lock the New UI Contract in Tests (Red)

**Files:**
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`
- Test: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`

- [ ] **Step 1: Add failing tests for comparison cards and financial fields**

```tsx
it("renders marketplace comparison cards after simulation run", async () => {
  const client = makeClient();
  render(<PricingSimulatorPage client={client} />);

  await screen.findByText("Product SKU-001");
  fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
  fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
  fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
  fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

  await waitFor(() => expect(client.runBatchSimulation).toHaveBeenCalledOnce());
  expect(await screen.findByText(/marketplace cost/i)).toBeInTheDocument();
  expect(screen.getByText(/shipping/i)).toBeInTheDocument();
  expect(screen.getByText(/margin before shipping/i)).toBeInTheDocument();
  expect(screen.getByText(/final margin/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Add failing test for grouped marketplace cost with commission percent**

```tsx
it("shows grouped marketplace cost with commission rate", async () => {
  const client = makeClient();
  render(<PricingSimulatorPage client={client} />);

  await screen.findByText("Product SKU-001");
  fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
  fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
  fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
  fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

  await waitFor(() => expect(client.runBatchSimulation).toHaveBeenCalledOnce());
  expect(await screen.findByText(/marketplace cost: r\$ .* \(16%\)/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Add failing test for price-reference switch clearing existing results**

```tsx
it("clears results when price reference switch changes after a run", async () => {
  const client = makeClient();
  render(<PricingSimulatorPage client={client} />);

  await screen.findByText("Product SKU-001");
  fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
  fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
  fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
  fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

  await screen.findByText(/final margin/i);
  fireEvent.click(screen.getByRole("button", { name: /toggle price source/i }));
  expect(screen.queryByText(/final margin/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run test file and verify it fails**

Run:
```bash
npx vitest run packages/feature-simulator/src/PricingSimulatorPage.test.tsx --reporter=verbose
```

Expected:
- FAIL on missing marketplace card fields
- FAIL on missing grouped marketplace cost format
- FAIL on missing clear-results behavior when toggling price source post-run

- [ ] **Step 5: Commit red tests**

```bash
git add packages/feature-simulator/src/PricingSimulatorPage.test.tsx
git commit -m "test(simulator): define comparison-card contract and reset behavior"
```

---

### Task 2: Implement Comparison Card Matrix (Green)

**Files:**
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.tsx`
- Test: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`

- [ ] **Step 1: Replace collapsed/expanded policy-column rendering with card columns**

Apply in `renderHeader` and `renderRow`:

```tsx
{hasResults && policies.map((pol) => (
  <th key={pol.policy_id} className="px-3 py-3 font-medium text-slate-600 text-left text-xs min-w-[220px]">
    {pol.policy_id}
  </th>
))}
```

```tsx
{hasResults && policies.map((pol) => {
  const item = resultMap[`${p.product_id}::${pol.policy_id}`];
  const marketplaceCost = item ? item.commission_amount + item.fixed_fee_amount : null;
  const beforeShippingAmount = item ? item.margin_amount + item.freight_amount : null;
  const beforeShippingPct = item && item.selling_price > 0 ? beforeShippingAmount! / item.selling_price : null;

  return (
    <td key={`${p.product_id}::${pol.policy_id}_card`} className="px-3 py-2 align-top">
      {item ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">{pol.policy_id}</div>
          {/* card content continues in next steps */}
        </div>
      ) : (
        <span className="text-slate-300 text-xs">—</span>
      )}
    </td>
  );
})}
```

- [ ] **Step 2: Implement full marketplace card financial fields**

Inside the card:

```tsx
<label className="block text-[11px] uppercase tracking-wide text-slate-500">Selling Price</label>
<input
  type="text"
  defaultValue={item.selling_price.toFixed(2)}
  aria-label={`Selling price ${p.sku} ${pol.policy_id}`}
  onBlur={(e) => commitOverride(p.product_id, pol.policy_id, e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") e.currentTarget.value = item.selling_price.toFixed(2);
  }}
  className="w-full px-2 py-1 text-right text-xs font-mono border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
/>

<div className="text-xs text-slate-600">
  Marketplace cost: <span className="font-mono">{fmt(marketplaceCost)}</span> ({(pol.commission_percent * 100).toFixed(0)}%)
</div>
<div className="text-xs text-slate-600">
  Shipping: <span className="font-mono">{fmt(item.freight_amount)}</span>
</div>
<div className="text-xs text-slate-600">
  Margin before shipping: <span className="font-mono">{fmt(beforeShippingAmount)}</span>
</div>
<div>
  <span className={`inline-block px-2 py-0.5 rounded font-mono text-xs font-bold ${marginBg(beforeShippingPct ?? 0)} ${marginColor(beforeShippingPct ?? 0)}`}>
    {beforeShippingPct != null ? `${(beforeShippingPct * 100).toFixed(1)}%` : "—"}
  </span>
</div>
<div className="text-xs font-semibold text-slate-700">
  Final margin: <span className="font-mono">{fmt(item.margin_amount)}</span>
</div>
<div>
  <span className={`inline-block px-2 py-0.5 rounded font-mono text-xs font-bold ${marginBg(item.margin_percent)} ${marginColor(item.margin_percent)}`}>
    {(item.margin_percent * 100).toFixed(1)}%
  </span>
</div>
```

- [ ] **Step 3: Remove legacy expand/collapse state and handlers**

Delete:

```tsx
const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set());

function toggleExpand(policyId: string) {
  setExpandedPolicies((prev) => {
    const next = new Set(prev);
    if (next.has(policyId)) next.delete(policyId); else next.add(policyId);
    return next;
  });
}
```

And remove all `expandedPolicies` / `toggleExpand` usages in headers and rows.

- [ ] **Step 4: Run focused tests to verify green**

Run:
```bash
npx vitest run packages/feature-simulator/src/PricingSimulatorPage.test.tsx --reporter=verbose
```

Expected:
- PASS for newly added card-layout tests
- PASS for existing load/run/error tests

- [ ] **Step 5: Commit implementation**

```bash
git add packages/feature-simulator/src/PricingSimulatorPage.tsx packages/feature-simulator/src/PricingSimulatorPage.test.tsx
git commit -m "feat(simulator): render per-marketplace comparison cards in results grid"
```

---

### Task 3: Enforce Price Reference Reset Rule and Chip Visibility

**Files:**
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.tsx`
- Test: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`

- [ ] **Step 1: Add helper to atomically clear results and overrides**

```tsx
function clearSimulationState() {
  setResults([]);
  setRunError(null);
  setPriceOverrides({});
}
```

- [ ] **Step 2: Update price-source toggle to clear existing results when changed post-run**

Replace toggle handler:

```tsx
onClick={() => {
  setPriceSource((v) => (v === "my_price" ? "suggested_price" : "my_price"));
  if (hasResults) clearSimulationState();
}}
```

- [ ] **Step 3: Keep margin chip semantics explicit for final margin status**

Ensure final margin chip stays visually dominant:

```tsx
<span
  aria-label={`Final margin status ${(item.margin_percent * 100).toFixed(1)} percent`}
  className={`inline-flex items-center px-2.5 py-1 rounded font-mono text-xs font-bold ${marginBg(item.margin_percent)} ${marginColor(item.margin_percent)}`}
>
  {(item.margin_percent * 100).toFixed(1)}%
</span>
```

- [ ] **Step 4: Run the exact test case for reset behavior, then full file**

Run:
```bash
npx vitest run packages/feature-simulator/src/PricingSimulatorPage.test.tsx -t "clears results when price reference switch changes after a run" --reporter=verbose
npx vitest run packages/feature-simulator/src/PricingSimulatorPage.test.tsx --reporter=verbose
```

Expected:
- Targeted test PASS
- Full simulator test file PASS

- [ ] **Step 5: Commit reset-rule behavior**

```bash
git add packages/feature-simulator/src/PricingSimulatorPage.tsx packages/feature-simulator/src/PricingSimulatorPage.test.tsx
git commit -m "fix(simulator): clear results on global price-reference change"
```

---

### Task 4: Final Verification and Integration Safety

**Files:**
- Verify only (no required code changes)

- [ ] **Step 1: Run workspace test for simulator package**

Run:
```bash
npm run test --workspace=packages/feature-simulator
```

Expected:
- PASS with updated test expectations for comparison cards

- [ ] **Step 2: Run web test suite to detect cross-feature regressions**

Run:
```bash
npm run test --workspace=apps/web
```

Expected:
- PASS with no regressions in app-level route/render integration

- [ ] **Step 3: Manual smoke check in browser**

Run:
```bash
.\run-server.ps1
npm run dev --workspace=apps/web
```

Manual checks:
- `/simulator` loads
- Run simulation with selected products and valid CEPs
- Marketplace cards render across row columns
- Each card shows marketplace cost, shipping, margin before shipping, final margin, and color chip
- Changing price reference clears result cards
- Inline selling-price edit still commits and updates card values

- [ ] **Step 4: Commit any verification-related test fixups (only if needed)**

```bash
git add packages/feature-simulator/src/PricingSimulatorPage.tsx packages/feature-simulator/src/PricingSimulatorPage.test.tsx
git commit -m "test(simulator): stabilize comparison-card regression coverage"
```

Only create this commit if you changed files after verification.

---

## Completion Checklist

- [ ] No `expandedPolicies` collapse logic remains
- [ ] Results display as marketplace card columns with auto height
- [ ] Marketplace cost is grouped and displays commission percent
- [ ] Margin before shipping and final margin are both visible in `R$` and `%`
- [ ] Final margin chip remains visually dominant and color-coded
- [ ] Price reference toggle clears results after a run
- [ ] Simulator tests pass
- [ ] Web workspace tests pass
- [ ] Manual smoke check completed
