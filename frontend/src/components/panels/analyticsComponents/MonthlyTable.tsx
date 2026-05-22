// ============================================================
// File: src/components/panels/analyticsComponents/MonthlyTable.tsx
// Sortable table — one row per month with budget breakdown.
// Click on a row → switches active month and navigates to summary.
// ============================================================

import { fmt } from "../../../utils/helpers";
import type { MonthlyDataPoint } from "./MonthlyTrendChart";

interface MonthlyTableProps {
  data:    MonthlyDataPoint[];
  onClick: (month: string) => void;
}

export function MonthlyTable({ data, onClick }: MonthlyTableProps) {
  if (data.length === 0) return null;

  // Newest first
  const sorted = [...data].sort((a, b) => b.month.localeCompare(a.month));

  const th: React.CSSProperties = {
    padding: "8px 12px", fontSize: 10, color: "#475569",
    textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700,
    textAlign: "left", borderBottom: "1px solid #1e293b", background: "#090e1b",
  };

  const td: React.CSSProperties = {
    padding: "10px 12px", fontSize: 13, color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <div style={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Miesiąc</th>
            <th style={{ ...th, textAlign: "right" }}>Wpływy</th>
            <th style={{ ...th, textAlign: "right" }}>Transfery</th>
            <th style={{ ...th, textAlign: "right" }}>Wydatki</th>
            <th style={{ ...th, textAlign: "right" }}>Oszczędności</th>
            <th style={{ ...th, textAlign: "right" }}>Saldo</th>
            <th style={{ ...th, textAlign: "right" }}>% wpływów</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => {
            const real    = row.income + row.transfers;
            const pct     = real > 0 ? (row.expenses / real) * 100 : 0;
            const pctColor = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#10b981";
            return (
              <tr
                key={row.month}
                onClick={() => onClick(row.month)}
                onMouseEnter={e => e.currentTarget.style.background = "#0a0f1e"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                style={{ cursor: "pointer", transition: "background 0.1s" }}
              >
                <td style={{ ...td, fontWeight: 700, color: "#e2e8f0" }}>{row.month}</td>
                <td style={{ ...td, textAlign: "right", color: "#10b981" }}>{fmt(row.income)}</td>
                <td style={{ ...td, textAlign: "right", color: row.transfers > 0 ? "#22d3ee" : "#334155" }}>
                  {row.transfers > 0 ? fmt(row.transfers) : "—"}
                </td>
                <td style={{ ...td, textAlign: "right", color: "#ef4444" }}>{fmt(row.expenses)}</td>
                <td style={{ ...td, textAlign: "right", color: row.savings > 0 ? "#3b82f6" : "#334155" }}>
                  {row.savings > 0 ? fmt(row.savings) : "—"}
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, color: row.balance >= 0 ? "#10b981" : "#ef4444" }}>
                  {row.balance >= 0 ? "+" : ""}{fmt(row.balance)}
                </td>
                <td style={{ ...td, textAlign: "right", color: pctColor, fontWeight: 600 }}>
                  {pct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
