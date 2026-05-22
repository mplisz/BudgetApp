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
import { PANEL_META, MONTH_SELECTOR_PANELS, MONTH_TITLE_PANELS }        from "./data/constants";


const PanelExpenses      = lazy(() => import("./components/panels/PanelExpenses"));
const PanelTransactions  = lazy(() => import("./components/panels/PanelTransactions"));
const PanelRecurring     = lazy(() => import("./components/panels/PanelRecurring"));
const PanelBaseBudget    = lazy(() => import("./components/panels/PanelBaseBudget"));
const PanelSettings      = lazy(() => import("./components/panels/PanelSettings"));
const PanelAdmin         = lazy(() => import("./components/panels/PanelAdmin"));
const PanelVouchers      = lazy(() => import("./components/panels/PanelVouchers"));
const PanelAddIncome          = lazy(() => import("./components/panels/PanelAddIncome"));
const PanelIncomeTransactions = lazy(() => import("./components/panels/PanelIncomeTransactions"))
const PanelPlanned = lazy(() => import("./components/panels/PanelPlanned"));
const PanelAddRecurring = lazy(() => import("./components/panels/PanelAddRecurring"));
const PanelAddPlanned   = lazy(() => import("./components/panels/PanelAddPlanned"));
const PanelSummary = lazy(() => import("./components/panels/PanelSummary"));
const PanelAnalytics = lazy(() => import("./components/panels/PanelAnalytics"));
const PanelSafetyNet = lazy(() => import("./components/panels/PanelSafetyNet"));


// PANEL_META,MONTH_SELECTOR_PANELS,MONTH_TITLE_PANELS imported from ./data/constants.js

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
      <main style={{ marginLeft: 220, flex: 1, minHeight: "100vh", paddingBottom: 80 }}>
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
            {panel === "addincome"          && <PanelAddIncome />}
            {panel === "addrecurring" && <PanelAddRecurring />}
            {panel === "addplanned"   && <PanelAddPlanned />}
            {panel === "planned"      && <PanelPlanned />}
            {panel === "transactions" && <PanelTransactions />}
            {panel === "incometransactions" && <PanelIncomeTransactions />}
            {panel === "recurring"    && <PanelRecurring />}
            {panel === "basebudget"   && <PanelBaseBudget />}
            {panel === "summary" && <PanelSummary />}
            {panel === "analytics" && <PanelAnalytics />}
            {panel === "safetynet" && <PanelSafetyNet />}
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