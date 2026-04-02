import { BrowserRouter, Route, Routes } from "react-router-dom";
import { MarketplaceSettingsPage } from "@marketplace-central/feature-marketplaces";
import { PricingSimulatorPage } from "@marketplace-central/feature-simulator";
import { Layout } from "./Layout";
import { DashboardPage } from "../pages/DashboardPage";

function MarketplaceSettingsPageWrapper() {
  return <MarketplaceSettingsPage />;
}

function PricingSimulatorPageWrapper() {
  return <PricingSimulatorPage />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/marketplaces" element={<MarketplaceSettingsPageWrapper />} />
          <Route path="/simulator" element={<PricingSimulatorPageWrapper />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
