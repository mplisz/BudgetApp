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
import { fmt, plural } from "../../utils/helpers";
import {
  buildTagBreakdown, DAILY_SERIES_MAX_DAYS,
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
  const { tags } = useAppContext();
  const { bounds, isLoading: boundsLoading, load: loadBounds } = useTagBounds();
  const { transactions, isLoading: txLoading, loadRange } = useTransactionsRange();

  const [selected, setSelected] = useState<TagBounds | null>(null);

  useEffect(() => { loadBounds(); }, [loadBounds]);

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

  const breakdown = useMemo(
    () => (selected
      ? buildTagBreakdown(transactions as unknown as TagTransaction[], selected.tagId)
      : null),
    [transactions, selected],
  );

  const grain = breakdown && breakdown.spanDays <= DAILY_SERIES_MAX_DAYS ? "day" : "month";
  const timeline = useMemo(() => {
    if (!breakdown) return [];
    return grain === "day"
      ? breakdown.daily.map(d => ({ key: d.date, amount: d.amount }))
      : breakdown.monthly.map(m => ({ key: m.month, amount: m.amount }));
  }, [breakdown, grain]);

  // The fetch covers the tag's own months, so a mismatch here means the range
  // response has not landed yet rather than anything being missing.
  const awaitingData = !!selected && !!breakdown && breakdown.count < selected.count;

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
          </div>

          {(txLoading || awaitingData || !breakdown) ? (
            <div style={{ color: c.textMuted, textAlign: "center", padding: 40 }}>Ładowanie…</div>
          ) : breakdown.count === 0 ? (
            <ChartEmpty message="Ten tag nie ma wydatków do pokazania." />
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
