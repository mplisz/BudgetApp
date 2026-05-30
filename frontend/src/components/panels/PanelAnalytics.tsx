// ============================================================
// File: src/components/panels/PanelAnalytics.tsx
// Multi-month analytics panel.
// Sections:
//   1) Range picker
//   2) Monthly trend (line chart)
//   3) Pie chart with drill-down + top categories bar
//   4) Monthly table (clickable rows → navigate to PanelSummary)
//   5) Category heatmap
//
// APP-START FLOOR:
//   The lower bound of the requested range is clamped to
//   settings.appStartMonth so the chart never shows months before the
//   budget actually started. When clamping is in effect, a banner
//   informs the user; the header reflects the clamped range, not the
//   user-requested one.
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { useAppContext }              from "../../context/AppContext";
import { useNavigate }                from "react-router-dom";
import { PANEL_PATHS }                from "../../data/routes";
import { useTransactionsRange } from "../../hooks/useTransactionsRange";
import { calculateEffectiveAmount } from "../../utils/returnUtils";
import { RangePicker, resolveRange, type DateRange } from "../ui/RangePicker";
import { Card } from "../ui/summaryUi";
import { theme as s } from "../../styles/theme";
import { fmt } from "../../utils/helpers";

import { MonthlyTrendChart, type MonthlyDataPoint } from "./analyticsComponents/MonthlyTrendChart";
import { AnalyticsPieChart, type AnalyticsCategorySlice } from "./analyticsComponents/AnalyticsPieChart";
import { TopCategoriesBar, type CategoryTotal } from "./analyticsComponents/TopCategoriesBar";
import { MonthlyTable } from "./analyticsComponents/MonthlyTable";
import { CategoryHeatmap, type HeatmapRow } from "./analyticsComponents/CategoryHeatmap";
import { useMonthFromUrl } from "../../hooks/useMonthFromUrl";


// ── Types ─────────────────────────────────────────────────────

interface Transaction {
  id:              string;
  type:            string;
  date:            string;
  budgetMonth:     string;
  categoryId:      string;
  categoryName:    string;
  subcategoryId:   string;
  subcategoryName: string;
  amount:          number;
  returns?:        Array<{ moneyReturnedInMonth: string; cashAmount?: number }>;
}

interface Category {
  id:         string;
  name:       string;
  icon:       string;
  type:       string;
  isArchived: boolean;
}

// ── Helpers ───────────────────────────────────────────────────

function enumerateMonths(fromYM: string, toYM: string): string[] {
  const result: string[] = [];
  const [fy, fm] = fromYM.split("-").map(Number);
  const [ty, tm] = toYM.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────

export default function PanelAnalytics() {
  const { categories, settings } = useAppContext() as {
    categories: Category[];
    settings:   { appStartMonth?: string } | null;
  };

  const { budgetMonth: activeBudgetMonth, setBudgetMonth } = useMonthFromUrl();
  const navigate           = useNavigate();

  // Clamp the lower bound to appStartMonth so analytics never shows
  // months before the budget actually started.
  const floor = settings?.appStartMonth;

  const { transactions, isLoading, loadRange } = useTransactionsRange();

  const [range, setRange] = useState<DateRange>({ months: 6, from: null, to: null });

  // Resolve user-requested range → clamp to floor
  const { fromMonth, toMonth } = useMemo(() => resolveRange(range), [range]);

  const clampedFrom = useMemo(
    () => (floor && fromMonth < floor ? floor : fromMonth),
    [fromMonth, floor],
  );


  // For PRESET ranges only: if the active budget month is past the
  // calendar month (e.g. today=2026-05, active=2026-06 because budget
  // starts in June), extend `to` so the user sees their forward-dated
  // data. Custom from/to is left alone — user decides explicitly.
  const isPreset = !range.from && !range.to;
  const effectiveTo = useMemo(
    () => (isPreset && activeBudgetMonth > toMonth ? activeBudgetMonth : toMonth),
    [toMonth, activeBudgetMonth, isPreset],
  );



  // True when clamp actually changed the lower bound — drives the banner.
  const wasClamped = clampedFrom !== fromMonth;

  // True when even the upper bound is below the floor (e.g. user picked
  // a 3-month preset and the entire window is before the budget started).
  // Render an empty-state instead of fetching from > to.
   const noDataAvailable = !!floor && effectiveTo < floor;


  useEffect(() => {
    // Skip the fetch entirely when the whole requested range is before
    // the floor — backend would 400 with `from must be <= to`.
    if (noDataAvailable) return;
    loadRange(clampedFrom, effectiveTo);
  }, [clampedFrom, effectiveTo, loadRange, noDataAvailable]);

  // Months in range (oldest -> newest) — uses the CLAMPED from
  const monthsInRange = useMemo(
    () => (noDataAvailable ? [] : enumerateMonths(clampedFrom, effectiveTo)),
    [clampedFrom, effectiveTo, noDataAvailable],
  );

  // ── Aggregate per-month totals ─────────────────────────────

  const monthlyData = useMemo<MonthlyDataPoint[]>(() => {
    const byMonth: Record<string, MonthlyDataPoint> = {};
    for (const m of monthsInRange) {
      byMonth[m] = { month: m, income: 0, transfers: 0, expenses: 0, savings: 0, balance: 0 };
    }
    for (const tx of (transactions as unknown as Transaction[])) {
      const row = byMonth[tx.budgetMonth];
      if (!row) continue;
      const effective = (tx.type === "EXPENSE" || tx.type === "SAVING")
        ? calculateEffectiveAmount(tx, tx.budgetMonth)
        : tx.amount;
      if (tx.type === "INCOME")   row.income    += tx.amount;
      if (tx.type === "TRANSFER") row.transfers += tx.amount;
      if (tx.type === "EXPENSE")  row.expenses  += effective;
      if (tx.type === "SAVING")   row.savings   += effective;
    }
    // Balance = income + transfers − expenses − savings
    for (const m of monthsInRange) {
      const r = byMonth[m];
      r.balance = r.income + r.transfers - r.expenses - r.savings;
    }
    return monthsInRange.map(m => byMonth[m]);
  }, [transactions, monthsInRange]);

  // ── Aggregate per-category totals (EXPENSE only for pie/bar) ──

  const categoryTotals = useMemo<CategoryTotal[]>(() => {
    const byCat: Record<string, CategoryTotal & { subcategories: Map<string, { id: string; name: string; total: number }> }> = {};
    for (const tx of (transactions as unknown as Transaction[])) {
      if (tx.type !== "EXPENSE") continue;
      const effective = calculateEffectiveAmount(tx, tx.budgetMonth);
      if (!byCat[tx.categoryId]) {
        const cat = categories.find(c => c.id === tx.categoryId);
        byCat[tx.categoryId] = {
          categoryId:   tx.categoryId,
          categoryName: tx.categoryName,
          icon:         cat?.icon,
          total:        0,
          share:        0,
          subcategories: new Map(),
        };
      }
      byCat[tx.categoryId].total += effective;
      // Subcategory drill-down
      const sub = byCat[tx.categoryId].subcategories.get(tx.subcategoryId);
      if (sub) {
        sub.total += effective;
      } else {
        byCat[tx.categoryId].subcategories.set(tx.subcategoryId, {
          id:    tx.subcategoryId,
          name:  tx.subcategoryName,
          total: effective,
        });
      }
    }
    const sum = Object.values(byCat).reduce((s, c) => s + c.total, 0);
    return Object.values(byCat).map(c => ({
      ...c,
      share: sum > 0 ? (c.total / sum) * 100 : 0,
    }));
  }, [transactions, categories]);

  // Convert categoryTotals (Map subs) to AnalyticsCategorySlice (array subs)
  const pieData = useMemo<AnalyticsCategorySlice[]>(() =>
    categoryTotals.map(c => ({
      categoryId:   c.categoryId,
      categoryName: c.categoryName,
      icon:         c.icon,
      total:        c.total,
      subcategories: Array.from(
        (c as unknown as { subcategories: Map<string, { id: string; name: string; total: number }> }).subcategories.values()
      ).map(s => ({
        subcategoryId:   s.id,
        subcategoryName: s.name,
        total:           s.total,
      })).sort((a, b) => b.total - a.total),
    })),
    [categoryTotals],
  );

  // ── Heatmap rows ───────────────────────────────────────────

  const heatmapRows = useMemo<HeatmapRow[]>(() => {
    const byCat: Record<string, HeatmapRow> = {};
    for (const tx of (transactions as unknown as Transaction[])) {
      if (tx.type !== "EXPENSE") continue;
      const effective = calculateEffectiveAmount(tx, tx.budgetMonth);
      if (!byCat[tx.categoryId]) {
        const cat = categories.find(c => c.id === tx.categoryId);
        byCat[tx.categoryId] = {
          categoryId:   tx.categoryId,
          categoryName: tx.categoryName,
          icon:         cat?.icon,
          byMonth:      {},
        };
      }
      byCat[tx.categoryId].byMonth[tx.budgetMonth] =
        (byCat[tx.categoryId].byMonth[tx.budgetMonth] || 0) + effective;
    }
    return Object.values(byCat)
      .sort((a, b) => {
        const aTotal = monthsInRange.reduce((s, m) => s + (a.byMonth[m] || 0), 0);
        const bTotal = monthsInRange.reduce((s, m) => s + (b.byMonth[m] || 0), 0);
        return bTotal - aTotal;
      });
  }, [transactions, categories, monthsInRange]);

  // ── Navigation handlers ───────────────────────────────────

  function navigateToMonth(monthStr: string) {
    // Set ?m= then route to summary — deep-linkable
    setBudgetMonth(monthStr);
    navigate(`${PANEL_PATHS.summary}?m=${monthStr}`);
  }

  // ── Range header summary ──────────────────────────────────

  const rangeTotals = useMemo(() => {
    return monthlyData.reduce(
      (acc, m) => ({
        income:    acc.income    + m.income,
        transfers: acc.transfers + m.transfers,
        expenses:  acc.expenses  + m.expenses,
        savings:   acc.savings   + m.savings,
        balance:   acc.balance   + m.balance,
      }),
      { income: 0, transfers: 0, expenses: 0, savings: 0, balance: 0 },
    );
  }, [monthlyData]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px 0", maxWidth: 1200 }}>

      {/* Header — shows the CLAMPED range, not the user-requested one */}
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={(s as any).sectionTitle}>📊 Analiza wielomiesięczna</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {noDataAvailable ? (
            <>Brak danych dla wybranego zakresu</>
          ) : (
            <>
              {clampedFrom} → {effectiveTo} · {monthsInRange.length}{" "}
              {monthsInRange.length === 1 ? "miesiąc" : "miesięcy"}
              {!isLoading && (
                <>
                  {" · Wydatki łącznie: "}
                  <strong style={{ color: "#ef4444" }}>{fmt(rangeTotals.expenses)} zł</strong>
                  {" · Saldo: "}
                  <strong style={{ color: rangeTotals.balance >= 0 ? "#10b981" : "#ef4444" }}>
                    {rangeTotals.balance >= 0 ? "+" : ""}{fmt(rangeTotals.balance)} zł
                  </strong>
                </>
              )}
            </>
          )}
        </div>

        {/* Clamp banner — shown when the user picked a range that reached
            below the budget start. Tells them what's actually displayed. */}
        {wasClamped && !noDataAvailable && (
          <div style={{
            marginTop: 8, padding: "6px 10px",
            background: "#3b82f611", border: "1px solid #3b82f644",
            borderRadius: 6, fontSize: 11, color: "#60a5fa",
          }}>
            ℹ️ Pokazuję dane od <strong>{clampedFrom}</strong> (budżet zaczyna się od {floor}).
            Wybrany zakres został przycięty.
          </div>
        )}
      </div>

      {/* Range picker */}
      <div style={{ marginBottom: 24 }}>
        <RangePicker value={range} onChange={setRange} allowAll={false} />
      </div>

      {/* Empty state — entire range is before the floor */}
      {noDataAvailable && (
        <Card>
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>
              Wybrany zakres jest przed startem budżetu
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
              Budżet rozpoczyna się od <strong style={{ color: "#10b981" }}>{floor}</strong>.
              Wybierz zakres obejmujący tę datę lub późniejszy.
            </div>
          </div>
        </Card>
      )}

      {isLoading && !noDataAvailable && (
        <div style={{ color: "#475569", textAlign: "center", padding: 40 }}>Ładowanie…</div>
      )}

      {!isLoading && !noDataAvailable && (
        <>
          {/* Trend */}
          <Card title="📈 Trend miesięczny">
            <MonthlyTrendChart data={monthlyData} />
          </Card>

          {/* Two-column: pie + bar */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginTop: 16,
          }} data-analytics-cols>
            <Card title="🥧 Struktura wydatków">
              <AnalyticsPieChart data={pieData} />
            </Card>
            <Card title="🏆 Top kategorie">
              <TopCategoriesBar data={categoryTotals} topN={10} />
            </Card>
          </div>

          {/* Monthly table */}
          <div style={{ marginTop: 16 }}>
            <Card title="📋 Miesiące">
              <MonthlyTable data={monthlyData} onClick={navigateToMonth} />
            </Card>
          </div>

          {/* Heatmap */}
          {heatmapRows.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Card title="🔥 Heatmapa kategorii × miesiące">
                <CategoryHeatmap rows={heatmapRows} months={monthsInRange} />
              </Card>
            </div>
          )}
        </>
      )}

      <style>{`
        @media (max-width: 900px) {
          [data-analytics-cols] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
