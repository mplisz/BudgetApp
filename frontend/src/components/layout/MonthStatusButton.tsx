// ============================================================
// File: src/components/layout/MonthStatusButton.tsx
// Shows open/closed status of the active budget month.
// Placed in the header next to NotificationBell and LogoutButton.
//
// Active month is now derived from the URL (?m=YYYY-MM) instead
// of AppContext state.
// ============================================================

import { useState } from "react";
import { useMonthStatus } from "../../hooks/useMonthStatus";
import { useMonthFromUrl } from "../../hooks/useMonthFromUrl";
import { MONTHS } from "../../data/constants";

export function MonthStatusButton() {
  const { month, year } = useMonthFromUrl();
  const {
    isActiveMonthClosed, closeMonth, openMonth,
    activeBudgetMonth, isFutureMonth,
  } = useMonthStatus() as {
    isActiveMonthClosed: boolean;
    closeMonth:          (m: string) => Promise<unknown>;
    openMonth:           (m: string) => Promise<unknown>;
    activeBudgetMonth:   string;
    isFutureMonth:       boolean;
  };

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
          <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
            Po zamknięciu miesiąca nie będzie można dodawać ani edytować transakcji w tym okresie.
            Można go później ponownie otworzyć.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={isSaving}
              style={{
                background: "transparent",
                border:     "1px solid #1e293b",
                color:      "#94a3b8",
                padding:    "8px 16px",
                borderRadius: 8,
                cursor:     "pointer",
                fontWeight: 600,
              }}>
              Anuluj
            </button>
            <button
              onClick={handleClose}
              disabled={isSaving}
              style={{
                background: "#ef4444",
                border:     "none",
                color:      "#fff",
                padding:    "8px 16px",
                borderRadius: 8,
                cursor:     isSaving ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}>
              {isSaving ? "Zamykam…" : "🔒 Zamknij miesiąc"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Open state — button ───────────────────────────────────
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
        border:       "1px solid #10b98144",
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
