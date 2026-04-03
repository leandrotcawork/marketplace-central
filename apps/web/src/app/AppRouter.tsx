import { BrowserRouter, Route, Routes } from "react-router-dom";
import { MarketplaceSettingsPage } from "@marketplace-central/feature-marketplaces";
import { PricingSimulatorPage } from "@marketplace-central/feature-simulator";
import { ProductsPage } from "@marketplace-central/feature-products";
import { VTEXPublishPage, BatchDetailPage } from "@marketplace-central/feature-connectors";
import { Layout } from "./Layout";
import { DashboardPage } from "../pages/DashboardPage";
import { useClient } from "./ClientContext";

function ProductsPageWrapper() {
  const client = useClient();
  return <ProductsPage client={client} />;
}

function VTEXPublishPageWrapper() {
  const client = useClient();
  return <VTEXPublishPage client={client} />;
}

function BatchDetailPageWrapper() {
  const client = useClient();
  return <BatchDetailPage client={client} />;
}

function MarketplaceSettingsPageWrapper() {
  const client = useClient();
  return <MarketplaceSettingsPage client={client} />;
}

function PricingSimulatorPageWrapper() {
  const client = useClient();
  return <PricingSimulatorPage client={client} />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPageWrapper />} />
          <Route path="/connectors/vtex" element={<VTEXPublishPageWrapper />} />
          <Route path="/connectors/vtex/batch/:batchId" element={<BatchDetailPageWrapper />} />
          <Route path="/marketplaces" element={<MarketplaceSettingsPageWrapper />} />
          <Route path="/simulator" element={<PricingSimulatorPageWrapper />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
