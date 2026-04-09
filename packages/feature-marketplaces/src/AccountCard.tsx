// packages/feature-marketplaces/src/AccountCard.tsx
import type { MarketplaceAccount, MarketplacePolicy } from "@marketplace-central/sdk-runtime";
import { MarketplaceIcon } from "./components/MarketplaceIcon";
import { StatusBadge } from "./components/StatusBadge";

interface AccountCardProps {
  account: MarketplaceAccount;
  policy: MarketplacePolicy | null;
  selected: boolean;
  onSelect: (account: MarketplaceAccount) => void;
}

export function AccountCard({ account, policy, selected, onSelect }: AccountCardProps) {
  return (
    <div
      onClick={() => onSelect(account)}
      className={[
        "relative bg-white rounded-2xl p-5 cursor-pointer transition-all duration-150 select-none",
        selected
          ? "border-2 border-blue-500 shadow-md bg-blue-50/20"
          : "border border-slate-100 shadow-sm hover:shadow-lg hover:shadow-blue-100/60 hover:border-blue-100 hover:-translate-y-0.5",
      ].join(" ")}
    >
      {/* Row 1: icon + status */}
      <div className="flex items-center justify-between mb-3">
        <MarketplaceIcon code={account.channel_code} size={32} />
        <StatusBadge status={account.status} />
      </div>

      {/* Row 2: name + id */}
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

      {/* Row 3: policy snapshot */}
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
        <p className="text-xs text-blue-500">Configure policy →</p>
      )}
    </div>
  );
}
