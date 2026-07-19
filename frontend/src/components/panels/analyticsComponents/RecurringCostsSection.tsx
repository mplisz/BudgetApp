// ============================================================
// File: src/components/panels/analyticsComponents/RecurringCostsSection.tsx
// Recurring cost-creep card: how much "just living" costs per month and
// how that base drifts. All math lives in utils/recurringCosts.ts (pure,
// unit-tested); data comes straight from RecurringTransactions
// definitions — no transactions needed. Renders:
//   - normalized monthly-cost baseline over the selected range
//   - price changes inside the range (raises red, decreases green)
//   - per-subscription table with annual cost and price drift
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { useRecurring, scheduleLabel } from "../../../hooks/useRecurring";
import { fmt } from "../../../utils/helpers";
import {
  costTimeline, priceChanges, changesInRange, subscriptionRows,
} from "../../../utils/recurringCosts";
import {
  SERIES, chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle,
  AXIS_STROKE, AXIS_FONT_SIZE, plnTick, plnLabel, ChartEmpty,
} from "./chartKit";

interface Props {
  months: string[];   // ordered "YYYY-MM" list (oldest -> newest)
}

export function RecurringCostsSection({ months }: Props) {
  const { recurring, loadAll } = useRecurring();

  // Definitions may not be loaded yet on a cold navigation to analytics.
  useEffect(() => {
    if (recurring.length === 0) loadAll();
  }, [recurring.length, loadAll]);

  const timeline = useMemo(() => costTimeline(recurring, months), [recurring, months]);
  const changes  = useMemo(() => changesInRange(priceChanges(recurring), months), [recurring, months]);
  const rows     = useMemo(
    () => subscriptionRows(recurring, months[months.length - 1] ?? ""),
    [recurring, months],
  );

  if (rows.length === 0 && timeline.every(p => p.total === 0)) {
    return <ChartEmpty message="Brak zdefiniowanych wydatków cyklicznych w zakresie." />;
  }

  const raisesMonthly = changes.reduce((sum, ch) => sum + ch.monthlyDelta, 0);
  const totalMonthly  = rows.reduce((sum, r) => sum + r.monthlyCost, 0);
  const label: React.CSSProperties = { fontSize: 11, color: c.textMuted };
  const th = (right = false): React.CSSProperties => ({
    position: "sticky", top: 0, background: c.surface, textAlign: right ? "right" : "left",
    padding: "6px 10px", fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.5px",
  });

  return (
    <div>
      {/* Headline: what "just living" costs now */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", marginBottom: 12 }}>
        <div>
          <div style={label}>Koszty stałe miesięcznie</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: c.text }}>{fmt(totalMonthly)} zł</div>
        </div>
        <div>
          <div style={label}>Rocznie</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: c.textSecondary }}>{fmt(totalMonthly * 12)} zł</div>
        </div>
        {changes.length > 0 && (
          <div>
            <div style={label}>Zmiany cen w zakresie</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: raisesMonthly > 0 ? c.danger : c.success }}>
              {raisesMonthly >= 0 ? "+" : ""}{fmt(raisesMonthly)} zł/mies.
            </div>
          </div>
        )}
      </div>

      {/* Baseline trend — normalized, so quarterly/yearly costs don't spike */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={timeline} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <XAxis dataKey="month" stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} interval="preserveStartEnd" />
          <YAxis stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} tickFormatter={plnTick} domain={["auto", "auto"]} width={56} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
            formatter={(v: unknown) => [plnLabel(v), "Koszty stałe / mies."]}
          />
          <Line dataKey="total" stroke={SERIES.fixed} strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>

      {/* Price changes inside the range */}
      <div style={{ marginTop: 12 }}>
        {changes.length === 0 ? (
          <span style={label}>✅ Brak zmian cen w wybranym zakresie.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {changes.map((ch, i) => {
              const raise = ch.monthlyDelta > 0;
              const color = raise ? c.danger : c.success;
              return (
                <div key={`${ch.id}-${ch.validFrom}-${i}`} style={{
                  display: "flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "baseline",
                  padding: "6px 10px", borderRadius: 8,
                  background: alpha(color, "11"), border: `1px solid ${alpha(color, "33")}`,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>
                    {raise ? "⬆️" : "⬇️"} {ch.description}
                  </span>
                  <span style={{ fontSize: 12, color: c.textSecondary }}>
                    {fmt(ch.fromAmount)} → {fmt(ch.toAmount)} zł{" "}
                    <strong style={{ color }}>
                      ({ch.deltaPct >= 0 ? "+" : ""}{ch.deltaPct.toFixed(1)}%)
                    </strong>{" "}
                    od {ch.validFrom}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-subscription table */}
      <div style={{ marginTop: 12, maxHeight: 280, overflowY: "auto", border: `1px solid ${c.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={th()}>Nazwa</th>
              <th style={th()}>Harmonogram</th>
              <th style={th(true)}>Mies.</th>
              <th style={th(true)}>Rocznie</th>
              <th style={th(true)}>Od startu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const docRef = recurring.find(d => d.id === r.id);
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${c.border}` }}>
                  <td style={{ padding: "5px 10px", color: c.text, fontWeight: 600 }}>
                    {r.description}
                    <span style={{ marginLeft: 6, color: c.textMuted, fontWeight: 400, fontSize: 10 }}>{r.categoryName}</span>
                  </td>
                  <td style={{ padding: "5px 10px", color: c.textTertiary, whiteSpace: "nowrap" }}>
                    {docRef ? scheduleLabel(docRef) : ""}
                  </td>
                  <td style={{ padding: "5px 10px", textAlign: "right", color: c.textBody, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {fmt(r.monthlyCost)} zł
                  </td>
                  <td style={{ padding: "5px 10px", textAlign: "right", color: c.textTertiary, whiteSpace: "nowrap" }}>
                    {fmt(r.annualCost)} zł
                  </td>
                  <td style={{
                    padding: "5px 10px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600,
                    color: r.sinceFirstPct === null ? c.textMuted : r.sinceFirstPct > 0 ? c.dangerLight : c.successLight,
                  }}>
                    {r.sinceFirstPct === null ? "—" : `${r.sinceFirstPct >= 0 ? "+" : ""}${r.sinceFirstPct.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10, color: c.textFaint, marginTop: 8 }}>
        Kwoty znormalizowane do miesiąca (kwartalne ÷3, roczne ÷12), więc sumują się uczciwie między częstotliwościami.
      </div>
    </div>
  );
}
