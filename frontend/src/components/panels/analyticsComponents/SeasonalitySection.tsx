// ============================================================
// File: src/components/panels/analyticsComponents/SeasonalitySection.tsx
// Seasonality / year-over-year section. All math lives in
// utils/seasonality.ts (pure, unit-tested).
//
// DATA WINDOW: independent of the panel's range picker — YoY needs 13+
// months and the picker defaults to 6, so this section fetches its own
// fixed window: last 24 months (backend max), clamped to appStartMonth.
// It lives inside a collapsed-by-default CollapsibleSection, which does
// not mount children, so the fetch fires lazily on first expand.
//
// Renders:
//   - year overlay line chart (Sty..Gru, one line per year)
//   - month picker + same-month-last-year per-category delta
//     (reuses MonthlyDeltaChart with previous = year-earlier month)
//   - honest gate: when < 13 months of history, shows the unlock date
// ============================================================

import { c } from "../../../styles/tokens";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useAppContext } from "../../../context/AppContext";
import { useTransactionsRange } from "../../../hooks/useTransactionsRange";
import { MONTH_NAMES } from "../../../hooks/useRecurring";
import { theme as s } from "../../../styles/theme";
import { fmt } from "../../../utils/helpers";
import {
  shiftMonth, enumerateMonths, yearOverlay,
  yoyEligibleMonths, defaultYoyMonth, yoyUnlockMonth, yoyComparison,
  type SeasonalityTx,
} from "../../../utils/seasonality";
import { MonthlyDeltaChart } from "./MonthlyDeltaChart";
import {
  CHART_COLORS, chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle,
  AXIS_STROKE, AXIS_FONT_SIZE, plnTick, plnLabel, ChartEmpty,
} from "./chartKit";

const WINDOW_MONTHS = 24;   // backend /range maximum

export function SeasonalitySection() {
  const { settings, categories } = useAppContext();
  const { transactions, isLoading, loadRange } = useTransactionsRange();
  const [selectedMonth, setSelectedMonth] = useState("");

  const currentMonth = new Date().toISOString().slice(0, 7);
  const floor = settings?.appStartMonth;
  const rawFrom = shiftMonth(currentMonth, -(WINDOW_MONTHS - 1));
  const fromMonth = floor && rawFrom < floor ? floor : rawFrom;

  useEffect(() => {
    loadRange(fromMonth, currentMonth);
  }, [fromMonth, currentMonth, loadRange]);

  const months = useMemo(() => enumerateMonths(fromMonth, currentMonth), [fromMonth, currentMonth]);
  const txs = transactions as unknown as SeasonalityTx[];

  const overlay = useMemo(() => yearOverlay(txs, months), [txs, months]);
  const eligible = useMemo(() => yoyEligibleMonths(months), [months]);

  const effectiveMonth = eligible.includes(selectedMonth)
    ? selectedMonth
    : defaultYoyMonth(eligible, currentMonth);

  const yoy = useMemo(
    () => (effectiveMonth ? yoyComparison(txs, effectiveMonth) : null),
    [txs, effectiveMonth],
  );

  // MonthlyDeltaChart expects icons — resolve them here, not in utils.
  const deltaData = useMemo(
    () => (yoy?.deltas ?? []).map(d => ({
      ...d,
      icon: categories.find(cat => cat.id === d.categoryId)?.icon,
    })),
    [yoy, categories],
  );

  if (isLoading) {
    return <div style={{ color: c.textMuted, textAlign: "center", padding: 40 }}>Ładowanie…</div>;
  }

  const label: React.CSSProperties = { fontSize: 11, color: c.textMuted };
  const subtitle: React.CSSProperties = { fontSize: 12, color: c.textMuted, fontWeight: 700, marginBottom: 8 };
  const yoyChangePct = yoy && yoy.totals.previous > 0
    ? ((yoy.totals.current - yoy.totals.previous) / yoy.totals.previous) * 100
    : null;

  return (
    <div>
      {/* Window info — this section ignores the range picker on purpose */}
      <div style={{ ...label, marginBottom: 12 }}>
        Stałe okno {months.length} mies. ({fromMonth} → {currentMonth}), niezależne od wybranego zakresu.
      </div>

      {/* Year overlay */}
      <div style={subtitle}>📈 Nakładka lat (wydatki, Sty → Gru)</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={overlay.rows.map(r => ({ ...r, name: MONTH_NAMES[r.monthIdx - 1] }))}
          margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
        >
          <XAxis dataKey="name" stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} />
          <YAxis stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} tickFormatter={plnTick} domain={["auto", "auto"]} width={56} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
            formatter={(v: unknown) => plnLabel(v)}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {overlay.years.map((year, i) => (
            <Line
              key={year}
              dataKey={year}
              name={year}
              type="monotone"
              stroke={CHART_COLORS[(i + 5) % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Year-over-year block */}
      <div style={{ marginTop: 16 }}>
        {eligible.length === 0 || !yoy || !effectiveMonth ? (
          <ChartEmpty message={
            `Porównanie rok do roku odblokuje się od ${yoyUnlockMonth(months[0])} — ` +
            "potrzebny ten sam miesiąc w dwóch kolejnych latach."
          } />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <span style={subtitle}>📊 Miesiąc vs rok wcześniej</span>
              <select
                value={effectiveMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                style={{ ...s.select, width: "auto", minWidth: 130, padding: "6px 10px", fontSize: 13 }}
              >
                {eligible.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ ...label, marginBottom: 8 }}>
              {effectiveMonth}: <strong style={{ color: c.text }}>{fmt(yoy.totals.current)}</strong>
              {" vs "}
              {shiftMonth(effectiveMonth, -12)}: <strong style={{ color: c.textSecondary }}>{fmt(yoy.totals.previous)}</strong>
              {yoyChangePct !== null && (
                <strong style={{ marginLeft: 6, color: yoyChangePct > 0 ? c.danger : c.success }}>
                  ({yoyChangePct >= 0 ? "+" : ""}{yoyChangePct.toFixed(1)}%)
                </strong>
              )}
            </div>

            <MonthlyDeltaChart data={deltaData} topN={10} />
          </>
        )}
      </div>
    </div>
  );
}
