// ============================================================
// File: src/components/panels/analyticsComponents/ReturnsSection.tsx
// "Analiza zwrotów" — money coming back, in five views:
//   - KPI chips (total / cash / voucher / surplus / rate, kind split)
//   - monthly stacked trend (store vs reimbursement vs legacy + surplus)
//   - per-category & per-merchant rankings (STORE returns only —
//     reimbursements would smear real shops)
//   - returned products (from per-line allocations, store only)
//   - recent returns table (everything, newest first)
// All aggregation lives in utils/returnAnalytics.ts (pure, unit-tested).
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useMemo } from "react";
import { fmt } from "../../../utils/helpers";
import {
  buildReturnAnalytics,
  type ReturnAnalyticsTx, type ReturnRankRow, type DetailedReturnBucket,
} from "../../../utils/returnAnalytics";
import { StackedMonthlyChart, type StackedSeries } from "./StackedMonthlyChart";
import { SERIES, ChartEmpty } from "./chartKit";

interface Props {
  transactions: ReturnAnalyticsTx[];
  months:       string[];   // ordered "YYYY-MM" list (oldest -> newest)
}

const KIND_META: Record<DetailedReturnBucket, { label: string; icon: string }> = {
  store:   { label: "do sklepu",      icon: "🏪" },
  person:  { label: "koszty — osoba", icon: "👥" },
  company: { label: "koszty — firma", icon: "🏢" },
  deposit: { label: "kaucja",         icon: "🍾" },
  unknown: { label: "nieoznaczony",   icon: "❔" },
};

const MONTHLY_SERIES: StackedSeries[] = [
  { key: "store",   name: "🏪 Do sklepu",       color: SERIES.expenses },
  { key: "person",  name: "👥 Koszty od osób",  color: SERIES.savings },
  { key: "company", name: "🏢 Koszty od firm",  color: SERIES.retirement },
  { key: "deposit", name: "🍾 Kaucje",          color: SERIES.variable },
  { key: "unknown", name: "❔ Nieoznaczone",    color: c.textMuted },
  { key: "surplus", name: "➕ Nadwyżka",        color: SERIES.income },
];

// ── Small presentational bits ─────────────────────────────────

function Chip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8,
      padding: "8px 12px", minWidth: 110,
    }}>
      <div style={{ fontSize: 10, color: c.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? c.text, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left", padding: "6px 8px", fontSize: 10, color: c.textTertiary,
  textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${c.border}`,
};
const td: React.CSSProperties = {
  padding: "6px 8px", fontSize: 12, color: c.text, borderBottom: `1px solid ${c.border}`,
};
const tdNum: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };

function RankTable({ rows, nameHeader }: { rows: ReturnRankRow[]; nameHeader: string }) {
  if (rows.length === 0) return <ChartEmpty message="Brak zwrotów sklepowych w zakresie." />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>{nameHeader}</th>
            <th style={{ ...th, textAlign: "right" }}>Zwrócono</th>
            <th style={{ ...th, textAlign: "right" }}>Wydano</th>
            <th style={{ ...th, textAlign: "right" }}>Stopa</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map(r => (
            <tr key={r.id}>
              <td style={td}>{r.name}</td>
              <td style={{ ...tdNum, color: c.orange, fontWeight: 600 }}>{fmt(r.returned)}</td>
              <td style={tdNum}>{fmt(r.spent)}</td>
              <td style={{ ...tdNum, color: r.rate >= 10 ? c.dangerLight : c.textSecondary }}>
                {r.rate.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────

export function ReturnsSection({ transactions, months }: Props) {
  const { kpi, monthly, byCategory, byMerchant, products, recent } = useMemo(
    () => buildReturnAnalytics(transactions, months),
    [transactions, months],
  );

  if (kpi.count === 0) {
    return <ChartEmpty message="Brak zwrotów w wybranym zakresie." />;
  }

  // Hide series that carry nothing in this range.
  const series = MONTHLY_SERIES.filter(s => {
    if (s.key === "company") return kpi.reimbursementCompany > 0;
    if (s.key === "unknown") return kpi.unknown > 0;
    if (s.key === "deposit") return kpi.deposit > 0;
    if (s.key === "surplus") return kpi.surplus > 0;
    return true;
  });

  return (
    <div>
      {/* KPI chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <Chip label="Zwroty łącznie" value={fmt(kpi.total)} color={c.orange} />
        <Chip label="Stopa zwrotów (sklep)" value={`${kpi.returnRate.toFixed(1)}%`} />
        <Chip label="Liczba zwrotów" value={String(kpi.count)} />
        <Chip label="🏪 Do sklepu" value={fmt(kpi.store)} />
        <Chip label="👥 Koszty od osób" value={fmt(kpi.reimbursementPerson)} color={c.info} />
        {kpi.reimbursementCompany > 0 && (
          <Chip label="🏢 Koszty od firm" value={fmt(kpi.reimbursementCompany)} color={c.voucherLight} />
        )}
        {kpi.deposit > 0 && <Chip label="🍾 Kaucje" value={fmt(kpi.deposit)} color={c.orange} />}
        {kpi.unknown > 0 && <Chip label="❔ Nieoznaczone" value={fmt(kpi.unknown)} color={c.textMuted} />}
        {kpi.voucher > 0 && <Chip label="🎫 Voucherem" value={fmt(kpi.voucher)} color={c.voucherLight} />}
        {kpi.surplus > 0 && <Chip label="➕ Nadwyżki" value={fmt(kpi.surplus)} color={c.success} />}
      </div>

      {/* Edge-of-range caveat — the range loads by PURCHASE month */}
      <div style={{ fontSize: 11, color: c.textTertiary, marginBottom: 12 }}>
        ℹ️ Oś czasu = miesiąc otrzymania zwrotu. Zwroty do zakupów sprzed wybranego
        zakresu nie są widoczne.
      </div>

      {/* Monthly trend */}
      <StackedMonthlyChart data={monthly} series={series} />

      {/* Rankings — store returns only */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16,
      }} data-analytics-cols>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 6 }}>
            🏪 Zwroty wg kategorii <span style={{ color: c.textTertiary, fontWeight: 400 }}>(bez zwrotów od osób)</span>
          </div>
          <RankTable rows={byCategory} nameHeader="Kategoria" />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 6 }}>
            🛒 Zwroty wg sklepów <span style={{ color: c.textTertiary, fontWeight: 400 }}>(bez zwrotów od osób)</span>
          </div>
          <RankTable rows={byMerchant} nameHeader="Sklep" />
        </div>
      </div>

      {/* Returned products */}
      {products.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 6 }}>
            📦 Zwracane produkty <span style={{ color: c.textTertiary, fontWeight: 400 }}>(z pozycji paragonów)</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Produkt</th>
                  <th style={{ ...th, textAlign: "right" }}>Ile razy</th>
                  <th style={{ ...th, textAlign: "right" }}>Kwota</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 10).map(p => (
                  <tr key={p.name}>
                    <td style={td}>
                      {p.name}
                      {p.tracked && (
                        <span style={{ color: c.cyanLight, fontSize: 10, fontWeight: 600, marginLeft: 6 }}>
                          🏷️ śledzony
                        </span>
                      )}
                    </td>
                    <td style={tdNum}>{p.count}×</td>
                    <td style={{ ...tdNum, color: c.orange, fontWeight: 600 }}>{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent returns */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 6 }}>
          🕓 Ostatnie zwroty
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Data</th>
                <th style={th}>Rodzaj</th>
                <th style={th}>Kategoria</th>
                <th style={th}>Sklep</th>
                <th style={{ ...th, textAlign: "right" }}>Kwota</th>
                <th style={th}>Powód</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, whiteSpace: "nowrap", color: c.textTertiary }}>{r.date}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }} title={KIND_META[r.kind].label}>
                    {KIND_META[r.kind].icon} {KIND_META[r.kind].label}
                  </td>
                  <td style={td}>
                    {r.categoryName}
                    {r.subcategoryName && (
                      <span style={{ color: c.textSecondary }}> › {r.subcategoryName}</span>
                    )}
                    {r.lineCount > 0 && (
                      <span style={{ color: c.textTertiary, fontSize: 10, marginLeft: 6 }}>
                        ({r.lineCount} poz.)
                      </span>
                    )}
                  </td>
                  <td style={td}>{r.merchant || "—"}</td>
                  <td style={{ ...tdNum, fontWeight: 600, color: c.orange }}>
                    {fmt(r.amount)}
                    {(r.voucher > 0 || r.surplus > 0) && (
                      <div style={{ fontSize: 10, fontWeight: 400, color: c.textTertiary }}>
                        {r.cash > 0 && `💵 ${fmt(r.cash)}`}
                        {r.voucher > 0 && ` 🎫 ${fmt(r.voucher)}`}
                        {r.surplus > 0 && ` ➕ ${fmt(r.surplus)}`}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, color: c.textSecondary, maxWidth: 220, wordBreak: "break-word" }}>
                    {r.reason || "—"}
                    {r.returnedBy && (
                      <span style={{ color: c.textMuted, fontSize: 10 }}> · {r.returnedBy}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{
        marginTop: 12, padding: "8px 12px", borderRadius: 8, fontSize: 11,
        background: alpha(c.info, "11"), border: `1px solid ${alpha(c.info, "33")}`,
        color: c.textTertiary,
      }}>
        💡 „Stopa" = zwroty sklepowe ÷ wydatki brutto w danej kategorii / sklepie.
        Wysoka stopa w sklepie oznacza zakupy „na próbę". Zwroty kosztów (👥 od osób,
        🏢 od firm/instytucji — np. LuxMed) i kaucje (🍾) liczą się tylko w sumach —
        nie obciążają sklepów ani nie usuwają cen z Historii cen.
      </div>
    </div>
  );
}
