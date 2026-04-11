import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Package, Tags, Send, Store, Calculator, ActivitySquare } from "lucide-react";

const navItems = [
  { to: "/",                 label: "Dashboard",         icon: LayoutDashboard },
  { to: "/products",         label: "Products",          icon: Package },
  { to: "/classifications",  label: "Classifications",   icon: Tags },
  { to: "/connectors/vtex",  label: "VTEX Publisher",    icon: Send },
  { to: "/marketplaces",     label: "Marketplaces",      icon: Store },
  { to: "/integrations",     label: "Integrations",      icon: ActivitySquare },
  { to: "/simulator",        label: "Pricing Simulator", icon: Calculator },
];

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col" style={{ backgroundColor: "#0F172A" }}>
        <div className="px-5 py-5 border-b border-slate-700">
          <span className="text-white font-semibold text-sm tracking-wide">Marketplace Central</span>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-slate-700">
          <p className="text-xs text-slate-500">v0.1.0</p>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center px-6">
          <h1 className="text-sm font-medium text-slate-700">Marketplace Central</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
