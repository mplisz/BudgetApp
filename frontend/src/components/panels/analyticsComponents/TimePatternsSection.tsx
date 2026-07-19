// ============================================================
// File: src/components/panels/analyticsComponents/TimePatternsSection.tsx
// Time-patterns section: WHEN the money leaves. All math lives in
// utils/timePatterns.ts (pure, unit-tested); this component renders:
//   - weekday profile bar (avg per weekday occurrence, priciest in red)
//   - day-of-month curve with detected payday markers and the
//     post-payday spend multiplier per payday
//   - weekday × month heatmap (reuses CategoryHeatmap)
// Default = variable expenses only; a toggle adds fixed ones back.
// Transactions carry no time-of-day, so there is no hourly view.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useMemo, useState } from "react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { theme as s } from "../../../styles/theme";
import { fmt } from "../../../utils/helpers";
import {
  weekdayProfile, weekdayInsights, dayOfMonthProfile,
  detectPaydays, postPaydayAnalysis, weekdayHeatmap,
  WEEKDAY_SHORT, WEEKDAY_FULL, POST_PAYDAY_WINDOW,
  type TimeTx,
} from "../../../utils/timePatterns";
import { CategoryHeatmap, type HeatmapRow } from "./CategoryHeatmap";
import {
  SERIES, chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle,
  AXIS_STROKE, AXIS_FONT_SIZE, plnTick, plnLabel, ChartEmpty,
} from "./chartKit";

interface Props {
  transactions: TimeTx[];
  months:       string[];   // ordered "YYYY-MM" list (oldest -> newest)
}

export function TimePatternsSection({ transactions, months }: Props) {
  const [includeFixed, setIncludeFixed] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);

  const weekdays = useMemo(
    () => weekdayProfile(transactions, months, todayStr, includeFixed),
    [transactions, months, todayStr, includeFixed],
  );
  const insights = useMemo(() => weekdayInsights(weekdays), [weekdays]);

  const dayRows = useMemo(
    () => dayOfMonthProfile(transactions, months, todayStr, includeFixed),
    [transactions, months, todayStr, includeFixed],
  );
  const paydays = useMemo(() => detectPaydays(transactions, months), [transactions, months]);
  const impacts = useMemo(() => postPaydayAnalysis(dayRows, paydays), [dayRows, paydays]);

  const heatmapRows = useMemo<HeatmapRow[]>(
    () => weekdayHeatmap(transactions, months, includeFixed).map(r => ({
      categoryId:   `wd-${r.weekday}`,
      categoryName: WEEKDAY_FULL[r.weekday],
      byMonth:      r.byMonth,
    })),
    [transactions, months, includeFixed],
  );

  if (weekdays.every(r => r.total === 0)) {
    return <ChartEmpty message="Brak wydatków zmiennych w wybranym zakresie." />;
  }

  const label: React.CSSProperties = { fontSize: 11, color: c.textMuted };
  const subtitle: React.CSSProperties = { fontSize: 12, color: c.textMuted, fontWeight: 700, marginBottom: 8 };
  const topWeekday = insights.top?.weekday ?? -1;

  return (
    <div>
      {/* Fixed/variable toggle — fixed costs are scheduled, not impulsive */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <span style={label}>
          Domyślnie tylko wydatki zmienne — stałe (czynsz, abonamenty) mają ustalone dni, nie mówią nic o impulsach.
        </span>
        <div style={s.toggle(includeFixed)} onClick={() => setIncludeFixed(v => !v)}>
          <div style={s.toggleBox(includeFixed)}><div style={s.toggleDot(includeFixed)} /></div>
          wliczaj stałe
        </div>
      </div>

      {/* Weekday profile */}
      <div style={subtitle}>📅 Średnie wydatki wg dnia tygodnia (zł / dzień)</div>
      {insights.top && (
        <div style={{ ...label, marginBottom: 8 }}>
          💥 Najdroższy dzień: <strong style={{ color: c.text }}>{WEEKDAY_FULL[topWeekday]}</strong>{" "}
          — śr. {fmt(insights.top.avgPerDay)}/dzień,{" "}
          <strong style={{ color: c.danger }}>+{insights.topAbovePct.toFixed(0)}%</strong> vs średnia
          {" · weekend "}{fmt(insights.weekendAvg)}/dzień vs dni robocze {fmt(insights.workdayAvg)}/dzień
        </div>
      )}
      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          data={weekdays.map(r => ({ ...r, name: WEEKDAY_SHORT[r.weekday] }))}
          margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
        >
          <XAxis dataKey="name" stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} />
          <YAxis stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} tickFormatter={plnTick} width={56} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
            formatter={(v: unknown) => [plnLabel(v), "Średnio / dzień"]}
          />
          <Bar dataKey="avgPerDay" radius={[4, 4, 0, 0]}>
            {weekdays.map(r => (
              <Cell key={r.weekday} fill={r.weekday === topWeekday ? SERIES.expenses : alpha(c.info, "99")} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Day-of-month curve with payday markers */}
      <div style={{ ...subtitle, marginTop: 16 }}>📆 Średnie wydatki wg dnia miesiąca</div>
      {impacts.length > 0 && (
        <div style={{ ...label, marginBottom: 8 }}>
          {impacts.map((im, i) => (
            <span key={im.day}>
              {i > 0 && " · "}
              💰 po „{im.label}” (~{im.day}.):{" "}
              {im.multiplier === null
                ? "za mało danych"
                : <strong style={{ color: im.multiplier > 1.2 ? c.danger : c.success }}>
                    {im.multiplier.toFixed(1)}× tempo bazowe
                  </strong>}
            </span>
          ))}
          <span> (okno {POST_PAYDAY_WINDOW} dni)</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={dayRows.filter(r => r.days > 0)} margin={{ top: 18, right: 16, bottom: 0, left: 0 }}>
          <XAxis dataKey="day" stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} interval={2} />
          <YAxis stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} tickFormatter={plnTick} width={56} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
            labelFormatter={(d: unknown) => `${d}. dzień miesiąca`}
            formatter={(v: unknown) => [plnLabel(v), "Średnio / dzień"]}
          />
          <Bar dataKey="avgPerDay" fill={alpha(c.info, "99")} radius={[3, 3, 0, 0]} />
          {paydays.map(p => (
            <ReferenceLine
              key={p.day}
              x={p.day}
              stroke={c.success}
              strokeDasharray="4 3"
              label={{ value: `💰 ${p.label} ~${p.day}.`, position: "top", fill: c.successLight, fontSize: 10 }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {paydays.length === 0 && (
        <div style={{ ...label, marginTop: 4 }}>
          Bez markera wypłaty — wpływy są zbyt nieregularne albo zakres za krótki (min. 3 miesiące).
        </div>
      )}

      {/* Weekday × month heatmap — is the pattern consistent? */}
      <div style={{ ...subtitle, marginTop: 16 }}>🔥 Dzień tygodnia × miesiąc</div>
      <CategoryHeatmap rows={heatmapRows} months={months} />
    </div>
  );
}
