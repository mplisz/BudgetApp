// ============================================================
// File: src/components/panels/analyticsComponents/SavingsRateChart.tsx
// #3 — Savings rate over time: total savings as % of income, plus the
// retirement-only slice, drawn against the configured minimum targets.
// Denominator is INCOME only (transfers excluded), matching the semantics
// of settings.targets.* which are defined as "% dochodu miesięcznego".
// ============================================================

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import {
  chartTooltipStyle, chartTooltipLabelStyle, AXIS_STROKE, AXIS_FONT_SIZE,
  pctLabel, SERIES, ChartEmpty,
} from "./chartKit";

export interface SavingsRatePoint {
  month:          string;  // "YYYY-MM"
  rate:           number;  // total savings / income * 100
  retirementRate: number;  // retirement savings / income * 100
}

interface Props {
  data:                  SavingsRatePoint[];
  minSavingsPercent?:    number;
  minRetirementPercent?: number;
}

export function SavingsRateChart({ data, minSavingsPercent, minRetirementPercent }: Props) {
  if (data.length === 0) {
    return <ChartEmpty message="Brak danych w wybranym zakresie." />;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 12, right: 20, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="month" stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} />
        <YAxis
          stroke={AXIS_STROKE}
          fontSize={AXIS_FONT_SIZE}
          domain={[0, "auto"]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          formatter={(v: unknown, name: unknown) => [pctLabel(v), name as string]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />

        {typeof minSavingsPercent === "number" && (
          <ReferenceLine
            y={minSavingsPercent}
            stroke={SERIES.savings}
            strokeDasharray="5 4"
            label={{ value: `min oszczędności ${minSavingsPercent}%`, position: "insideTopRight", fill: SERIES.savings, fontSize: 11 }}
          />
        )}
        {typeof minRetirementPercent === "number" && (
          <ReferenceLine
            y={minRetirementPercent}
            stroke={SERIES.retirement}
            strokeDasharray="5 4"
            label={{ value: `min emerytura ${minRetirementPercent}%`, position: "insideBottomRight", fill: SERIES.retirement, fontSize: 11 }}
          />
        )}

        <Line type="monotone" dataKey="rate"           name="Stopa oszczędności" stroke={SERIES.savings}    strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="retirementRate" name="W tym emerytura"     stroke={SERIES.retirement} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
