// ============================================================
// File: src/components/panels/analyticsComponents/StackedMonthlyChart.tsx
// Generic stacked-bar chart over months. Series are caller-defined, so the
// same component powers BOTH:
//   #5 — fixed vs. variable expenses
//   #6 — savings contributions split by goal
// ============================================================

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  chartTooltipStyle, chartTooltipLabelStyle, AXIS_STROKE, AXIS_FONT_SIZE,
  plnLabel, plnTick, ChartEmpty,
} from "./chartKit";

export interface StackedSeries {
  key:   string;
  name:  string;
  color: string;
}

interface Props {
  data:          Array<{ month: string; [series: string]: number | string }>;
  series:        StackedSeries[];
  emptyMessage?: string;
}

export function StackedMonthlyChart({ data, series, emptyMessage }: Props) {
  if (data.length === 0 || series.length === 0) {
    return <ChartEmpty message={emptyMessage ?? "Brak danych w wybranym zakresie."} />;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 12, right: 20, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="month" stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} />
        <YAxis stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} tickFormatter={plnTick} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          cursor={{ fill: "#1e293b22" }}
          formatter={(v: unknown, name: unknown) => [plnLabel(v), name as string]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((sr, i) => (
          <Bar
            key={sr.key}
            dataKey={sr.key}
            name={sr.name}
            stackId="a"
            fill={sr.color}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
