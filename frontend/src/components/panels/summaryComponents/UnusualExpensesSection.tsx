// ============================================================
// File: src/components/panels/summaryComponents/UnusualExpensesSection.tsx
// "🔥 Nietypowe wydatki" in Podsumowanie: the month's one-off expenses that
// are big for what they are (rules: utils/unusualExpenses.ts).
//
//   - four numbers: how many, how much, how much of it above the norms, and
//     the share of the month's expenses
//   - one bar per expense: grey = its subcategory's norm, amber = the excess;
//     ordered by excess (420 zł over a 90 zł norm surprises more than 500 zł
//     over 400 zł). Each bar opens Wydatki on that subcategory with the
//     Nietypowo duże filter on.
//   - the share over the last 6 months, every month judged against its own
//     previous months — so "are surprises becoming the norm" is visible
//
// The slider is the same family-wide threshold as the Wydatki filter.
// Mounted only while the section is open, so its history loads on demand.
// ============================================================

import { useMemo } from "react";
import { c, alpha } from "../../../styles/tokens";
import { fmt, monthLabel } from "../../../utils/helpers";
import { MONTH_NAMES } from "../../../hooks/useRecurring";
import { txLink } from "../../../data/routes";
import { PanelLink } from "../../ui/summaryUi";
import { UnusualThresholdSlider } from "../../ui/UnusualThresholdSlider";
import { useUnusualExpenses, useUnusualMultiplier } from "../../../hooks/useUnusualExpenses";
import {
  UNUSUAL_MIN_AMOUNT, formatMultiplier, unusualMonthStats, unusualTitle,
  type UnusualInfo, type UnusualMonthStats,
} from "../../../utils/unusualExpenses";
import type { Transaction } from "../../../types/summary";

const MAX_BARS    = 8;
const TREND_MONTHS = 6;

const pct = (share: number) => `${(share * 100).toFixed(1).replace(".", ",")}%`;

interface Props {
  monthTx: Transaction[];
  month:   string;
}

export function UnusualExpensesSection({ monthTx, month }: Props) {
  const { multiplier, setMultiplier } = useUnusualMultiplier();
  const { unusual, trend } = useUnusualExpenses(monthTx, month, multiplier, TREND_MONTHS);

  const stats = useMemo(() => unusual && unusualMonthStats(month, monthTx, unusual), [unusual, month, monthTx]);
  const rows  = useMemo(() => {
    if (!unusual) return [];
    return monthTx
      .filter(tx => unusual.has(tx.id))
      .map(tx => ({ tx, info: unusual.get(tx.id)! }))
      .sort((a, b) => (b.tx.amount - b.info.typical) - (a.tx.amount - a.info.typical));
  }, [unusual, monthTx]);

  return (
    <div>
      {/* Numbers + threshold */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch", marginBottom: 14 }}>
        <Stat label="Nietypowe"          value={stats ? String(stats.count) : "…"} />
        <Stat label="Łącznie"            value={stats ? fmt(stats.total) : "…"} />
        <Stat label="Ponad normę"        value={stats ? fmt(stats.excess) : "…"} color={c.warningLight} />
        <Stat label="Udział w wydatkach" value={stats ? pct(stats.share) : "…"} />
        <div style={{ flex: "1 1 220px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <UnusualThresholdSlider value={multiplier} onChange={setMultiplier} />
        </div>
      </div>

      {!unusual && <div style={{ color: c.textMuted, fontSize: 13, padding: "8px 0" }}>Liczę normy z poprzednich miesięcy…</div>}

      {unusual && rows.length === 0 && (
        <div style={{ color: c.textMuted, fontSize: 13, padding: "8px 0" }}>
          Brak jednorazowych wydatków co najmniej {formatMultiplier(multiplier)} powyżej normy (i min. {UNUSUAL_MIN_AMOUNT} zł).
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: c.textSecondary, marginBottom: 4, flexWrap: "wrap" }}>
            <span><Swatch color={c.borderStrong} />Norma subkategorii</span>
            <span><Swatch color={c.warning} />Nadwyżka</span>
          </div>
          <Bars rows={rows.slice(0, MAX_BARS)} month={month} />
          {rows.length > MAX_BARS && (
            <div style={{ fontSize: 12, color: c.textMuted, marginTop: 6 }}>…i {rows.length - MAX_BARS} więcej</div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <PanelLink
              to={txLink(month, { type: "EXPENSE", unusual: true })}
              title="Pokaż nietypowe wydatki w panelu Wydatki"
              style={{ fontSize: 12, fontWeight: 600, color: c.infoLight, padding: "6px 10px", borderRadius: 8, border: `1px solid ${alpha(c.info, "55")}`, background: alpha(c.info, "18") }}
              hoverStyle={{ background: alpha(c.info, "44"), color: c.white }}
            >
              Pokaż w panelu Wydatki ↗
            </PanelLink>
          </div>
        </>
      )}

      {trend && trend.length > 1 && <Trend trend={trend} month={month} />}
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────

function Stat({ label, value, color = c.text }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.borderStrong}`, borderRadius: 10, padding: "8px 14px", minWidth: 110 }}>
      <div style={{ fontSize: 10, color: c.textSecondary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: color, marginRight: 5, verticalAlign: -1 }} />;
}

interface BarRow { tx: Transaction; info: UnusualInfo }

function Bars({ rows, month }: { rows: BarRow[]; month: string }) {
  const max = Math.max(...rows.map(r => r.tx.amount));
  return (
    <div>
      {rows.map(({ tx, info }) => {
        const normPct = (info.typical / max) * 100;
        const fullPct = (tx.amount / max) * 100;
        return (
          <PanelLink
            key={tx.id}
            to={txLink(month, { type: "EXPENSE", category: tx.categoryName, sub: tx.subcategoryName, unusual: true })}
            title={`${unusualTitle(info)}\nKliknij, aby otworzyć w panelu Wydatki`}
            style={{
              display: "grid", gridTemplateColumns: "minmax(0, 190px) minmax(0, 1fr) auto", gap: 12, alignItems: "center",
              padding: "7px 6px", margin: "0 -6px", borderRadius: 6, borderBottom: `1px solid ${c.border}`, color: c.text,
            }}
            hoverStyle={{ background: c.surface }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {tx.description || tx.subcategoryName}
              </span>
              <span style={{ display: "block", fontSize: 11, color: c.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {tx.subcategoryName} · {formatMultiplier(info.ratio)} normy
              </span>
            </span>
            <span style={{ position: "relative", height: 12, background: c.bg, borderRadius: 3 }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${normPct}%`, background: c.borderStrong, borderRadius: "3px 0 0 3px" }} />
              <span style={{ position: "absolute", left: `${normPct}%`, top: 0, bottom: 0, width: `${fullPct - normPct}%`, background: c.warning, borderRadius: "0 3px 3px 0" }} />
            </span>
            <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{fmt(tx.amount)}</span>
              <span style={{ display: "block", fontSize: 11, color: c.textMuted }}>norma {fmt(info.typical)}</span>
            </span>
          </PanelLink>
        );
      })}
    </div>
  );
}

function Trend({ trend, month }: { trend: UnusualMonthStats[]; month: string }) {
  const top = Math.max(...trend.map(t => t.share), 0.05);
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 8 }}>
        Udział nietypowych w wydatkach · {trend.length} mies.
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, borderBottom: `1px solid ${c.border}`, padding: "0 4px" }}>
        {trend.map(t => {
          const current = t.month === month;
          return (
            <div
              key={t.month}
              title={`${monthLabel(t.month)}: ${t.count} nietypowych, ${fmt(t.total)} (${pct(t.share)} wydatków)${current ? " — miesiąc w toku lub wybrany" : ""}`}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, height: "100%" }}
            >
              <span style={{ fontSize: 11, color: current ? c.warningLight : c.textSecondary, fontWeight: current ? 700 : 400 }}>{pct(t.share)}</span>
              <span style={{
                width: "min(34px, 70%)", height: `${Math.max((t.share / top) * 85, t.share > 0 ? 2 : 0)}px`,
                background: c.warning, opacity: current ? 1 : 0.5, borderRadius: "3px 3px 0 0",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "6px 4px 0" }}>
        {trend.map(t => (
          <span key={t.month} style={{ flex: 1, textAlign: "center", fontSize: 11, color: t.month === month ? c.text : c.textMuted }}>
            {MONTH_NAMES[Number(t.month.slice(5, 7)) - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}
