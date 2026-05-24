// ============================================================
// File: src/components/layout/MonthNavigator.tsx
// Month navigation that writes to ?m=YYYY-MM in the URL.
//
// Replaces the old setMonth/setYear pattern. Because the URL is
// now the source of truth, F5 keeps the month and a back-button
// click on mobile walks through visited months.
// ============================================================

import { useAppContext }  from "../../context/AppContext";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { MONTHS }         from "../../data/constants";
import { useMonthFromUrl, addMonthsToYM, currentMonthYMD } from "../../hooks/useMonthFromUrl";

interface AppSettingsView {
  settings: { appStartMonth?: string } | null;
}

export function MonthNavigator() {
  const { settings } = useAppContext() as AppSettingsView;
  const { budgetMonth, month, year, setBudgetMonth } = useMonthFromUrl();

  const { navigateToFirstOpenMonth } = useMonthStatus() as {
    navigateToFirstOpenMonth: () => void;
  };

  // ── Boundary check ────────────────────────────────────────

  const startMonth = settings?.appStartMonth;
  const canGoBack = !startMonth || budgetMonth > startMonth;

  // ── "Back to today" visibility ────────────────────────────
  // Show when current nav month ≠ actual calendar month
  const today      = currentMonthYMD();
  const isOnToday  = budgetMonth === today;

  // ── Handlers ──────────────────────────────────────────────

  function goBack() {
    if (!canGoBack) return;
    setBudgetMonth(addMonthsToYM(budgetMonth, -1));
  }

  function goForward() {
    setBudgetMonth(addMonthsToYM(budgetMonth, +1));
  }

  function goToToday() {
    // navigateToFirstOpenMonth is now URL-aware (see useMonthStatus refactor)
    navigateToFirstOpenMonth();
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

      {!isOnToday && (
        <button
          onClick={goToToday}
          title="Wróć do bieżącego miesiąca"
          style={{
            background:   "#10b98118",
            border:       "1px solid #10b98144",
            borderRadius: 8,
            color:        "#10b981",
            cursor:       "pointer",
            fontSize:     11,
            fontWeight:   700,
            padding:      "4px 10px",
            whiteSpace:   "nowrap",
            transition:   "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#10b98130")}
          onMouseLeave={e => (e.currentTarget.style.background = "#10b98118")}
        >
          ⌂ Aktualny miesiąc
        </button>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 10, padding: "4px 6px" }}>
        <button
          onClick={goBack}
          disabled={!canGoBack}
          title={!canGoBack ? `Najwcześniejszy miesiąc: ${startMonth}` : "Poprzedni miesiąc"}
          style={{
            background: "transparent",
            border:     "none",
            color:      canGoBack ? "#94a3b8" : "#1e293b",
            padding:    "4px 10px",
            cursor:     canGoBack ? "pointer" : "default",
            fontSize:   18,
          }}
        >
          ‹
        </button>

        <div style={{ textAlign: "center", minWidth: 100 }}>
          <div style={{ color: "#10b981", fontWeight: 800, fontSize: 15 }}>
            {MONTHS[month]}
          </div>
          <div style={{ color: "#475569", fontSize: 10 }}>{year}</div>
        </div>

        <button
          onClick={goForward}
          title="Następny miesiąc"
          style={{
            background: "transparent",
            border:     "none",
            color:      "#94a3b8",
            padding:    "4px 10px",
            cursor:     "pointer",
            fontSize:   18,
          }}
        >
          ›
        </button>
      </div>
    </div>
  );
}
