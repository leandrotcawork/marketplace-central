import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>;

export function Button({ children, type = "button", style, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      style={{
        border: "1px solid #d6d6d6",
        borderRadius: 10,
        padding: "8px 12px",
        background: "#ffffff",
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
