// ============================================================
// File: src/components/panels/cardComponents/RepaymentModal.tsx
// Register a card repayment — or correct one already registered.
//
// New repayment: the amount starts at what the closed statement asks for
// (paying that is what avoids interest), with the whole debt one click away.
// Any amount is allowed, above the debt too — the panel then shows an
// overpayment instead of this modal refusing. Interest and fees included in
// the transfer are split off into their own field; the backend books them as
// an expense on the card.
//
// Correction (`repayment` given): amount and date only.
//
// Opened from the card panel and from the bell, hence data-modal: the bell's
// click-outside handler leaves modals alone.
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useCreditCards } from "../../../hooks/useCreditCards";
import { useMonthStatus } from "../../../hooks/useMonthStatus";
import { AppDatePicker, todayLocal, toYMD, fromYMD } from "../../ui/AppDatePicker";
import { fmt, round2, monthLabel, firstOpenMonth } from "../../../utils/helpers";
import type { CardStatus } from "../../../utils/cardDebt";
import type { CardRepayment } from "../../../types/creditCard";

interface RepaymentModalProps {
  status:     CardStatus;
  /** Correct this repayment instead of adding a new one. */
  repayment?: CardRepayment;
  onClose:    () => void;
}

const label: React.CSSProperties = {
  display: "block", fontSize: 11, color: c.textSecondary, textTransform: "uppercase",
  letterSpacing: "0.6px", fontWeight: 700, marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8,
  color: c.text, padding: "10px 12px", fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box",
};
const quick = (color: string): React.CSSProperties => ({
  padding: "6px 10px", borderRadius: 8, border: `1px solid ${alpha(color, "44")}`,
  background: "transparent", color, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
});

const toAmount = (text: string) => round2(parseFloat(text.replace(",", ".")) || 0);

export function RepaymentModal({ status, repayment, onClose }: RepaymentModalProps) {
  const { addRepayment, updateRepayment, isSaving } = useCreditCards();
  const { closedMonths, isClosedMonth } = useMonthStatus();

  const isEdit = !!repayment;
  // A new repayment is booked in the first open month — the same one returns
  // use — whatever month the user happens to be looking at when the bell
  // opens this. A correction stays in the month the repayment was booked in.
  const budgetMonth = repayment?.budgetMonth ?? firstOpenMonth(closedMonths);
  const monthClosed = isClosedMonth(budgetMonth);

  const suggested = status.statementDue > 0 ? status.statementDue : Math.max(0, status.debt);

  const [amountText,   setAmountText]   = useState(String(repayment?.amount ?? (suggested || "")));
  const [interestText, setInterestText] = useState("");
  const [date,         setDate]         = useState<Date>((repayment && fromYMD(repayment.date)) || todayLocal());

  const amount   = toAmount(amountText);
  const interest = toAmount(interestText);
  const interestTooHigh = interest > amount;
  const canSave  = amount > 0 && !interestTooHigh && !monthClosed && !isSaving;

  async function handleSave() {
    if (!canSave) return;
    const ok = repayment
      ? await updateRepayment(repayment.id, { amount, date: toYMD(date) })
      : await addRepayment(status.card.id, { amount, date: toYMD(date), budgetMonth, interestAmount: interest });
    if (ok) onClose();
  }

  return createPortal(
    <div
      data-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, color: c.text, fontSize: 16, marginBottom: 4 }}>
          {isEdit ? "✏️ Popraw spłatę" : "💸 Spłata karty"}
        </div>
        <div style={{ fontSize: 13, color: c.textSecondary, marginBottom: 20 }}>
          {status.card.name} · do spłaty łącznie{" "}
          <strong style={{ color: c.text }}>{fmt(Math.max(0, status.debt))}</strong>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 16 }}>
          <label style={label}>Kwota przelewu (PLN)</label>
          <input
            type="number" min={0} step={0.01} autoFocus
            value={amountText}
            onChange={e => setAmountText(e.target.value)}
            style={input}
          />
          {!isEdit && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {status.statementDue > 0 && (
                <button onClick={() => setAmountText(String(status.statementDue))} style={quick(c.success)}>
                  Wyciąg {fmt(status.statementDue)}
                </button>
              )}
              {status.debt > status.statementDue && (
                <button onClick={() => setAmountText(String(status.debt))} style={quick(c.info)}>
                  Całość {fmt(status.debt)}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Date */}
        <div style={{ marginBottom: 16 }}>
          <label style={label}>Data spłaty</label>
          <AppDatePicker value={date} onChange={setDate} />
          <div style={{ fontSize: 11, color: monthClosed ? c.danger : c.textMuted, marginTop: 4 }}>
            Miesiąc budżetowy: <strong>{monthLabel(budgetMonth)}</strong>
            {monthClosed && " — zamknięty, otwórz go, żeby zapisać spłatę"}
          </div>
        </div>

        {/* Interest — only when adding; it becomes its own expense */}
        {!isEdit && (
          <div style={{ marginBottom: 16 }}>
            <label style={label}>W tym odsetki i opłaty (opcjonalnie)</label>
            <input
              type="number" min={0} step={0.01}
              value={interestText}
              onChange={e => setInterestText(e.target.value)}
              placeholder="0,00"
              style={{ ...input, fontSize: 14, fontWeight: 600, borderColor: interestTooHigh ? alpha(c.danger, "66") : c.border }}
            />
            <div style={{ fontSize: 11, color: interestTooHigh ? c.danger : c.textMuted, marginTop: 4, lineHeight: 1.4 }}>
              {interestTooHigh
                ? "Odsetki nie mogą być większe niż kwota przelewu."
                : "Zostaną zapisane jako osobny wydatek na karcie — to koszt kredytu, a nie spłata zakupów."}
            </div>
          </div>
        )}

        {isEdit && (repayment?.interestAmount ?? 0) > 0 && (
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 16, lineHeight: 1.4 }}>
            Ta spłata zapisała {fmt(repayment!.interestAmount!)} odsetek jako osobny wydatek —
            poprawisz go w panelu Wydatki.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textTertiary, cursor: "pointer", fontWeight: 600 }}
          >
            Anuluj
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 14,
              background: canSave ? c.success : c.border,
              color:      canSave ? c.white : c.textMuted,
              cursor:     canSave ? "pointer" : "not-allowed",
            }}
          >
            {isSaving ? "⏳ Zapisuję…" : isEdit ? "💾 Zapisz" : "✅ Zapisz spłatę"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
