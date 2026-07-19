// ============================================================
// File: src/components/panels/PanelSummary.tsx
// "Podsumowanie miesiąca" panel — desktop only.
// ============================================================

import { c } from "../../styles/tokens";
import { useMemo, useEffect, useCallback, useState  } from "react";
import { useAppContext }    from "../../context/AppContext";
import { useMonthStatus }   from "../../hooks/useMonthStatus";
import { useTransactions }  from "../../hooks/useTransactions";
import { useLimits, buildLimitMap } from "../../hooks/useLimits";
import { calculateEffectiveAmount, calculateNetAmount } from "../../utils/returnUtils";
import { fmt }              from "../../utils/helpers";
import { theme as s }       from "../../styles/theme";
import { Card }             from "../ui/summaryUi";
import { CategoryLimitBar } from "./summaryComponents/CategoryLimitBar";
import { SpendingPieChart } from "./summaryComponents/SpendingPieChart";
import { TargetIndicator }  from "./summaryComponents/TargetIndicator";
import { PriorityBreakdown } from "./summaryComponents/PriorityBreakdown";
import { TopTransactions }  from "./summaryComponents/TopTransactions";
import { SavingsSummary }   from "./summaryComponents/SavingsSummary";
import { DEFAULT_TARGETS }  from "../../types/summaryConstants";
import { SkeletonKpiCard, SkeletonCard, SkeletonChart, Skeleton } from "../ui/Skeleton";
import { MONTHS } from "../../data/constants";

import type {
  Transaction,
  CategorySummary,
  SubcategorySummary,
  SettingsTargets,
  BudgetMonth,
} from "../../types/summary";
import { EnvelopeBreakdown }  from "../ui/EnvelopeBreakdown";
import type { EnvelopeBreakdownItem } from "../ui/EnvelopeBreakdown";
import { MonthForecastSection } from "./analyticsComponents/MonthForecastSection";
import type { ForecastTransaction } from "../../utils/monthForecast";

// ── Local types ───────────────────────────────────────────────

interface KpiPillProps {
  icon: string;
  label: string;
  value: string;
  color?: string;
  sub?: string;
}
// ── Pure helpers ──────────────────────────────────────────────

function formatMonthTitle(budgetMonth: BudgetMonth): string {
  if (!budgetMonth) return "";
  const [y, m] = budgetMonth.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function sumTx(
  txList:      Transaction[],
  type:        Transaction["type"],
  budgetMonth?: string,
): number {
  return txList
    .filter(tx => tx.type === type)
    .reduce((acc, tx) => {
      // Deduct same-month cash returns from EXPENSE/SAVING totals
      if ((type === "EXPENSE" || type === "SAVING") && budgetMonth) {
        return acc + calculateEffectiveAmount(tx, budgetMonth);
      }
      return acc + tx.amount;
    }, 0);
}

// Tags are stored as tagId strings in tx.tags[].
// Matches if the transaction has ANY of the given tagIds.
function sumByTagIds(
  txList: Transaction[],
  type: Transaction["type"],
  tagIds: string[],
): number {
  return txList
    .filter(tx => tx.type === type && tx.tags?.some(t => tagIds.includes(t)))
    .reduce((acc, tx) => acc + tx.amount, 0);
}


// Matches SAVING transactions belonging to a specific categoryId.
function sumByCategoryId(
  txList: Transaction[],
  type: Transaction["type"],
  categoryIds: string[],
): number {
  return txList
    .filter(tx => tx.type === type && categoryIds.includes(tx.categoryId))
    .reduce((acc, tx) => acc + tx.amount, 0);
}

// ── KPI Pill ──────────────────────────────────────────────────

function KpiPill({ icon, label, value, color = c.text, sub }: KpiPillProps) {
  return (
    <div style={{
      background: c.border,
      border: `1px solid ${c.borderStrong}`,
      borderRadius: 12,
      padding: "12px 18px",
      textAlign: "center",
      flex: 1,
      minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: c.textSecondary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────

export default function PanelSummary() {
  const {
    transactions: rawTransactions,
    categories: rawCategories,
    settings: rawSettings,
    planned: rawPlanned 
  } = useAppContext();

  const { activeBudgetMonth }             = useMonthStatus();
  const { loadTransactions } = useTransactions();
  const { limits: rawLimits, loadLimits } = useLimits();
const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
const isFirstLoad = loadedMonth !== activeBudgetMonth;

  useEffect(() => {
   setLoadedMonth(null);
   loadTransactions(activeBudgetMonth)
    .then(() => setLoadedMonth(activeBudgetMonth))
    .catch(() => setLoadedMonth(activeBudgetMonth));   // stop skeleton on error
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBudgetMonth]);

  useEffect(() => {
    loadLimits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transactions = rawTransactions ?? [];
  const categories   = rawCategories   ?? [];
  const limits       = rawLimits       ?? [];
  const planned      = rawPlanned      ?? [];

  // ── Filtered transactions ─────────────────────────────────
  const monthTx = useMemo<Transaction[]>(() =>
    transactions.filter(tx => tx.budgetMonth === activeBudgetMonth && !tx.isArchived),
    [transactions, activeBudgetMonth],
  );

  // ── KPIs ──────────────────────────────────────────────────
  const totalIncome    = useMemo(() => sumTx(monthTx, "INCOME"),   [monthTx]);
  const totalTransfers = useMemo(() => sumTx(monthTx, "TRANSFER"), [monthTx]);
  const totalExpenses  = useMemo(() => sumTx(monthTx, "EXPENSE",  activeBudgetMonth), [monthTx, activeBudgetMonth]);
  const totalSavings   = useMemo(() => sumTx(monthTx, "SAVING",   activeBudgetMonth), [monthTx, activeBudgetMonth]);
  const virtualEnvelopePaid = useMemo(() => {
    // Include purchased envelopes: their paid rates locked money in the month
    // they were set aside, so past-month balance stays stable after purchase
    // (matches PanelAnalytics). Only paidByUser entries count.
    return (planned as any[])
      .filter(p => p.mode === "envelope" && !p.isArchived)
      .reduce((sum, p) => {
        const entry = (p.virtualSavings || []).find(
          (v: any) => v.month === activeBudgetMonth && v.paidByUser,
        );
        return sum + (entry?.amountPLN || 0);
      }, 0);
  }, [planned, activeBudgetMonth]);

  // SALDO = INCOME + TRANSFER(in) - EXPENSE - SAVING - PADI VIRTUAL ENVELOPS
  const balance        = totalIncome + totalTransfers - totalExpenses - totalSavings- virtualEnvelopePaid;;

  const limitMap   = useMemo(() => buildLimitMap(limits, activeBudgetMonth), [limits, activeBudgetMonth]);
  // Budget % = expenses as share of real income (INCOME + TRANSFER),
  // not of the base budget total — that's only an approximation.
  const totalRealIncome = totalIncome + totalTransfers;
  const budgetPct: number | null = totalRealIncome > 0 ? (totalExpenses / totalRealIncome) * 100 : null;

  // ── Category summaries ────────────────────────────────────
  const expenseCategories = useMemo<CategorySummary[]>(() => {
    const catMap = new Map<string, CategorySummary>();
    for (const tx of monthTx) {
      if (tx.type !== "EXPENSE") continue;
      if (!catMap.has(tx.categoryId)) {
        const catDef = categories.find(c => c.id === tx.categoryId);
        catMap.set(tx.categoryId, {
          categoryId:   tx.categoryId,
          categoryName: tx.categoryName,
          categoryIcon: catDef?.icon ?? "📦",
          spent:        0,
          limit:        limitMap[tx.categoryId]?.amount ?? null,
          percent:      null,
        });
      }
      // Category cost is NET of every cash return (incl. cross-month), so the
      // bars reflect what the category actually cost — not the gross outflow.
      catMap.get(tx.categoryId)!.spent += calculateNetAmount(tx);
    }
    for (const cat of catMap.values()) {
      if (cat.limit !== null && cat.limit > 0) {
        cat.percent = (cat.spent / cat.limit) * 100;
      }
    }
    return Array.from(catMap.values());
  }, [monthTx, categories, limitMap]);

  const categoriesWithLimit    = useMemo(() => expenseCategories.filter(c => c.limit !== null), [expenseCategories]);
  const categoriesWithoutLimit = useMemo(() => expenseCategories.filter(c => c.limit === null),  [expenseCategories]);

  // Net total across categories — denominator for the category breakdown %.
  const totalExpensesNet = useMemo(
    () => expenseCategories.reduce((sum, cat) => sum + cat.spent, 0),
    [expenseCategories],
  );

  // ── Subcategory drill-down ────────────────────────────────
  const getSubcategories = useCallback((categoryId: string): SubcategorySummary[] => {
    const catTx    = monthTx.filter(tx => tx.type === "EXPENSE" && tx.categoryId === categoryId);
    const subMap   = new Map<string, SubcategorySummary>();
    const catTotal = expenseCategories.find(c => c.categoryId === categoryId)?.spent ?? 0;

    for (const tx of catTx) {
      if (!subMap.has(tx.subcategoryId)) {
        subMap.set(tx.subcategoryId, {
          subcategoryId:     tx.subcategoryId,
          subcategoryName:   tx.subcategoryName,
          spent:             0,
          percentOfCategory: 0,
          percentOfTotal:    0,
        });
      }
      subMap.get(tx.subcategoryId)!.spent += calculateNetAmount(tx);
    }
    for (const sub of subMap.values()) {
      sub.percentOfCategory = catTotal          > 0 ? (sub.spent / catTotal)          * 100 : 0;
      sub.percentOfTotal    = totalExpensesNet  > 0 ? (sub.spent / totalExpensesNet)  * 100 : 0;
    }
    return Array.from(subMap.values()).sort((a, b) => b.spent - a.spent);
  }, [monthTx, expenseCategories, totalExpensesNet]);

  // ── Target indicators ─────────────────────────────────────
  const targets: SettingsTargets = rawSettings?.targets ?? DEFAULT_TARGETS;

  const insuranceSpent   = useMemo(() => sumByTagIds(monthTx, "EXPENSE", ["tag_ubezpieczenia_MMs"]), [monthTx]);
  const obligationsSpent = useMemo(() => sumByTagIds(monthTx, "EXPENSE", ["tag_raty_MMs"]), [monthTx]);
  const retirementSpent  = useMemo(() => sumByCategoryId(monthTx, "SAVING", ["cat_emerytura"]), [monthTx]);

  const hasData = monthTx.length > 0;
 
  //Envelope breakdown
  const envelopeBreakdown = useMemo<EnvelopeBreakdownItem[]>(() => {
    const items: EnvelopeBreakdownItem[] = [];
    for (const p of (planned as any[])) {
      if (p.isArchived || p.mode !== "envelope") continue;
      const entry = (p.virtualSavings || []).find(
        (v: any) => v.month === activeBudgetMonth && !v.dismissedByUser,
      );
      if (!entry) continue;
      // A purchased envelope only shows historically paid rates — no "○ not yet".
      if (p.isPurchased && !entry.paidByUser) continue;
      items.push({
        categoryName: p.targetCategoryName,
        description:  p.description,
        amount:       entry.amountPLN || entry.amount || 0,
        isPaid:       !!entry.paidByUser,
      });
    }
    return items;
  }, [planned, activeBudgetMonth]);
 
  const envelopeTotal = useMemo(
    () => envelopeBreakdown.reduce((s, i) => s + i.amount, 0),
    [envelopeBreakdown],
  );

  // ── Returns booked against THIS month's expenses ──────────────
  // Category sums are net of every cash return; the headline "Wydatki"
  // (cash-flow) only nets same-month returns. The difference is exactly the
  // cross-month cash returns (they spawn a TRANSFER in the return month), so
  // this box explains why category totals sit below the headline.
  const returnsInfo = useMemo(() => {
    let sameMonth = 0, crossMonth = 0, voucher = 0;
    for (const tx of monthTx) {
      if (tx.type !== "EXPENSE") continue;
      const rets = (tx as unknown as {
        returns?: Array<{ moneyReturnedInMonth: string; cashAmount?: number; voucherAmount?: number }>;
      }).returns || [];
      for (const r of rets) {
        voucher += r.voucherAmount || 0;
        const cash = r.cashAmount || 0;
        if (cash <= 0) continue;
        if (r.moneyReturnedInMonth === activeBudgetMonth) sameMonth += cash;
        else crossMonth += cash;
      }
    }
    return { sameMonth, crossMonth, voucher, total: sameMonth + crossMonth };
  }, [monthTx, activeBudgetMonth]);




 // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ padding: "0 0 60px 0"}}>

      {/* Header */}
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={s.sectionTitle}>📊 Podsumowanie — {formatMonthTitle(activeBudgetMonth)}</div>
        <div style={s.sectionSub}>Przegląd budżetu miesiąca</div>
      </div>

      {/* ── Loading skeletons ───────────────────────────── */}
      {isFirstLoad && (
        <>
          {/* KPI row skeleton */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {[0, 1, 2, 3, 4].map(i => (
              <SkeletonKpiCard key={i} style={{ flex: 1, minWidth: 130 }} />
            ))}
          </div>

          {/* ROW 1: Limity + Pie */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "flex-start" }}>
            <SkeletonCard title style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <Skeleton width={140} height={12} />
                      <Skeleton width={70}  height={12} />
                    </div>
                    <Skeleton height={8} rounded={4} />
                  </div>
                ))}
              </div>
            </SkeletonCard>
            <SkeletonCard title style={{ flex: 1, minWidth: 0 }}>
              <SkeletonChart height={220} legend={false} />
            </SkeletonCard>
          </div>

          {/* ROW 2: Targets */}
          <SkeletonCard title style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ flex: 1, minWidth: 160 }}>
                  <Skeleton width="80%" height={12} style={{ marginBottom: 8 }} />
                  <Skeleton height={8} rounded={4} />
                </div>
              ))}
            </div>
          </SkeletonCard>

          {/* ROW 3: 3 columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <SkeletonCard title height={140} />
            <SkeletonCard title height={140} />
            <SkeletonCard title height={140} />
          </div>
        </>
      )}

      {/* ── Real content ────────────────────────────────── */}
      {!isFirstLoad && (
        <>
          {/* KPI row */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <KpiPill icon="💰" label="Wpływy"    value={fmt(totalIncome)}   color={c.success} />
            {totalTransfers > 0 && (
              <KpiPill icon="🔄" label="Transfery" value={fmt(totalTransfers)} color={c.success} />
            )}
            <KpiPill
              icon="💸" label="Wydatki"
              value={fmt(totalExpenses)} color={c.danger}
              sub={budgetPct !== null ? `${budgetPct.toFixed(1)}% wpływów` : undefined}
            />
            <KpiPill
              icon="🏦" label="Oszczędności"
              value={fmt(totalSavings)} color={c.info}
              sub={totalIncome > 0 ? `${((totalSavings / totalIncome) * 100).toFixed(1)}% wpływów` : undefined}
            />
             {virtualEnvelopePaid > 0 && (
            <KpiPill
              icon="🪙" label="Koperty"
              value={fmt(virtualEnvelopePaid)} color={c.voucher}
              sub="wirtualne raty"
            />
            )}
            <KpiPill
              icon="⚖️" label="Saldo"
              value={fmt(balance)}
              color={balance >= 0 ? c.success : c.danger}
            />
            {budgetPct !== null && (
              <KpiPill
                icon="🎯" label="Wydatki / kwota dostępna"
                value={`${budgetPct.toFixed(1)}%`}
                color={budgetPct > 90 ? c.danger : budgetPct > 70 ? c.warning : c.success}
                sub={`${fmt(totalExpenses)} / ${fmt(totalRealIncome)}`}
              />
            )}
          </div>

          {/* Virtual envelopes — shown regardless of whether the month has
              transactions, so monthly rates are visible even before any
              expense is booked. */}
          {envelopeBreakdown.length > 0 && (
            <EnvelopeBreakdown
              items={envelopeBreakdown}
              total={envelopeTotal}
              activeBudgetMonth={activeBudgetMonth}
              style={{ marginBottom: 16 }}
              variant="card"
            />
          )}

          {/* Run-rate forecast — only for the RUNNING calendar month; past
              months have nothing to forecast, future ones have no pace. */}
          {activeBudgetMonth === new Date().toISOString().slice(0, 7) && (
            <Card title="🔮 Prognoza końca miesiąca" style={{ marginBottom: 16 }}>
              <MonthForecastSection
                transactions={monthTx as unknown as ForecastTransaction[]}
                months={[activeBudgetMonth]}
              />
            </Card>
          )}

          {/* Empty state */}
          {!hasData && (
            <div style={{ textAlign: "center", padding: "60px 0", color: c.textMuted, fontSize: 15 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              Brak transakcji dla miesiąca{" "}
              <strong style={{ color: c.textSecondary }}>{activeBudgetMonth}</strong>
            </div>
          )}

          {hasData && (
            <>
              {/* Returns info — explains net category sums vs headline expenses */}
              {(returnsInfo.total > 0 || returnsInfo.voucher > 0) && (
                <Card title="🔙 Zwroty" style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.7 }}>
                    {returnsInfo.total > 0 && (
                      <>
                        Zwroty gotówkowe z wydatków tego miesiąca:{" "}
                        <strong style={{ color: c.orange }}>{fmt(returnsInfo.total)} PLN</strong>{" "}
                        — odjęte od sum kategorii.
                      </>
                    )}
                    {returnsInfo.crossMonth > 0 && (
                      <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>
                        W tym <strong style={{ color: c.text }}>{fmt(returnsInfo.crossMonth)} PLN</strong>{" "}
                        odebrane w innym miesiącu → utworzono TRANSFER. Dlatego sumy kategorii są o tę
                        kwotę niższe niż nagłówkowe „Wydatki" (Saldo tego miesiąca bez zmian).
                      </div>
                    )}
                    {returnsInfo.voucher > 0 && (
                      <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>
                        Zwroty na voucher: <strong style={{ color: c.voucher }}>{fmt(returnsInfo.voucher)} PLN</strong>{" "}
                        — osobny środek, nie zmniejsza wydatku gotówkowego.
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* ROW 1: Limits and Pie Chart*/}
              <div style={{
                  display: "flex",
                  gap: 16,
                  marginBottom: 16,
                  alignItems: "stretch",
                }} data-sum-row1>
                <Card title="📋 Limity kategorii"
                style={{
                    flex: 1,
                    minWidth: 0,
                  }}>
                  {categoriesWithLimit.length === 0 && categoriesWithoutLimit.length === 0 && (
                    <div style={{ color: c.textMuted, fontSize: 13 }}>Brak wydatków.</div>
                  )}
                  {categoriesWithLimit.map(cat => (
                    <CategoryLimitBar
                      key={cat.categoryId}
                      category={cat}
                      subcategories={getSubcategories(cat.categoryId)}
                    />
                  ))}
                  {categoriesWithoutLimit.length > 0 && (
                    <>
                      <div style={{ color: c.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginTop: 16, marginBottom: 8, letterSpacing: "0.5px" }}>
                        Bez limitu
                      </div>
                      {categoriesWithoutLimit.map(cat => (
                        <CategoryLimitBar
                          key={cat.categoryId}
                          category={cat}
                          subcategories={getSubcategories(cat.categoryId)}
                        />
                      ))}
                    </>
                  )}
                </Card>

                <Card title="🥧 Struktura wydatków" 
                style={{
                    flex: 1,
                    minWidth: 0
                  }}>
                  <SpendingPieChart
                    categories={expenseCategories}
                    getSubcategories={getSubcategories}
                  />
                </Card>
              </div>

              {/* ROW 2: Indicators */}
              <Card title="🎯 Wskaźniki budżetowe" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <TargetIndicator
                    icon="🛡️" label="Ubezpieczenia"
                    spent={insuranceSpent}
                    targetPercent={targets.maxInsurancePercent}
                    totalIncome={totalIncome}
                    direction="max"
                  />
                  <TargetIndicator
                    icon="🏦" label="Zobowiązania/Raty"
                    spent={obligationsSpent}
                    targetPercent={targets.maxObligationsPercent}
                    totalIncome={totalIncome}
                    direction="max"
                  />
                  <TargetIndicator
                    icon="👴" label="Emerytura"
                    spent={retirementSpent}
                    targetPercent={targets.minRetirementPercent}
                    totalIncome={totalIncome}
                    direction="min"
                  />
                  <TargetIndicator
                    icon="💎" label="Oszczędności"
                    spent={totalSavings}
                    targetPercent={targets.minSavingsPercent}
                    totalIncome={totalIncome}
                    direction="min"
                  />
                </div>
              </Card>

              {/* ROW 3: Prio/Top 5/Savings*/}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }} data-sum-cols3>
                <Card title="🎖️ Rozkład priorytetów">
                  <PriorityBreakdown monthTx={monthTx} totalExpenses={totalExpenses} />
                </Card>
                <Card title="🔝 Top 5 wydatków">
                  <TopTransactions monthTx={monthTx} totalExpenses={totalExpenses} limit={5} />
                </Card>
                <Card title="💎 Oszczędności miesiąca">
                  <SavingsSummary
                    monthTx={monthTx}
                    totalIncome={totalIncome}
                    minSavingsPercent={targets.minSavingsPercent}
                  />
                </Card>
              </div>
            </>
          )}
        </>
      )}
      <style>{`
        @media (max-width: 900px) {
          [data-sum-row1]  { flex-direction: column; }
          [data-sum-cols3] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}