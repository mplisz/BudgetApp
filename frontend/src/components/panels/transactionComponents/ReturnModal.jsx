// ============================================================
// File: frontend/src/components/panels/transactionComponents/ReturnModal.jsx
// Refund entry form for a single transaction.
// Supports multiple partial returns; cashAmount is auto-derived.
// Called from: PanelTransactions
// ============================================================

import { useState, useEffect } from "react";
import { useAuth }        from "../../../context/AuthContext";
import { useToast }       from "../../../hooks/useToast";
import { AppDatePicker, toYMD, todayLocal } from "../../ui/AppDatePicker";
import { BudgetInput }    from "../../ui/BudgetInput";
import { fmt }            from "../../../utils/helpers";
import { s, calcReturns } from "./txStyles";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function ReturnModal({ tx, activeBudgetMonth, onClose, onSaved }) {
  const { fetchWithAuth }          = useAuth();
  const { showError, showSuccess } = useToast();

  const [form, setForm] = useState({
    amount:               "",
    voucherAmount:        0,
    cashAmount:           0,
    moneyReturnedInMonth: activeBudgetMonth,
    returnedAt:           todayLocal(),   // Date object — converted to YYYY-MM-DD on submit
    reason:               "",
  });
  const [saving, setSaving] = useState(false);

  const { totalReturnedAmount } = calcReturns(tx);
  const remaining = Math.max(0, tx.amount - totalReturnedAmount);

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  // Keep cashAmount in sync whenever amount or voucherAmount changes
  useEffect(() => {
    const amt = parseFloat(form.amount) || 0;
    const vch = form.voucherAmount       || 0;
    setField("cashAmount", Math.max(0, amt - vch));
  }, [form.amount, form.voucherAmount]);

  async function handleSubmit() {
    const payload = {
      amount:               parseFloat(form.amount),
      voucherAmount:        form.voucherAmount || 0,
      cashAmount:           form.cashAmount    || 0,
      moneyReturnedInMonth: form.moneyReturnedInMonth,
      returnedAt:           toYMD(form.returnedAt),
      reason:               form.reason,
    };

    if (!payload.amount || payload.amount <= 0) { showError("Podaj kwotę zwrotu.");              return; }
    if (!payload.moneyReturnedInMonth)           { showError("Podaj miesiąc budżetowy zwrotu."); return; }
    if (!payload.returnedAt)                     { showError("Podaj datę faktycznego zwrotu.");  return; }

    setSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/transactions/${tx.id}/returns`, {
        method: "POST",
        body:   JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd zapisu zwrotu.");
      // Backend returns a soft warning when total returned exceeds transaction amount
      if (data.warning) showError(data.warning);
      else showSuccess("Zwrot zapisany! 🔙");
      onSaved(data.transaction);
      onClose();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.modalBox} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitle}>🔙 Formularz zwrotu</div>

        {/* Transaction summary for context */}
        <div style={{ background: "#0a0f1e", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#94a3b8" }}>
          <strong style={{ color: "#e2e8f0" }}>{tx.categoryName} › {tx.subcategoryName}</strong>
          {tx.description && <span style={{ color: "#64748b" }}> — {tx.description}</span>}
          <div style={{ marginTop: 4 }}>
            Kwota: <strong style={{ color: "#e2e8f0" }}>{fmt(tx.amount)} PLN</strong>
            {totalReturnedAmount > 0 && (
              <span style={{ color: "#f97316", marginLeft: 10 }}>
                (już zwrócono: {fmt(totalReturnedAmount)} PLN)
              </span>
            )}
          </div>
        </div>

        {/* Return amount — BudgetInput handles comma/dot decimal entry */}
        <div style={s.formRow}>
          <label style={s.lbl}>Kwota zwrotu (PLN) *</label>
          <BudgetInput
            value={form.amount === "" ? 0 : form.amount}
            onChange={v => setField("amount", v || "")}
            placeholder={`max. ${fmt(remaining)}`}
            style={s.inp}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={s.formRow}>
            <label style={s.lbl}>Z czego: voucher (PLN)</label>
            <BudgetInput
              value={form.voucherAmount}
              onChange={v => setField("voucherAmount", v || 0)}
              style={s.inp}
            />
          </div>
          <div style={s.formRow}>
            <label style={s.lbl}>Z czego: gotówka (PLN)</label>
            {/* Read-only: derived as amount − voucherAmount */}
            <input readOnly value={fmt(form.cashAmount)} style={{ ...s.inp, opacity: 0.5, cursor: "default" }} />
          </div>
        </div>

        {/* Budget month of the return — plain text input, not a date picker */}
        <div style={s.formRow}>
          <label style={s.lbl}>Miesiąc budżetowy zwrotu *</label>
          <input
            style={s.inp}
            type="text"
            placeholder="YYYY-MM"
            value={form.moneyReturnedInMonth}
            onChange={e => setField("moneyReturnedInMonth", e.target.value)}
          />
        </div>

        {/* Actual return date — AppDatePicker, maxDate=null allows future dates */}
        <div style={s.formRow}>
          <label style={s.lbl}>Data faktycznego zwrotu *</label>
          <AppDatePicker
            value={form.returnedAt}
            onChange={d => setField("returnedAt", d)}
            maxDate={null}
          />
        </div>

        <div style={s.formRow}>
          <label style={s.lbl}>Powód / opis</label>
          <input
            style={s.inp}
            type="text"
            maxLength={500}
            value={form.reason}
            onChange={e => setField("reason", e.target.value)}
            placeholder="np. Luxmed — zwrot wizyty"
          />
        </div>

        {/* Previous returns history (read-only) */}
        {(tx.returns || []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...s.lbl, marginBottom: 8 }}>Historia zwrotów</div>
            {tx.returns.map((r, i) => (
              <div key={i} style={{ fontSize: 12, color: "#64748b", padding: "5px 0", borderBottom: "1px solid #0f172a" }}>
                <span style={{ color: "#94a3b8" }}>{r.returnedAt}</span>
                {" · "}
                <strong style={{ color: "#e2e8f0" }}>{fmt(r.amount)} PLN</strong>
                {r.voucherAmount > 0 && <span style={{ color: "#a78bfa" }}> (voucher: {fmt(r.voucherAmount)})</span>}
                {r.reason && <span> — {r.reason}</span>}
                {" · "}<span>{r.returnedBy}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={s.btn("secondary")} onClick={onClose}>Anuluj</button>
          <button style={s.btn("primary")} onClick={handleSubmit} disabled={saving}>
            {saving ? "Zapisuję…" : "🔙 Zapisz zwrot"}
          </button>
        </div>
      </div>
    </div>
  );
}