// ============================================================
// File: src/components/panels/PanelPlanned.tsx
// Desktop panel — view and management of planned expenses.
// ============================================================

import { c } from "../../styles/tokens";
import { useState, useEffect, useMemo } from "react";
import { createPortal }   from "react-dom";
import { usePlanned, sumPaid } from "../../hooks/usePlanned";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { ConfirmModal }   from "../ui/ConfirmModal";
import { PlannedCard }    from "./plannedComponents/PlannedCard";
import { PlannedForm }    from "./plannedComponents/PlannedForm";
import { fmt }            from "../../utils/helpers";
import { theme as s }     from "../../styles/theme";
import { RangePicker, type DateRange } from "../ui/RangePicker";
import { AppDatePicker, toYM } from "../ui/AppDatePicker";
import type { PlannedDoc, PlannedPostPayload, PlannedPatchPayload } from "../../hooks/usePlanned";

// ── Helpers ───────────────────────────────────────────────────

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const total  = (y * 12 + m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
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

  const [range,         setRange]         = useState<DateRange>({ months: 3, from: null, to: null });
  const [filterMode,    setFilterMode]    = useState<"all" | "envelope" | "oneoff">("all");
  const [filterMonth,   setFilterMonth]   = useState<Date | null>(null);
  const [showModal,     setShowModal]     = useState(false);
  const [editTarget,    setEditTarget]    = useState<PlannedDoc | null>(null);
  const [archiveModal,  setArchiveModal]  = useState<ArchiveModalState>({
    isOpen: false, id: null, name: "", doc: null, paidSoFar: 0,
  });
  const [purchaseModal, setPurchaseModal] = useState<PurchaseModalState>({
    isOpen: false, doc: null,
  });

  useEffect(() => { loadAll(); }, []);

  const cur = currentMonthStr();

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
    if (filterMonthStr && doc.plannedMonth !== filterMonthStr) return false;
    if (fromMonth && doc.plannedMonth < fromMonth) return false;
    if (toMonth   && doc.plannedMonth > toMonth)   return false;
    if (maxMonth  && doc.plannedMonth > maxMonth)  return false;
    return true;
  }).sort((a, b) => a.plannedMonth.localeCompare(b.plannedMonth));
}, [planned, range, filterMode, filterMonth, cur]);

  // ── Totals ────────────────────────────────────────────────

  const totalGoal      = useMemo(() => filtered.reduce((s, d) => s + d.totalAmountPLN, 0), [filtered]);
  const totalCollected = useMemo(() => filtered.reduce((s, d) => s + sumPaid(d.virtualSavings), 0), [filtered]);

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

  async function handlePurchase() {
    if (!purchaseModal.doc) return;
    const today = new Date().toISOString().slice(0, 10);
    await purchasePlanned(purchaseModal.doc.id, today, activeBudgetMonth);
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
            {filtered.length} planowanych · cel:{" "}
            <strong style={{ color: c.text }}>{fmt(totalGoal)} PLN</strong>
            {totalCollected > 0 && (
              <> · zebrano: <strong style={{ color: c.success }}>{fmt(totalCollected)} PLN</strong></>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <RangePicker value={range} onChange={setRange} />
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
          onChange={(d: Date) => { setFilterMonth(d); setRange({ months: 0, from: null, to: null }); }}
          monthPicker
        />
        {filterMonth && (
          <button onClick={() => setFilterMonth(null)}
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${c.borderStrong}`, background: "transparent", color: c.textSecondary, fontSize: 12, cursor: "pointer" }}>
            ✕
          </button>
        )}
      </div>

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

      {/* Purchase confirm */}
      {purchaseModal.doc && createPortal(
        <ConfirmModal
          isOpen={!!purchaseModal.doc}
          title="🛍️ Potwierdź zakup"
          message={
            `Czy potwierdzasz zakup:\n` +
            `${purchaseModal.doc.description} — ${fmt(purchaseModal.doc.totalAmountPLN)} PLN?\n\n` +
            `Zebrano: ${fmt(sumPaid(purchaseModal.doc.virtualSavings))} PLN\n\n` +
            `Zostaną utworzone:\n` +
            `• Wydatek ${fmt(purchaseModal.doc.totalAmountPLN)} PLN → ${purchaseModal.doc.targetCategoryName}\n` +
            `• Transfer ${fmt(sumPaid(purchaseModal.doc.virtualSavings))} PLN → Środki własne`
          }
          onConfirm={handlePurchase}
          onCancel={() => setPurchaseModal({ isOpen: false, doc: null })}
        />,
        document.body
      )}
    </div>
  );
}
