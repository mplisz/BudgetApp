// ============================================================
// File: src/components/layout/MonthStatusButton.jsx
// Shows open/closed status of the active budget month.
// Placed in the header next to NotificationBell and LogoutButton.
// ============================================================

import { useState } from "react";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { MONTHS }         from "../../data/constants";
import { useAppContext }  from "../../context/AppContext";

export function MonthStatusButton() {
  const { month, year }                                    = useAppContext();
  const { isActiveMonthClosed, closeMonth, openMonth,
          activeBudgetMonth, isFutureMonth }               = useMonthStatus();

  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving,    setIsSaving]    = useState(false);

  const monthLabel = `${MONTHS[month]} ${year}`;

  async function handleClose() {
    setIsSaving(true);
    await closeMonth(activeBudgetMonth);
    setIsSaving(false);
    setShowConfirm(false);
  }

  async function handleOpen() {
    setIsSaving(true);
    await openMonth(activeBudgetMonth);
    setIsSaving(false);
  }

  // Don't show button for future months (nothing to close)
  if (isFutureMonth) return null;

  // ── Closed state ─────────────────────────────────────────
  if (isActiveMonthClosed) {
    return (
      <button
        onClick={handleOpen}
        disabled={isSaving}
        title={`Otwórz ${monthLabel} ponownie`}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          5,
          padding:      "5px 10px",
          borderRadius: 8,
          border:       "1px solid #ef444444",
          background:   "#ef444411",
          color:        "#f87171",
          cursor:       isSaving ? "not-allowed" : "pointer",
          fontSize:     12,
          fontWeight:   600,
          whiteSpace:   "nowrap",
        }}>
        {isSaving ? "⏳" : "🔒"} {isSaving ? "Otwieranie…" : monthLabel}
      </button>
    );
  }

  // ── Open state — confirm modal ────────────────────────────
  if (showConfirm) {
    return (
      <div style={{
        position:   "fixed",
        inset:      0,
        zIndex:     1000,
        background: "rgba(0,0,0,0.7)",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
        onClick={() => setShowConfirm(false)}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background:   "#0d1424",
            border:       "1px solid #1e293b",
            borderRadius: 12,
            padding:      "24px 28px",
            maxWidth:     400,
            width:        "90vw",
          }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 16, marginBottom: 8 }}>
            Zamknąć {monthLabel}?
          </div>
          <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
            Po zamknięciu nie będzie można dodawać ani edytować transakcji w tym miesiącu.
            Możesz go ponownie otworzyć w każdej chwili.
            Aplikacja przejdzie automatycznie do następnego otwartego miesiąca.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleClose}
              disabled={isSaving}
              style={{
                flex:         1,
                padding:      "10px",
                borderRadius: 8,
                border:       "none",
                background:   isSaving ? "#334155" : "#10b981",
                color:        "#fff",
                fontWeight:   700,
                cursor:       isSaving ? "not-allowed" : "pointer",
              }}>
              {isSaving ? "⏳ Zamykanie…" : "✅ Zamknij miesiąc"}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={isSaving}
              style={{
                padding:      "10px 16px",
                borderRadius: 8,
                border:       "1px solid #1e293b",
                background:   "transparent",
                color:        "#475569",
                cursor:       "pointer",
              }}>
              Anuluj
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Open state — default button ───────────────────────────
  return (
    <button
      onClick={() => setShowConfirm(true)}
      title={`Zamknij ${monthLabel}`}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          5,
        padding:      "5px 10px",
        borderRadius: 8,
        border:       "1px solid #10b98133",
        background:   "#10b98111",
        color:        "#10b981",
        cursor:       "pointer",
        fontSize:     12,
        fontWeight:   600,
        whiteSpace:   "nowrap",
      }}>
      🔓 {monthLabel}
    </button>
  );
}