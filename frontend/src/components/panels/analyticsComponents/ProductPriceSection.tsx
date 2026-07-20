// ============================================================
// File: src/components/panels/analyticsComponents/ProductPriceSection.tsx
// Price history of receipt products, grouped by CATALOG identity (so the
// same product across shops is one line, honouring manual merges). All
// aggregation lives in utils/productPricing.ts (pure, unit-tested); this
// component picks a product and renders:
//   - coverage stats bar (how much of the range qualifies)
//   - searchable product pills, sorted by purchase frequency
//   - unit-price line chart, one line per shop
//   - shrinkflation badge + first/last change summary
//   - merge / rename controls for catalog-backed products
//   - occurrences table (newest first)
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { theme as s } from "../../../styles/theme";
import { fmt } from "../../../utils/helpers";
import { useProductCatalog } from "../../../hooks/useProductCatalog";
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
  const [mergeTarget, setMergeTarget] = useState("");
  const [renaming,    setRenaming]    = useState<string | null>(null);
  const [renameText,  setRenameText]  = useState("");

  const { resolve, load: loadCatalog, merge, rename } = useProductCatalog();
  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const monthsSet = useMemo(() => new Set(months), [months]);

  const { products, stats } = useMemo(
    () => buildPriceHistory(transactions, monthsSet, resolve),
    [transactions, monthsSet, resolve],
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

  // ── Merge / rename (catalog-backed products only) ──────────
  async function handleMerge() {
    if (!selected?.catalogId || !mergeTarget) return;
    // Fold the CURRENT product into the picked one — the pick survives and
    // keeps its name (reads as "to jest to samo co <pick>").
    const ok = await merge(selected.catalogId, mergeTarget);
    if (ok) { setSelectedKey(mergeTarget); setMergeTarget(""); }
  }
  async function handleRename() {
    if (!selected?.catalogId || !renameText.trim()) return;
    const ok = await rename(selected.catalogId, renameText.trim());
    if (ok) setRenaming(null);
  }

  // ── Empty state ────────────────────────────────────────────
  if (products.length === 0) {
    return (
      <ChartEmpty message={
        `Brak produktów kupionych min. ${MIN_OCCURRENCES}× w zakresie ` +
        "(z paragonów lub pojedynczych transakcji)."
      } />
    );
  }

  const statChip: React.CSSProperties = {
    fontSize: 11, color: c.textMuted, whiteSpace: "nowrap",
  };
  const miniBtn = (enabled: boolean): React.CSSProperties => ({
    padding: "5px 10px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700,
    cursor: enabled ? "pointer" : "not-allowed",
    background: enabled ? c.info : c.border, color: enabled ? c.white : c.textMuted,
  });
  const mergeOptions = products.filter(p => p.catalogId && p.catalogId !== selected?.catalogId);

  return (
    <div>
      {/* Coverage stats */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginBottom: 12 }}>
        <span style={statChip}>🧾 {stats.txWithItems} transakcji uwzględnionych</span>
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

          {/* Merge / rename — only for catalog-backed products */}
          {selected.catalogId && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
              {renaming === selected.catalogId ? (
                <>
                  <input
                    value={renameText}
                    onChange={e => setRenameText(e.target.value)}
                    autoFocus
                    style={{
                      background: c.bg, border: `1px solid ${c.borderStrong}`, borderRadius: 8,
                      color: c.text, padding: "6px 10px", fontSize: 12, minWidth: 180, outline: "none",
                    }}
                  />
                  <button onClick={handleRename} style={miniBtn(!!renameText.trim())}>Zapisz</button>
                  <button onClick={() => setRenaming(null)} style={{ ...miniBtn(true), background: c.border, color: c.textSecondary }}>Anuluj</button>
                </>
              ) : (
                <>
                  <span style={statChip}>🔗 Połącz z:</span>
                  <select
                    value={mergeTarget}
                    onChange={e => setMergeTarget(e.target.value)}
                    disabled={mergeOptions.length === 0}
                    style={{ ...s.select, width: "auto", minWidth: 180, padding: "6px 10px", fontSize: 12 }}
                  >
                    <option value="">{mergeOptions.length ? "— wybierz produkt —" : "brak innych produktów"}</option>
                    {mergeOptions.map(p => (
                      <option key={p.catalogId} value={p.catalogId}>{p.label}</option>
                    ))}
                  </select>
                  <button onClick={handleMerge} style={miniBtn(!!mergeTarget)}>Połącz</button>
                  <button
                    onClick={() => { setRenaming(selected.catalogId!); setRenameText(selected.label); }}
                    style={{ ...miniBtn(true), background: c.border, color: c.textSecondary }}
                  >
                    ✏️ Zmień nazwę
                  </button>
                </>
              )}
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
