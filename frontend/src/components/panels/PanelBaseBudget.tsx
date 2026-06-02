// ============================================================
// File: src/components/panels/PanelBaseBudget.tsx
// Panel "Baza budżetu" — per-category limits (EXPENSE + SAVING).
//
// Column layout — two visual zones separated by a vertical rule:
//
//   ◀── PLAN (budżet) ─────────────────────▶ ◀── FAKT ──▶
//   Kategoria | Baza | Nadpisanie | Aktywny ‖ Wydano | Cykl. | Plan.
//
// "Wydano"   = read-only sum of real transactions (EXPENSE or SAVING).
// "Cykliczne/Planowane" = estimated/reserved amounts, shown for EXPENSE only.
// Both sections share the SAME grid so columns align pixel-perfectly.
// The PLAN | Estymata | Faktycznie wydano separators are rendered via borderLeft on the relevant cells.
// ============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAppContext }  from "../../context/AppContext";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { usePanelLock }   from "../../hooks/usePanelLock";
import { useLimits, getActiveLimit } from "../../hooks/useLimits";
import type { BatchLimitChange, LimitDoc, LimitEntry, ActiveLimit } from "../../hooks/useLimits";
import { useRecurring, isActiveInMonth, getActiveCost } from "../../hooks/useRecurring";
import { usePlanned }     from "../../hooks/usePlanned";
import { LockBanner }     from "../ui/LockBanner";
import { BudgetInput }    from "../ui/BudgetInput";
import { fmt }            from "../../utils/helpers";
import { theme as s }     from "../../styles/theme";
import type { Transaction } from "../../types/summary";
import { useTransactions } from "../../hooks/useTransactions";
import { EnvelopeBreakdown } from "../ui/EnvelopeBreakdown";
import type { EnvelopeBreakdownItem } from "../ui/EnvelopeBreakdown";

// ── Types ─────────────────────────────────────────────────────

interface AppCategory {
  id: string;
  name: string;
  icon: string;
  type: string;
  isArchived: boolean;
  _readOnly?: boolean;
}

interface PlannedItem {
  amount: number;
  isEnvelope: boolean;
  description: string;
}

// ── Grid — col order: Kategoria | Baza | Nadpisanie | Aktywny | Cykliczne | Planowane | Faktycznie wydano
const GRID = "1fr 140px 140px 80px 110px 130px 110px";

// Shared border style that draws the PLAN | FAKT vertical separator.
// Applied to every Wydano cell (header, data rows, totals, grand total).
const SEPARATOR: React.CSSProperties = {
  borderLeft: "1px solid #334155",
  paddingLeft: 12,
};

// ── Pure helpers ──────────────────────────────────────────────

function sumRecurringForCategory(
  recurring: unknown[],
  categoryId: string,
  month: string,
): number {
  return (recurring as any[])
    .filter(r => r.categoryId === categoryId && isActiveInMonth(r, month))
    .reduce((sum: number, r: any) => {
      const cost = getActiveCost(r, month);
      return sum + (cost?.amountPLN ?? cost?.amount ?? 0);
    }, 0);
}

function plannedItemsForCategory(
  planned: unknown[],
  categoryId: string,
  month: string,
): PlannedItem[] {
  return (planned as any[])
    .filter(p => !p.isArchived && !p.isPurchased && p.targetCategoryId === categoryId)
    .flatMap((p): PlannedItem[] => {
      if (p.plannedMonth === month) {
        return [{
          amount:      p.totalAmountPLN ?? p.totalAmount ?? 0,
          isEnvelope:  false,
          description: p.description || "",
        }];
      }
      return [];
    });
}

// Sum of real transactions (EXPENSE or SAVING) for a category in a given month.
function sumSpentForCategory(
  transactions: Transaction[],
  categoryId: string,
  month: string,
  txType: "EXPENSE" | "SAVING" = "EXPENSE",
): number {
  return transactions
    .filter(tx =>
      tx.categoryId === categoryId &&
      tx.budgetMonth === month &&
      tx.type === txType &&
      !tx.isArchived,
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
}

// ── PlannedCell ───────────────────────────────────────────────

function PlannedCell({ items }: { items: PlannedItem[] }) {
  const total = items.reduce((s, p) => s + p.amount, 0);
  if (items.length === 0) {
    return <span style={{ color: "#334155", fontSize: 12 }}>—</span>;
  }
  // Single item — plain span avoids flex container causing sub-pixel drift vs Cykliczne.
  if (items.length === 1) {
    return (
      <span style={{ fontSize: 13, color: "#a855f7", fontWeight: 600 }}>
        {fmt(items[0].amount)}
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
      {items.map((p, i) => (
        <div key={i} title={p.description} style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {p.isEnvelope && (
            <span style={{ fontSize: 10, color: "#7c3aed" }} title="Wirtualna koperta">📋</span>
          )}
          <span style={{ fontSize: 13, color: "#a855f7", fontWeight: 600 }}>
            {fmt(p.amount)}
          </span>
        </div>
      ))}
      {items.length > 1 && (
        <div style={{
          fontSize: 10, color: "#64748b",
          borderTop: "1px solid #1e293b",
          paddingTop: 2, marginTop: 1,
        }}>
          = {fmt(total)}
        </div>
      )}
    </div>
  );
}

// ── LimitRow — defined outside PanelBaseBudget to prevent remount on render ──

interface LimitRowProps {
  cat: AppCategory;
  activeBudgetMonth: string;
  getLimitDoc: (catId: string) => LimitDoc | null;
  baseEdits: Record<string, number | "">;
  overrideEdits: Record<string, number | "">;
  setBase: (catId: string, val: number | "") => void;
  setOverride: (catId: string, val: number | "") => void;
  isReadOnly: boolean;
  spentAmount: number;
  recurringAmount: number;
  plannedItems: PlannedItem[];
  showExtra?: boolean | "spent-only";
}

function LimitRow({
  cat, activeBudgetMonth, getLimitDoc,
  baseEdits, overrideEdits, setBase, setOverride,
  isReadOnly, spentAmount, recurringAmount, plannedItems,
  showExtra = true,
}: LimitRowProps) {
  const doc    = getLimitDoc(cat.id);
  const active = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;

  // Resolve base independently — stays visible even when an override is active.
  const activeLimits = (doc?.limits || []) as LimitEntry[];
  const activeBase   = activeLimits
    .filter(l => l.type === "base" && l.date <= activeBudgetMonth)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  const baseHistory = activeLimits
    .filter(l => l.type === "base")
    .sort((a, b) => b.date.localeCompare(a.date));

  const hasOverride    = active?.type === "override";
  const effectiveLimit = active?.amount ?? null;
  const isOverBudget   = effectiveLimit !== null && spentAmount > effectiveLimit;

  const inputStyle: React.CSSProperties = {
    ...(s.input as React.CSSProperties),
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: GRID,
      gap: 8,
      alignItems: "start",
      padding: "10px 0",
      borderBottom: "1px solid #1e293b",
      opacity: cat._readOnly ? 0.5 : 1,
    }}>
      {/* Category name */}
      <div style={{ paddingTop: 2 }}>
        <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 13 }}>
          {cat.icon} {cat.name}
          {cat._readOnly && (
            <span style={{ fontSize: 10, color: "#475569", marginLeft: 6, fontWeight: 400 }}>
              (zarchiwizowana)
            </span>
          )}
        </div>
        {baseHistory.length > 1 && (
          <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>
            📝 {baseHistory.length} wersji bazy
          </div>
        )}
      </div>

      {/* Base limit input — always shows underlying base even when override is active */}
      <div>
        {isReadOnly ? (
          <div style={{ ...inputStyle, color: "#64748b", cursor: "not-allowed", opacity: 0.6 }}>
            {activeBase ? fmt(activeBase.amount) : "—"}
          </div>
        ) : (
          <BudgetInput
            value={baseEdits[cat.id] ?? ""}
            onChange={(v) => setBase(cat.id, v)}
            style={inputStyle}
            placeholder={activeBase ? String(activeBase.amount) : "brak"}
          />
        )}
        {activeBase && (
          <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>
            od {activeBase.date}
          </div>
        )}
      </div>

      {/* Override input — single-month override */}
      <div>
        {isReadOnly ? (
          <div style={{ ...inputStyle, color: hasOverride ? "#f59e0b" : "#334155", cursor: "not-allowed", opacity: 0.6 }}>
            {hasOverride ? fmt(active!.amount) : "—"}
          </div>
        ) : (
          <BudgetInput
            value={overrideEdits[cat.id] ?? ""}
            onChange={(v) => setOverride(cat.id, v)}
            style={{ ...inputStyle, borderColor: hasOverride ? "#f59e0b66" : "#1e293b" }}
            placeholder="—"
          />
        )}
        {hasOverride && (
          <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 3 }}>
            ⚡ nadpisanie {activeBudgetMonth}
          </div>
        )}
      </div>

      {/* Active limit (base or override) */}
      <div style={{ textAlign: "right", paddingTop: 2 }}>
        {effectiveLimit !== null ? (
          <span style={{ fontWeight: 700, fontSize: 13, color: hasOverride ? "#f59e0b" : "#10b981" }}>
            {fmt(effectiveLimit)}
          </span>
        ) : (
          <span style={{ color: "#334155", fontSize: 12 }}>—</span>
        )}
      </div>

      {/* Cykliczne — empty cell for SAVING preserves grid alignment */}
      <div style={{ textAlign: "right", paddingTop: 2 }}>
        {showExtra === true && (recurringAmount > 0 ? (
          <span style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600 }}>
            {fmt(recurringAmount)}
          </span>
        ) : (
          <span style={{ color: "#334155", fontSize: 12 }}>—</span>
        ))}
      </div>

      {/* Planowane — empty cell for SAVING preserves grid alignment */}
      <div style={{ textAlign: "right", paddingTop: 2 }}>
        {showExtra === true && <PlannedCell items={plannedItems} />}
      </div>

      {/* Faktycznie wydano — real transactions; rightmost column; separator from Estymata zone */}
      <div style={{ textAlign: "right", paddingTop: 2, ...SEPARATOR }}>
        {showExtra && (
          spentAmount > 0 ? (
            <span style={{ fontSize: 13, fontWeight: 600, color: isOverBudget ? "#ef4444" : "#e2e8f0" }}>
              {fmt(spentAmount)}
            </span>
          ) : (
            <span style={{ color: "#334155", fontSize: 12 }}>—</span>
          )
        )}
      </div>
    </div>
  );
}

// ── TotalsRow ─────────────────────────────────────────────────

function TotalsRow({ activeLimit, spent, recurring, planned, showExtra = true }: {
  activeLimit: number;
  spent:       number;
  recurring:   number;
  planned:     number;
  showExtra?:  boolean | "spent-only";
}) {
  const isOverBudget = activeLimit > 0 && spent > activeLimit;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: GRID,
      gap: 8,
      alignItems: "center",
      padding: "10px 0",
      borderTop: "2px solid #334155",
      background: "#0a0f1e",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Suma
      </div>
      <div />{/* base */}
      <div />{/* override */}
      <div style={{ textAlign: "right" }}>
        {activeLimit > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: "#10b981" }}>{fmt(activeLimit)}</span>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {showExtra === true && recurring > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: "#3b82f6" }}>{fmt(recurring)}</span>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {showExtra === true && planned > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: "#a855f7" }}>{fmt(planned)}</span>
        )}
      </div>
      <div style={{ textAlign: "right", ...SEPARATOR }}>
        {showExtra && spent > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: isOverBudget ? "#ef4444" : "#e2e8f0" }}>
            {fmt(spent)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────

function SectionHeader({ title, activeBudgetMonth, showExtra = true }: {
  title:             string;
  activeBudgetMonth: string;
  showExtra?:        boolean | "spent-only";
}) {
  return (
    <>
      <div style={{ marginTop: 28, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 14 }}>{title}</div>
      </div>

      {/* ── Group label row: PLAN | Estymata | Faktycznie wydano ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 8,
        paddingBottom: 4,
      }}>
        <div />{/* category */}
        {/* PLAN spans: Baza + Nadpisanie + Aktywny = cols 2-4 */}
        <div style={{ gridColumn: "2 / 5", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Plan
          </span>
          <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
        </div>
        {/* Estymata — cols 5-6, only for EXPENSE */}
        {showExtra === true ? (
          <div style={{ gridColumn: "5 / 7", display: "flex", alignItems: "center", gap: 6, borderLeft: "1px solid #334155", paddingLeft: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Estymata
            </span>
            <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
          </div>
        ) : (
          <div style={{ gridColumn: "5 / 7" }} />
        )}
        {/* Faktycznie wydano — col 7, always shown when showExtra truthy */}
        <div style={{ gridColumn: "7 / 8", display: "flex", alignItems: "center", gap: 6, ...SEPARATOR }}>
          <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
        </div>
      </div>

      {/* ── Column header row ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 8,
        padding: "4px 0 10px",
        borderBottom: "2px solid #1e293b",
        marginBottom: 4,
      }}>
        <div style={(s as any).label}>Kategoria</div>
        <div style={(s as any).label}>
          Baza
          <div style={{ fontSize: 10, color: "#334155", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            od daty wzwyż
          </div>
        </div>
        <div style={(s as any).label}>
          Nadpisanie
          <div style={{ fontSize: 10, color: "#334155", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            tylko {activeBudgetMonth}
          </div>
        </div>
        <div style={{ ...(s as any).label, textAlign: "right" }}>Aktywny</div>

        {/* Cykliczne — Estymata zone, EXPENSE only */}
        <div style={{ ...(s as any).label, textAlign: "right", color: "#3b82f6", borderLeft: "1px solid #334155", paddingLeft: 12 }}>
          {showExtra === true && (
            <>
              🔄 Cykliczne
              <div style={{ fontSize: 10, color: "#334155", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                ten miesiąc
              </div>
            </>
          )}
        </div>
        <div style={{ ...(s as any).label, textAlign: "right", color: "#a855f7" }}>
          {showExtra === true && "📅 Planowane"}
        </div>

        {/* Faktycznie wydano — rightmost, separator from Estymata zone */}
        <div style={{ ...(s as any).label, textAlign: "right", color: "#e2e8f0", ...SEPARATOR }}>
          {showExtra && "Faktycznie wydano"}
        </div>
      </div>
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────

export default function PanelBaseBudget() {
  const { categories, transactions } = useAppContext() as {
    categories:   AppCategory[];
    transactions: Transaction[];
  };
  const { activeBudgetMonth } = useMonthStatus() as { activeBudgetMonth: string };
  const { isPastMonth, isMonthClosed, isHistoricalLock } = usePanelLock(activeBudgetMonth) as {
    isPastMonth: boolean; isMonthClosed: boolean; isHistoricalLock: boolean;
  };

  const {
    limits, isLoading, isSaving,
    loadLimits, saveLimitsBatch, getLimitDoc,
  } = useLimits();

  const { recurring, loadAll: loadRecurring } = useRecurring() as {
    recurring: unknown[];
    loadAll: () => void;
  };

  const { planned, loadAll: loadPlanned } = usePlanned() as {
    planned: unknown[];
    loadAll: () => void;
  };

  const { loadTransactions } = useTransactions() as {
    loadTransactions: (month: string) => void;
  };

  const [baseEdits,     setBaseEdits]     = useState<Record<string, number | "">>({});
  const [overrideEdits, setOverrideEdits] = useState<Record<string, number | "">>({});
  const [isDirty,       setIsDirty]       = useState(false);

  useEffect(() => {
    loadLimits();
    loadRecurring();
    loadPlanned();
    loadTransactions(activeBudgetMonth);
  }, [activeBudgetMonth]);

  // ── Category lists ────────────────────────────────────────

  const expenseCategories = useMemo<AppCategory[]>(() => {
    const active = (categories || []).filter(c => c.type === "EXPENSE" && !c.isArchived);
    const archivedWithLimits = (categories || []).filter(c =>
      c.type === "EXPENSE" && c.isArchived &&
      limits.some(l => l.categoryId === c.id && getActiveLimit(l, activeBudgetMonth))
    );
    return [...active, ...archivedWithLimits.map(c => ({ ...c, _readOnly: true }))];
  }, [categories, limits, activeBudgetMonth]);

  const savingCategories = useMemo<AppCategory[]>(() => {
    const active = (categories || []).filter(c => c.type === "SAVING" && !c.isArchived);
    const archivedWithLimits = (categories || []).filter(c =>
      c.type === "SAVING" && c.isArchived &&
      limits.some(l => l.categoryId === c.id && getActiveLimit(l, activeBudgetMonth))
    );
    return [...active, ...archivedWithLimits.map(c => ({ ...c, _readOnly: true }))];
  }, [categories, limits, activeBudgetMonth]);

  // ── Virtual envelopes for current month (info-only) ──────

  const envelopeBreakdown = useMemo<EnvelopeBreakdownItem[]>(() => {
    const items: EnvelopeBreakdownItem[] = [];
    for (const p of (planned as any[])) {
      if (p.isArchived || p.isPurchased || p.mode !== "envelope") continue;
      const entry = (p.virtualSavings || []).find(
        (v: any) => v.month === activeBudgetMonth && !v.dismissedByUser,
      );
      if (!entry) continue;
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

  // ── Monthly available funds (income + transfers) ─────────

  const monthlyIncome = useMemo(() =>
    transactions
      .filter(t =>
        t.budgetMonth === activeBudgetMonth &&
        (t.type === "INCOME" || t.type === "TRANSFER") &&
        !t.isArchived
      )
      .reduce((sum, t) => sum + t.amount, 0),
    [transactions, activeBudgetMonth],
  );

  // ── Init edit state (EXPENSE + SAVING combined) ───────────

  useEffect(() => {
    const bases: Record<string, number | ""> = {};
    const overrides: Record<string, number | ""> = {};
    for (const cat of [...expenseCategories, ...savingCategories]) {
      const doc          = getLimitDoc(cat.id);
      const active       = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      const limitsArr    = (doc?.limits || []) as LimitEntry[];
      const initBase     = limitsArr
        .filter(l => l.type === "base" && l.date <= activeBudgetMonth)
        .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
      bases[cat.id]     = initBase ? initBase.amount : "";
      overrides[cat.id] = active?.type === "override" ? active.amount : "";
    }
    setBaseEdits(bases);
    setOverrideEdits(overrides);
    setIsDirty(false);
  }, [limits, expenseCategories, savingCategories, activeBudgetMonth]);

  const setBase = useCallback((catId: string, val: number | "") => {
    setBaseEdits(p => ({ ...p, [catId]: val }));
    setIsDirty(true);
  }, []);

  const setOverride = useCallback((catId: string, val: number | "") => {
    setOverrideEdits(p => ({ ...p, [catId]: val }));
    setIsDirty(true);
  }, []);

  // ── Save ─────────────────────────────────────────────────

  async function handleSave() {
    const changes: BatchLimitChange[] = [];

    for (const cat of [...expenseCategories, ...savingCategories]) {
      if (cat._readOnly) continue;

      const doc      = getLimitDoc(cat.id);
      const active   = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      const baseVal  = typeof baseEdits[cat.id]     === "number" ? baseEdits[cat.id]     as number : NaN;
      const ovrVal   = typeof overrideEdits[cat.id] === "number" ? overrideEdits[cat.id] as number : NaN;

      const activeBase   = active?.type === "base" ? active : null;
      const baseChanged  = !isNaN(baseVal) && baseVal !== (activeBase?.amount ?? NaN);
      if (baseChanged) {
        changes.push({ categoryId: cat.id, date: activeBudgetMonth, amount: baseVal, type: "base", action: "upsert" });
      }

      const hasOverride = overrideEdits[cat.id] !== "" && !isNaN(ovrVal);
      const hadOverride = active?.type === "override";
      if (hasOverride && ovrVal !== active?.amount) {
        changes.push({ categoryId: cat.id, date: activeBudgetMonth, amount: ovrVal, type: "override", action: "upsert" });
      } else if (!hasOverride && hadOverride) {
        changes.push({ categoryId: cat.id, date: activeBudgetMonth, amount: 0, type: "override", action: "delete" });
      }
    }

    if (changes.length > 0) {
      await saveLimitsBatch(changes);
    }
    setIsDirty(false);
  }

  // ── Totals ───────────────────────────────────────────────

  const expenseTotals = useMemo(() => {
    let activeLimit = 0, spentSum = 0, recurringSum = 0, plannedSum = 0;
    for (const cat of expenseCategories) {
      const doc    = limits.find((l: LimitDoc) => l.categoryId === cat.id) ?? null;
      const active = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      if (active) activeLimit += active.amount;
      spentSum     += sumSpentForCategory(transactions, cat.id, activeBudgetMonth);
      recurringSum += sumRecurringForCategory(recurring, cat.id, activeBudgetMonth);
      plannedSum   += plannedItemsForCategory(planned, cat.id, activeBudgetMonth)
        .reduce((s, p) => s + p.amount, 0);
    }
    return { activeLimit, spent: spentSum, recurring: recurringSum, planned: plannedSum };
  }, [expenseCategories, limits, transactions, recurring, planned, activeBudgetMonth]);

  const savingTotals = useMemo(() => {
    let activeLimit = 0, spentSum = 0;
    for (const cat of savingCategories) {
      const doc    = limits.find((l: LimitDoc) => l.categoryId === cat.id) ?? null;
      const active = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      if (active) activeLimit += active.amount;
      spentSum += sumSpentForCategory(transactions, cat.id, activeBudgetMonth, "SAVING");
    }
    return { activeLimit, spent: spentSum, recurring: 0, planned: 0 };
  }, [savingCategories, limits, transactions, activeBudgetMonth]);

  // ── Row renderers ─────────────────────────────────────────

  const renderExpenseRow = (cat: AppCategory) => (
    <LimitRow
      key={cat.id}
      cat={cat}
      activeBudgetMonth={activeBudgetMonth}
      getLimitDoc={getLimitDoc}
      baseEdits={baseEdits}
      overrideEdits={overrideEdits}
      setBase={setBase}
      setOverride={setOverride}
      isReadOnly={isHistoricalLock || !!cat._readOnly}
      spentAmount={sumSpentForCategory(transactions, cat.id, activeBudgetMonth)}
      recurringAmount={sumRecurringForCategory(recurring, cat.id, activeBudgetMonth)}
      plannedItems={plannedItemsForCategory(planned, cat.id, activeBudgetMonth)}
    />
  );

  const renderSavingRow = (cat: AppCategory) => (
    <LimitRow
      key={cat.id}
      cat={cat}
      activeBudgetMonth={activeBudgetMonth}
      getLimitDoc={getLimitDoc}
      baseEdits={baseEdits}
      overrideEdits={overrideEdits}
      setBase={setBase}
      setOverride={setOverride}
      isReadOnly={isHistoricalLock || !!cat._readOnly}
      spentAmount={sumSpentForCategory(transactions, cat.id, activeBudgetMonth, "SAVING")}
      recurringAmount={0}
      plannedItems={[]}
      showExtra="spent-only"
    />
  );

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px 0", maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={(s as any).sectionTitle}>🏦 Baza budżetu</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {activeBudgetMonth} · planowanie wydatków i oszczędności
        </div>
      </div>

      <LockBanner isPastMonth={isPastMonth} isMonthClosed={isMonthClosed} selectedMonth={activeBudgetMonth} />

      {isLoading && (
        <div style={{ color: "#475569", textAlign: "center", padding: 40 }}>Ładowanie…</div>
      )}

      {!isLoading && (
        <>
          {/* ── EXPENSE ── */}
          <SectionHeader title="💸 Wydatki" activeBudgetMonth={activeBudgetMonth} />
          {expenseCategories.map(renderExpenseRow)}
          <TotalsRow {...expenseTotals} />

          {/* ── SAVING ── */}
          <SectionHeader title="🏦 Oszczędności" activeBudgetMonth={activeBudgetMonth} showExtra="spent-only" />
          {savingCategories.map(renderSavingRow)}
          <TotalsRow {...savingTotals} showExtra="spent-only" />

          {/* ── GRAND TOTAL ── */}
          {(expenseTotals.activeLimit + savingTotals.activeLimit) > 0 && (() => {
            const totalOutflow = expenseTotals.activeLimit + savingTotals.activeLimit + envelopeTotal;
            const surplus      = monthlyIncome - totalOutflow;
            const hasSurplus   = monthlyIncome > 0;
            return (
              <div style={{
                marginTop: 8,
                border: "1px solid #10b98144",
                borderRadius: 8,
                overflow: "hidden",
              }}>
                {/* Row 1 — limits / spent / recurring / planned totals */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: GRID,
                  gap: 8,
                  alignItems: "center",
                  padding: "10px 12px",
                  background: "#0a0f1e",
                  borderBottom: hasSurplus ? "1px solid #1e293b" : "none",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    💰 Razem budżet
                  </div>
                  <div />{/* base */}
                  <div />{/* override */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#10b981" }}>
                      {fmt(expenseTotals.activeLimit + savingTotals.activeLimit)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {(expenseTotals.recurring + savingTotals.recurring) > 0 && (
                      <span style={{ fontWeight: 800, fontSize: 13, color: "#3b82f6" }}>
                        {fmt(expenseTotals.recurring + savingTotals.recurring)}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {(expenseTotals.planned + savingTotals.planned) > 0 && (
                      <span style={{ fontWeight: 800, fontSize: 13, color: "#a855f7" }}>
                        {fmt(expenseTotals.planned + savingTotals.planned)}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "right", ...SEPARATOR }}>
                    {(expenseTotals.spent + savingTotals.spent) > 0 && (
                      <span style={{
                        fontWeight: 800, fontSize: 13,
                        color: (expenseTotals.spent + savingTotals.spent) > (expenseTotals.activeLimit + savingTotals.activeLimit) ? "#ef4444" : "#e2e8f0",
                      }}>
                        {fmt(expenseTotals.spent + savingTotals.spent)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 2 — estimate vs available funds */}
                {hasSurplus && (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 16,
                    alignItems: "center",
                    padding: "10px 12px",
                    background: "#0d1424",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#94a3b8" }}>
                        <span>📤 Estymata wydatków:</span>
                        <span style={{ fontWeight: 700, color: "#e2e8f0" }}>
                          {fmt(totalOutflow)} zł
                        </span>
                        {envelopeTotal > 0 && (
                          <span style={{ fontSize: 10, color: "#a855f7" }}>
                            (w tym 🪙 {fmt(envelopeTotal)} koperty)
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#94a3b8" }}>
                        <span>📥 Kwota dostępna w miesiącu:</span>
                        <span style={{ fontWeight: 700, color: "#10b981" }}>
                          {fmt(monthlyIncome)} zł
                        </span>
                        {monthlyIncome === 0 && (
                          <span style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>
                            (brak zaksięgowanych wpływów / transferów)
                          </span>
                        )}
                      </div>
                    </div>

                    {monthlyIncome > 0 && (
                      <div style={{
                        textAlign: "right",
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: surplus >= 0 ? "#10b98111" : "#ef444411",
                        border: `1px solid ${surplus >= 0 ? "#10b98133" : "#ef444433"}`,
                      }}>
                        <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>
                          {surplus >= 0 ? "Nadwyżka" : "Niedobór"}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: surplus >= 0 ? "#10b981" : "#ef4444" }}>
                          {surplus >= 0 ? "+" : ""}{fmt(surplus)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Virtual envelopes — info-only ── */}
          <EnvelopeBreakdown
            items={envelopeBreakdown}
            total={envelopeTotal}
            activeBudgetMonth={activeBudgetMonth}
            style={{ marginTop: 24 }}
          />

          {/* Save bar */}
          {!isHistoricalLock && isDirty && (
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => { loadLimits(); setIsDirty(false); }}
                style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#94a3b8", cursor: "pointer", fontWeight: 600 }}
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{ ...(s as any).btn("#10b981"), opacity: isSaving ? 0.6 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}
              >
                {isSaving ? "Zapisuję…" : "💾 Zapisz limity"}
              </button>
            </div>
          )}

          {/* Legend */}
          <div style={{ marginTop: 32, fontSize: 11, color: "#334155", lineHeight: 1.9 }}>
            <div style={{ color: "#475569", fontWeight: 700, marginBottom: 2 }}>Plan</div>
            <div>🟢 <strong style={{ color: "#475569" }}>Baza</strong> — limit obowiązujący od podanego miesiąca wzwyż.</div>
            <div>🟡 <strong style={{ color: "#475569" }}>Nadpisanie</strong> — jednorazowa korekta tylko dla {activeBudgetMonth}.</div>
            <div style={{ marginTop: 8, color: "#475569", fontWeight: 700, marginBottom: 2 }}>Faktycznie wydano</div>
            <div>⚪ <strong style={{ color: "#475569" }}>Faktycznie wydano</strong> — rzeczywiste transakcje z tego miesiąca (czerwone = przekroczony limit).</div>
            <div style={{ marginTop: 8, color: "#475569", fontWeight: 700, marginBottom: 2 }}>Estymata</div>
            <div>🔵 <strong style={{ color: "#475569" }}>Cykliczne</strong> — przewidywane koszty cykliczne; mogą, ale nie muszą wystąpić.</div>
            <div>🟣 <strong style={{ color: "#475569" }}>Planowane</strong> — zaplanowany jednorazowy wydatek; może, ale nie musi wystąpić.</div>
          </div>
        </>
      )}
    </div>
  );
}