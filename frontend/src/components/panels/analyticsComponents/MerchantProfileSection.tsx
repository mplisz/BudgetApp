// ============================================================
// File: src/components/panels/analyticsComponents/MerchantProfileSection.tsx
// Merchant profile card: visits, average basket, monthly trend sparkline
// per shop. All aggregation lives in utils/merchantProfile.ts (pure,
// unit-tested); this component renders:
//   - micro-spending highlight cards ("Żabka: 18 wizyt × 14 zł = 252 zł")
//   - sortable table (click a header to toggle column/direction)
// Amounts are net of returns — same numbers as the "Top sklepy" bar.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useMemo, useState } from "react";
import { fmt } from "../../../utils/helpers";
import {
  buildMerchantProfile, type MerchantTx, type MerchantRow,
} from "../../../utils/merchantProfile";
import { SERIES, ChartEmpty } from "./chartKit";

interface Props {
  transactions: MerchantTx[];
  months:       string[];   // ordered "YYYY-MM" list (oldest -> newest)
}

// ── Sparkline ────────────────────────────────────────────────
// Tiny inline SVG — one polyline over the monthly totals. A single-month
// range has no line to draw, so it degrades to a dot.

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 72, h = 22, pad = 3;
  const max = Math.max(...values, 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  if (values.length < 2) {
    return (
      <svg width={w} height={h}>
        <circle cx={w - pad} cy={y(values[0] ?? 0)} r={2.5} fill={color} />
      </svg>
    );
  }
  const step = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => `${pad + i * step},${y(v)}`).join(" ");
  return (
    <svg width={w} height={h}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ── Sorting ──────────────────────────────────────────────────

type SortKey = "merchant" | "visits" | "avgBasket" | "total" | "visitsPerMonth" | "lastVisit";

const COLUMNS: Array<{ key: SortKey; label: string; right?: boolean }> = [
  { key: "merchant",       label: "Sklep" },
  { key: "visits",         label: "Wizyty",     right: true },
  { key: "visitsPerMonth", label: "/ mies.",    right: true },
  { key: "avgBasket",      label: "Śr. koszyk", right: true },
  { key: "total",          label: "Suma",       right: true },
  { key: "lastVisit",      label: "Ostatnio",   right: true },
];

function compareBy(key: SortKey, dir: 1 | -1) {
  return (a: MerchantRow, b: MerchantRow): number => {
    const av = a[key], bv = b[key];
    const cmp = typeof av === "string"
      ? (av as string).localeCompare(bv as string)
      : (av as number) - (bv as number);
    return cmp * dir;
  };
}

// ── Component ────────────────────────────────────────────────

export function MerchantProfileSection({ transactions, months }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const { rows, micro } = useMemo(
    () => buildMerchantProfile(transactions, months),
    [transactions, months],
  );

  const sorted = useMemo(() => [...rows].sort(compareBy(sortKey, sortDir)), [rows, sortKey, sortDir]);

  if (rows.length === 0) {
    return <ChartEmpty message="Brak wydatków z przypisanym sklepem w zakresie." />;
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(key === "merchant" ? 1 : -1); }
  }

  return (
    <div>
      {/* Micro-spending highlights */}
      {micro.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {micro.map(m => (
            <div key={m.merchant} style={{
              padding: "8px 12px", borderRadius: 8,
              background: alpha(c.warning, "11"), border: `1px solid ${alpha(c.warning, "44")}`,
            }}>
              <div style={{ fontSize: 11, color: c.warningLight, fontWeight: 700, marginBottom: 2 }}>
                ☕ Mikrowydatki
              </div>
              <div style={{ fontSize: 12, color: c.text }}>
                <strong>{m.merchant}</strong>: {m.visits} wizyt × {fmt(m.avgBasket)} ={" "}
                <strong style={{ color: c.warningLight }}>{fmt(m.total)}</strong>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sortable profile table */}
      <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${c.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  style={{
                    position: "sticky", top: 0, background: c.surface, cursor: "pointer",
                    textAlign: col.right ? "right" : "left", padding: "6px 10px", fontSize: 10,
                    color: col.key === sortKey ? c.text : c.textMuted,
                    textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap",
                    userSelect: "none",
                  }}>
                  {col.label}{col.key === sortKey ? (sortDir === -1 ? " ▼" : " ▲") : ""}
                </th>
              ))}
              <th style={{
                position: "sticky", top: 0, background: c.surface, padding: "6px 10px",
                fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right",
              }}>
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.merchant} style={{ borderTop: `1px solid ${c.border}` }}>
                <td style={{ padding: "5px 10px", color: c.text, fontWeight: 600 }}>
                  {r.merchant}
                  <span style={{ marginLeft: 6, color: c.textMuted, fontWeight: 400, fontSize: 10 }}>
                    {r.share.toFixed(1)}%
                  </span>
                </td>
                <td style={{ padding: "5px 10px", textAlign: "right", color: c.textBody }}>{r.visits}</td>
                <td style={{ padding: "5px 10px", textAlign: "right", color: c.textTertiary }}>
                  {r.visitsPerMonth.toFixed(1)}
                </td>
                <td style={{ padding: "5px 10px", textAlign: "right", color: c.textBody, whiteSpace: "nowrap" }}>
                  {fmt(r.avgBasket)}
                </td>
                <td style={{ padding: "5px 10px", textAlign: "right", color: c.text, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {fmt(r.total)}
                </td>
                <td style={{ padding: "5px 10px", textAlign: "right", color: c.textTertiary, whiteSpace: "nowrap" }}>
                  {r.lastVisit}
                </td>
                <td style={{ padding: "2px 10px", textAlign: "right" }}>
                  <Sparkline values={months.map(m => r.byMonth[m] ?? 0)} color={SERIES.expenses} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10, color: c.textFaint, marginTop: 8 }}>
        Kwoty netto po zwrotach — spójne z „Top sklepy". Trend: suma miesięczna w wybranym zakresie.
      </div>
    </div>
  );
}
