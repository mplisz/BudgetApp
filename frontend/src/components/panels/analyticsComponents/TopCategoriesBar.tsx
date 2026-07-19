// ============================================================
// File: src/components/panels/analyticsComponents/TopCategoriesBar.tsx
// Horizontal bar chart — top N categories by total amount.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { fmt } from "../../../utils/helpers";
import {
  CHART_COLORS, chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle,
  AXIS_STROKE, AXIS_FONT_SIZE, plnTick, toNum, ChartEmpty,
} from "./chartKit";

export interface CategoryTotal {
  categoryId:   string;
  categoryName: string;
  icon?:        string;
  total:        number;
  share:        number;   // 0–100
}

interface TopCategoriesBarProps {
  data:   CategoryTotal[];
  topN?:  number;
  onClick?: (cat: CategoryTotal) => void;
}

export function TopCategoriesBar({ data, topN = 10, onClick }: TopCategoriesBarProps) {
  const sorted = [...data].sort((a, b) => b.total - a.total).slice(0, topN);

  if (sorted.length === 0) {
    return <ChartEmpty message="Brak wydatków w zakresie." />;
  }

  // Add icon to label for richer Y axis
  const chartData = sorted.map(c => ({
    ...c,
    label: `${c.icon || ""} ${c.categoryName}`.trim(),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 34)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 8 }}>
        <XAxis type="number" stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} tickFormatter={plnTick} />
        <YAxis type="category" dataKey="label" stroke={c.textBody} fontSize={12} width={140} />
        <Tooltip
          cursor={{ fill: alpha(c.border, "22") }}
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          itemStyle={chartTooltipItemStyle}
          formatter={(v: unknown, _name: unknown, item: unknown) => {
            const num = toNum(v);
            const payload = (item as { payload?: CategoryTotal })?.payload;
            const share = payload?.share ?? 0;
            return [`${fmt(num)} (${share.toFixed(1)}%)`, "Suma"];
          }}
        />
        <Bar
          dataKey="total" radius={[0, 6, 6, 0]}
          onClick={(data: unknown) => {
            const payload = (data as { payload?: CategoryTotal })?.payload;
            if (onClick && payload) onClick(payload);
          }}
          cursor={onClick ? "pointer" : "default"}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
