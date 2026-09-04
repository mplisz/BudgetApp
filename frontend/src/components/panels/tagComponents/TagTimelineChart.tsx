// ============================================================
// File: src/components/panels/tagComponents/TagTimelineChart.tsx
// Spend over time under one tag.
//
// Bars, not a line: the buckets are discrete (a day, a month) and a trip has
// quiet days, which a line would smooth into a slope that never happened.
// One series, so it carries the semantic expense colour rather than a
// categorical hue, and needs no legend — the section title names it.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fmt, monthLabel } from "../../../utils/helpers";
import {
  SERIES, chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle,
  AXIS_STROKE, AXIS_FONT_SIZE, plnTick, toNum, ChartEmpty,
} from "../analyticsComponents/chartKit";

export type TimelineGrain = "day" | "month";

interface TagTimelineChartProps {
  /** "YYYY-MM-DD" for day grain, "YYYY-MM" for month grain. */
  data:  Array<{ key: string; amount: number }>;
  grain: TimelineGrain;
}

/** "2026-07-15" → "15.07"; month grain keeps the full Polish month name. */
function tickLabel(key: string, grain: TimelineGrain): string {
  if (grain === "month") return monthLabel(key);
  const [, m, d] = key.split("-");
  return `${d}.${m}`;
}

export function TagTimelineChart({ data, grain }: TagTimelineChartProps) {
  if (data.length === 0) return <ChartEmpty message="Brak wydatków w tym zakresie." />;

  const rows = data.map(d => ({ ...d, label: tickLabel(d.key, grain) }));

  // A long daily series gets crowded ticks; thin them out rather than letting
  // recharts drop labels at random.
  const tickGap = rows.length > 45 ? 6 : rows.length > 20 ? 2 : 0;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={alpha(c.border, "55")} vertical={false} />
        <XAxis
          dataKey="label"
          stroke={AXIS_STROKE}
          fontSize={AXIS_FONT_SIZE}
          interval={tickGap}
          tickLine={false}
        />
        <YAxis stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} tickFormatter={plnTick} width={56} />
        <Tooltip
          cursor={{ fill: alpha(c.border, "22") }}
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          itemStyle={chartTooltipItemStyle}
          formatter={(v: unknown) => [fmt(toNum(v)), "Wydatki"]}
        />
        <Bar dataKey="amount" fill={SERIES.expenses} radius={[4, 4, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  );
}
