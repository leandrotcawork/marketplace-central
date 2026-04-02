import type { PropsWithChildren } from "react";

interface SurfaceCardProps {
  className?: string;
}

export function SurfaceCard({ children, className = "" }: PropsWithChildren<SurfaceCardProps>) {
  return <section className={`bg-white border border-slate-200 rounded-xl p-6 ${className}`}>{children}</section>;
}
