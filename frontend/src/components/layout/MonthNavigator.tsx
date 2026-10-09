// ============================================================
// File: src/components/layout/MonthNavigator.tsx
// Month navigation with "back to current" button.
//
// Source of truth: the ?m= URL param (via useMonthFromUrl), NOT
// AppContext. This makes the month a deep-linkable, shareable piece
// of state — F5 and back/forward work naturally.
//
// "⌂ Aktualny miesiąc" semantics (point 1):
//   "Current" means the first OPEN budget month (skipping closed
//   months), NOT the calendar month. The button appears only when
//   the user has navigated away from that first-open month, and
//   clicking it returns there. This keeps the button consistent with
//   where the app naturally lands on load.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useAppContext }    from "../../context/AppContext";
import { useMonthStatus }   from "../../hooks/useMonthStatus";
import { useMonthFromUrl, addMonthsToYM } from "../../hooks/useMonthFromUrl";
import { MONTHS }           from "../../data/constants";
import { firstOpenMonth }   from "../../utils/helpers";

export function MonthNavigator() {
  const { settings, closedMonths } = useAppContext();

  const { budgetMonth, setBudgetMonth } = useMonthFromUrl();
  const { navigateToFirstOpenMonth }    = useMonthStatus();

  // budgetMonth is "YYYY-MM". Derive display parts.
  const [yearStr, monthStr] = budgetMonth.split("-");
  const year  = Number(yearStr);
  const month = Number(monthStr) - 1;  // 0-indexed for MONTHS[]

  // ── Floor (appStartMonth) ─────────────────────────────────
  const startMonth = settings?.appStartMonth;
  const canGoBack  = !startMonth || addMonthsToYM(budgetMonth, -1) >= startMonth;

  // ── "Back to current" visibility (point 1) ────────────────
  // Compare against the first OPEN budget month, not calendar month.
  const target    = firstOpenMonth(closedMonths);
  const isOnTarget = budgetMonth === target;

  // ── Handlers ──────────────────────────────────────────────

  function goBack() {
    if (!canGoBack) return;
    setBudgetMonth(addMonthsToYM(budgetMonth, -1));
  }

  function goForward() {
    setBudgetMonth(addMonthsToYM(budgetMonth, +1));
  }

  function goToCurrent() {
    // Navigate to the first open month (updates ?m= via useMonthStatus)
    navigateToFirstOpenMonth();
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

      {/* Back-to-current button — only when not already on first-open month */}
      {!isOnTarget && (
        <button
          onClick={goToCurrent}
          title="Wróć do bieżącego miesiąca budżetowego"
          style={{
            background:   alpha(c.success, "18"),
            border:       `1px solid ${alpha(c.success, "44")}`,
            borderRadius: 8,
            color:        c.success,
            cursor:       "pointer",
            fontSize:     11,
            fontWeight:   700,
            padding:      "4px 10px",
            whiteSpace:   "nowrap",
            transition:   "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = alpha(c.success, "30"))}
          onMouseLeave={e => (e.currentTarget.style.background = alpha(c.success, "18"))}
        >
          ⌂ Aktualny miesiąc
        </button>
      )}

      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: c.border, borderRadius: 10, padding: "4px 6px" }}>
        <button
          onClick={goBack}
          disabled={!canGoBack}
          title={!canGoBack ? `Najwcześniejszy miesiąc: ${startMonth}` : "Poprzedni miesiąc"}
          style={{
            background: "transparent",
            border:     "none",
            color:      canGoBack ? c.textTertiary : c.border,
            padding:    "4px 10px",
            cursor:     canGoBack ? "pointer" : "default",
            fontSize:   18,
          }}
        >
          ‹
        </button>

        <div style={{ textAlign: "center", minWidth: 100 }}>
          <div style={{ color: c.success, fontWeight: 800, fontSize: 15 }}>
            {(MONTHS as string[])[month]}
          </div>
          <div style={{ color: c.textMuted, fontSize: 10 }}>{year}</div>
        </div>

        <button
          onClick={goForward}
          title="Następny miesiąc"
          style={{
            background: "transparent",
            border:     "none",
            color:      c.textTertiary,
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
