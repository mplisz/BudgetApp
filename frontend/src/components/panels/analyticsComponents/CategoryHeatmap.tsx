// ============================================================
// File: src/components/panels/analyticsComponents/CategoryHeatmap.tsx
// Heatmap: rows = categories, columns = months, cell color by amount.
// Color scale relative to MAX cell value across the matrix (per-cell intensity).
// ============================================================

import { fmt } from "../../../utils/helpers";

export interface HeatmapRow {
  categoryId:    string;
  categoryName:  string;
  icon?:         string;
  // Map of "YYYY-MM" -> amount in PLN
  byMonth:       Record<string, number>;
}

interface CategoryHeatmapProps {
  rows:    HeatmapRow[];
  months:  string[];   // ordered "YYYY-MM" list (oldest -> newest)
  onClick?: (categoryId: string, month: string) => void;
}

function colorForIntensity(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "#0a0f1e";
  const intensity = Math.min(1, value / max);
  // Green (low) -> yellow -> orange -> red (high)
  if (intensity < 0.25) return `rgba(16, 185, 129, ${0.15 + intensity})`;
  if (intensity < 0.50) return `rgba(234, 179, 8,  ${0.20 + intensity * 0.6})`;
  if (intensity < 0.75) return `rgba(249, 115, 22, ${0.30 + intensity * 0.5})`;
  return `rgba(239, 68, 68, ${0.45 + intensity * 0.5})`;
}

export function CategoryHeatmap({ rows, months, onClick }: CategoryHeatmapProps) {
  if (rows.length === 0 || months.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
        Brak danych dla heatmapy.
      </div>
    );
  }

  // Find global max for intensity scale
  let maxValue = 0;
  for (const row of rows) {
    for (const m of months) {
      maxValue = Math.max(maxValue, row.byMonth[m] || 0);
    }
  }

  return (
    <div style={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 12, padding: "12px", overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 2, minWidth: "100%" }}>
        <thead>
          <tr>
            <th style={{ minWidth: 160, padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700 }}>
              Kategoria
            </th>
            {months.map(m => (
              <th key={m} style={{ minWidth: 70, padding: "6px 4px", textAlign: "center", fontSize: 10, color: "#475569", fontWeight: 700 }}>
                {m.slice(2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const rowTotal = months.reduce((s, m) => s + (row.byMonth[m] || 0), 0);
            return (
              <tr key={row.categoryId}>
                <td style={{ padding: "6px 10px", fontSize: 12, color: "#cbd5e1", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {row.icon} {row.categoryName}
                  <span style={{ marginLeft: 6, color: "#475569", fontSize: 10, fontWeight: 400 }}>
                    {fmt(rowTotal)}
                  </span>
                </td>
                {months.map(m => {
                  const value = row.byMonth[m] || 0;
                  return (
                    <td
                      key={m}
                      onClick={() => onClick && onClick(row.categoryId, m)}
                      title={`${row.categoryName} · ${m} · ${fmt(value)} zł`}
                      style={{
                        textAlign: "center",
                        padding: "8px 4px",
                        background: colorForIntensity(value, maxValue),
                        borderRadius: 6,
                        fontSize: 10,
                        color: value > maxValue * 0.5 ? "#fff" : "#94a3b8",
                        cursor: onClick ? "pointer" : "default",
                        minWidth: 70,
                        fontWeight: 600,
                      }}
                    >
                      {value > 0 ? fmt(value) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", fontSize: 10, color: "#475569" }}>
        Skala:
        <span style={{ width: 18, height: 12, background: "rgba(16,185,129,0.4)", borderRadius: 3 }} />
        niska
        <span style={{ width: 18, height: 12, background: "rgba(234,179,8,0.6)",  borderRadius: 3 }} />
        średnia
        <span style={{ width: 18, height: 12, background: "rgba(249,115,22,0.8)", borderRadius: 3 }} />
        wysoka
        <span style={{ width: 18, height: 12, background: "rgba(239,68,68,0.9)",  borderRadius: 3 }} />
        max
      </div>
    </div>
  );
}
