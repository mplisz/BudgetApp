// ============================================================
// File: src/components/panels/analyticsComponents/AnalyticsPieChart.tsx
// Pie chart of category spending across the range, with drill-down
// into subcategories on click.
//
// Now reused for BOTH expense structure and income structure — pass
// `emptyMessage` to tailor the empty-state wording.
// ============================================================

import { c } from "../../../styles/tokens";
import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { fmt } from "../../../utils/helpers";
import { CHART_COLORS, chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, toNum, ChartEmpty } from "./chartKit";

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
  emptyMessage?: string;
}

export function AnalyticsPieChart({ data, emptyMessage }: AnalyticsPieChartProps) {
  const [drillCategoryId, setDrillCategoryId] = useState<string | null>(null);

  if (data.length === 0) {
    return <ChartEmpty message={emptyMessage ?? "Brak wydatków w zakresie."} />;
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
          <div style={{ color: c.textTertiary, fontSize: 13, fontWeight: 600 }}>
            {drillCategory.icon} {drillCategory.categoryName} — podkategorie
          </div>
          <button
            onClick={() => setDrillCategoryId(null)}
            style={{
              background: c.border, border: `1px solid ${c.borderStrong}`,
              color: c.textTertiary, borderRadius: 8, padding: "4px 12px",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}
          >
            ⬅️ Powrót
          </button>
        </div>
      )}

      {!drillCategory && (
        <div style={{ color: c.textMuted, fontSize: 11, marginBottom: 8, textAlign: "center" }}>
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
            stroke={c.surface}
            strokeWidth={2}
            onClick={(data: unknown) => {
              const payload = data as { _categoryId?: string };
              if (!drillCategory && payload._categoryId) {
                setDrillCategoryId(payload._categoryId);
              }
              }}
            cursor={!drillCategory ? "pointer" : "default"}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
            formatter={(v: unknown) => {
              const num = toNum(v);
              return [
                `${fmt(num)} zł (${total > 0 ? ((num / total) * 100).toFixed(1) : 0}%)`,
                "Suma",
              ];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value: string) => <span style={{ color: c.textBody }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
