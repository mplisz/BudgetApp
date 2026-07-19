// ============================================================
// File: src/components/panels/analyticsComponents/MonthlyDeltaChart.tsx
// #7 — How each category's latest-month spend deviates from a baseline.
// The caller supplies `previous` as the comparison value; the panel uses the
// average of the preceding months in the selected range, so the range length
// matters and a single outlier month is smoothed out.
// Diverging horizontal bars: right = spent MORE than baseline (red),
// left = spent LESS (green). Sorted by size of deviation, top N. Axis is
// symmetric around zero so the divergence reads cleanly.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { fmt } from "../../../utils/helpers";
import {
  chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle,
  AXIS_STROKE, AXIS_FONT_SIZE, plnTick, toNum, SERIES, ChartEmpty,
} from "./chartKit";

export interface CategoryDelta {
  categoryId:   string;
  categoryName: string;
  icon?:        string;
  current:      number;   // latest month
  previous:     number;   // baseline to compare against (e.g. avg of prior months)
  delta:        number;   // current − previous
}

interface Props {
  data:  CategoryDelta[];
  topN?: number;
}

export function MonthlyDeltaChart({ data, topN = 10 }: Props) {
  if (data.length === 0) {
    return <ChartEmpty message="Potrzebne co najmniej dwa miesiące z wydatkami." />;
  }

  const top = [...data]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, topN)
    .map(c => ({ ...c, label: `${c.icon || ""} ${c.categoryName}`.trim() }));

  const maxAbs = Math.max(...top.map(c => Math.abs(c.delta)), 1);

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, top.length * 34)}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <XAxis
          type="number"
          domain={[-maxAbs, maxAbs]}
          stroke={AXIS_STROKE}
          fontSize={AXIS_FONT_SIZE}
          tickFormatter={plnTick}
        />
        <YAxis type="category" dataKey="label" stroke={c.textBody} fontSize={12} width={140} />
        <ReferenceLine x={0} stroke={c.borderStrong} />
        <Tooltip
          cursor={{ fill: alpha(c.border, "22") }}
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          itemStyle={chartTooltipItemStyle}
          formatter={(v: unknown, _name: unknown, item: unknown) => {
            const num  = toNum(v);
            const p    = (item as { payload?: CategoryDelta })?.payload;
            const sign = num > 0 ? "+" : num < 0 ? "−" : "";
            const ctx  = p ? ` (śr. ${fmt(p.previous)} → bież. ${fmt(p.current)})` : "";
            return [`${sign}${fmt(Math.abs(num))} zł${ctx}`, "Odchylenie od średniej"];
          }}
        />
        <Bar dataKey="delta" radius={[2, 2, 2, 2]}>
          {top.map((d, i) => (
            <Cell key={i} fill={d.delta > 0 ? SERIES.up : SERIES.down} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
