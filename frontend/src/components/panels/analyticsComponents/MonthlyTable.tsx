// ============================================================
// File: src/components/panels/analyticsComponents/MonthlyTable.tsx
// Sortable table — one row per month with budget breakdown.
// Click on a row → switches active month and navigates to summary.
//
// Mobile: the 7-column grid can't shrink below ~560px without crushing,
// so the wrapper scrolls horizontally instead of clipping/squeezing.
// ============================================================

import { c } from "../../../styles/tokens";
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
    padding: "8px 12px", fontSize: 10, color: c.textMuted,
    textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700,
    textAlign: "left", borderBottom: `1px solid ${c.border}`, background: c.bgDeepest,
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "10px 12px", fontSize: 13, color: c.textBody,
    borderBottom: `1px solid ${c.surfaceAlt}`, whiteSpace: "nowrap",
  };

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
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
            const pctColor = pct > 90 ? c.danger : pct > 70 ? c.warning : c.success;
            return (
              <tr
                key={row.month}
                onClick={() => onClick(row.month)}
                onMouseEnter={e => e.currentTarget.style.background = c.bg}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                style={{ cursor: "pointer", transition: "background 0.1s" }}
              >
                <td style={{ ...td, fontWeight: 700, color: c.text }}>{row.month}</td>
                <td style={{ ...td, textAlign: "right", color: c.success }}>{fmt(row.income)}</td>
                <td style={{ ...td, textAlign: "right", color: row.transfers > 0 ? c.cyanLight : c.borderStrong }}>
                  {row.transfers > 0 ? fmt(row.transfers) : "—"}
                </td>
                <td style={{ ...td, textAlign: "right", color: c.danger }}>{fmt(row.expenses)}</td>
                <td style={{ ...td, textAlign: "right", color: row.savings > 0 ? c.info : c.borderStrong }}>
                  {row.savings > 0 ? fmt(row.savings) : "—"}
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, color: row.balance >= 0 ? c.success : c.danger }}>
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
