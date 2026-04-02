import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createMarketplaceCentralClient } from "@marketplace-central/sdk-runtime";

type Client = ReturnType<typeof createMarketplaceCentralClient>;

const ClientContext = createContext<Client | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";
  const client = useMemo(
    () => createMarketplaceCentralClient({ baseUrl }),
    [baseUrl]
  );
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): Client {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClient must be used inside <ClientProvider>");
  return ctx;
}
