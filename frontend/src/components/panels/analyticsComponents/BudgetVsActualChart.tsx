// ============================================================
// File: src/components/panels/analyticsComponents/BudgetVsActualChart.tsx
// #1 — Grouped bars per month: budgeted limit vs. actual expenses.
// The "Wydano" bar turns red in months where spending exceeds the limit.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer,
} from "recharts";
import {
  chartTooltipStyle, chartTooltipLabelStyle, AXIS_STROKE, AXIS_FONT_SIZE,
  plnLabel, plnTick, SERIES, ChartEmpty,
} from "./chartKit";

export interface BudgetVsActualPoint {
  month:    string;   // "YYYY-MM"
  limit:    number;   // sum of active limits across expense categories
  expenses: number;   // actual (effective) expenses
}

interface Props {
  data: BudgetVsActualPoint[];
}

export function BudgetVsActualChart({ data }: Props) {
  if (data.length === 0) {
    return <ChartEmpty message="Brak danych w wybranym zakresie." />;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 12, right: 20, bottom: 0, left: -10 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
        <XAxis dataKey="month" stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} />
        <YAxis stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} tickFormatter={plnTick} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          cursor={{ fill: alpha(c.border, "22") }}
          formatter={(v: unknown, name: unknown) => [plnLabel(v), name as string]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="limit" name="Budżet (limit)" fill={SERIES.limit} radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name="Wydano" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.expenses > d.limit && d.limit > 0 ? SERIES.over : SERIES.income} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
