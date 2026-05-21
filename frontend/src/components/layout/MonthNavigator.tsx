// ============================================================
// File: src/components/layout/MonthNavigator.tsx
// Month navigation with "back to today" button.
// The today button appears only when the user has navigated
// away from the current calendar month.
// ============================================================

import { useAppContext }    from "../../context/AppContext";
import { useMonthStatus }   from "../../hooks/useMonthStatus";
import { MONTHS }           from "../../data/constants";

export function MonthNavigator() {
  const { month, setMonth, year, setYear, settings } = useAppContext() as {
    month:    number;
    setMonth: (m: number | ((prev: number) => number)) => void;
    year:     number;
    setYear:  (y: number | ((prev: number) => number)) => void;
    settings: { appStartMonth?: string } | null;
  };

  const { navigateToFirstOpenMonth } = useMonthStatus() as {
    navigateToFirstOpenMonth: () => void;
  };

  // ── Boundary check ────────────────────────────────────────

  const startMonth = settings?.appStartMonth;
  const [startYear, startM] = startMonth
    ? startMonth.split("-").map(Number)
    : [null, null];

  const canGoBack = !startMonth ||
    (year > (startYear ?? 0) || (year === startYear && month > (startM ?? 1) - 1));

  // ── "Back to today" visibility ────────────────────────────
  // Show when current nav month ≠ actual calendar month

  const now          = new Date();
  const todayMonth   = now.getMonth();
  const todayYear    = now.getFullYear();
  const isOnToday    = month === todayMonth && year === todayYear;

  // ── Handlers ──────────────────────────────────────────────

  function goBack() {
    if (!canGoBack) return;
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function goForward() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function goToToday() {
    // Navigate to the first open month starting from today
    navigateToFirstOpenMonth();
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

      {/* Back to today button — only when not already on current month */}
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

      {/* Month navigation */}
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
            {(MONTHS as string[])[month]}
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
