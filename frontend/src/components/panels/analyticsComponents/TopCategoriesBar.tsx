// ============================================================
// File: src/components/panels/analyticsComponents/TopCategoriesBar.tsx
// Horizontal bar chart — top N categories by total amount.
// ============================================================

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { fmt } from "../../../utils/helpers";

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

const BAR_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#10b981", "#06b6d4", "#3b82f6",
  "#8b5cf6", "#a855f7",
];

export function TopCategoriesBar({ data, topN = 10, onClick }: TopCategoriesBarProps) {
  const sorted = [...data].sort((a, b) => b.total - a.total).slice(0, topN);

  if (sorted.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
        Brak wydatków w zakresie.
      </div>
    );
  }

  // Add icon to label for richer Y axis
  const chartData = sorted.map(c => ({
    ...c,
    label: `${c.icon || ""} ${c.categoryName}`.trim(),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 34)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 8 }}>
        <XAxis type="number" stroke="#475569" fontSize={11} tickFormatter={v => fmt(v)} />
        <YAxis type="category" dataKey="label" stroke="#cbd5e1" fontSize={12} width={140} />
        <Tooltip
          cursor={{ fill: "#1e293b22" }}
          contentStyle={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 8 }}
          formatter={(v: number, _name: string, item: { payload: CategoryTotal }) =>
            [`${fmt(v)} zł (${item.payload.share.toFixed(1)}%)`, "Suma"]
          }
        />
        <Bar
          dataKey="total" radius={[0, 6, 6, 0]}
          onClick={(payload: { payload?: CategoryTotal }) => onClick && payload?.payload && onClick(payload.payload)}
          cursor={onClick ? "pointer" : "default"}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
