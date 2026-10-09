// ============================================================
// File: src/components/panels/cardComponents/CardForm.tsx
// Add a credit card, or edit one: its name, what was already owed when
// tracking started, and the two numbers the statement dates come from.
// ============================================================

import { c } from "../../../styles/tokens";
import { useState } from "react";
import { round2 } from "../../../utils/helpers";
import type { CardInput, CreditCard } from "../../../types/creditCard";

interface CardFormProps {
  /** Card being edited; absent when adding. */
  card?:     CreditCard;
  isSaving:  boolean;
  onSave:    (card: CardInput) => void;
  onCancel?: () => void;
}

const label: React.CSSProperties = {
  display: "block", fontSize: 11, color: c.textSecondary, textTransform: "uppercase",
  letterSpacing: "0.6px", fontWeight: 700, marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8,
  color: c.text, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box",
};
const hint: React.CSSProperties = { fontSize: 11, color: c.textMuted, marginTop: 4, lineHeight: 1.4 };

export function CardForm({ card, isSaving, onSave, onCancel }: CardFormProps) {
  const [name,         setName]         = useState(card?.name ?? "");
  const [opening,      setOpening]      = useState(String(card?.openingBalance ?? 0));
  const [statementDay, setStatementDay] = useState(String(card?.statementDay ?? ""));
  const [graceDays,    setGraceDays]    = useState(String(card?.graceDays ?? ""));

  const day   = parseInt(statementDay, 10);
  const grace = parseInt(graceDays, 10);
  const openingBalance = round2(parseFloat(opening.replace(",", ".")) || 0);

  const valid = name.trim().length > 0
    && day >= 1 && day <= 31
    && grace >= 0 && grace <= 60
    && openingBalance >= 0;

  function handleSave() {
    if (!valid || isSaving) return;
    onSave({ name: name.trim(), openingBalance, statementDay: day, graceDays: grace });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
      <div>
        <label style={label}>Nazwa karty</label>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="np. Visa mBank" style={input} />
      </div>

      <div>
        <label style={label}>Saldo początkowe (PLN)</label>
        <input type="number" min={0} step={0.01} value={opening} onChange={e => setOpening(e.target.value)} style={input} />
        <div style={hint}>Ile było do spłaty, zanim zacząłeś oznaczać zakupy kartą. Zwykle 0.</div>
      </div>

      <div>
        <label style={label}>Dzień zamknięcia wyciągu</label>
        <input type="number" min={1} max={31} step={1} value={statementDay} onChange={e => setStatementDay(e.target.value)} placeholder="1–31" style={input} />
        <div style={hint}>Dzień miesiąca, w którym bank zamyka okres rozliczeniowy.</div>
      </div>

      <div>
        <label style={label}>Dni na spłatę po wyciągu</label>
        <input type="number" min={0} max={60} step={1} value={graceDays} onChange={e => setGraceDays(e.target.value)} placeholder="np. 26" style={input} />
        <div style={hint}>Przy „56 dniach bez odsetek” to zwykle 26.</div>
      </div>

      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textTertiary, cursor: "pointer", fontWeight: 600 }}
          >
            Anuluj
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!valid || isSaving}
          style={{
            padding: "9px 22px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 14,
            background: valid && !isSaving ? c.success : c.border,
            color:      valid && !isSaving ? c.white : c.textMuted,
            cursor:     valid && !isSaving ? "pointer" : "not-allowed",
          }}
        >
          {isSaving ? "⏳ Zapisuję…" : card ? "💾 Zapisz kartę" : "➕ Dodaj kartę"}
        </button>
      </div>
    </div>
  );
}
