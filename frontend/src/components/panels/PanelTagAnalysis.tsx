// ============================================================
// File: src/components/panels/PanelTagAnalysis.tsx
// Panel "Analiza tagów" — what one tag actually cost, broken down.
//
// Built for trip summaries ("ile kosztowały wakacje, ile poszło na fast
// food"), but any tag works. Two screens: an index of every tag that ever
// had spend, and the breakdown for the one you pick.
//
// No range picker. The index comes from /tag-bounds, which knows each tag's
// real span over all history, so picking a tag fetches EXACTLY the budget
// months that tag covers — usually one or two for a trip. Nothing is guessed,
// so nothing can be silently cut off.
//
// Dates vs budget months matter twice here. The fetch is by budgetMonth
// because that is what /range supports; every figure shown is keyed off
// tx.date, because a purchase on the 30th can be booked into the next month
// and bucketing a trip by budget month would tear it in half.
//
// Aggregation stays client-side, matching the rest of the analytics layer:
// the rules (net of returns, expenses only, one tag at a time) live once, in
// utils/tagBreakdown, rather than being restated in SQL.
// ============================================================

import { c } from "../../styles/tokens";
import { useState, useEffect, useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import { useTransactionsRange } from "../../hooks/useTransactionsRange";
import { useTagBounds, type TagBounds } from "../../hooks/useTagBounds";
import { TopCategoriesBar, type CategoryTotal } from "./analyticsComponents/TopCategoriesBar";
import { ChartEmpty } from "./analyticsComponents/chartKit";
import { TagTimelineChart } from "./tagComponents/TagTimelineChart";
import { theme as s } from "../../styles/theme";
import { s as txStyles } from "./transactionComponents/txStyles";
import { DateRangeFilter } from "./transactionComponents/DateRangeFilter";
import { toYMD, fromYMD } from "../ui/AppDatePicker";
import { fmt, plural } from "../../utils/helpers";
import {
  buildTagBreakdown, DAILY_SERIES_MAX_DAYS,
  type TagTransaction, type BreakdownSlice, type MoneySplit,
} from "../../utils/tagBreakdown";

// BreakdownSlice → the shape TopCategoriesBar already speaks.
const toBars = (slices: BreakdownSlice[]): CategoryTotal[] =>
  slices.map(sl => ({
    categoryId:   sl.id,
    categoryName: sl.name,
    total:        sl.total,
    share:        sl.share,
  }));

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...s.statBox, textAlign: "left", flex: "1 1 150px", minWidth: 0 }}>
      <div style={{ ...s.statLab, marginTop: 0, marginBottom: 4 }}>{label}</div>
      <div style={{ ...s.statVal, fontSize: 20 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/**
 * A money tile that shows its arithmetic when part of it came back.
 *
 * The headline is always the NET figure — what the thing actually cost — so
 * the number you read first is the true one. Paid and refunded appear beneath
 * it only when a refund exists, so an ordinary purchase stays a single clean
 * number instead of carrying two zeroes it doesn't need.
 */
function MoneyTile({ label, money, sub }: { label: string; money: MoneySplit; sub?: string }) {
  const hasReturn = money.returned > 0.005;
  return (
    <div style={{ ...s.statBox, textAlign: "left", flex: "1 1 190px", minWidth: 0 }}>
      <div style={{ ...s.statLab, marginTop: 0, marginBottom: 4 }}>{label}</div>
      <div style={{ ...s.statVal, fontSize: 20 }}>{fmt(money.net)}</div>

      {hasReturn && (
        <div style={{
          display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap",
          marginTop: 6, paddingTop: 6, borderTop: `1px solid ${c.border}`,
          fontSize: 11,
        }}>
          <span style={{ color: c.textMuted }}>zapłacono</span>
          <span style={{ color: c.textTertiary, fontWeight: 600 }}>{fmt(money.paid)}</span>
          <span style={{ color: c.borderStrong }}>−</span>
          <span style={{ color: c.textMuted }}>zwrot</span>
          <span style={{ color: c.successLight, fontWeight: 600 }}>{fmt(money.returned)}</span>
        </div>
      )}

      {sub && <div style={{ fontSize: 10, color: c.textMuted, marginTop: hasReturn ? 4 : 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ fontWeight: 700, color: c.text, fontSize: 14, marginBottom: hint ? 2 : 12 }}>{title}</div>
      {hint && <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 12 }}>{hint}</div>}
      {children}
    </div>
  );
}

export default function PanelTagAnalysis() {
  const { tags } = useAppContext();
  const { bounds, isLoading: boundsLoading, load: loadBounds } = useTagBounds();
  const { transactions, isLoading: txLoading, loadRange } = useTransactionsRange();

  const [selected, setSelected] = useState<TagBounds | null>(null);
  // Narrowing WITHIN a tag — pointless for a trip (it is one span anyway),
  // but a long-lived tag like "dzieci" is only interesting per season or year.
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo,   setDateTo]   = useState<Date | null>(null);

  useEffect(() => { loadBounds(); }, [loadBounds]);

  // A range picked for one tag means nothing on the next one.
  useEffect(() => { setDateFrom(null); setDateTo(null); }, [selected?.tagId]);

  // Exactly the months this tag spans — no window, no guessing. The LRU cache
  // in useTransactionsRange makes flipping back to a tag instant.
  useEffect(() => {
    if (!selected) return;
    loadRange(selected.firstMonth, selected.lastMonth);
  }, [selected, loadRange]);

  const tagMeta = useMemo(() => {
    const m = new Map<string, { name: string; icon?: string }>();
    for (const t of tags) m.set(t.id, { name: t.name, icon: t.icon });
    return m;
  }, [tags]);

  // Archived tags keep their spend visible under a fallback label — history
  // must not vanish because a tag was retired.
  const labelFor = (tagId: string) => {
    const meta = tagMeta.get(tagId);
    return `${meta?.icon ?? "🏷️"} ${meta?.name ?? "(archiwalny tag)"}`;
  };

  const isFiltered = !!dateFrom || !!dateTo;

  // Narrowing happens BEFORE aggregation, so every figure below — totals,
  // shares, timeline, biggest, days with spend — describes the filtered slice
  // rather than the whole tag. No refetch: the months are already in hand.
  const scoped = useMemo(() => {
    const all = transactions as unknown as TagTransaction[];
    if (!isFiltered) return all;
    const from = dateFrom ? toYMD(dateFrom) : null;
    const to   = dateTo   ? toYMD(dateTo)   : null;
    return all.filter(tx => (!from || tx.date >= from) && (!to || tx.date <= to));
  }, [transactions, dateFrom, dateTo, isFiltered]);

  const breakdown = useMemo(
    () => (selected ? buildTagBreakdown(scoped, selected.tagId) : null),
    [scoped, selected],
  );

  // The picker is bounded by the tag's true span, which /tag-bounds already
  // knows — no need to re-derive it from the fetched rows.
  const dateBounds = useMemo(
    () => (selected
      ? { minDate: fromYMD(selected.firstDate), maxDate: fromYMD(selected.lastDate) }
      : { minDate: null, maxDate: null }),
    [selected],
  );

  const grain = breakdown && breakdown.spanDays <= DAILY_SERIES_MAX_DAYS ? "day" : "month";
  const timeline = useMemo(() => {
    if (!breakdown) return [];
    return grain === "day"
      ? breakdown.daily.map(d => ({ key: d.date, amount: d.amount }))
      : breakdown.monthly.map(m => ({ key: m.month, amount: m.amount }));
  }, [breakdown, grain]);

  // The fetch covers the tag's own months, so a shortfall means the range
  // response has not landed yet rather than anything being missing. Skipped
  // while a date filter is on, where a smaller count is the whole point.
  const awaitingData = !!selected && !!breakdown && !isFiltered
    && breakdown.count < selected.count;

  return (
    <div style={{ padding: "0 0 60px 0" }}>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>🏷️ Analiza tagów</div>
        <div style={s.sectionSub}>
          Ile kosztował wyjazd i co się na niego złożyło. Liczone po dacie transakcji,
          netto po zwrotach, tylko wydatki.
        </div>
      </div>

      {/* ── Index: pick a tag ── */}
      {!selected && (
        boundsLoading || bounds === null ? (
          <div style={{ color: c.textMuted, textAlign: "center", padding: 40 }}>Ładowanie…</div>
        ) : bounds.length === 0 ? (
          <ChartEmpty message="Brak otagowanych wydatków. Otaguj zakupy, żeby zobaczyć tu podsumowanie." />
        ) : (
          <>
            <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 10 }}>
              {bounds.length} {plural(bounds.length, "tag", "tagi", "tagów")} z wydatkami,
              od najnowszych — kliknij, żeby zobaczyć rozbicie.
            </div>
            {bounds.map(row => (
              <button
                key={row.tagId}
                onClick={() => setSelected(row)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12,
                  padding: "12px 16px", marginBottom: 8, cursor: "pointer",
                  textAlign: "left", font: "inherit",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{labelFor(row.tagId)}</span>
                <span style={{ fontSize: 11, color: c.textMuted }}>
                  {row.firstDate === row.lastDate ? row.firstDate : `${row.firstDate} → ${row.lastDate}`}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: c.textSecondary, whiteSpace: "nowrap" }}>
                  {row.count} {plural(row.count, "transakcja", "transakcje", "transakcji")}
                </span>
              </button>
            ))}
          </>
        )
      )}

      {/* ── Breakdown for one tag ── */}
      {selected && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <button
              onClick={() => setSelected(null)}
              style={{
                padding: "6px 12px", borderRadius: 8, border: `1px solid ${c.borderStrong}`,
                background: "transparent", color: c.textSecondary, cursor: "pointer", fontSize: 12, fontWeight: 700,
              }}
            >
              ← Wszystkie tagi
            </button>
            <span style={{ fontSize: 16, fontWeight: 800, color: c.text }}>{labelFor(selected.tagId)}</span>
            {/* When it happened is context, not a metric — it belongs beside
                the name rather than taking a tile of its own. */}
            <span style={{ fontSize: 12, color: c.textMuted }}>
              {selected.firstDate === selected.lastDate
                ? selected.firstDate
                : `${selected.firstDate} → ${selected.lastDate}`}
            </span>
          </div>

          {/* Date narrowing. Bounded by the tag's own span, so the picker can
              only ever land on dates the tag actually covers. */}
          <div style={{ background: c.bgDeepest, border: `1px solid ${c.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
            <div style={txStyles.filterRow as React.CSSProperties}>
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                onFrom={setDateFrom}
                onTo={setDateTo}
                bounds={dateBounds}
                labels={{ from: "Od", to: "Do" }}
                emptyMessage="Ten tag nie ma jeszcze wydatków — filtr dat niedostępny."
                disabled={!dateBounds.minDate}
              />
              {isFiltered && (
                <button
                  onClick={() => { setDateFrom(null); setDateTo(null); }}
                  style={{
                    alignSelf: "flex-end", padding: "6px 12px", borderRadius: 8,
                    border: `1px solid ${c.borderStrong}`, background: "transparent",
                    color: c.textSecondary, fontSize: 12, cursor: "pointer",
                  }}
                >
                  ✕ Cały tag
                </button>
              )}
            </div>
          </div>

          {(txLoading || awaitingData || !breakdown) ? (
            <div style={{ color: c.textMuted, textAlign: "center", padding: 40 }}>Ładowanie…</div>
          ) : breakdown.count === 0 ? (
            <ChartEmpty message={isFiltered
              ? "Brak wydatków w wybranym zakresie dat."
              : "Ten tag nie ma wydatków do pokazania."} />
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <MoneyTile label="Suma" money={breakdown.money} />
                <Tile
                  label="Średnio dziennie"
                  // Divided by days that actually carry a transaction, NOT by
                  // the calendar span. A tag used sporadically across a year
                  // would otherwise be divided by 365 and mean nothing; even
                  // on a trip, days you bought nothing shouldn't dilute the
                  // figure. The subtitle names the denominator so the number
                  // is never ambiguous.
                  value={fmt(breakdown.spendingDays > 0 ? breakdown.total / breakdown.spendingDays : 0)}
                  sub={`na ${breakdown.spendingDays} ${plural(breakdown.spendingDays, "dzień", "dni", "dni")} z wydatkami`}
                />
                {breakdown.biggest && (
                  <MoneyTile
                    label="Największy wydatek"
                    money={breakdown.biggest}
                    sub={breakdown.biggest.description}
                  />
                )}
              </div>

              <Section title="📂 Kategorie" hint="Z czego składa się ten tag, na poziomie kategorii głównych.">
                <TopCategoriesBar data={toBars(breakdown.categories)} topN={12} />
              </Section>

              <Section
                title="🍔 Podkategorie"
                hint="Tu widać konkrety — ile poszło na fast food, ile na pamiątki."
              >
                <TopCategoriesBar data={toBars(breakdown.subcategories)} topN={15} />
              </Section>

              <Section
                title="📈 Przebieg w czasie"
                hint={grain === "day"
                  ? "Dzień po dniu — dni bez wydatków też są pokazane."
                  : "Tag rozciąga się na ponad dwa miesiące, więc widok miesięczny."}
              >
                <TagTimelineChart data={timeline} grain={grain} />
              </Section>

              {breakdown.merchants.length > 0 && (
                <Section title="🏬 Sklepy">
                  <TopCategoriesBar data={toBars(breakdown.merchants)} topN={10} />
                </Section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
