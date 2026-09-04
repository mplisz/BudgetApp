// ============================================================
// File: src/components/panels/PanelTagAnalysis.tsx
// Panel "Analiza tagów" — what one tag actually cost, broken down.
//
// Built for trip summaries ("ile kosztowały wakacje, ile poszło na fast food"),
// but any tag works. Two screens: an index of tags with totals, and the
// breakdown for the one you pick.
//
// No month navigator — a trip is a date range, not a budget month. The window
// comes from the RangePicker, and everything inside is bucketed by the
// transaction DATE, so a purchase booked into the next budget month still
// lands on the day it happened.
//
// Aggregation is client-side over /range, matching PanelAnalytics: the rules
// (net of returns, expenses only, one tag at a time) live once, in
// utils/tagBreakdown, rather than being restated on the server.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect, useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { useTransactionsRange } from "../../hooks/useTransactionsRange";
import { RangePicker, resolveRange, type DateRange } from "../ui/RangePicker";
import { TopCategoriesBar, type CategoryTotal } from "./analyticsComponents/TopCategoriesBar";
import { ChartEmpty } from "./analyticsComponents/chartKit";
import { TagTimelineChart } from "./tagComponents/TagTimelineChart";
import { theme as s } from "../../styles/theme";
import { fmt, plural, monthLabel } from "../../utils/helpers";
import {
  summariseTags, buildTagBreakdown, DAILY_SERIES_MAX_DAYS,
  type TagTransaction, type BreakdownSlice,
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
  const { tags, settings } = useAppContext();
  const { activeBudgetMonth } = useMonthStatus();
  const { transactions, isLoading, loadRange } = useTransactionsRange();

  // 12 months by default, not the 6 Analiza uses — this panel is for looking
  // back at last summer, not for spotting a trend.
  const [range, setRange] = useState<DateRange>({ months: 12, from: null, to: null });
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Same clamping as PanelAnalytics: never fetch below the budget's start.
  const floor = settings?.appStartMonth as string | undefined;
  const { fromMonth, toMonth } = useMemo(() => resolveRange(range), [range]);
  const clampedFrom = useMemo(() => (floor && fromMonth < floor ? floor : fromMonth), [fromMonth, floor]);
  const isPreset = !range.from && !range.to;
  const effectiveTo = useMemo(
    () => (isPreset && activeBudgetMonth > toMonth ? activeBudgetMonth : toMonth),
    [toMonth, activeBudgetMonth, isPreset],
  );
  const noDataAvailable = !!floor && effectiveTo < floor;

  useEffect(() => {
    if (noDataAvailable) return;
    loadRange(clampedFrom, effectiveTo);
  }, [clampedFrom, effectiveTo, loadRange, noDataAvailable]);

  const txs = transactions as unknown as TagTransaction[];

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

  const index = useMemo(() => summariseTags(txs), [txs]);
  const breakdown = useMemo(
    () => (selectedTag ? buildTagBreakdown(txs, selectedTag) : null),
    [txs, selectedTag],
  );

  const grain = breakdown && breakdown.spanDays <= DAILY_SERIES_MAX_DAYS ? "day" : "month";
  const timeline = useMemo(() => {
    if (!breakdown) return [];
    return grain === "day"
      ? breakdown.daily.map(d => ({ key: d.date, amount: d.amount }))
      : breakdown.monthly.map(m => ({ key: m.month, amount: m.amount }));
  }, [breakdown, grain]);

  // The window is a guess, so say when a tag touches its edge — the totals
  // below would be silently cut off.
  const touchesEdge = !!breakdown?.firstDate && breakdown.firstDate.slice(0, 7) <= clampedFrom;

  return (
    <div style={{ padding: "0 0 60px 0" }}>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <div style={s.sectionTitle}>🏷️ Analiza tagów</div>
        <div style={s.sectionSub}>
          Ile kosztował wyjazd i co się na niego złożyło. Liczone po dacie transakcji,
          netto po zwrotach, tylko wydatki.
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <RangePicker value={range} onChange={setRange} allowAll={false} />
      </div>

      {noDataAvailable && (
        <ChartEmpty message={`Wybrany zakres kończy się przed startem budżetu (${monthLabel(floor!)}).`} />
      )}

      {!noDataAvailable && isLoading && (
        <div style={{ color: c.textMuted, textAlign: "center", padding: 40 }}>Ładowanie…</div>
      )}

      {/* ── Index: pick a tag ── */}
      {!noDataAvailable && !isLoading && !selectedTag && (
        index.length === 0 ? (
          <ChartEmpty message="Brak otagowanych wydatków w tym zakresie." />
        ) : (
          <>
            <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 10 }}>
              {index.length} {plural(index.length, "tag", "tagi", "tagów")} z wydatkami — kliknij, żeby zobaczyć rozbicie.
            </div>
            {index.map(row => (
              <button
                key={row.tagId}
                onClick={() => setSelectedTag(row.tagId)}
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
                  {" · "}{row.count} {plural(row.count, "transakcja", "transakcje", "transakcji")}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, color: c.success, whiteSpace: "nowrap" }}>
                  {fmt(row.total)}
                </span>
              </button>
            ))}
          </>
        )
      )}

      {/* ── Breakdown for one tag ── */}
      {!noDataAvailable && !isLoading && selectedTag && breakdown && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <button
              onClick={() => setSelectedTag(null)}
              style={{
                padding: "6px 12px", borderRadius: 8, border: `1px solid ${c.borderStrong}`,
                background: "transparent", color: c.textSecondary, cursor: "pointer", fontSize: 12, fontWeight: 700,
              }}
            >
              ← Wszystkie tagi
            </button>
            <span style={{ fontSize: 16, fontWeight: 800, color: c.text }}>{labelFor(selectedTag)}</span>
          </div>

          {touchesEdge && (
            <div style={{
              marginBottom: 14, padding: "8px 12px", borderRadius: 8,
              background: alpha(c.warning, "11"), border: `1px solid ${alpha(c.warning, "44")}`,
              fontSize: 12, color: c.warning,
            }}>
              ⚠️ Najstarszy wydatek dotyka krawędzi zakresu — poszerz go, żeby mieć pewność, że nic nie zostało ucięte.
            </div>
          )}

          {breakdown.count === 0 ? (
            <ChartEmpty message="Ten tag nie ma wydatków w wybranym zakresie." />
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <Tile label="Suma" value={fmt(breakdown.total)} />
                <Tile
                  label="Transakcje"
                  value={String(breakdown.count)}
                  sub={`${breakdown.spendingDays} ${plural(breakdown.spendingDays, "dzień", "dni", "dni")} z wydatkami`}
                />
                <Tile
                  label="Okres"
                  value={`${breakdown.spanDays} ${plural(breakdown.spanDays, "dzień", "dni", "dni")}`}
                  sub={`${breakdown.firstDate} → ${breakdown.lastDate}`}
                />
                <Tile
                  label="Średnio dziennie"
                  value={fmt(breakdown.spanDays > 0 ? breakdown.total / breakdown.spanDays : 0)}
                  sub="na dzień okresu"
                />
                {breakdown.biggest && (
                  <Tile
                    label="Największy wydatek"
                    value={fmt(breakdown.biggest.amount)}
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
                  : "Zakres dłuższy niż dwa miesiące, więc widok miesięczny."}
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
