// ============================================================
// File: src/App.jsx
// ============================================================

import React, { Suspense, lazy } from "react";
import { useAppContext } from "./context/AppContext";
import { useAuth } from "./context/AuthContext";
import { LoginPage } from "./components/LoginPage";
import { MONTHS } from "./data/constants";
import { Sidebar } from "./components/layout/Sidebar";
import { MonthNavigator } from "./components/layout/MonthNavigator";
import { NotificationBell } from "./components/layout/NotificationBell";
import { MobileNav } from "./components/layout/MobileNav";
import { LogoutButton } from "./components/ui/LogoutButton";
import { ToastContainer } from "./components/ui/ToastContainer";
import { MonthStatusButton } from "./components/layout/MonthStatusButton";
import { PANEL_META }        from "./data/constants";

const PanelExpenses      = lazy(() => import("./components/panels/PanelExpenses"));
const PanelPlanned       = lazy(() => import("./components/panels/PanelPlanned"));
const PanelIncome        = lazy(() => import("./components/panels/PanelIncome"));
const PanelResults       = lazy(() => import("./components/panels/PanelResults"));
const PanelTransactions  = lazy(() => import("./components/panels/PanelTransactions"));
const PanelTrends        = lazy(() => import("./components/panels/PanelTrends"));
const PanelCushion       = lazy(() => import("./components/panels/PanelCushion"));
const PanelRecurring     = lazy(() => import("./components/panels/PanelRecurring"));
const PanelBaseBudget    = lazy(() => import("./components/panels/PanelBaseBudget"));
const PanelGoals         = lazy(() => import("./components/panels/PanelGoals"));
const PanelStash         = lazy(() => import("./components/panels/PanelStash"));
const PanelDocuments     = lazy(() => import("./components/panels/PanelDocuments"));
const PanelSettings      = lazy(() => import("./components/panels/PanelSettings"));
const PanelAdmin         = lazy(() => import("./components/panels/PanelAdmin"));
const PanelVouchers      = lazy(() => import("./components/panels/PanelVouchers"));

// PANEL_META imported from ./data/constants.js

// Panels that show the month navigator in the header
const MONTH_SELECTOR_PANELS = ["expenses", "results", "income", "planned", "transactions"];

// Panels that show "Month Year" title text in the header
const MONTH_TITLE_PANELS = ["expenses", "results", "income", "planned", "transactions"];

export default function App() {
  const { panel, month, year } = useAppContext();
  const { accessToken, isLoading } = useAuth();
  const currentItem = PANEL_META[panel];

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0f1e", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981", fontWeight: 800 }}>
        Weryfikacja sesji...
      </div>
    );
  }

  if (!accessToken) {
    return <LoginPage />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", display: "flex" }}>
      <ToastContainer />
      <Sidebar />

      <main style={{ marginLeft: 220, flex: 1, minHeight: "100vh" }}>
        <header style={{ background: "#0d1424", borderBottom: "1px solid #1e293b", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>

          {/* Left: panel title */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
              {currentItem?.icon} {currentItem?.label}
            </span>
            {MONTH_TITLE_PANELS.includes(panel) && (
              <span style={{ color: "#10b981", fontWeight: 800, fontSize: 15 }}>{MONTHS[month]} {year}</span>
            )}
          </div>

          {/* Center: month navigator */}
          {MONTH_SELECTOR_PANELS.includes(panel) && <MonthNavigator />}

          {/* Right: status + notifications + logout */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <MonthStatusButton />
            <NotificationBell />
            <LogoutButton />
          </div>
        </header>

        <div style={{ padding: "20px" }}>
          <Suspense fallback={<div style={{ color: "#64748b" }}>Ładowanie panelu...</div>}>
            {panel === "expenses"     && <PanelExpenses />}
            {panel === "planned"      && <PanelPlanned />}
            {panel === "income"       && <PanelIncome />}
            {panel === "results"      && <PanelResults />}
            {panel === "transactions" && <PanelTransactions />}
            {panel === "trends"       && <PanelTrends />}
            {panel === "cushion"      && <PanelCushion />}
            {panel === "recurring"    && <PanelRecurring />}
            {panel === "basebudget"   && <PanelBaseBudget />}
            {panel === "goals"        && <PanelGoals />}
            {panel === "stash"        && <PanelStash />}
            {panel === "documents"    && <PanelDocuments />}
            {panel === "settings"     && <PanelSettings />}
            {panel === "admin"        && <PanelAdmin />}
            {panel === "vouchers"     && <PanelVouchers />}
          </Suspense>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}