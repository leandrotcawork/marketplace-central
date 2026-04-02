import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white border-transparent",
  secondary: "bg-white hover:bg-slate-50 text-slate-700 border-slate-200",
  danger: "bg-red-600 hover:bg-red-700 text-white border-transparent",
};

export function Button({
  children,
  type = "button",
  variant = "secondary",
  loading = false,
  disabled,
  className = "",
  ...props
}: PropsWithChildren<ButtonProps>) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border cursor-pointer transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
