// ============================================================
// File: src/components/panels/PanelBaseBudget.tsx
// Panel "Baza budżetu" — limity per kategoria (EXPENSE + SAVING).
// Kolumny: Baza | Nadpisanie | Aktywny | Cykliczne | Planowane
// Cykliczne i Planowane = podgląd ile "zajęte" w danym miesiącu.
// Obie sekcje (EXPENSE i SAVING) używają TEGO SAMEGO grida — dla
// savings cele 5 i 6 (Cykliczne, Planowane) renderują się jako
// puste komórki, żeby Baza/Nadpisanie/Aktywny wyrównały się
// pikselowo między sekcjami.
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

// ── Types ─────────────────────────────────────────────────────

interface AppCategory {
  id: string;
  name: string;
  icon: string;
  type: string;
  isArchived: boolean;
  _readOnly?: boolean;
}

interface EnvelopeBreakdownItem {
  categoryName: string;
  description:  string;
  amount:       number;
  isPaid:       boolean;
}

interface PlannedItem {
  amount: number;
  isEnvelope: boolean;
  description: string;
}

// ── Grid (shared between EXPENSE and SAVING for visual alignment) ──
const GRID = "1fr 140px 140px 80px 110px 130px";

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
      // We do not show envelopes here — only if that's the planned buying month
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

// ── PlannedCell ───────────────────────────────────────────────

function PlannedCell({ items }: { items: PlannedItem[] }) {
  const total = items.reduce((s, p) => s + p.amount, 0);
  if (items.length === 0) {
    return <span style={{ color: "#334155", fontSize: 12 }}>—</span>;
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

// ── LimitRow — OUTSIDE component to prevent remount (focus bug fix) ──

interface LimitRowProps {
  cat: AppCategory;
  activeBudgetMonth: string;
  getLimitDoc: (catId: string) => LimitDoc | null;
  baseEdits: Record<string, number | "">;
  overrideEdits: Record<string, number | "">;
  setBase: (catId: string, val: number | "") => void;
  setOverride: (catId: string, val: number | "") => void;
  isReadOnly: boolean;
  recurringAmount: number;
  plannedItems: PlannedItem[];
  showExtra?: boolean;
}

function LimitRow({
  cat, activeBudgetMonth, getLimitDoc,
  baseEdits, overrideEdits, setBase, setOverride,
  isReadOnly, recurringAmount, plannedItems,
  showExtra = true,
}: LimitRowProps) {
  const doc    = getLimitDoc(cat.id);
  const active = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;

  // Resolve base independently so it's always visible even when override is active
  const activeLimits = (doc?.limits || []) as LimitEntry[];
  const activeBase   = activeLimits
    .filter(l => l.type === "base" && l.date <= activeBudgetMonth)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  const baseHistory = activeLimits
    .filter(l => l.type === "base")
    .sort((a, b) => b.date.localeCompare(a.date));

  const hasOverride    = active?.type === "override";
  const effectiveLimit = active?.amount ?? null;

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
      {/* Category */}
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

      {/* Base — always shows the underlying base even when override is active */}
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

      {/* Override */}
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

      {/* Active limit */}
      <div style={{ textAlign: "right", paddingTop: 2 }}>
        {effectiveLimit !== null ? (
          <span style={{ fontWeight: 700, fontSize: 13, color: hasOverride ? "#f59e0b" : "#10b981" }}>
            {fmt(effectiveLimit)}
          </span>
        ) : (
          <span style={{ color: "#334155", fontSize: 12 }}>—</span>
        )}
      </div>

      {/* Recurring — empty cell for SAVING (showExtra=false) preserves grid alignment */}
      <div style={{ textAlign: "right", paddingTop: 2 }}>
        {showExtra && (recurringAmount > 0 ? (
          <span style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600 }}>
            {fmt(recurringAmount)}
          </span>
        ) : (
          <span style={{ color: "#334155", fontSize: 12 }}>—</span>
        ))}
      </div>

      {/* Planned — empty cell for SAVING (showExtra=false) preserves grid alignment */}
      <div style={{ textAlign: "right" }}>
        {showExtra && <PlannedCell items={plannedItems} />}
      </div>
    </div>
  );
}

// ── TotalsRow ─────────────────────────────────────────────────

function TotalsRow({ activeLimit, recurring, planned, showExtra = true }: {
  activeLimit: number;
  recurring:   number;
  planned:     number;
  showExtra?:  boolean;
}) {
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
        {showExtra && recurring > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: "#3b82f6" }}>{fmt(recurring)}</span>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {showExtra && planned > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: "#a855f7" }}>{fmt(planned)}</span>
        )}
      </div>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────

function SectionHeader({ title, activeBudgetMonth, showExtra = true }: {
  title:             string;
  activeBudgetMonth: string;
  showExtra?:        boolean;
}) {
  return (
    <>
      <div style={{ marginTop: 28, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 14 }}>{title}</div>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 8,
        padding: "6px 0 10px",
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

        {/* Cyclical / Planned headers — empty cells for SAVING preserve grid alignment */}
        <div style={{ ...(s as any).label, textAlign: "right", color: "#3b82f6" }}>
          {showExtra && (
            <>
              🔄 Cykliczne
              <div style={{ fontSize: 10, color: "#334155", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                ten miesiąc
              </div>
            </>
          )}
        </div>
        <div style={{ ...(s as any).label, textAlign: "right", color: "#a855f7" }}>
          {showExtra && "📅 Planowane"}
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
      // Show underlying base value regardless of whether override is active
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

  // ── Save (EXPENSE + SAVING) ───────────────────────────────

  async function handleSave() {
    // Collect all changes into a single batch — one HTTP request instead of N.
    const changes: BatchLimitChange[] = [];

    for (const cat of [...expenseCategories, ...savingCategories]) {
      if (cat._readOnly) continue;

      const doc      = getLimitDoc(cat.id);
      const active   = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      const baseVal  = typeof baseEdits[cat.id]     === "number" ? baseEdits[cat.id]     as number : NaN;
      const ovrVal   = typeof overrideEdits[cat.id] === "number" ? overrideEdits[cat.id] as number : NaN;

      // Base: save to activeBudgetMonth — backend upserts by (date+type),
      // so this creates a new entry for this month without touching older bases.
      const activeBase   = active?.type === "base" ? active : null;
      const baseChanged  = !isNaN(baseVal) && baseVal !== (activeBase?.amount ?? NaN);
      if (baseChanged) {
        changes.push({ categoryId: cat.id, date: activeBudgetMonth, amount: baseVal, type: "base", action: "upsert" });
      }

      // Override: upsert if value changed, delete if cleared
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
    let activeLimit = 0, recurringSum = 0, plannedSum = 0;
    for (const cat of expenseCategories) {
      const doc    = limits.find((l: LimitDoc) => l.categoryId === cat.id) ?? null;
      const active = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      if (active) activeLimit += active.amount;
      recurringSum += sumRecurringForCategory(recurring, cat.id, activeBudgetMonth);
      plannedSum   += plannedItemsForCategory(planned, cat.id, activeBudgetMonth)
        .reduce((s, p) => s + p.amount, 0);
    }
    return { activeLimit, recurring: recurringSum, planned: plannedSum };
  }, [expenseCategories, limits, recurring, planned, activeBudgetMonth]);

  const savingTotals = useMemo(() => {
    let activeLimit = 0;
    for (const cat of savingCategories) {
      const doc    = limits.find((l: LimitDoc) => l.categoryId === cat.id) ?? null;
      const active = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      if (active) activeLimit += active.amount;
    }
    return { activeLimit, recurring: 0, planned: 0 };
  }, [savingCategories, limits, activeBudgetMonth]);

  // ── Rows renderers ───────────────────────────────────

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
      recurringAmount={0}
      plannedItems={[]}
      showExtra={false}
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
          <SectionHeader title="🏦 Oszczędności" activeBudgetMonth={activeBudgetMonth} showExtra={false} />
          {savingCategories.map(renderSavingRow)}
          <TotalsRow {...savingTotals} showExtra={false} />

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
                {/* Row 1 — limits / recurring / planned summary */}
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
          {envelopeBreakdown.length > 0 && (
            <div style={{
              marginTop: 24,
              padding: 16,
              background: "#0a0f1e",
              border: "1px solid #a855f733",
              borderRadius: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, color: "#a855f7", fontSize: 13 }}>
                  🪙 Wirtualne koperty — {activeBudgetMonth}
                </span>
                <span style={{ fontWeight: 800, fontSize: 14, color: "#a855f7" }}>
                  {fmt(envelopeTotal)} zł
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {envelopeBreakdown.map((item, i) => (
                  <div key={i} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    padding: "2px 0",
                  }}>
                    <span style={{ color: "#94a3b8" }}>
                      <span style={{ marginRight: 6 }}>{item.isPaid ? "✅" : "○"}</span>
                      <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{item.description}</span>
                      <span style={{ color: "#475569", marginLeft: 6 }}>({item.categoryName})</span>
                    </span>
                    <span style={{ color: item.isPaid ? "#10b981" : "#94a3b8", fontWeight: 600 }}>
                      {fmt(item.amount)} zł
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "#475569", fontStyle: "italic", lineHeight: 1.5 }}>
                Wirtualne raty na planowane zakupy. Nie obciążają limitów kategorii — odkładasz na sub-konto poza budżetem miesięcznym. ✅ = już opłacone, ○ = jeszcze nie.
              </div>
            </div>
          )}
        </>
      )}

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
        <div>🟢 <strong style={{ color: "#475569" }}>Baza</strong> — obowiązuje od podanego miesiąca wzwyż.</div>
        <div>🟡 <strong style={{ color: "#475569" }}>Nadpisanie</strong> — jednorazowe tylko dla {activeBudgetMonth}.</div>
        <div>🔵 <strong style={{ color: "#475569" }}>Cykliczne</strong> — suma aktywnych wydatków cyklicznych w tym miesiącu.</div>
        <div>🟣 <strong style={{ color: "#475569" }}>Planowane</strong> — rata koperty lub jednorazowy wydatek. 📋 = wirtualna koperta.</div>
      </div>
    </div>
  );
}