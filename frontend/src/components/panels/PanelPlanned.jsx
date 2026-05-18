// ============================================================
// File: src/components/panels/PanelPlanned.jsx
// Desktop panel — view of planned expenses.
// Datepill filter: 1/3/6/12 months.
// Separate add panel (PanelAddPlanned) for mobile.
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { createPortal }    from "react-dom";
import { usePlanned, sumPaid, isReadyToPurchase } from "../../hooks/usePlanned";
import { useCurrencyConverter }  from "../../hooks/useCurrencyConverter";
import { ConfirmModal }    from "../ui/ConfirmModal";
import { PlannedCard }     from "./plannedComponents/PlannedCard";
import { PlannedForm }     from "./plannedComponents/PlannedForm";
import { fmt }             from "../../utils/helpers";
import { theme as s }      from "../../styles/theme";

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function addMonths(monthStr, n) {
  const [y, m] = monthStr.split("-").map(Number);
  const total  = (y * 12 + m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const DATE_PILLS = [
  { label: "1 msc",  months: 1  },
  { label: "3 msc",  months: 3  },
  { label: "6 msc",  months: 6  },
  { label: "12 msc", months: 12 },
  { label: "Wszystkie", months: null },
];

export default function PanelPlanned() {
  const {
    planned, isLoading, isSaving,
    loadAll, addPlanned, updatePlanned, archivePlanned, purchasePlanned,
  } = usePlanned();

  const [activePill,   setActivePill]   = useState(3);
  const [filterMode,   setFilterMode]   = useState("all"); // all | envelope | oneoff
  const [showModal,    setShowModal]    = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [archiveModal, setArchiveModal] = useState({ isOpen: false, id: null, name: "", doc: null, paidSoFar: 0 });
  const [purchaseModal, setPurchaseModal] = useState({ isOpen: false, doc: null });

  useEffect(() => { loadAll(); }, []);

  const cur = currentMonthStr();

  // Filter by datepill
  const filtered = useMemo(() => {
    const maxMonth = activePill ? addMonths(cur, activePill) : null;
    return planned.filter(doc => {
      if (doc.isPurchased || doc.isArchived) return false;
      if (maxMonth && doc.plannedMonth > maxMonth) return false;
      if (filterMode === "envelope" && doc.mode !== "envelope") return false;
      if (filterMode === "oneoff"   && doc.mode !== "oneoff")   return false;
      return true;
    });
  }, [planned, activePill, filterMode, cur]);

  // Summary — total PLN needed in filtered view
  const totalNeeded = useMemo(() =>
    filtered.reduce((sum, doc) => sum + doc.totalAmountPLN, 0),
    [filtered]
  );
  const totalPaid = useMemo(() =>
    filtered.filter(d => d.mode === "envelope").reduce((sum, doc) => sum + sumPaid(doc.virtualSavings), 0),
    [filtered]
  );
  const readyCount = useMemo(() =>
    filtered.filter(isReadyToPurchase).length,
    [filtered]
  );

  function openAdd()     { setEditTarget(null); setShowModal(true); }
  function openEdit(doc) { setEditTarget(doc);  setShowModal(true); }
  function closeModal()  { setShowModal(false); setEditTarget(null); }

  async function handleSubmit(payload) {
    if (editTarget) {
      await updatePlanned(editTarget.id, payload);
    } else {
      await addPlanned(payload);
    }
    closeModal();
  }

  async function handleArchive() {
    if (!archiveModal.id) return;
    await archivePlanned(archiveModal.id);
    setArchiveModal({ isOpen: false, id: null, name: "" });
  }

  async function handlePurchase() {
    if (!purchaseModal.doc) return;
    const today       = new Date().toISOString().slice(0, 10);
    const budgetMonth = today.slice(0, 7);
    await purchasePlanned(purchaseModal.doc.id, today, budgetMonth);
    setPurchaseModal({ isOpen: false, doc: null });
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
          {editTarget ? "✏️ Edytuj planowany wydatek" : "📅 Nowy planowany wydatek"}
        </div>
        <PlannedForm
          key={editTarget ? editTarget.id : "add"}
          initialValues={editTarget}
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
          📅 Planowane wydatki
        </div>
        <div style={{ fontSize: 13, color: "#64748b", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>{filtered.length} planowanych</span>
          <span>cel: <strong style={{ color: "#e2e8f0" }}>{fmt(totalNeeded)} PLN</strong></span>
          {totalPaid > 0 && <span>zebrano: <strong style={{ color: "#10b981" }}>{fmt(totalPaid)} PLN</strong></span>}
          {readyCount > 0 && <span style={{ color: "#10b981", fontWeight: 700 }}>✅ {readyCount} gotowych do zakupu</span>}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={openAdd} style={s.btn("#3b82f6")}>📅 Nowy planowany</button>

        {/* Datepills */}
        <div style={{ display: "flex", gap: 4 }}>
          {DATE_PILLS.map(pill => (
            <button
              key={pill.label}
              onClick={() => setActivePill(pill.months)}
              style={{
                padding: "6px 12px", borderRadius: 20, border: "none",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
                background: activePill === pill.months ? "#3b82f6" : "#1e293b",
                color:      activePill === pill.months ? "#fff"    : "#64748b",
              }}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Mode filter */}
        <select
          value={filterMode}
          onChange={e => setFilterMode(e.target.value)}
          style={{ background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 8, color: "#94a3b8", padding: "6px 10px", fontSize: 12, cursor: "pointer" }}
        >
          <option value="all">Wszystkie tryby</option>
          <option value="envelope">🪙 Koperty</option>
          <option value="oneoff">💳 Jednorazowe</option>
        </select>
      </div>

      {isLoading && (
        <div style={{ color: "#475569", textAlign: "center", padding: 40 }}>Ładowanie…</div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
          Brak planowanych wydatków w tym okresie.
        </div>
      )}

      {!isLoading && filtered.map(doc => (
        <PlannedCard
          key={doc.id}
          doc={doc}
          onEdit={openEdit}
          onArchive={d => setArchiveModal({ isOpen: true, id: d.id, name: d.description, doc: d, paidSoFar: sumPaid(d.virtualSavings) })}
          onPurchase={d => setPurchaseModal({ isOpen: true, doc: d })}
        />
      ))}

      {modalEl}

      <ConfirmModal
        isOpen={archiveModal.isOpen}
        title="Archiwizuj planowany wydatek"
        message={
          archiveModal.doc?.isPurchased
            ? `"${archiveModal.name}" został już zakupiony. Archiwizacja usunie go z listy — transakcje zakupu pozostają bez zmian.`
            : archiveModal.paidSoFar > 0
              ? `"${archiveModal.name}" ma już odłożone ${fmt(archiveModal.paidSoFar)} PLN.\n\nArchiwizacja usunie plan — fizycznie odłożone środki pozostają na Twoim koncie celu.`
              : `"${archiveModal.name}" zostanie zarchiwizowany.`
        }
        onConfirm={handleArchive}
        onCancel={() => setArchiveModal({ isOpen: false, id: null, name: "", doc: null, paidSoFar: 0 })}
      />

      {purchaseModal.doc && createPortal(
        <ConfirmModal
          isOpen={!!purchaseModal.doc}
          title="🛍️ Potwierdź zakup"
          message={
            `Czy potwierdzasz zakup:\n` +
            `${purchaseModal.doc?.description} — ${fmt(purchaseModal.doc?.totalAmountPLN)} PLN?\n\n` +
            `Zebrano: ${fmt(sumPaid(purchaseModal.doc?.virtualSavings))} PLN\n\n` +
            `Zostaną utworzone:\n• Wydatek ${fmt(purchaseModal.doc?.totalAmountPLN)} PLN → ${purchaseModal.doc?.targetCategoryName}\n` +
            `• Transfer ${fmt(sumPaid(purchaseModal.doc?.virtualSavings))} PLN → Środki własne`
          }
          onConfirm={handlePurchase}
          onCancel={() => setPurchaseModal({ isOpen: false, doc: null })}
        />,
        document.body
      )}
    </div>
  );
}