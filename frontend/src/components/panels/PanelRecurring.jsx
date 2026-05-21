// ============================================================
// File: src/components/panels/PanelRecurring.jsx
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { createPortal }    from "react-dom";
import { useMonthStatus }  from "../../hooks/useMonthStatus";
import { usePanelLock }    from "../../hooks/usePanelLock";
import { usePagination }   from "../../hooks/usePagination";
import { useRecurring, isActiveInMonth, getActiveCost } from "../../hooks/useRecurring";
import {FREQUENCY_OPTIONS} from  "../../data/constants";
import { ConfirmModal }    from "../ui/ConfirmModal";
import { LockBanner }      from "../ui/LockBanner";
import { Pagination }      from "../ui/Pagination";
import { RecurringForm }   from "./recurringComponents/RecurringForm";
import { RecurringRow }    from "./recurringComponents/RecurringRow";
import { fmt }             from "../../utils/helpers";
import { theme as s }      from "../../styles/theme";

const PAGE_SIZE = 20;

export default function PanelRecurring() {
  const { activeBudgetMonth } = useMonthStatus();
  const { isPastMonth, isMonthClosed, isHistoricalLock } = usePanelLock(activeBudgetMonth);

  const {
    recurring, isLoading, isSaving,
    loadAll, updateRecurring, archiveRecurring,
  } = useRecurring();

  const [showModal,    setShowModal]    = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [archiveModal, setArchiveModal] = useState({ isOpen: false, id: null, name: "" });
  const [filterFreq,   setFilterFreq]   = useState("");

  useEffect(() => { loadAll(); }, []);

  // Active this month
  const activeThisMonth = useMemo(() =>
    recurring.filter(r => isActiveInMonth(r, activeBudgetMonth)),
    [recurring, activeBudgetMonth]
  );

  // Filter
  const filtered = useMemo(() =>
    filterFreq ? activeThisMonth.filter(r => r.frequency === filterFreq) : activeThisMonth,
    [activeThisMonth, filterFreq]
  );

  // Pagination
  const { page, totalPages, paginated, setPage } = usePagination(filtered, PAGE_SIZE);

  // Summary — sum of active costs in PLN
  const totalPLN = useMemo(() =>
    activeThisMonth.reduce((sum, r) => {
      const cost = getActiveCost(r, activeBudgetMonth);
      return sum + (cost?.amountPLN ?? cost?.amount ?? 0);
    }, 0),
    [activeThisMonth, activeBudgetMonth]
  );

  function openEdit(doc) { setEditTarget(doc); setShowModal(true); }
  function closeModal()  { setShowModal(false); setEditTarget(null); }

  async function handleSubmit(payload) {
    const { newCostEntry, ...meta } = payload;
    if (!editTarget) return;
    const activeCost    = getActiveCost(editTarget, activeBudgetMonth);
    const amountChanged = parseFloat(newCostEntry.amount) !== parseFloat(activeCost?.amount)
      || newCostEntry.originalCurrency !== (activeCost?.originalCurrency || "PLN");
    let updatedCosts = [...(editTarget.costs || [])];
    if (amountChanged) {
      updatedCosts = updatedCosts.filter(c => c.validFrom !== newCostEntry.validFrom);
      updatedCosts.push(newCostEntry);
      updatedCosts.sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    }
    await updateRecurring(editTarget.id, {
      ...meta,
      ...(amountChanged ? { costs: updatedCosts } : {}),
    });
    closeModal();
  }

  async function handleArchive() {
    if (!archiveModal.id) return;
    await archiveRecurring(archiveModal.id, activeBudgetMonth);
    setArchiveModal({ isOpen: false, id: null, name: "" });
  }

  // Modal
  const modalEl = showModal && createPortal(
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={closeModal}
    >
      <div
        style={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 16, padding: 24, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 16, marginBottom: 20 }}>
          {editTarget ? "✏️ Edytuj wydatek cykliczny" : ""}
        </div>
        <RecurringForm
          key={editTarget ? editTarget.id : "add"}
          initialValues={editTarget}
          validFrom={activeBudgetMonth}
          activeBudgetMonth={activeBudgetMonth}
          onSubmit={handleSubmit}
          onCancel={closeModal}
          isSaving={isSaving}
          mode={editTarget ? "edit" : "add"}
        />
      </div>
    </div>,
    document.body
  );

  return (
    <div style={{ padding: "0 0 40px 0" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 }}>
          🔄 Wydatki cykliczne
        </div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {activeBudgetMonth} · {activeThisMonth.length} aktywnych ·{" "}
          <strong style={{ color: "#e2e8f0" }}>~{fmt(totalPLN)} PLN</strong>/miesiąc
          <span style={{ color: "#334155", marginLeft: 4 }}>(orientacyjnie)</span>
        </div>
      </div>

      <LockBanner isPastMonth={isPastMonth} isMonthClosed={isMonthClosed} selectedMonth={activeBudgetMonth} />

      {isPastMonth && (
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#64748b" }}>
          📅 Miesiąc {activeBudgetMonth} jest w przeszłości — dane są tylko do odczytu. Edycja dostępna wyłącznie dla bieżącego i przyszłych miesięcy.
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={filterFreq}
          onChange={e => { setFilterFreq(e.target.value); setPage(1); }}
          style={{ background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 8, color: "#94a3b8", padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
        >
          <option value="">Wszystkie cykliczności</option>
          {FREQUENCY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {filterFreq && (
          <button
            onClick={() => setFilterFreq("")}
            style={{ background: "transparent", border: "1px solid #334155", borderRadius: 8, color: "#64748b", padding: "8px 12px", cursor: "pointer", fontSize: 12 }}
          >
            ✕ Wyczyść
          </button>
        )}
      </div>

      {isLoading && <div style={{ color: "#475569", textAlign: "center", padding: 40 }}>Ładowanie…</div>}

      {!isLoading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
          Brak aktywnych wydatków cyklicznych w {activeBudgetMonth}.
        </div>
      )}

      {!isLoading && paginated.length > 0 && (
        <>
          <div style={{ color: "#475569", fontSize: 12, marginBottom: 8, textAlign: "right" }}>
            {filtered.length} pozycji · strona {page} z {totalPages}
          </div>
          {paginated.map(r => (
            <RecurringRow
              key={r.id}
              doc={r}
              activeBudgetMonth={activeBudgetMonth}
              isLocked={isHistoricalLock || isPastMonth}
              onEdit={openEdit}
              onArchive={doc => setArchiveModal({ isOpen: true, id: doc.id, name: doc.description })}
            />
          ))}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {modalEl}

      <ConfirmModal
        isOpen={archiveModal.isOpen}
        title="Archiwizuj wydatek cykliczny"
        message={`"${archiveModal.name}" nie będzie pokazywany od ${activeBudgetMonth} wzwyż.\n\nPoprzednie miesiące pozostają bez zmian.`}
        onConfirm={handleArchive}
        onCancel={() => setArchiveModal({ isOpen: false, id: null, name: "" })}
      />
    </div>
  );
}