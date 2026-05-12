// ============================================================
// File: src/components/layout/MonthNavigator.jsx
// ============================================================

import { useAppContext } from "../../context/AppContext";
import { MONTHS } from "../../data/constants";

export function MonthNavigator() {
  const { month, setMonth, year, setYear } = useAppContext();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 10, padding: "4px 6px" }}>
      <button
        style={{ background: "transparent", border: "none", color: "#94a3b8", padding: "4px 10px", cursor: "pointer", fontSize: 18 }}
        onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}>
        ‹
      </button>
      <div style={{ textAlign: "center", minWidth: 100 }}>
        <div style={{ color: "#10b981", fontWeight: 800, fontSize: 15 }}>{MONTHS[month]}</div>
        <div style={{ color: "#475569", fontSize: 10 }}>{year}</div>
      </div>
      <button
        style={{ background: "transparent", border: "none", color: "#94a3b8", padding: "4px 10px", cursor: "pointer", fontSize: 18 }}
        onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}>
        ›
      </button>
    </div>
  );
}