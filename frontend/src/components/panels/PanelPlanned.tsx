// ============================================================
// File: src/components/panels/PanelPlanned.tsx
// Desktop panel — view and management of planned expenses.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { useState, useEffect, useMemo } from "react";
import { createPortal }   from "react-dom";
import { usePlanned, sumPaid, isReadyToPurchase } from "../../hooks/usePlanned";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { useTransactions } from "../../hooks/useTransactions";
import { useAppContext }  from "../../context/AppContext";
import { ConfirmModal }   from "../ui/ConfirmModal";
import { PlannedCard }    from "./plannedComponents/PlannedCard";
import { PlannedForm }    from "./plannedComponents/PlannedForm";
import { TransactionForm, emptyFormValues } from "./transactionComponents/TransactionForm";
import { fmt, currentCalendarMonth } from "../../utils/helpers";
import { theme as s }     from "../../styles/theme";
import { RangePicker, type DateRange } from "../ui/RangePicker";
import { AppDatePicker, toYM } from "../ui/AppDatePicker";
import type { PlannedDoc, PlannedPostPayload, PlannedPatchPayload } from "../../hooks/usePlanned";
import type { FormValues, TransactionPayload, Priority } from "../../types/transaction";

// ── Helpers ───────────────────────────────────────────────────

function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const total  = (y * 12 + m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// Pre-fill the expense form from a planned expense, so realizing it opens an
// editable transaction (the real amount/date can differ from the plan).
function plannedToFormValues(doc: PlannedDoc): FormValues {
  return {
    ...emptyFormValues(),
    currency:        doc.originalCurrency || "PLN",
    amountOrig:      String(doc.totalAmount ?? doc.totalAmountPLN ?? ""),
    subcategoryId:   doc.targetSubcategoryId,
    subcategoryName: doc.targetSubcategoryName,
    categoryId:      doc.targetCategoryId,
    categoryName:    doc.targetCategoryName,
    priority:        (doc.priority ?? 2) as Priority,
    description:     doc.description,
    tags:            doc.tags || [],
  };
}

// ── Archive modal state ───────────────────────────────────────

interface ArchiveModalState {
  isOpen:     boolean;
  id:         string | null;
  name:       string;
  doc:        PlannedDoc | null;
  paidSoFar:  number;
}

interface PurchaseModalState {
  isOpen: boolean;
  doc:    PlannedDoc | null;
}

// ── Component ─────────────────────────────────────────────────

export default function PanelPlanned() {
  const {
    planned, isLoading, isSaving,
    loadAll, updatePlanned, archivePlanned, purchasePlanned,
  } = usePlanned();

  const { activeBudgetMonth } = useMonthStatus();
  const { transactions }      = useAppContext();
  const { loadTransactions }  = useTransactions();

  const [range,         setRange]         = useState<DateRange>({ months: 3, from: null, to: null });
  const [filterMode,    setFilterMode]    = useState<"all" | "envelope" | "oneoff">("all");
  const [filterMonth,   setFilterMonth]   = useState<Date | null>(null);
  const [currentMonthOnly, setCurrentMonthOnly] = useState(false);
  const [showModal,     setShowModal]     = useState(false);
  const [editTarget,    setEditTarget]    = useState<PlannedDoc | null>(null);
  const [archiveModal,  setArchiveModal]  = useState<ArchiveModalState>({
    isOpen: false, id: null, name: "", doc: null, paidSoFar: 0,
  });
  const [purchaseModal, setPurchaseModal] = useState<PurchaseModalState>({
    isOpen: false, doc: null,
  });

  useEffect(() => { loadAll(); }, []);

  const cur = currentCalendarMonth();

  // Current-month transactions carry the ACTUAL spent amount for realized
  // one-offs (linked via plannedExpenseId), which can differ from the plan.
  useEffect(() => { loadTransactions(cur); }, [cur, loadTransactions]);

  // planId → actual booked expense amount, from the real transactions.
  const actualSpentByPlan = useMemo(() => {
    const m: Record<string, number> = {};
    for (const tx of (transactions || []) as Array<{ type?: string; amount?: number; plannedExpenseId?: string; isArchived?: boolean }>) {
      if (tx.type !== "EXPENSE" || tx.isArchived || !tx.plannedExpenseId) continue;
      m[tx.plannedExpenseId] = (m[tx.plannedExpenseId] || 0) + (tx.amount || 0);
    }
    return m;
  }, [transactions]);

  // ── Filter ────────────────────────────────────────────────

const filtered = useMemo<PlannedDoc[]>(() => {
  const filterMonthStr = filterMonth ? toYM(filterMonth) : "";

  // A specific month fully overrides the range pill.
  const useRange  = !filterMonthStr;
  const maxMonth  = useRange && range.months > 0 && !range.from && !range.to
    ? addMonths(cur, range.months)
    : null;
  const fromMonth = useRange && range.from ? toYM(range.from) : null;
  const toMonth   = useRange && range.to   ? toYM(range.to)   : null;

  return planned.filter(doc => {
    if (doc.isArchived) return false;
    if (filterMode !== "all" && doc.mode !== filterMode) return false;

    // ── "Bieżący miesiąc" view — everything actionable / done this month.
    // This is where confirming happens and confirmed items stay as read-only.
    if (currentMonthOnly) {
      if (doc.mode === "oneoff") {
        // Due now or overdue (unrealized), plus anything realized this month.
        return (!doc.isPurchased && doc.plannedMonth <= cur) || doc.purchasedMonth === cur;
      }
      const hasCurRate = (doc.virtualSavings || []).some(v => v.month === cur && !v.dismissedByUser);
      return hasCurRate || isReadyToPurchase(doc) || doc.purchasedMonth === cur;
    }

    // ── Range / explicit-month views are forward-looking: hide purchased.
    if (doc.isPurchased) return false;

    // An explicit month filter is authoritative — respect it exactly.
    if (filterMonthStr) return doc.plannedMonth === filterMonthStr;

    // Otherwise always surface envelopes with an outstanding contribution for
    // the current month: you pay the monthly rate now even when the purchase
    // is months away, so the range filter on plannedMonth must not hide them.
    const hasDueRateThisMonth = doc.mode === "envelope" &&
      (doc.virtualSavings || []).some(v => v.month === cur && !v.paidByUser && !v.dismissedByUser);
    if (hasDueRateThisMonth) return true;

    if (fromMonth && doc.plannedMonth < fromMonth) return false;
    if (toMonth   && doc.plannedMonth > toMonth)   return false;
    // Preset ranges are a forward window: current month … current + N months.
    if (maxMonth  && doc.plannedMonth < cur)       return false;
    if (maxMonth  && doc.plannedMonth > maxMonth)  return false;
    return true;
  }).sort((a, b) => a.plannedMonth.localeCompare(b.plannedMonth));
}, [planned, range, filterMode, filterMonth, currentMonthOnly, cur]);

  // ── Totals ────────────────────────────────────────────────

  // Header summary over the CURRENT FILTERED view (archived already excluded):
  //   one-offs  → total planned vs. actually realized (purchased)
  //   envelopes → this month's rate total vs. actually paid (shown only in the
  //               "Bieżący miesiąc" view, since rates are month-specific)
  const summary = useMemo(() => {
    let oneoffTotal = 0, oneoffSpent = 0, envRateTotal = 0, envRateCollected = 0;
    for (const p of filtered) {
      if (p.mode === "oneoff") {
        oneoffTotal += p.totalAmountPLN;
        // Actual booked amount (from the transaction), not the planned one;
        // fall back to the plan if its transaction isn't loaded.
        if (p.isPurchased) oneoffSpent += actualSpentByPlan[p.id] ?? p.totalAmountPLN;
      } else {
        const entry = (p.virtualSavings || []).find(v => v.month === cur && !v.dismissedByUser);
        if (!entry) continue;
        const rate = entry.amountPLN || entry.amount || 0;
        envRateTotal += rate;
        if (entry.paidByUser) envRateCollected += rate;
      }
    }
    return { oneoffTotal, oneoffSpent, envRateTotal, envRateCollected };
  }, [filtered, cur, actualSpentByPlan]);

  // Overdue = unrealized plans whose planned month is already in the past.
  // They surface in the "Bieżący miesiąc" view; flag which months they're from.
  const overdueMonths = useMemo(() => {
    if (!currentMonthOnly) return [];
    const set = new Set<string>();
    for (const d of filtered) {
      if (!d.isPurchased && d.plannedMonth < cur) set.add(d.plannedMonth);
    }
    return [...set].sort();
  }, [filtered, currentMonthOnly, cur]);

  // ── Handlers ─────────────────────────────────────────────

  function openEdit(doc: PlannedDoc) {
    setEditTarget(doc);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditTarget(null);
  }

  async function handleFormSubmit(payload: PlannedPostPayload | PlannedPatchPayload) {
    if (editTarget) {
      await updatePlanned(editTarget.id, payload as PlannedPatchPayload);
    }
    closeModal();
  }

  async function handleArchive() {
    if (!archiveModal.id) return;
    await archivePlanned(archiveModal.id);
    setArchiveModal({ isOpen: false, id: null, name: "", doc: null, paidSoFar: 0 });
  }

  async function handleRealize(payload: TransactionPayload) {
    if (!purchaseModal.doc) return;
    await purchasePlanned(purchaseModal.doc.id, payload.date, payload.budgetMonth, {
      amount:           payload.amount,
      originalAmount:   payload.originalAmount,
      originalCurrency: payload.originalCurrency,
      fxRate:           payload.fxRate,
      categoryId:       payload.categoryId,
      categoryName:     payload.categoryName,
      subcategoryId:    payload.subcategoryId,
      subcategoryName:  payload.subcategoryName,
      description:      payload.description,
      tags:             payload.tags,
      priority:         payload.priority,
      merchant:         payload.merchant ?? null,
    });
    setPurchaseModal({ isOpen: false, doc: null });
  }

  // ── Edit modal portal ─────────────────────────────────────

  const modalEl = showModal && editTarget ? createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={closeModal}
    >
      <div
        style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: "24px", maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 16, color: c.text, marginBottom: 20 }}>
          ✏️ Edytuj planowany wydatek
        </div>
        <PlannedForm
          initialValues={editTarget}
          startMonth={cur}
          onSubmit={handleFormSubmit}
          onCancel={closeModal}
          isSaving={isSaving}
          mode="edit"
        />
      </div>
    </div>,
    document.body
  ) : null;

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px 0" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={s.sectionTitle}>📅 Planowane wydatki</div>
          <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 4 }}>
            {filtered.length} planowanych w widoku
          </div>
          <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
            <span>
              💳 Jednorazowe — Suma:{" "}
              <strong style={{ color: c.text }}>{fmt(summary.oneoffTotal)} zł</strong>
              {" / "}Faktycznie wydano:{" "}
              <strong style={{ color: c.success }}>{fmt(summary.oneoffSpent)} zł</strong>
            </span>
            {currentMonthOnly && (
              <span>
                🪙 Koperty ({cur}) — Suma rat:{" "}
                <strong style={{ color: c.text }}>{fmt(summary.envRateTotal)} zł</strong>
                {" / "}Faktycznie zebrano:{" "}
                <strong style={{ color: c.success }}>{fmt(summary.envRateCollected)} zł</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => { setCurrentMonthOnly(true); setFilterMonth(null); }}
          style={{
            padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 12,
            background: currentMonthOnly ? c.success : c.border,
            color:      currentMonthOnly ? c.white     : c.textSecondary,
          }}
        >
          📅 Bieżący miesiąc
        </button>
        <RangePicker
          value={currentMonthOnly ? { months: -1, from: null, to: null } : range}
          onChange={r => { setRange(r); setCurrentMonthOnly(false); }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {/* Mode filter */}
        {(["all", "envelope", "oneoff"] as const).map(m => (
          <button
            key={m}
            onClick={() => setFilterMode(m)}
            style={{
              padding: "6px 12px", borderRadius: 20, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 12,
              background: filterMode === m ? c.info : c.border,
              color:      filterMode === m ? c.white    : c.textSecondary,
            }}
          >
            {m === "all" ? "Wszystkie tryby" : m === "envelope" ? "🪙 Koperty" : "💳 Jednorazowe"}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: c.border }} />

        {/* Specific month filter — uses AppDatePicker (clickable anywhere in input) */}
        <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Konkretny miesiąc:
        </span>
        <AppDatePicker
          value={filterMonth}
          onChange={(d: Date) => { setFilterMonth(d); setRange({ months: 0, from: null, to: null }); setCurrentMonthOnly(false); }}
          monthPicker
        />
        {filterMonth && (
          <button onClick={() => setFilterMonth(null)}
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${c.borderStrong}`, background: "transparent", color: c.textSecondary, fontSize: 12, cursor: "pointer" }}>
            ✕
          </button>
        )}
      </div>

      {/* Overdue warning — unrealized plans from past months */}
      {overdueMonths.length > 0 && (
        <div style={{
          marginBottom: 16, padding: "10px 14px",
          background: alpha(c.danger, "11"), border: `1px solid ${alpha(c.danger, "55")}`,
          borderRadius: 10, fontSize: 13, color: c.danger, fontWeight: 600,
        }}>
          ⚠️ Zaległe (niezrealizowane) z: {overdueMonths.join(", ")}
        </div>
      )}

      {/* List */}
      {isLoading && <div style={{ color: c.textMuted, textAlign: "center", padding: 40 }}>Ładowanie…</div>}

      {!isLoading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: c.borderStrong }}>
          Brak planowanych wydatków w tym okresie.
        </div>
      )}

      {!isLoading && filtered.map(doc => (
        <PlannedCard
          key={doc.id}
          doc={doc}
          onEdit={openEdit}
          onArchive={d => setArchiveModal({
            isOpen: true, id: d.id, name: d.description,
            doc: d, paidSoFar: sumPaid(d.virtualSavings),
          })}
          onPurchase={d => setPurchaseModal({ isOpen: true, doc: d })}
        />
      ))}

      {/* Edit modal */}
      {modalEl}

      {/* Archive confirm */}
      <ConfirmModal
        isOpen={archiveModal.isOpen}
        title="Archiwizuj planowany wydatek"
        message={
          archiveModal.paidSoFar > 0
            ? `"${archiveModal.name}" ma już odłożone ${fmt(archiveModal.paidSoFar)} PLN.\n\nArchiwizacja usunie plan — fizycznie odłożone środki pozostają na Twoim koncie.`
            : `"${archiveModal.name}" zostanie zarchiwizowany.`
        }
        onConfirm={handleArchive}
        onCancel={() => setArchiveModal({ isOpen: false, id: null, name: "", doc: null, paidSoFar: 0 })}
      />

      {/* Purchase / realize — editable expense form pre-filled from the plan */}
      {purchaseModal.doc && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setPurchaseModal({ isOpen: false, doc: null })}
        >
          <div
            style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: "24px", maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, fontSize: 16, color: c.text, marginBottom: 6 }}>
              🛍️ Zrealizuj zakup
            </div>
            <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 16 }}>
              {purchaseModal.doc.description} · plan {fmt(purchaseModal.doc.totalAmountPLN)} PLN
              {purchaseModal.doc.mode === "envelope" && (
                <> · zebrano {fmt(sumPaid(purchaseModal.doc.virtualSavings))} PLN (zostanie odblokowane)</>
              )}
            </div>
            <TransactionForm
              key={purchaseModal.doc.id}
              initialValues={plannedToFormValues(purchaseModal.doc)}
              budgetMonth={activeBudgetMonth}
              showVouchers={false}
              isSaving={isSaving}
              onSubmit={handleRealize}
              onCancel={() => setPurchaseModal({ isOpen: false, doc: null })}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
