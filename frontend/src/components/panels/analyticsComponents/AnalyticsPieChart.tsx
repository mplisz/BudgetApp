// ============================================================
// File: src/components/panels/analyticsComponents/AnalyticsPieChart.tsx
// Pie chart of category spending across the range, with drill-down
// into subcategories on click.
// ============================================================

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { fmt } from "../../../utils/helpers";

export interface AnalyticsCategorySlice {
  categoryId:   string;
  categoryName: string;
  icon?:        string;
  total:        number;
  // Optional breakdown for drill-down
  subcategories?: Array<{
    subcategoryId:   string;
    subcategoryName: string;
    total:           number;
  }>;
}

interface AnalyticsPieChartProps {
  data: AnalyticsCategorySlice[];
}

const PIE_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e",
];

export function AnalyticsPieChart({ data }: AnalyticsPieChartProps) {
  const [drillCategoryId, setDrillCategoryId] = useState<string | null>(null);

  if (data.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
        Brak wydatków w zakresie.
      </div>
    );
  }

  const drillCategory = drillCategoryId
    ? data.find(c => c.categoryId === drillCategoryId)
    : null;

  // Build chart data — either categories or subcategories of the drill target
  const chartData = drillCategory && drillCategory.subcategories
    ? drillCategory.subcategories.map(s => ({
        name:  s.subcategoryName,
        value: s.total,
      }))
    : data
        .filter(c => c.total > 0)
        .map(c => ({
          name:        `${c.icon || ""} ${c.categoryName}`.trim(),
          value:       c.total,
          _categoryId: c.categoryId,
        }));

  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      {/* Drill-down header */}
      {drillCategory && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>
            {drillCategory.icon} {drillCategory.categoryName} — podkategorie
          </div>
          <button
            onClick={() => setDrillCategoryId(null)}
            style={{
              background: "#1e293b", border: "1px solid #334155",
              color: "#94a3b8", borderRadius: 8, padding: "4px 12px",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}
          >
            ⬅️ Powrót
          </button>
        </div>
      )}

      {!drillCategory && (
        <div style={{ color: "#475569", fontSize: 11, marginBottom: 8, textAlign: "center" }}>
          Kliknij wycinek aby zobaczyć podkategorie
        </div>
      )}

      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            cx="50%" cy="50%"
            outerRadius={110}
            stroke="#0d1424"
            strokeWidth={2}
            onClick={(payload: { _categoryId?: string }) => {
              if (!drillCategory && payload._categoryId) {
                setDrillCategoryId(payload._categoryId);
              }
            }}
            cursor={!drillCategory ? "pointer" : "default"}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 8 }}
            formatter={(v: number) => [
              `${fmt(v)} zł (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`,
              "Suma",
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value: string) => <span style={{ color: "#cbd5e1" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
