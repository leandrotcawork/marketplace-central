import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { MarketplaceSettingsPage } from "@marketplace-central/feature-marketplaces";
import { PricingSimulatorPage } from "@marketplace-central/feature-simulator";

export function AppRouter() {
  return (
    <BrowserRouter>
      <nav>
        <NavLink to="/marketplaces">Marketplaces</NavLink>
        <NavLink to="/simulator">Simulator</NavLink>
      </nav>
      <Routes>
        <Route path="/marketplaces" element={<MarketplaceSettingsPage />} />
        <Route path="/simulator" element={<PricingSimulatorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
