# Marketplaces Page — Component Design Guide

> Implementation-ready design. Every Tailwind class, CSS value, and interaction is specified.
> Source of truth: spec at `docs/superpowers/specs/2026-04-09-marketplaces-redesign-design.md`
> Design system: `design-system/marketplace-central/MASTER.md`

---

## Design Tokens

```css
/* Colors */
--color-primary:    #2563EB;
--color-cta:        #F97316;
--color-bg:         #F8FAFC;
--color-text:       #1E293B;
--color-success:    #10B981;
--color-warning:    #F59E0B;
--color-danger:     #EF4444;

/* Glassmorphism */
--glass-bg:         rgba(255, 255, 255, 0.85);
--glass-border:     1px solid rgba(0, 0, 0, 0.06);
--glass-blur:       backdrop-filter: blur(12px);

/* Elevation (Dimensional Layering) */
--shadow-card:      0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
--shadow-card-hover:0 8px 24px rgba(37,99,235,0.10), 0 2px 8px rgba(0,0,0,0.06);
--shadow-panel:     -4px 0 24px rgba(0,0,0,0.08);

/* Radius */
--radius-card:      16px;   /* rounded-2xl */
--radius-badge:     999px;  /* rounded-full */
--radius-input:     8px;    /* rounded-lg */
--radius-btn:       8px;    /* rounded-lg */

/* Typography — Plus Jakarta Sans */
--font-display:     700 20px/1.3  'Plus Jakarta Sans';
--font-heading:     600 14px/1.4  'Plus Jakarta Sans';
--font-label:       500 12px/1.5  'Plus Jakarta Sans';
--font-body:        400 14px/1.5  'Plus Jakarta Sans';
--font-mono:        400 12px/1.5  ui-monospace, SFMono-Regular, monospace;

/* Transitions */
--transition-card:  all 150ms ease-out;
--transition-panel: transform 200ms ease-out;
```

---

## 1. Page Shell

```tsx
// Outer wrapper — fills the main content area
<div className="min-h-full bg-slate-50 p-6">

  {/* Page header */}
  <div className="flex items-center justify-between mb-6">
    <div>
      <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans' }}>
        Marketplaces
      </h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Manage your channels and pricing policies
      </p>
    </div>
    <button className="
      inline-flex items-center gap-2
      px-4 py-2
      bg-orange-500 hover:bg-orange-600
      text-white text-sm font-semibold
      rounded-lg
      shadow-sm hover:shadow-md
      transition-all duration-150
      cursor-pointer
    ">
      <Plus className="w-4 h-4" />
      Connect Marketplace
    </button>
  </div>

  {/* Grid + panel container */}
  <div
    className="transition-all duration-200"
    style={{ paddingRight: panelOpen ? '416px' : '0' }}
  >
    {/* Card grid */}
    <div className="grid gap-5" style={{
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'
    }}>
      {/* Account cards */}
      {/* Add card */}
    </div>
  </div>

  {/* Detail panel — fixed right */}
</div>
```

**Notes:**
- `bg-slate-50` = `#F8FAFC` background token
- CTA button: `bg-orange-500` = `#F97316`, hover darkens to `bg-orange-600`
- Grid uses `auto-fill` + `minmax(280px, 1fr)` — reflows from 1 to 3+ columns automatically
- `paddingRight: 416px` = 400px panel + 16px gap; grid cards reflow left instead of panel overlapping

---

## 2. Account Card

```tsx
<div
  onClick={() => onSelect(account)}
  className={`
    relative
    bg-white rounded-2xl p-5
    border cursor-pointer
    transition-all duration-150
    ${selected
      ? 'border-2 border-blue-500 shadow-md bg-blue-50/20'
      : 'border border-slate-100 shadow-sm hover:shadow-blue-100/60 hover:shadow-lg hover:border-blue-100 hover:-translate-y-0.5'
    }
  `}
  style={{ backdropFilter: 'blur(12px)' }}
>
  {/* Row 1: Icon + Status */}
  <div className="flex items-center justify-between mb-3">
    <MarketplaceIcon code={account.marketplace_code} size={32} />
    <StatusBadge status={account.status} />
  </div>

  {/* Row 2: Name + ID */}
  <div className="mb-4">
    <p className="text-sm font-semibold text-slate-900 leading-snug">
      {account.display_name}
    </p>
    <p className="text-xs text-slate-400 font-mono mt-0.5">
      {account.account_id} · {account.channel_code}
    </p>
  </div>

  {/* Divider */}
  <div className="border-t border-slate-100 mb-4" />

  {/* Row 3: Policy snapshot */}
  {policy ? (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <p className="text-xs text-slate-400 mb-0.5">Commission</p>
        <p className="text-sm font-bold text-slate-900 tabular-nums">
          {(policy.commission_percent * 100).toFixed(1)}%
        </p>
      </div>
      <div>
        <p className="text-xs text-slate-400 mb-0.5">Min Margin</p>
        <p className="text-sm font-bold text-slate-900 tabular-nums">
          {(policy.min_margin_percent * 100).toFixed(1)}%
        </p>
      </div>
    </div>
  ) : (
    <p className="text-xs text-blue-500 hover:text-blue-700 cursor-pointer">
      Configure policy →
    </p>
  )}
</div>
```

### Card States — Tailwind Classes

| State | Classes |
|-------|---------|
| Default | `bg-white border border-slate-100 shadow-sm rounded-2xl` |
| Hover | `hover:shadow-lg hover:shadow-blue-100/60 hover:border-blue-100 hover:-translate-y-0.5` |
| Selected | `border-2 border-blue-500 shadow-md bg-blue-50/20` |
| Inactive account | add `opacity-70` to card, status badge goes slate |

### Hover scale (ui-ux-pro-max Bento Grid spec)
```css
/* hover scale 1.02 + shadow */
transition: all 150ms ease-out;
hover: translateY(-2px) + shadow-lg
```
> Note: Use `hover:-translate-y-0.5` (2px lift) instead of scale to avoid layout reflow per ui-ux-pro-max `layout-shift-avoid` rule.

---

## 3. Marketplace Icon Component

```tsx
const MARKETPLACE_COLORS: Record<string, { bg: string; text: string }> = {
  vtex:           { bg: '#FF3366', text: '#FFFFFF' },
  mercado_livre:  { bg: '#FFE600', text: '#1A1A1A' },
  magalu:         { bg: '#0086FF', text: '#FFFFFF' },
  shopee:         { bg: '#EE4D2D', text: '#FFFFFF' },
  americanas:     { bg: '#E30613', text: '#FFFFFF' },
  default:        { bg: '#6366F1', text: '#FFFFFF' },
};

function MarketplaceIcon({ code, size = 32 }: { code: string; size?: number }) {
  const { bg, text } = MARKETPLACE_COLORS[code] ?? MARKETPLACE_COLORS.default;
  const initial = code.charAt(0).toUpperCase();

  return (
    <div
      className="rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
      style={{ width: size, height: size, backgroundColor: bg, color: text }}
    >
      {initial}
    </div>
  );
}
```

---

## 4. Status Badge

```tsx
const STATUS_STYLES = {
  active:   'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
  default:  'bg-slate-100 text-slate-500',
};

function StatusBadge({ status }: { status: string }) {
  const styles = STATUS_STYLES[status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.default;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles}`}
      aria-label={`Status: ${status}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {status}
    </span>
  );
}
```

---

## 5. Add Account Card

```tsx
<button
  onClick={onAdd}
  className="
    flex flex-col items-center justify-center gap-2
    rounded-2xl p-5 min-h-[160px]
    border-2 border-dashed border-slate-200
    bg-white
    text-slate-400
    hover:border-blue-400 hover:bg-blue-50/30 hover:text-blue-500
    transition-all duration-150
    cursor-pointer w-full
  "
>
  <Plus className="w-6 h-6" />
  <span className="text-sm font-medium">Connect Marketplace</span>
</button>
```

---

## 6. Empty State

```tsx
{/* Rendered when accounts.length === 0 after load */}
<div className="flex flex-col items-center justify-center py-20 text-center">
  <Store className="w-12 h-12 text-slate-200 mb-4" />
  <h3 className="text-lg font-semibold text-slate-700 mb-2">
    No marketplaces connected
  </h3>
  <p className="text-sm text-slate-400 max-w-xs mb-6">
    Connect your first marketplace to start managing channels and pricing policies.
  </p>
  <button
    onClick={onAdd}
    className="
      inline-flex items-center gap-2
      px-4 py-2 bg-orange-500 hover:bg-orange-600
      text-white text-sm font-semibold
      rounded-lg shadow-sm transition-all duration-150 cursor-pointer
    "
  >
    <Plus className="w-4 h-4" />
    Connect Marketplace
  </button>
</div>
```

---

## 7. Loading State (Skeleton Cards)

```tsx
{/* 3 skeleton cards shown while loading */}
{Array.from({ length: 3 }).map((_, i) => (
  <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
    <div className="flex items-center justify-between mb-3">
      <div className="w-8 h-8 rounded-lg bg-slate-200" />
      <div className="w-16 h-5 rounded-full bg-slate-200" />
    </div>
    <div className="w-32 h-4 bg-slate-200 rounded mb-1.5" />
    <div className="w-24 h-3 bg-slate-100 rounded mb-4" />
    <div className="border-t border-slate-100 mb-4" />
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <div className="w-16 h-3 bg-slate-100 rounded" />
        <div className="w-10 h-4 bg-slate-200 rounded" />
      </div>
      <div className="space-y-1.5">
        <div className="w-16 h-3 bg-slate-100 rounded" />
        <div className="w-10 h-4 bg-slate-200 rounded" />
      </div>
    </div>
  </div>
))}
```

---

## 8. Detail Panel

### Panel Container

```tsx
{/* Position: fixed right, slides in/out */}
<div
  role="dialog"
  aria-label="Account settings"
  className={`
    fixed top-0 right-0 h-full w-[400px]
    bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.08)]
    border-l border-slate-100
    flex flex-col
    transition-transform duration-200
    ${panelOpen ? 'translate-x-0' : 'translate-x-full'}
  `}
  style={{ zIndex: 40 }}
>
  <PanelHeader />
  <div className="flex-1 overflow-y-auto p-5 space-y-5">
    <ConnectionSection />
    <PolicySection />
  </div>
  <PanelFooter />
</div>
```

**Animation rule (ui-ux-pro-max):**
- Enter: `ease-out` 200ms (`translate-x-full → translate-x-0`)
- Exit: `ease-in` 150ms (`translate-x-0 → translate-x-full`) — exits faster than enters
- `@media (prefers-reduced-motion: reduce)` → skip transform, use instant show/hide

### Panel Header

```tsx
<div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
  <MarketplaceIcon code={account.marketplace_code} size={32} />
  <div className="flex-1 min-w-0">
    <p className="text-sm font-semibold text-slate-900 truncate">
      {account.display_name}
    </p>
    <div className="flex items-center gap-2 mt-0.5">
      <p className="text-xs text-slate-400 font-mono">{account.account_id}</p>
      <StatusBadge status={account.status} />
    </div>
  </div>
  <button
    onClick={onClose}
    aria-label="Close panel"
    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
  >
    <X className="w-4 h-4" />
  </button>
</div>
```

### Collapsible Section Header

```tsx
function SectionHeader({ label, open, onToggle }: {
  label: string; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full cursor-pointer group"
    >
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {label}
      </span>
      <ChevronDown
        className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}
```

### Input Field

```tsx
function Field({ id, label, type = 'text', placeholder, value, onChange, readOnly, suffix }: FieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          className={`
            w-full px-3 py-2 text-sm rounded-lg border
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-colors duration-150
            ${readOnly
              ? 'bg-slate-50 border-slate-100 text-slate-500 font-mono cursor-default'
              : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300'
            }
            ${suffix ? 'pr-10' : ''}
          `}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
```

**Read-only distinction (ui-ux-pro-max rule `read-only-distinction`):**
- `bg-slate-50` + `font-mono` + `cursor-default` visually separates read-only from editable

### Connection Section

```tsx
<div className="space-y-3">
  <SectionHeader label="Connection" open={connOpen} onToggle={() => setConnOpen(v => !v)} />
  {connOpen && (
    <div className="space-y-3 pt-1">
      {/* Marketplace type — read-only pill in edit mode, dropdown in create mode */}
      {isCreate ? (
        <div className="space-y-1">
          <label htmlFor="marketplace_code" className="block text-xs font-medium text-slate-600">
            Marketplace
          </label>
          <select id="marketplace_code" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">— Select marketplace —</option>
            {definitions.map(d => <option key={d.marketplace_code} value={d.marketplace_code}>{d.display_name}</option>)}
          </select>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-600">Marketplace</p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
            <MarketplaceIcon code={account.marketplace_code} size={16} />
            <span className="text-sm font-medium text-slate-700">
              {definition?.display_name ?? account.marketplace_code}
            </span>
          </div>
        </div>
      )}

      <Field id="display_name" label="Display Name" placeholder="My VTEX Store" ... />
      {isCreate && <Field id="account_id" label="Account ID" placeholder="Auto-generated" readOnly ... />}
      <Field id="connection_mode" label="Connection Mode" placeholder="api" ... />

      {/* Dynamic credential fields */}
      {definition?.credential_schema.length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Credentials</p>
          {definition.credential_schema.map(field => (
            <CredentialField key={field.key} field={field} ... />
          ))}
        </div>
      )}
    </div>
  )}
</div>
```

### Credential Field (with eye toggle for secrets)

```tsx
function CredentialField({ field, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <label htmlFor={`cred_${field.key}`} className="block text-xs font-medium text-slate-600">
        {field.label}
      </label>
      <div className="relative">
        <input
          id={`cred_${field.key}`}
          type={field.secret && !show ? 'password' : 'text'}
          value={value}
          onChange={onChange}
          className="w-full px-3 py-2 pr-10 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {field.secret && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            aria-label={show ? 'Hide' : 'Show'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
```

### Policy Section

```tsx
<div className="space-y-3">
  <SectionHeader label="Pricing Policy" open={policyOpen} onToggle={() => setPolicyOpen(v => !v)} />
  {policyOpen && (
    <div className="grid grid-cols-2 gap-3 pt-1">
      <Field id="commission_percent" label="Commission (0.16 = 16%)" placeholder="0.16" type="number" ... />
      <Field id="fixed_fee_amount"   label="Fixed Fee"               placeholder="5.00"  type="number" suffix="R$" ... />
      <Field id="default_shipping"   label="Default Shipping"        placeholder="10.00" type="number" suffix="R$" ... />
      <Field id="min_margin_percent" label="Min Margin (0.10 = 10%)" placeholder="0.10"  type="number" ... />
      <Field id="sla_question"       label="SLA Question"            placeholder="60"    type="number" suffix="min" ... />
      <Field id="sla_dispatch"       label="SLA Dispatch"            placeholder="24"    type="number" suffix="h" ... />
    </div>
  )}
</div>
```

### Panel Footer

```tsx
<div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">

  {/* Left: Disconnect / inline confirm */}
  {!confirmingDisconnect ? (
    <button
      onClick={() => setConfirmingDisconnect(true)}
      className="text-sm text-red-500 hover:text-red-700 transition-colors cursor-pointer"
    >
      Disconnect
    </button>
  ) : (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-red-600 font-medium">Are you sure?</span>
      <button onClick={handleDisconnect} className="text-red-600 underline hover:text-red-800 cursor-pointer">Yes</button>
      <button onClick={() => setConfirmingDisconnect(false)} className="text-slate-500 hover:text-slate-700 cursor-pointer">Cancel</button>
    </div>
  )}

  {/* Right: Save / submit feedback */}
  <div className="flex items-center gap-2">
    {saveState === 'success' && (
      <span className="text-xs text-emerald-600 flex items-center gap-1">
        <Check className="w-3 h-3" /> Saved
      </span>
    )}
    {saveState === 'error' && (
      <span className="text-xs text-red-600">Failed to save</span>
    )}
    <button
      onClick={handleSave}
      disabled={!hasChanges || saving}
      className="
        inline-flex items-center gap-2
        px-4 py-2 text-sm font-semibold rounded-lg
        bg-orange-500 hover:bg-orange-600
        text-white
        disabled:opacity-40 disabled:cursor-not-allowed
        transition-all duration-150 cursor-pointer
      "
    >
      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {isCreate ? 'Connect' : 'Save Changes'}
    </button>
  </div>
</div>
```

---

## 9. Animation Spec

| Element | Enter | Exit | Duration | Easing |
|---------|-------|------|----------|--------|
| Detail panel | `translateX(100%) → 0` | `translateX(0) → 100%)` | 200ms / 150ms | ease-out / ease-in |
| Card hover lift | `translateY(0) → -2px` | `translateY(-2px) → 0` | 150ms | ease-out |
| Section collapse | `height auto → 0` | `height 0 → auto` | 150ms | ease-out |
| Success flash (footer) | `opacity 0 → 1` | `opacity 1 → 0` after 2s | 200ms | ease-out |
| Skeleton pulse | `opacity 0.5 ↔ 1` | — | 1500ms | ease-in-out, infinite |

**prefers-reduced-motion:**
```css
@media (prefers-reduced-motion: reduce) {
  .panel { transition: none; }
  .card  { transition: none; }
  .animate-pulse { animation: none; opacity: 0.7; }
}
```

---

## 10. Accessibility Checklist

- [ ] Panel has `role="dialog"` and `aria-label="Account settings"`
- [ ] Focus moves into panel on open (first input or close button)
- [ ] Focus returns to triggering card on panel close
- [ ] All inputs have `<label htmlFor>` — no placeholder-only labels
- [ ] Status badges have `aria-label` with full text
- [ ] `cursor-pointer` on every interactive element
- [ ] Disconnect inline confirm satisfies `confirmation-dialogs` rule
- [ ] Password reveal uses `aria-label="Show"` / `aria-label="Hide"`
- [ ] Skeleton cards use `aria-busy="true"` on the grid container
- [ ] Save button is `disabled` (not just visually) when no changes — uses `disabled` attribute
- [ ] Contrast: text-slate-900 on white = 16.75:1 ✓, text-slate-400 on white = 4.86:1 ✓

---

## 11. Responsive Breakpoints

| Breakpoint | Grid | Panel |
|-----------|------|-------|
| `< 768px` (mobile) | 1 col | Full-width overlay, `fixed inset-0 z-50`, `translateY(100%) → 0` (slides up) |
| `768–1279px` (tablet) | 2 cols | Pushes grid, `paddingRight: 360px` |
| `≥ 1280px` (desktop) | 3+ cols | Pushes grid, `paddingRight: 416px` |

---

## 12. Z-Index Scale

```
Cards:          z-0
Card hover:     z-10
Panel:          z-40
Mobile overlay: z-50
```

---

## 13. Icon Imports Required

```tsx
import {
  Plus, X, ChevronDown, Eye, EyeOff,
  Store, Check, Loader2
} from 'lucide-react';
```

All from `lucide-react` (already installed). No emoji. No custom SVG needed.
