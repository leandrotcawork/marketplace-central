import { useState } from "react";
import { X, ChevronDown, Eye, EyeOff, Loader2, Check } from "lucide-react";
import type {
  MarketplaceAccount,
  MarketplaceDefinition,
  MarketplacePolicy,
  CreateMarketplaceAccountRequest,
  CreateMarketplacePolicyRequest,
} from "@marketplace-central/sdk-runtime";
import { MarketplaceIcon } from "./components/MarketplaceIcon";
import { StatusBadge } from "./components/StatusBadge";

// ---------- local shape (superset of SDK MarketplaceDefinition for runtime fields) ----------

interface DefinitionShape {
  marketplace_code: string;
  display_name: string;
  credential_schema: Array<{ key: string; label: string; secret: boolean }>;
  [key: string]: unknown;
}

// ---------- helpers ----------

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().split("-")[0]}`;
}

function toDefinitionShape(d: MarketplaceDefinition | null): DefinitionShape | null {
  if (!d) return null;
  const raw = d as unknown as Record<string, unknown>;
  return {
    marketplace_code: (raw.marketplace_code ?? raw.code ?? "") as string,
    display_name: (raw.display_name ?? "") as string,
    credential_schema: (raw.credential_schema ?? []) as DefinitionShape["credential_schema"],
  };
}

function toDefinitionShapes(ds: MarketplaceDefinition[]): DefinitionShape[] {
  return ds.map((d) => toDefinitionShape(d) as DefinitionShape);
}

// ---------- sub-components ----------

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className="flex items-center justify-between w-full cursor-pointer group py-1"
    >
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {label}
      </span>
      <ChevronDown
        className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
      />
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  suffix?: string;
  required?: boolean;
}

function Field({
  id,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  readOnly,
  suffix,
  required,
}: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && show ? "text" : type;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          readOnly={readOnly}
          aria-label={label}
          className={[
            "w-full px-3 py-2 text-sm rounded-lg border",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
            "transition-colors duration-150",
            readOnly
              ? "bg-slate-50 border-slate-100 text-slate-500 font-mono cursor-default"
              : "bg-white border-slate-200 text-slate-900 hover:border-slate-300",
            suffix ? "pr-10" : "",
            isPassword ? "pr-10" : "",
          ].join(" ")}
        />
        {suffix && !isPassword && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
            {suffix}
          </span>
        )}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide" : "Show"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- props ----------

interface AccountPanelBaseProps {
  onClose: () => void;
  definitions: MarketplaceDefinition[];
  onCreateAccount: (req: CreateMarketplaceAccountRequest) => Promise<MarketplaceAccount>;
  onCreatePolicy: (req: CreateMarketplacePolicyRequest) => Promise<MarketplacePolicy>;
}

interface AccountPanelCreateProps extends AccountPanelBaseProps {
  mode: "create";
  account: null;
  policy: null;
  definition: null;
}

interface AccountPanelViewProps extends AccountPanelBaseProps {
  mode: "view";
  account: MarketplaceAccount;
  policy: MarketplacePolicy | null;
  definition: MarketplaceDefinition | null;
}

export type AccountPanelProps = AccountPanelCreateProps | AccountPanelViewProps;

// ---------- component ----------

export function AccountPanel(props: AccountPanelProps) {
  const { mode, onClose, definitions, onCreateAccount, onCreatePolicy } = props;

  const shapedDefinitions = toDefinitionShapes(definitions);

  // Create form state
  const [displayName, setDisplayName] = useState("");
  const [marketplaceCode, setMarketplaceCode] = useState("");
  const [connectionMode, setConnectionMode] = useState("api");
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  // Policy form state
  const [commission, setCommission] = useState(
    mode === "view" && props.policy ? String(props.policy.commission_percent) : ""
  );
  const [fixedFee, setFixedFee] = useState(
    mode === "view" && props.policy ? String(props.policy.fixed_fee_amount) : ""
  );
  const [defaultShipping, setDefaultShipping] = useState(
    mode === "view" && props.policy ? String(props.policy.default_shipping) : ""
  );
  const [minMargin, setMinMargin] = useState(
    mode === "view" && props.policy ? String(props.policy.min_margin_percent) : ""
  );
  const [slaQuestion, setSlaQuestion] = useState(
    mode === "view" && props.policy ? String(props.policy.sla_question_minutes) : ""
  );
  const [slaDispatch, setSlaDispatch] = useState(
    mode === "view" && props.policy ? String(props.policy.sla_dispatch_hours) : ""
  );

  // Section open/close
  const [connOpen, setConnOpen] = useState(true);
  const [policyOpen, setPolicyOpen] = useState(true);

  // Submit state
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Disconnect confirm
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Derived: selected definition in create mode
  const selectedDefinition: DefinitionShape | null =
    mode === "create"
      ? shapedDefinitions.find((d) => d.marketplace_code === marketplaceCode) ?? null
      : toDefinitionShape(props.definition);

  async function handleSubmit() {
    setSaving(true);
    setSaveResult(null);
    setSaveError(null);
    try {
      if (mode === "create") {
        const accountId = generateId("acc");
        const created = await onCreateAccount({
          account_id: accountId,
          display_name: displayName,
          channel_code: marketplaceCode,
          marketplace_code: marketplaceCode,
          connection_mode: connectionMode,
          credentials_json: Object.keys(credentials).length > 0 ? credentials : undefined,
        });
        if (commission) {
          await onCreatePolicy({
            policy_id: generateId("pol"),
            account_id: created.account_id,
            commission_percent: parseFloat(commission) || 0,
            fixed_fee_amount: parseFloat(fixedFee) || 0,
            default_shipping: parseFloat(defaultShipping) || 0,
            min_margin_percent: parseFloat(minMargin) || 0,
            sla_question_minutes: parseInt(slaQuestion, 10) || 0,
            sla_dispatch_hours: parseInt(slaDispatch, 10) || 0,
          });
        }
        setSaveResult("success");
        setTimeout(onClose, 800);
      }
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setSaveError(e?.error?.message ?? "Failed to save. Please try again.");
      setSaveResult("error");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    mode === "create"
      ? !!displayName.trim() && !!marketplaceCode && !saving
      : !saving;

  return (
    <div
      role="dialog"
      aria-label="Account settings"
      className="fixed top-0 right-0 h-full w-[400px] bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.08)] border-l border-slate-100 flex flex-col z-40"
      style={{ transition: "transform 200ms ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
        <MarketplaceIcon
          code={mode === "view" ? props.account.channel_code : marketplaceCode || "default"}
          size={32}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {mode === "view" ? props.account.display_name : displayName || "New Marketplace"}
          </p>
          {mode === "view" && (
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-slate-400 font-mono">{props.account.account_id}</p>
              <StatusBadge status={props.account.status} />
            </div>
          )}
          {mode === "create" && (
            <p className="text-xs text-slate-400 mt-0.5">New account</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* CONNECTION section */}
        <div className="space-y-3">
          <SectionHeader
            label="Connection"
            open={connOpen}
            onToggle={() => setConnOpen((v) => !v)}
          />
          {connOpen && (
            <div className="space-y-3 pt-1">
              {mode === "create" ? (
                <>
                  <Field
                    id="display_name"
                    label="Display Name"
                    placeholder="My VTEX Store"
                    value={displayName}
                    onChange={setDisplayName}
                    required
                  />
                  <div className="space-y-1">
                    <label
                      htmlFor="marketplace_code"
                      className="block text-xs font-medium text-slate-600"
                    >
                      Marketplace<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <select
                      id="marketplace_code"
                      aria-label="Marketplace"
                      value={marketplaceCode}
                      onChange={(e) => {
                        setMarketplaceCode(e.target.value);
                        setCredentials({});
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">— Select marketplace —</option>
                      {shapedDefinitions.map((d) => (
                        <option key={d.marketplace_code} value={d.marketplace_code}>
                          {d.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field
                    id="connection_mode"
                    label="Connection Mode"
                    placeholder="api"
                    value={connectionMode}
                    onChange={setConnectionMode}
                  />
                </>
              ) : (
                <>
                  <Field
                    id="view_name"
                    label="Display Name"
                    value={props.account.display_name}
                    readOnly
                  />
                  <Field
                    id="view_account_id"
                    label="Account ID"
                    value={props.account.account_id}
                    readOnly
                  />
                  <Field
                    id="view_mode"
                    label="Connection Mode"
                    value={props.account.connection_mode}
                    readOnly
                  />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-600">Marketplace</p>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <MarketplaceIcon code={props.account.channel_code} size={16} />
                      <span className="text-sm font-medium text-slate-700">
                        {selectedDefinition?.display_name ?? props.account.channel_code}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Dynamic credentials */}
              {selectedDefinition && selectedDefinition.credential_schema.length > 0 && (
                <div className="space-y-3 pt-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Credentials
                  </p>
                  {selectedDefinition.credential_schema.map((field) => (
                    <Field
                      key={field.key}
                      id={`cred_${field.key}`}
                      label={field.label}
                      type={field.secret ? "password" : "text"}
                      placeholder={field.label}
                      value={credentials[field.key] ?? ""}
                      onChange={(v) => setCredentials((c) => ({ ...c, [field.key]: v }))}
                      readOnly={mode === "view"}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* PRICING POLICY section */}
        <div className="space-y-3">
          <SectionHeader
            label="Pricing Policy"
            open={policyOpen}
            onToggle={() => setPolicyOpen((v) => !v)}
          />
          {policyOpen && (
            <>
              {mode === "view" && props.policy && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  Policy editing requires backend update endpoint. Shown read-only.
                </p>
              )}
              {mode === "view" && !props.policy && (
                <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                  No policy configured yet. Fill in below to create one.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Field
                  id="commission"
                  label="Commission (0.16 = 16%)"
                  type="number"
                  placeholder="0.16"
                  value={commission}
                  onChange={setCommission}
                  readOnly={mode === "view" && !!props.policy}
                />
                <Field
                  id="fixed_fee"
                  label="Fixed Fee"
                  type="number"
                  placeholder="5.00"
                  value={fixedFee}
                  onChange={setFixedFee}
                  suffix="R$"
                  readOnly={mode === "view" && !!props.policy}
                />
                <Field
                  id="default_ship"
                  label="Default Shipping"
                  type="number"
                  placeholder="10.00"
                  value={defaultShipping}
                  onChange={setDefaultShipping}
                  suffix="R$"
                  readOnly={mode === "view" && !!props.policy}
                />
                <Field
                  id="min_margin"
                  label="Min Margin (0.10 = 10%)"
                  type="number"
                  placeholder="0.10"
                  value={minMargin}
                  onChange={setMinMargin}
                  readOnly={mode === "view" && !!props.policy}
                />
                <Field
                  id="sla_question"
                  label="SLA Question"
                  type="number"
                  placeholder="60"
                  value={slaQuestion}
                  onChange={setSlaQuestion}
                  suffix="min"
                  readOnly={mode === "view" && !!props.policy}
                />
                <Field
                  id="sla_dispatch"
                  label="SLA Dispatch"
                  type="number"
                  placeholder="24"
                  value={slaDispatch}
                  onChange={setSlaDispatch}
                  suffix="h"
                  readOnly={mode === "view" && !!props.policy}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
        {mode === "view" && !confirmDisconnect && (
          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            className="text-sm text-red-500 hover:text-red-700 transition-colors cursor-pointer"
          >
            Disconnect
          </button>
        )}
        {mode === "view" && confirmDisconnect && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-red-600 font-medium text-xs">No delete API yet</span>
            <button
              type="button"
              onClick={() => setConfirmDisconnect(false)}
              className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
        {mode === "create" && <span />}

        <div className="flex items-center gap-2">
          {saveResult === "success" && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <Check className="w-3 h-3" /> Connected
            </span>
          )}
          {saveResult === "error" && saveError && (
            <span className="text-xs text-red-600 max-w-[140px] text-right">{saveError}</span>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-label={mode === "create" ? "Connect" : "Save Changes"}
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
            {mode === "create" ? "Connect" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
