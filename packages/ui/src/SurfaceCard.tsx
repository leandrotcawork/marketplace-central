import type { PropsWithChildren } from "react";

export function SurfaceCard({ children }: PropsWithChildren) {
  return <section style={{ border: "1px solid #d6d6d6", padding: 16, borderRadius: 12 }}>{children}</section>;
}
