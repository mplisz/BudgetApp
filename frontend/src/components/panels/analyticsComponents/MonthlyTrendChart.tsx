// ============================================================
// File: src/components/panels/analyticsComponents/MonthlyTrendChart.tsx
// Line chart: income / transfers / expenses / savings / balance per month.
//
// #8 — when each point carries `expensesMA` (3-month trailing average of
// expenses, computed by the panel), a dashed overlay line is drawn so a
// one-off spike is visually separated from a real upward trend.
// ============================================================

import { c } from "../../../styles/tokens";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  SERIES, chartTooltipStyle, chartTooltipLabelStyle, AXIS_STROKE, AXIS_FONT_SIZE,
  plnLabel, ChartEmpty,
} from "./chartKit";

export interface MonthlyDataPoint {
  month:     string;   // "YYYY-MM"
  income:    number;
  transfers: number;
  expenses:  number;
  savings:   number;
  envelopes: number;   // money set aside into virtual envelopes that month
  balance:   number;   // income + transfers − expenses − savings − envelopes
  expensesMA?: number; // 3-month trailing average of expenses (#8)
}

interface MonthlyTrendChartProps {
  data: MonthlyDataPoint[];
}

export function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  if (data.length === 0) {
    return <ChartEmpty message="Brak danych w wybranym zakresie." />;
  }

  const hasMA = data.some(d => typeof d.expensesMA === "number");

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 12, right: 20, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
        <XAxis dataKey="month" stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} />
        <YAxis stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          formatter={(v: unknown) => plnLabel(v)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="income"    name="Wpływy"        stroke={SERIES.income}    strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="transfers" name="Transfery"     stroke={SERIES.transfers} strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="expenses"  name="Wydatki"       stroke={SERIES.expenses}  strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="savings"   name="Oszczędności"  stroke={SERIES.savings}   strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="balance"   name="Saldo"         stroke={SERIES.balance}   strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 4" />
        {hasMA && (
          <Line
            type="monotone"
            dataKey="expensesMA"
            name="Wydatki — średnia 3M"
            stroke={SERIES.movingAvg}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
