import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ClassificationsPage } from "@marketplace-central/feature-classifications";
import { MarketplaceSettingsPage } from "@marketplace-central/feature-marketplaces";
import { PricingSimulatorPage } from "@marketplace-central/feature-simulator";
import { ProductsPage } from "@marketplace-central/feature-products";
import { VTEXPublishPage, BatchDetailPage } from "@marketplace-central/feature-connectors";
import { IntegrationsHubPage } from "@marketplace-central/feature-integrations";
import { Layout } from "./Layout";
import { DashboardPage } from "../pages/DashboardPage";
import { useClient } from "./ClientContext";

function ProductsPageWrapper() {
  const client = useClient();
  return <ProductsPage client={client} />;
}

function ClassificationsPageWrapper() {
  const client = useClient();
  return <ClassificationsPage client={client} />;
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

function IntegrationsHubPageWrapper() {
  const client = useClient();
  return <IntegrationsHubPage client={client} />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPageWrapper />} />
          <Route path="/classifications" element={<ClassificationsPageWrapper />} />
          <Route path="/connectors/vtex" element={<VTEXPublishPageWrapper />} />
          <Route path="/connectors/vtex/batch/:batchId" element={<BatchDetailPageWrapper />} />
          <Route path="/marketplaces" element={<MarketplaceSettingsPageWrapper />} />
          <Route path="/integrations" element={<IntegrationsHubPageWrapper />} />
          <Route path="/simulator" element={<PricingSimulatorPageWrapper />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
