// ============================================================
// File: src/components/panels/PanelAnalytics.tsx
// Multi-month analytics panel.
// Sections:
//   1) Range picker
//   2) Monthly trend (line chart)
//   3) Budget vs. actual (#1)
//   4) Pie chart with drill-down + top categories bar
//   5) Income structure (#2) + savings rate (#3)
//   6) Fixed vs. variable expenses (#5)
//   7) Savings contributions by goal (#6)
//   8) Monthly table (clickable rows → navigate to PanelSummary)
//   9) Category heatmap
//
// APP-START FLOOR:
//   The lower bound of the requested range is clamped to
//   settings.appStartMonth so the chart never shows months before the
//   budget actually started. When clamping is in effect, a banner
//   informs the user; the header reflects the clamped range, not the
//   user-requested one.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect, useMemo } from "react";
import { useAppContext }              from "../../context/AppContext";
import { useNavigate }                from "react-router-dom";
import { PANEL_PATHS }                from "../../data/routes";
import { useTransactionsRange } from "../../hooks/useTransactionsRange";
import { useLimits, getActiveLimit } from "../../hooks/useLimits";
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
import { BudgetVsActualChart, type BudgetVsActualPoint } from "./analyticsComponents/BudgetVsActualChart";
import { SavingsRateChart, type SavingsRatePoint }       from "./analyticsComponents/SavingsRateChart";
import { StackedMonthlyChart, type StackedSeries }       from "./analyticsComponents/StackedMonthlyChart";
import { MonthlyDeltaChart, type CategoryDelta }         from "./analyticsComponents/MonthlyDeltaChart";
import { CHART_COLORS, SERIES, isRetirementCategory }    from "./analyticsComponents/chartKit";
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
  isRecurring?:    boolean;
  recurringId?:    string | null;
  merchant?:       string | null;
  returns?:        Array<{ moneyReturnedInMonth: string; cashAmount?: number }>;
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
  const { categories, settings } = useAppContext();

  const { budgetMonth: activeBudgetMonth, setBudgetMonth } = useMonthFromUrl();
  const navigate           = useNavigate();

  // Clamp the lower bound to appStartMonth so analytics never shows
  // months before the budget actually started.
  const floor = settings?.appStartMonth;

  const { transactions, isLoading, loadRange } = useTransactionsRange();
  const { limits, loadLimits } = useLimits();

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

  // Limits are month-independent here (we read the full set and resolve the
  // active entry per month), so load once.
  useEffect(() => { loadLimits(); }, [loadLimits]);

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
    const out = monthsInRange.map(m => byMonth[m]);
    // #8 — 3-month trailing moving average of expenses (smooths one-off spikes)
    for (let i = 2; i < out.length; i++) {
      out[i].expensesMA = (out[i].expenses + out[i - 1].expenses + out[i - 2].expenses) / 3;
    }
    return out;
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

  // ── Top shops (by merchant; OCR-populated, expense only) ───
  // Share is relative to merchant-tagged spend; untagged transactions are
  // skipped so the chart reflects "where my labelled spending goes".

  const merchantTotals = useMemo<CategoryTotal[]>(() => {
    const byShop: Record<string, CategoryTotal> = {};
    let sum = 0;
    for (const tx of (transactions as unknown as Transaction[])) {
      if (tx.type !== "EXPENSE") continue;
      const shop = (tx.merchant ?? "").trim();
      if (!shop) continue;
      const eff = calculateEffectiveAmount(tx, tx.budgetMonth);
      if (!byShop[shop]) {
        byShop[shop] = { categoryId: shop, categoryName: shop, total: 0, share: 0 };
      }
      byShop[shop].total += eff;
      sum += eff;
    }
    return Object.values(byShop)
      .map(c => ({ ...c, share: sum > 0 ? (c.total / sum) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [transactions]);

  // ── #1 Budget vs. actual (expenses only) ───────────────────

  const expenseCategoryIds = useMemo(
    () => new Set(categories.filter(c => c.type === "EXPENSE").map(c => c.id)),
    [categories],
  );

  const budgetVsActual = useMemo<BudgetVsActualPoint[]>(() =>
    monthlyData.map(d => {
      const limit = limits.reduce((sum, doc) => {
        if (!expenseCategoryIds.has(doc.categoryId)) return sum;
        const active = getActiveLimit(doc, d.month);
        return sum + (active?.amount ?? 0);
      }, 0);
      return { month: d.month, limit, expenses: d.expenses };
    }),
    [monthlyData, limits, expenseCategoryIds],
  );

  // ── #2 Income structure (INCOME only — diversification view) ──

  const incomePieData = useMemo<AnalyticsCategorySlice[]>(() => {
    const byCat = new Map<string, {
      categoryId: string; categoryName: string; icon?: string; total: number;
      subs: Map<string, { subcategoryId: string; subcategoryName: string; total: number }>;
    }>();
    for (const tx of (transactions as unknown as Transaction[])) {
      if (tx.type !== "INCOME") continue;
      let slice = byCat.get(tx.categoryId);
      if (!slice) {
        slice = {
          categoryId:   tx.categoryId,
          categoryName: tx.categoryName,
          icon:         categories.find(c => c.id === tx.categoryId)?.icon,
          total:        0,
          subs:         new Map(),
        };
        byCat.set(tx.categoryId, slice);
      }
      slice.total += tx.amount;
      const sub = slice.subs.get(tx.subcategoryId);
      if (sub) sub.total += tx.amount;
      else slice.subs.set(tx.subcategoryId, {
        subcategoryId: tx.subcategoryId, subcategoryName: tx.subcategoryName, total: tx.amount,
      });
    }
    return [...byCat.values()].map(c => ({
      categoryId: c.categoryId, categoryName: c.categoryName, icon: c.icon, total: c.total,
      subcategories: [...c.subs.values()].sort((a, b) => b.total - a.total),
    }));
  }, [transactions, categories]);

  // ── #3 Savings rate (denominator = income; retirement subset) ──

  const savingsRateData = useMemo<SavingsRatePoint[]>(() => {
    const retByMonth: Record<string, number> = {};
    for (const tx of (transactions as unknown as Transaction[])) {
      if (tx.type !== "SAVING" || !isRetirementCategory(tx.categoryName)) continue;
      retByMonth[tx.budgetMonth] =
        (retByMonth[tx.budgetMonth] ?? 0) + calculateEffectiveAmount(tx, tx.budgetMonth);
    }
    return monthlyData.map(d => {
      const retirement = retByMonth[d.month] ?? 0;
      return {
        month:          d.month,
        rate:           d.income > 0 ? (d.savings  / d.income) * 100 : 0,
        retirementRate: d.income > 0 ? (retirement / d.income) * 100 : 0,
      };
    });
  }, [monthlyData, transactions]);

  // ── #5 Fixed vs. variable expenses (by isRecurring / recurringId) ──

  const fixedVariableData = useMemo<Array<{ month: string; fixed: number; variable: number }>>(() => {
    const byMonth: Record<string, { month: string; fixed: number; variable: number }> = {};
    for (const d of monthlyData) byMonth[d.month] = { month: d.month, fixed: 0, variable: 0 };
    for (const tx of (transactions as unknown as Transaction[])) {
      if (tx.type !== "EXPENSE") continue;
      const row = byMonth[tx.budgetMonth];
      if (!row) continue;
      const eff     = calculateEffectiveAmount(tx, tx.budgetMonth);
      const isFixed = tx.isRecurring === true || (tx.recurringId ?? null) !== null;
      if (isFixed) row.fixed += eff; else row.variable += eff;
    }
    return monthlyData.map(d => byMonth[d.month]);
  }, [monthlyData, transactions]);

  const fixedVariableSeries: StackedSeries[] = [
    { key: "fixed",    name: "Stałe (cykliczne)", color: SERIES.fixed },
    { key: "variable", name: "Zmienne",           color: SERIES.variable },
  ];

  // ── #6 Savings contributions by goal (top-level SAVING category) ──

  const savingsByGoal = useMemo<{
    data: Array<{ month: string } & Record<string, number>>;
    series: StackedSeries[];
  }>(() => {
    const goals   = new Map<string, string>();   // categoryId -> categoryName
    const byMonth: Record<string, Record<string, number> & { month: string }> = {};
    for (const d of monthlyData) {
      byMonth[d.month] = { month: d.month } as Record<string, number> & { month: string };
    }
    for (const tx of (transactions as unknown as Transaction[])) {
      if (tx.type !== "SAVING") continue;
      const row = byMonth[tx.budgetMonth];
      if (!row) continue;
      goals.set(tx.categoryId, tx.categoryName);
      row[tx.categoryId] = (row[tx.categoryId] ?? 0) + calculateEffectiveAmount(tx, tx.budgetMonth);
    }
    const goalIds = [...goals.keys()];
    const data = monthlyData.map(d => {
      const row = byMonth[d.month];
      for (const id of goalIds) if (row[id] === undefined) row[id] = 0;  // fill gaps
      return row;
    });
    const series: StackedSeries[] = goalIds.map((id, i) => ({
      key: id, name: goals.get(id) ?? id, color: CHART_COLORS[i % CHART_COLORS.length],
    }));
    return { data, series };
  }, [monthlyData, transactions]);

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

  // ── #7 Latest month vs. average of the preceding months in range ──
  // The selected range now matters: the baseline is the per-category mean
  // across every month before the latest one, so a single outlier month is
  // smoothed out (pairs naturally with the trend's moving average).

  const categoryDeltas = useMemo<CategoryDelta[]>(() => {
    if (monthsInRange.length < 2) return [];
    const cur        = monthsInRange[monthsInRange.length - 1];
    const priorSet   = new Set(monthsInRange.slice(0, -1));
    const priorCount = monthsInRange.length - 1;

    const acc: Record<string, {
      categoryId: string; categoryName: string; icon?: string;
      current: number; priorSum: number;
    }> = {};

    for (const tx of (transactions as unknown as Transaction[])) {
      if (tx.type !== "EXPENSE") continue;
      const isCur   = tx.budgetMonth === cur;
      const isPrior = priorSet.has(tx.budgetMonth);
      if (!isCur && !isPrior) continue;
      const eff = calculateEffectiveAmount(tx, tx.budgetMonth);
      let row = acc[tx.categoryId];
      if (!row) {
        row = {
          categoryId:   tx.categoryId,
          categoryName: tx.categoryName,
          icon:         categories.find(c => c.id === tx.categoryId)?.icon,
          current:      0,
          priorSum:     0,
        };
        acc[tx.categoryId] = row;
      }
      if (isCur) row.current += eff;
      else       row.priorSum += eff;
    }

    return Object.values(acc)
      .map(c => {
        const baseline = priorCount > 0 ? c.priorSum / priorCount : 0;
        return {
          categoryId:   c.categoryId,
          categoryName: c.categoryName,
          icon:         c.icon,
          current:      c.current,
          previous:     baseline,            // baseline = avg of preceding months
          delta:        c.current - baseline,
        };
      })
      .filter(c => Math.abs(c.delta) > 0.005);
  }, [transactions, categories, monthsInRange]);

  const deltaMeta = monthsInRange.length >= 2
    ? {
        cur:        monthsInRange[monthsInRange.length - 1],
        priorFrom:  monthsInRange[0],
        priorTo:    monthsInRange[monthsInRange.length - 2],
        priorCount: monthsInRange.length - 1,
      }
    : null;

  const deltaBaselineLabel = deltaMeta
    ? (deltaMeta.priorFrom === deltaMeta.priorTo
        ? deltaMeta.priorFrom
        : `${deltaMeta.priorFrom}–${deltaMeta.priorTo}`)
    : "";

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
    <div style={{ padding: "0 16px 40px", maxWidth: 1200, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

      {/* Header — shows the CLAMPED range, not the user-requested one */}
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={s.sectionTitle}>📊 Analiza wielomiesięczna</div>
        <div style={{ fontSize: 13, color: c.textSecondary }}>
          {noDataAvailable ? (
            <>Brak danych dla wybranego zakresu</>
          ) : (
            <>
              {clampedFrom} → {effectiveTo} · {monthsInRange.length}{" "}
              {monthsInRange.length === 1 ? "miesiąc" : "miesięcy"}
              {!isLoading && (
                <>
                  {" · Wydatki łącznie: "}
                  <strong style={{ color: c.danger }}>{fmt(rangeTotals.expenses)} zł</strong>
                  {" · Saldo: "}
                  <strong style={{ color: rangeTotals.balance >= 0 ? c.success : c.danger }}>
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
            background: alpha(c.info, "11"), border: `1px solid ${alpha(c.info, "44")}`,
            borderRadius: 6, fontSize: 11, color: c.infoSky,
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
          <div style={{ textAlign: "center", padding: "40px 20px", color: c.textTertiary }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 6 }}>
              Wybrany zakres jest przed startem budżetu
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
              Budżet rozpoczyna się od <strong style={{ color: c.success }}>{floor}</strong>.
              Wybierz zakres obejmujący tę datę lub późniejszy.
            </div>
          </div>
        </Card>
      )}

      {isLoading && !noDataAvailable && (
        <div style={{ color: c.textMuted, textAlign: "center", padding: 40 }}>Ładowanie…</div>
      )}

      {!isLoading && !noDataAvailable && (
        <>
          {/* Trend */}
          <Card title="📈 Trend miesięczny">
            <MonthlyTrendChart data={monthlyData} />
          </Card>

          {/* #1 Budget vs. actual */}
          <div style={{ marginTop: 16 }}>
            <Card title="🎯 Budżet vs. rzeczywistość">
              <BudgetVsActualChart data={budgetVsActual} />
            </Card>
          </div>

          {/* Two-column: expense pie + top categories bar */}
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

          {/* Top shops (only when merchant data exists) */}
          {merchantTotals.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Card title="🛒 Top sklepy">
                <TopCategoriesBar data={merchantTotals} topN={10} />
              </Card>
            </div>
          )}

          {/* #2 income structure + #3 savings rate */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginTop: 16,
          }} data-analytics-cols>
            <Card title="💰 Struktura wpływów">
              <AnalyticsPieChart data={incomePieData} emptyMessage="Brak wpływów w zakresie." />
            </Card>
            <Card title="📈 Stopa oszczędności">
              <SavingsRateChart
                data={savingsRateData}
                minSavingsPercent={settings?.targets?.minSavingsPercent}
                minRetirementPercent={settings?.targets?.minRetirementPercent}
              />
            </Card>
          </div>

          {/* #5 fixed vs. variable */}
          <div style={{ marginTop: 16 }}>
            <Card title="🧱 Wydatki stałe vs. zmienne">
              <StackedMonthlyChart data={fixedVariableData} series={fixedVariableSeries} />
            </Card>
          </div>

          {/* #6 savings contributions by goal */}
          <div style={{ marginTop: 16 }}>
            <Card title="🏦 Wpłaty na cele oszczędnościowe">
              <StackedMonthlyChart
                data={savingsByGoal.data}
                series={savingsByGoal.series}
                emptyMessage="Brak wpłat na oszczędności w zakresie."
              />
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

          {/* #7 Latest month vs. in-range average per category */}
          {deltaMeta && (
            <div style={{ marginTop: 16 }}>
              <Card title={`📊 ${deltaMeta.cur} vs średnia (${deltaBaselineLabel})`}>
                <MonthlyDeltaChart data={categoryDeltas} topN={10} />
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
