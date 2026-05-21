// ============================================================
// File: src/components/panels/PanelSummary.tsx
// "Podsumowanie miesiąca" panel — desktop only.
// ============================================================

import { useMemo, useEffect, useCallback } from "react";
import { useAppContext }    from "../../context/AppContext";
import { useMonthStatus }   from "../../hooks/useMonthStatus";
import { useTransactions }  from "../../hooks/useTransactions";
import { useLimits, buildLimitMap } from "../../hooks/useLimits";
import { calculateEffectiveAmount } from "../../utils/returnUtils";
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
import type {
  Transaction,
  CategorySummary,
  SubcategorySummary,
  SettingsTargets,
  BudgetMonth,
} from "../../types/summary";

// ── Local types ───────────────────────────────────────────────

interface AppCategory {
  id: string;
  name: string;
  icon?: string;
  type: string;
  isArchived?: boolean;
}

interface AppSettings {
  targets?: SettingsTargets;
}

interface KpiPillProps {
  icon: string;
  label: string;
  value: string;
  color?: string;
  sub?: string;
}

// ── Constants ─────────────────────────────────────────────────

const MONTH_NAMES = [
  "Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
  "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień",
] as const;

// ── Pure helpers ──────────────────────────────────────────────

function formatMonthTitle(budgetMonth: BudgetMonth): string {
  if (!budgetMonth) return "";
  const [y, m] = budgetMonth.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
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

function sumByCategoryNameMatch(
  txList: Transaction[],
  type: Transaction["type"],
  keywords: string[],
): number {
  return txList
    .filter(tx => tx.type === type && keywords.some(kw => tx.categoryName.toLowerCase().includes(kw)))
    .reduce((acc, tx) => acc + tx.amount, 0);
}

// ── KPI Pill ──────────────────────────────────────────────────

function KpiPill({ icon, label, value, color = "#e2e8f0", sub }: KpiPillProps) {
  return (
    <div style={{
      background: "#1e293b",
      border: "1px solid #334155",
      borderRadius: 12,
      padding: "12px 18px",
      textAlign: "center",
      flex: 1,
      minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────

export default function PanelSummary() {
  const {
    transactions: rawTransactions,
    categories: rawCategories,
    settings: rawSettings,
  } = useAppContext() as {
    transactions: Transaction[];
    categories: AppCategory[];
    settings: AppSettings | null;
  };

  const { activeBudgetMonth }             = useMonthStatus() as { activeBudgetMonth: BudgetMonth };
  const { loadTransactions }              = useTransactions() as { loadTransactions: (m: BudgetMonth) => void };
  const { limits: rawLimits, loadLimits } = useLimits() as {
    limits: Parameters<typeof buildLimitMap>[0];
    loadLimits: () => void;
  };

  useEffect(() => {
    loadTransactions(activeBudgetMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBudgetMonth]);

  useEffect(() => {
    loadLimits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transactions = rawTransactions ?? [];
  const categories   = rawCategories   ?? [];
  const limits       = rawLimits       ?? [];

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
  // SALDO = INCOME + TRANSFER(in) - EXPENSE - SAVING
  const balance        = totalIncome + totalTransfers - totalExpenses - totalSavings;

  const limitMap   = useMemo(() => buildLimitMap(limits, activeBudgetMonth), [limits, activeBudgetMonth]);
  const totalLimit = useMemo(
    () => Object.values(limitMap).reduce((acc, l) => acc + (l?.amount ?? 0), 0),
    [limitMap],
  );
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
      catMap.get(tx.categoryId)!.spent += tx.amount;
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
      subMap.get(tx.subcategoryId)!.spent += tx.amount;
    }
    for (const sub of subMap.values()) {
      sub.percentOfCategory = catTotal      > 0 ? (sub.spent / catTotal)      * 100 : 0;
      sub.percentOfTotal    = totalExpenses > 0 ? (sub.spent / totalExpenses) * 100 : 0;
    }
    return Array.from(subMap.values()).sort((a, b) => b.spent - a.spent);
  }, [monthTx, expenseCategories, totalExpenses]);

  // ── Target indicators ─────────────────────────────────────
  const targets: SettingsTargets = rawSettings?.targets ?? DEFAULT_TARGETS;

  const insuranceSpent   = useMemo(() => sumByTagIds(monthTx, "EXPENSE", ["tag_ubezpieczenia_MMs"]), [monthTx]);
  const obligationsSpent = useMemo(() => sumByTagIds(monthTx, "EXPENSE", ["tag_raty_MMs"]), [monthTx]);
  const retirementSpent  = useMemo(() => sumByCategoryId(monthTx, "SAVING", ["cat_emerytura"]), [monthTx]);

  const hasData = monthTx.length > 0;

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ padding: "0 0 60px 0", maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ marginBottom: 20, marginTop: 8 }}>
        <div style={s.sectionTitle}>📊 Podsumowanie — {formatMonthTitle(activeBudgetMonth)}</div>
        <div style={s.sectionSub}>Przegląd budżetu miesiąca</div>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiPill icon="💰" label="Wpływy"    value={fmt(totalIncome)}   color="#10b981" />
        {totalTransfers > 0 && (
          <KpiPill icon="🔄" label="Transfery" value={fmt(totalTransfers)} color="#10b981" />
        )}
        <KpiPill
          icon="💸" label="Wydatki"
          value={fmt(totalExpenses)} color="#ef4444"
          sub={budgetPct !== null ? `${budgetPct.toFixed(1)}% wpływów` : undefined}
        />
        <KpiPill
          icon="🏦" label="Oszczędności"
          value={fmt(totalSavings)} color="#3b82f6"
          sub={totalIncome > 0 ? `${((totalSavings / totalIncome) * 100).toFixed(1)}% wpływów` : undefined}
        />
        <KpiPill
          icon="⚖️" label="Saldo"
          value={fmt(balance)}
          color={balance >= 0 ? "#10b981" : "#ef4444"}
        />
        {budgetPct !== null && (
          <KpiPill
            icon="🎯" label="Wydatki / wpływy"
            value={`${budgetPct.toFixed(1)}%`}
            color={budgetPct > 90 ? "#ef4444" : budgetPct > 70 ? "#f59e0b" : "#10b981"}
            sub={`${fmt(totalExpenses)} / ${fmt(totalRealIncome)}`}
          />
        )}
      </div>

      {/* Empty state */}
      {!hasData && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#475569", fontSize: 15 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          Brak transakcji dla miesiąca{" "}
          <strong style={{ color: "#64748b" }}>{activeBudgetMonth}</strong>
        </div>
      )}

      {hasData && (
        <>
          {/* ROW 1: Limity | Wykres kołowy */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "flex-start" }}>
            <Card title="📋 Limity kategorii" style={{ flex: 1, minWidth: 0 }}>
              {categoriesWithLimit.length === 0 && categoriesWithoutLimit.length === 0 && (
                <div style={{ color: "#475569", fontSize: 13 }}>Brak wydatków.</div>
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
                  <div style={{ color: "#475569", fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginTop: 16, marginBottom: 8, letterSpacing: "0.5px" }}>
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

            <Card title="🥧 Struktura wydatków" style={{ flex: 1, minWidth: 0 }}>
              <SpendingPieChart
                categories={expenseCategories}
                getSubcategories={getSubcategories}
                totalExpenses={totalExpenses}
              />
            </Card>
          </div>

          {/* ROW 2: Wskaźniki targets */}
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

          {/* ROW 3: Priorytety | Top 5 | Oszczędności */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
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
    </div>
  );
}
