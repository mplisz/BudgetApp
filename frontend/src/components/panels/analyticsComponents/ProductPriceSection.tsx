// ============================================================
// File: src/components/panels/analyticsComponents/ProductPriceSection.tsx
// Price history of receipt products (phase 1+2 — deterministic matching).
// All aggregation lives in utils/productPricing.ts (pure, unit-tested);
// this component only picks a product and renders:
//   - coverage stats bar (how much of the range qualifies)
//   - searchable product pills, sorted by purchase frequency
//   - unit-price line chart, one line per shop
//   - shrinkflation badge + first/last change summary
//   - occurrences table (newest first)
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { fmt } from "../../../utils/helpers";
import {
  buildPriceHistory, productMetric, formatSize, foldText, MIN_OCCURRENCES,
  type PricedTransaction, type ProductHistory,
} from "../../../utils/productPricing";
import {
  CHART_COLORS, chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle,
  AXIS_STROKE, AXIS_FONT_SIZE, plnTick, plnNum, ChartEmpty,
} from "./chartKit";

interface Props {
  transactions: PricedTransaction[];
  months:       string[];   // ordered "YYYY-MM" list (oldest -> newest)
}

const MAX_PILLS = 24;

export function ProductPriceSection({ transactions, months }: Props) {
  const [search,      setSearch]      = useState("");
  const [selectedKey, setSelectedKey] = useState("");

  const monthsSet = useMemo(() => new Set(months), [months]);

  const { products, stats } = useMemo(
    () => buildPriceHistory(transactions, monthsSet),
    [transactions, monthsSet],
  );

  const filtered = useMemo(() => {
    const needle = foldText(search.trim());
    if (!needle) return products;
    return products.filter(p =>
      p.nameKey.includes(needle) || foldText(p.label).includes(needle));
  }, [products, search]);

  // Selection survives range changes when possible; otherwise falls back to
  // the most frequently bought product in the current filter.
  const selected: ProductHistory | undefined =
    filtered.find(p => p.nameKey === selectedKey) ?? filtered[0];

  const chart = useMemo(() => {
    if (!selected) return null;
    const metric = productMetric(selected);
    const byDate = new Map<string, Record<string, string | number>>();
    let plotted = 0, skipped = 0;
    for (const o of selected.occurrences) {
      const v = metric.value(o);
      if (v === null) { skipped++; continue; }   // not comparable → off the chart
      plotted++;
      let row = byDate.get(o.date);
      if (!row) { row = { date: o.date }; byDate.set(o.date, row); }
      row[o.merchant] = v;
    }
    // Summary uses only the comparable (chart) values, in date order.
    const values = selected.occurrences
      .map(metric.value)
      .filter((v): v is number => v !== null);
    const first = values[0] ?? 0, last = values[values.length - 1] ?? 0;
    return {
      metric,
      rows: [...byDate.values()],
      plotted,
      skipped,
      summary: {
        first, last,
        changePct: first > 0 ? ((last - first) / first) * 100 : 0,
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
      },
    };
  }, [selected]);

  // ── Empty state ────────────────────────────────────────────
  if (products.length === 0) {
    return (
      <ChartEmpty message={
        `Brak produktów kupionych min. ${MIN_OCCURRENCES}× w zakresie. ` +
        "Potrzebne paragony z pozycjami i przypisanym sklepem."
      } />
    );
  }

  const statChip: React.CSSProperties = {
    fontSize: 11, color: c.textMuted, whiteSpace: "nowrap",
  };

  return (
    <div>
      {/* Coverage stats */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginBottom: 12 }}>
        <span style={statChip}>🧾 {stats.txWithItems} transakcji z pozycjami</span>
        <span style={statChip}>📦 {stats.productsTracked} produktów kupowanych ≥{MIN_OCCURRENCES}×</span>
        <span style={statChip}>⚖️ {stats.withUnitPrice} z ceną jednostkową</span>
      </div>

      {/* Product search + pills */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Szukaj produktu…"
        style={{
          width: "100%", boxSizing: "border-box", background: c.bg,
          border: `1px solid ${c.border}`, borderRadius: 8, color: c.text,
          padding: "8px 12px", fontSize: 13, outline: "none", marginBottom: 10,
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {filtered.slice(0, MAX_PILLS).map(p => {
          const active = p === selected;
          return (
            <span
              key={p.nameKey}
              onClick={() => setSelectedKey(p.nameKey)}
              style={{
                padding: "3px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                background: active ? alpha(c.success, "22") : c.bg,
                border:     `1px solid ${active ? c.success : c.border}`,
                color:      active ? c.successLight : c.textSecondary,
              }}>
              {p.label} <span style={{ opacity: 0.6 }}>×{p.occurrences.length}</span>
            </span>
          );
        })}
        {filtered.length > MAX_PILLS && (
          <span style={{ ...statChip, alignSelf: "center" }}>
            +{filtered.length - MAX_PILLS} — zawęź wyszukiwaniem
          </span>
        )}
        {filtered.length === 0 && (
          <span style={statChip}>Brak produktów pasujących do „{search}”</span>
        )}
      </div>

      {selected && chart && (
        <>
          {/* Summary row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
              {selected.label}
            </span>
            <span style={statChip}>
              {plnNum(chart.summary.first)} → {plnNum(chart.summary.last)} {chart.metric.label}{" "}
              <strong style={{ color: chart.summary.changePct > 0 ? c.danger : c.success }}>
                ({chart.summary.changePct >= 0 ? "+" : ""}{chart.summary.changePct.toFixed(1)}%)
              </strong>
            </span>
            <span style={statChip}>
              min {plnNum(chart.summary.min)} · max {plnNum(chart.summary.max)} {chart.metric.label}
            </span>
          </div>

          {/* Comparability notes */}
          {!chart.metric.useUnitPrice && (
            <div style={{ ...statChip, color: c.warningLight, marginBottom: 8 }}>
              ⚠️ Brak gramatur — pokazane kwoty pozycji nie są porównywalne między zakupami.
            </div>
          )}
          {chart.metric.useUnitPrice && chart.skipped > 0 && (
            <div style={{ ...statChip, marginBottom: 8 }}>
              ℹ️ {chart.skipped} {chart.skipped === 1 ? "wpis" : "wpisów"} poza wykresem
              (inna jednostka niż {chart.metric.label} lub brak gramatury) — widoczne w tabeli.
            </div>
          )}

          {/* Shrinkflation badge */}
          {selected.shrink && (
            <div style={{
              display: "inline-block", marginBottom: 8, padding: "4px 10px",
              background: alpha(c.warning, "16"), border: `1px solid ${alpha(c.warning, "55")}`,
              borderRadius: 6, fontSize: 11, color: c.warningLight,
            }}>
              📉 Zmniejszona gramatura:{" "}
              {formatSize(selected.shrink.fromSize, selected.shrink.unit)} →{" "}
              {formatSize(selected.shrink.toSize, selected.shrink.unit)}{" "}
              ({selected.shrink.date})
            </div>
          )}

          {/* Price chart — one line per shop */}
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chart.rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <XAxis dataKey="date" stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} interval="preserveStartEnd" />
              <YAxis stroke={AXIS_STROKE} fontSize={AXIS_FONT_SIZE} tickFormatter={plnTick} domain={["auto", "auto"]} width={56} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelStyle={chartTooltipLabelStyle}
                itemStyle={chartTooltipItemStyle}
                formatter={(v: unknown) => `${plnNum(v)} ${chart.metric.label}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {selected.merchants.map((m, i) => (
                <Line
                  key={m}
                  dataKey={m}
                  name={m}
                  connectNulls
                  type="monotone"
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* Occurrences table (newest first) */}
          <div style={{ marginTop: 12, maxHeight: 240, overflowY: "auto", border: `1px solid ${c.border}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Data", "Sklep", "Pozycja", "Ilość", "Cena poz.",
                    ...(chart.metric.useUnitPrice ? [chart.metric.label] : [])].map((h, i) => (
                    <th key={i} style={{
                      position: "sticky", top: 0, background: c.surface, textAlign: i >= 3 ? "right" : "left",
                      padding: "6px 10px", fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.5px",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...selected.occurrences].reverse().map((o, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${c.border}` }}>
                    <td style={{ padding: "5px 10px", color: c.textTertiary, whiteSpace: "nowrap" }}>{o.date}</td>
                    <td style={{ padding: "5px 10px", color: c.textBody }}>{o.merchant}</td>
                    <td style={{ padding: "5px 10px", color: c.textSecondary }} title={o.raw}>{o.label}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right", color: c.textTertiary, whiteSpace: "nowrap" }}>
                      {o.size !== null && o.unit !== null ? formatSize(o.size, o.unit) : "—"}
                    </td>
                    <td style={{ padding: "5px 10px", textAlign: "right", color: c.textTertiary, whiteSpace: "nowrap" }}>
                      {fmt(o.price)}
                    </td>
                    {chart.metric.useUnitPrice && (
                      <td style={{
                        padding: "5px 10px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700,
                        // Highlight the comparable rows; grey out the ones off the chart.
                        color: o.unit === chart.metric.unit && o.unitPrice !== null ? c.text : c.borderStrong,
                      }}>
                        {o.unit === chart.metric.unit && o.unitPrice !== null ? plnNum(o.unitPrice) : "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
