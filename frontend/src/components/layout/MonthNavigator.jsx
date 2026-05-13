// ============================================================
// File: frontend/src/components/layout/MonthNavigator.jsx
// ============================================================

import { useAppContext } from "../../context/AppContext";
import { MONTHS } from "../../data/constants";

export function MonthNavigator() {
  const { month, setMonth, year, setYear, settings } = useAppContext();

  // settings.appStartMonth format: "YYYY-MM"
  const startMonth = settings?.appStartMonth;
  const [startYear, startM] = startMonth
    ? startMonth.split("-").map(Number)
    : [null, null];

  const canGoBack = !startMonth || (year > startYear || (year === startYear && month > startM - 1));

  function goBack() {
    if (!canGoBack) return;
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function goForward() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 10, padding: "4px 6px" }}>
      <button
        style={{ background: "transparent", border: "none", color: canGoBack ? "#94a3b8" : "#1e293b", padding: "4px 10px", cursor: canGoBack ? "pointer" : "default", fontSize: 18 }}
        onClick={goBack}
        disabled={!canGoBack}
        title={!canGoBack ? `Najwcześniejszy miesiąc: ${startMonth}` : undefined}>
        ‹
      </button>
      <div style={{ textAlign: "center", minWidth: 100 }}>
        <div style={{ color: "#10b981", fontWeight: 800, fontSize: 15 }}>{MONTHS[month]}</div>
        <div style={{ color: "#475569", fontSize: 10 }}>{year}</div>
      </div>
      <button
        style={{ background: "transparent", border: "none", color: "#94a3b8", padding: "4px 10px", cursor: "pointer", fontSize: 18 }}
        onClick={goForward}>
        ›
      </button>
    </div>
  );
}