// ============================================================
// File: src/components/panels/PanelBaseBudget.tsx
// Panel "Baza budżetu" — limity per kategoria (EXPENSE + SAVING).
// Kolumny: Baza | Nadpisanie | Aktywny | Cykliczne | Planowane
// Cykliczne i Planowane = podgląd ile "zajęte" w danym miesiącu.
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

// ── Types ─────────────────────────────────────────────────────

interface AppCategory {
  id: string;
  name: string;
  icon: string;
  type: string;
  isArchived: boolean;
  _readOnly?: boolean;
}

// LimitEntry, LimitDoc, ActiveLimit imported from useLimits.ts

interface PlannedItem {
  amount: number;
  isEnvelope: boolean;
  description: string;
}

// ── Grid (shared between EXPENSE and SAVING) ──────────────────
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
      if (p.mode === "envelope") {
        const entry = (p.virtualSavings || []).find(
          (v: any) => v.month === month && !v.dismissedByUser,
        );
        if (!entry) return [];
        return [{
          amount:      entry.amountPLN || entry.amount || 0,
          isEnvelope:  true,
          description: p.description || "",
        }];
      }
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
}

function LimitRow({
  cat, activeBudgetMonth, getLimitDoc,
  baseEdits, overrideEdits, setBase, setOverride,
  isReadOnly, recurringAmount, plannedItems,
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
            onChange={(v: number) => setBase(cat.id, v)}
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
            onChange={(v: number) => setOverride(cat.id, v)}
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

      {/* Recurring */}
      <div style={{ textAlign: "right", paddingTop: 2 }}>
        {recurringAmount > 0 ? (
          <span style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600 }}>
            {fmt(recurringAmount)}
          </span>
        ) : (
          <span style={{ color: "#334155", fontSize: 12 }}>—</span>
        )}
      </div>

      {/* Planned */}
      <div style={{ textAlign: "right" }}>
        <PlannedCell items={plannedItems} />
      </div>
    </div>
  );
}

// ── TotalsRow ─────────────────────────────────────────────────

function TotalsRow({ activeLimit, recurring, planned }: {
  activeLimit: number;
  recurring: number;
  planned: number;
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
        {recurring > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: "#3b82f6" }}>{fmt(recurring)}</span>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {planned > 0 && (
          <span style={{ fontWeight: 800, fontSize: 13, color: "#a855f7" }}>{fmt(planned)}</span>
        )}
      </div>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────

function SectionHeader({ title, activeBudgetMonth }: { title: string; activeBudgetMonth: string }) {
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
        <div style={{ ...(s as any).label, textAlign: "right", color: "#3b82f6" }}>
          🔄 Cykliczne
          <div style={{ fontSize: 10, color: "#334155", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            ten miesiąc
          </div>
        </div>
        <div style={{ ...(s as any).label, textAlign: "right", color: "#a855f7" }}>
          📅 Planowane
          <div style={{ fontSize: 10, color: "#334155", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            📋 = koperta
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────

export default function PanelBaseBudget() {
  const { categories }        = useAppContext() as { categories: AppCategory[] };
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

  const [baseEdits,     setBaseEdits]     = useState<Record<string, number | "">>({});
  const [overrideEdits, setOverrideEdits] = useState<Record<string, number | "">>({});
  const [isDirty,       setIsDirty]       = useState(false);

  useEffect(() => { loadLimits(); loadRecurring(); loadPlanned(); }, []);

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

  // ── Init edit state (EXPENSE + SAVING combined) ───────────

  useEffect(() => {
    const bases: Record<string, number | ""> = {};
    const overrides: Record<string, number | ""> = {};
    for (const cat of [...expenseCategories, ...savingCategories]) {
      const doc    = getLimitDoc(cat.id);
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

  const setBase     = useCallback((catId: string, val: number | "") => {
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

  // ── Totals ───────────────────────────────────────────────────
  // calcTotals is inlined so useMemo deps are explicit and complete.

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
    let activeLimit = 0, recurringSum = 0, plannedSum = 0;
    for (const cat of savingCategories) {
      const doc    = limits.find((l: LimitDoc) => l.categoryId === cat.id) ?? null;
      const active = getActiveLimit(doc, activeBudgetMonth) as ActiveLimit | null;
      if (active) activeLimit += active.amount;
      recurringSum += sumRecurringForCategory(recurring, cat.id, activeBudgetMonth);
      plannedSum   += plannedItemsForCategory(planned, cat.id, activeBudgetMonth)
        .reduce((s, p) => s + p.amount, 0);
    }
    return { activeLimit, recurring: recurringSum, planned: plannedSum };
  }, [savingCategories, limits, recurring, planned, activeBudgetMonth]);

  // ── Shared row renderer ───────────────────────────────────

  const renderRow = (cat: AppCategory) => (
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
          {expenseCategories.map(renderRow)}
          <TotalsRow {...expenseTotals} />

          {/* ── SAVING ── */}
          <SectionHeader title="🏦 Oszczędności" activeBudgetMonth={activeBudgetMonth} />
          {savingCategories.map(renderRow)}
          <TotalsRow {...savingTotals} />

          {/* ── GRAND TOTAL — tylko kolumna Aktywny ── */}
          {(expenseTotals.activeLimit + savingTotals.activeLimit) > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: GRID,
              gap: 8,
              alignItems: "center",
              padding: "12px 0 8px",
              marginTop: 8,
              borderTop: "2px solid #10b981",
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                💰 Razem budżet
              </div>
              <div />{/* base */}
              <div />{/* override */}
              <div style={{ textAlign: "right" }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: "#10b981" }}>
                  {fmt(expenseTotals.activeLimit + savingTotals.activeLimit)}
                </span>
              </div>
              <div />{/* cykliczne — pomocnicze, bez sumy */}
              <div />{/* planowane — pomocnicze, bez sumy */}
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