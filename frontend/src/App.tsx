// ============================================================
// File: src/App.tsx
// Top-level layout with React Router routes.
//
// Architecture:
//   - <Routes> declared centrally; each panel is lazy-loaded
//   - Shared layout (Sidebar, header, MonthNavigator) wraps all
//     authenticated routes via the AuthenticatedLayout component
//   - / redirects to VITE_DEFAULT_PANEL or /expenses/add
//   - Unknown paths redirect to default (no dedicated 404 page —
//     family app is single-tenant, link rot is more annoying than helpful)
//
// Error boundaries (3 layers, isolated failure domains):
//   1. Root boundary    — wraps everything. Last resort.
//   2. Header boundary  — wraps the status/notifications cluster.
//                         If bell or status crashes, the panel below
//                         remains usable.
//   3. Panel boundary   — wraps the route Outlet. If a panel crashes,
//                         Sidebar/header stay functional so the user
//                         can navigate elsewhere. Keyed on `pathname`
//                         so the boundary resets automatically when
//                         the user switches panels (otherwise an old
//                         error would linger until manual reset).
// ============================================================

import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
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
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { PANEL_META } from "./data/constants";
import { panelIdFromPath, getDefaultPath } from "./data/routes";
import { useMonthFromUrl } from "./hooks/useMonthFromUrl";

// ── Lazy-loaded panels ───────────────────────────────────────

const PanelExpenses           = lazy(() => import("./components/panels/PanelExpenses"));
const PanelTransactions       = lazy(() => import("./components/panels/PanelTransactions"));
const PanelRecurring          = lazy(() => import("./components/panels/PanelRecurring"));
const PanelBaseBudget         = lazy(() => import("./components/panels/PanelBaseBudget"));
const PanelSettings           = lazy(() => import("./components/panels/PanelSettings"));
const PanelAdmin              = lazy(() => import("./components/panels/PanelAdmin"));
const PanelVouchers           = lazy(() => import("./components/panels/PanelVouchers"));
const PanelAddIncome          = lazy(() => import("./components/panels/PanelAddIncome"));
const PanelIncomeTransactions = lazy(() => import("./components/panels/PanelIncomeTransactions"));
const PanelPlanned            = lazy(() => import("./components/panels/PanelPlanned"));
const PanelAddRecurring       = lazy(() => import("./components/panels/PanelAddRecurring"));
const PanelAddPlanned         = lazy(() => import("./components/panels/PanelAddPlanned"));
const PanelSummary            = lazy(() => import("./components/panels/PanelSummary"));
const PanelAnalytics          = lazy(() => import("./components/panels/PanelAnalytics"));
const PanelSafetyNet          = lazy(() => import("./components/panels/PanelSafetyNet"));

// ── Which panels show the MonthNavigator in the header ──────
const PANELS_WITH_MONTH_NAVIGATOR = new Set([
  "expenses", "addincome", "addrecurring", "addplanned",
  "transactions", "incometransactions", "planned", "recurring",
  "summary", "basebudget",
]);

// ── Which panels show the month name in the title ──────────
const PANELS_WITH_MONTH_TITLE = new Set([
  "expenses", "addincome", "addrecurring", "addplanned",
  "transactions", "incometransactions", "planned", "recurring",
  "summary", "basebudget",
]);

// ============================================================
// Authenticated layout — used as a route wrapper
// ============================================================

function AuthenticatedLayout() {
  const { pathname } = useLocation();
  const { month, year } = useMonthFromUrl();
  const panelId = panelIdFromPath(pathname);
  const currentItem = panelId
    ? (PANEL_META as Record<string, { icon: string; label: string; section: string }>)[panelId]
    : null;

  const showMonthNav   = panelId !== null && PANELS_WITH_MONTH_NAVIGATOR.has(panelId);
  const showMonthTitle = panelId !== null && PANELS_WITH_MONTH_TITLE.has(panelId);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", display: "flex" }}>
      <ToastContainer />
      <Sidebar />
      <main style={{ marginLeft: 220, flex: 1, minHeight: "100vh", paddingBottom: 80 }}>
        <header style={{
          background: "#0d1424", borderBottom: "1px solid #1e293b",
          padding: "10px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          {/* Left: panel title */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
              {currentItem?.icon} {currentItem?.label}
            </span>
            {showMonthTitle && (
              <span style={{ color: "#10b981", fontWeight: 800, fontSize: 15 }}>
                {MONTHS[month]} {year}
              </span>
            )}
          </div>

          {/* Center: month navigator */}
          {showMonthNav && <MonthNavigator />}

          {/* Right: status + notifications + logout — isolated boundary */}
          {/* If NotificationBell explodes (e.g. malformed planned doc),
              the panel below stays usable instead of going blank. */}
          <ErrorBoundary
            name="Header"
            fallback={(_err, reset) => (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "4px 10px", borderRadius: 8,
                background: "#ef444411", border: "1px solid #ef444444",
                color: "#ef4444", fontSize: 11, fontWeight: 700,
              }}>
                <span>⚠️ Pasek narzędzi padł</span>
                <button onClick={reset} style={{
                  background: "transparent", border: "1px solid #ef444466",
                  color: "#ef4444", borderRadius: 6, padding: "2px 8px",
                  cursor: "pointer", fontSize: 11, fontWeight: 700,
                }}>
                  ↻
                </button>
              </div>
            )}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <MonthStatusButton />
              <NotificationBell />
              <LogoutButton />
            </div>
          </ErrorBoundary>
        </header>

        <div style={{ padding: "20px" }}>
          {/* Panel boundary, keyed on pathname so it auto-resets
              when the user navigates to a different panel. */}
          <ErrorBoundary name="Panel" key={pathname}>
            <Suspense fallback={<div style={{ color: "#64748b" }}>Ładowanie panelu...</div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}

// ============================================================
// Main App component
// ============================================================

function AppContent() {
  const { accessToken, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0a0f1e",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#10b981", fontWeight: 800,
      }}>
        Weryfikacja sesji...
      </div>
    );
  }

  if (!accessToken) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<AuthenticatedLayout />}>
        {/* Root → default landing */}
        <Route index element={<Navigate to={getDefaultPath()} replace />} />

        {/* Add / quick-add forms */}
        <Route path="expenses/add"  element={<PanelExpenses />} />
        <Route path="income/add"    element={<PanelAddIncome />} />
        <Route path="recurring/add" element={<PanelAddRecurring />} />
        <Route path="planned/add"   element={<PanelAddPlanned />} />

        {/* Per-month panels (month read from ?m=) */}
        <Route path="transactions"        element={<PanelTransactions />} />
        <Route path="income-transactions" element={<PanelIncomeTransactions />} />
        <Route path="summary"             element={<PanelSummary />} />
        <Route path="basebudget"          element={<PanelBaseBudget />} />

        {/* Lists & tools */}
        <Route path="recurring" element={<PanelRecurring />} />
        <Route path="planned"   element={<PanelPlanned />} />
        <Route path="vouchers"  element={<PanelVouchers />} />
        <Route path="safetynet" element={<PanelSafetyNet />} />
        <Route path="analytics" element={<PanelAnalytics />} />

        {/* Admin */}
        <Route path="settings" element={<PanelSettings />} />
        <Route path="admin"    element={<PanelAdmin />} />

        {/* Catch-all → default */}
        <Route path="*" element={<Navigate to={getDefaultPath()} replace />} />
      </Route>
    </Routes>
  );
}

// ── Root: outermost boundary as last resort ─────────────────
// If anything inside AppContent crashes (login flow, router itself,
// AppContext bootstrap), this catches it and shows the generic
// fallback. Outside everything, deliberately not styled with our
// dark theme variables because if those broke, we don't want the
// fallback to break too.

export default function App() {
  return (
    <ErrorBoundary name="Root">
      <AppContent />
    </ErrorBoundary>
  );
}
