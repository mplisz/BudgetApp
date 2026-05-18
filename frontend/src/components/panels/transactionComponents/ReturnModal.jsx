// ============================================================
// File: src/components/panels/transactionComponents/ReturnModal.jsx
// Refund entry form — supports:
//   - Same-month returns (reduces effectiveAmount)
//   - Cross-month returns (creates TRANSFER in target month)
//   - Cash + voucher split
//   - Voucher creation on return
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { useAuth }        from "../../../context/AuthContext";
import { useToast }       from "../../../hooks/useToast";
import { AppDatePicker, toYMD, todayLocal } from "../../ui/AppDatePicker";
import { BudgetInput }    from "../../ui/BudgetInput";
import { fmt }            from "../../../utils/helpers";
import {
  calculateTotalReturned,
  remainingToReturn,
  canAddReturn,
  isCrossMonthReturn,
  getReturnMonthBounds,
  isReturnMonthAllowed,
} from "../../../utils/returnUtils";
import { s, calcReturns } from "./txStyles.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Month input — free text YYYY-MM, min = minMonth, no upper limit ──
function MonthInput({ value, onChange, minMonth }) {
  const safeValue = value ?? "";
  const isValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(safeValue) && safeValue >= minMonth;
  return (
    <div>
      <input
        type="month"
        value={safeValue}
        min={minMonth}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box",
          background: "#0a0f1e", border: `1px solid ${isValid ? "#1e293b" : "#ef444488"}`,
          borderRadius: 8, color: "#e2e8f0", padding: "9px 12px",
          fontSize: 14, outline: "none",
          colorScheme: "dark",
        }}
      />
      {!isValid && value && (
        <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>
          Miesiąc nie może być wcześniejszy niż {minMonth}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ReturnModal
// ─────────────────────────────────────────────────────────────
export function ReturnModal({ tx, activeBudgetMonth, onClose, onSaved }) {
  const { fetchWithAuth }          = useAuth();
  const { showError, showSuccess } = useToast();

  const { minMonth, maxMonth, currentMonth } = getReturnMonthBounds();
  const remaining = Math.round(remainingToReturn(tx) * 100) / 100;
  const totalAlreadyReturned = calculateTotalReturned(tx);

  const [form, setForm] = useState({
    amount:               "",
    voucherAmount:        0,
    cashAmount:           0,
    hasVoucher:           false,
    moneyReturnedInMonth: activeBudgetMonth >= minMonth
      ? activeBudgetMonth
      : currentMonth,
    returnedAt:           todayLocal(),
    reason:               "",
    // Voucher creation
    createVoucher:        false,
    voucherCode:          "",
    voucherExpiresAt:     null,
  });
  const [saving, setSaving] = useState(false);

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  // Pure cap logic:
  // CAP = remaining
  // amount  <= CAP - voucherAmount
  // voucher <= CAP - amount
  const amt     = parseFloat(form.amount)        || 0;
  const vchAmt  = form.hasVoucher ? (parseFloat(form.voucherAmount) || 0) : 0;
  const cashAmt = Math.max(0, amt - vchAmt);

  const maxAmount  = remaining - vchAmt;   // how much left for cash return
  const maxVoucher = remaining - amt;      // how much left for voucher

  const crossMonth = isCrossMonthReturn(tx, form.moneyReturnedInMonth);

  function handleAmountChange(v) {
    const raw = parseFloat(v) || 0;
    setField("amount", Math.min(raw, maxAmount));
  }

  function handleVoucherChange(v) {
    const raw = parseFloat(v) || 0;
    setField("voucherAmount", Math.min(raw, maxVoucher));
  }

  async function handleSubmit() {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0)        { showError("Podaj kwotę zwrotu.");              return; }
    if (amount > remaining)            { showError(`Maksymalny zwrot to ${fmt(remaining)} PLN.`); return; }
    if (!isReturnMonthAllowed(form.moneyReturnedInMonth)) {
      showError(`Miesiąc zwrotu nie może być wcześniejszy niż ${minMonth}.`);
      return;
    }
    if (form.createVoucher && vchAmt <= 0) {
      showError("Podaj kwotę vouchera aby go utworzyć.");
      return;
    }

    const payload = {
      amount,
      voucherAmount:        vchAmt,
      cashAmount:           Math.max(0, amount - vchAmt),
      moneyReturnedInMonth: form.moneyReturnedInMonth,
      returnedAt:           toYMD(form.returnedAt),
      reason:               form.reason,
      createVoucher:        form.createVoucher,
      voucherCode:          form.voucherCode,
      voucherExpiresAt:     form.voucherExpiresAt ? toYMD(form.voucherExpiresAt) : null,
    };

    setSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/transactions/${tx.id}/returns`, {
        method: "POST",
        body:   JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd zapisu zwrotu.");

      if (data.warning) showError(data.warning);
      else {
        let msg = "Zwrot zapisany! 🔙";
        if (data.sideEffects?.transferCreated) msg += " Utworzono TRANSFER w miesiącu zwrotu.";
        if (data.sideEffects?.voucherCreated)  msg += " Voucher dodany.";
        showSuccess(msg);
      }
      onSaved(data.transaction, data.sideEffects);
      onClose();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!canAddReturn(tx)) {
    return (
      <div style={s.modal} onClick={onClose}>
        <div style={s.modalBox} onClick={e => e.stopPropagation()}>
          <div style={s.modalTitle}>🔙 Zwrot</div>
          <div style={{ color: "#f87171", fontSize: 14 }}>
            Ta transakcja jest w pełni zwrócona.
          </div>
          <button style={{ ...s.btn("secondary"), marginTop: 16 }} onClick={onClose}>Zamknij</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={{ ...s.modalBox, maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}
           onClick={e => e.stopPropagation()}>
        <div style={s.modalTitle}>🔙 Formularz zwrotu</div>

        {/* Transaction context */}
        <div style={{ background: "#0a0f1e", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#94a3b8" }}>
          <strong style={{ color: "#e2e8f0" }}>{tx.categoryName} › {tx.subcategoryName}</strong>
          {tx.description && <span style={{ color: "#64748b" }}> — {tx.description}</span>}
          <div style={{ marginTop: 4, display: "flex", gap: 16 }}>
            <span>Kwota: <strong style={{ color: "#e2e8f0" }}>{fmt(tx.amount)} PLN</strong></span>
            {totalAlreadyReturned > 0 && (
              <span style={{ color: "#f97316" }}>
                Już zwrócono: {fmt(totalAlreadyReturned)} PLN
              </span>
            )}
            <span style={{ color: "#10b981" }}>
              Pozostało: {fmt(remaining)} PLN
            </span>
          </div>
        </div>

        {/* Amount + MAX + % calculator */}
        <div style={s.formRow}>
          <label style={s.lbl}>Kwota zwrotu (PLN) *</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.amount}
              onChange={e => {
                const raw = parseFloat(e.target.value) || 0;
                const capped = Math.round(Math.min(raw, maxAmount) * 100) / 100;
                setField("amount", raw > maxAmount ? capped : e.target.value);
              }}
              placeholder={`max. ${fmt(maxAmount)}`}
              style={{ ...s.inp, flex: 1 }}
            />
            {/* % calculator */}
            <select
              onChange={e => {
                const pct = parseFloat(e.target.value);
                if (!pct) return;
                const calculated = Math.round(remaining * pct) / 100;
                const rounded = Math.round(Math.min(calculated, maxAmount) * 100) / 100;
                setField("amount", rounded);
                setField("voucherAmount", 0);
                setForm(p => ({ ...p, hasVoucher: false, createVoucher: false, voucherCode: "", voucherExpiresAt: null }));
                e.target.value = "";
              }}
              defaultValue=""
              title="Oblicz procent kwoty"
              style={{
                ...s.inp,
                width: 72, padding: "8px 4px",
                cursor: "pointer", textAlign: "center",
                color: "#94a3b8", fontSize: 12,
              }}
            >
              <option value="" disabled>%</option>
              {[10, 20, 25, 30, 50, 70, 75, 80, 90].map(p => (
                <option key={p} value={p}>{p}%</option>
              ))}
            </select>
            {/* MAX — sets full amount, zeros voucher */}
            <button
              onClick={() => {
                setField("amount", Math.round(maxAmount * 100) / 100);
                setField("voucherAmount", 0);
                setForm(p => ({ ...p, hasVoucher: false, createVoucher: false, voucherCode: "", voucherExpiresAt: null }));
              }}
              title="Zwróć całość gotówką"
              style={{
                ...s.actionBtn("#10b981"),
                padding: "8px 14px", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                background: amt > 0 && amt === remaining ? "#10b98122" : "transparent",
                borderColor: "#10b98166",
              }}
            >MAX</button>
          </div>
          {amt > 0 && amt < remaining && (
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
              {Math.round(amt / remaining * 100)}% z {fmt(remaining)} PLN
            </div>
          )}
        </div>


        {/* Month of return */}
        <div style={s.formRow}>
          <label style={s.lbl}>Miesiąc budżetowy zwrotu *</label>
          <MonthInput value={form.moneyReturnedInMonth} onChange={v => setField("moneyReturnedInMonth", v)} minMonth={minMonth} />

          {/* Cross-month info banner */}
          {crossMonth && cashAmt > 0 && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#1a1200", border: "1px solid #f59e0b44", borderRadius: 8, fontSize: 12, color: "#f59e0b" }}>
              ℹ️ Zwrot w innym miesiącu niż zakup — system automatycznie utworzy transakcję
              <strong> TRANSFER › Zwroty</strong> na{" "}
              <strong>
                {form.moneyReturnedInMonth < currentMonth ? currentMonth : form.moneyReturnedInMonth}
              </strong>{" "}
              ({fmt(cashAmt)} PLN gotówka).
              {form.moneyReturnedInMonth < currentMonth && (
                <span style={{ color: "#94a3b8" }}> Kasa wróciła w {form.moneyReturnedInMonth}, ale TRANSFER ląduje w bieżącym miesiącu.</span>
              )}
            </div>
          )}
          {crossMonth && cashAmt === 0 && vchAmt > 0 && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#0a1a0a", border: "1px solid #10b98144", borderRadius: 8, fontSize: 12, color: "#10b981" }}>
              ℹ️ Zwrot tylko voucherem — TRANSFER nie zostanie utworzony. Voucher będzie dostępny do użycia.
            </div>
          )}
        </div>

        {/* Return date */}
        <div style={s.formRow}>
          <label style={s.lbl}>Data faktycznego zwrotu *</label>
          <AppDatePicker
            value={form.returnedAt}
            onChange={d => setField("returnedAt", d)}
            minDate={(() => { const [y, m] = minMonth.split("-").map(Number); return new Date(y, m - 1, 1); })()}
            maxDate={null}
          />
        </div>

        {/* Reason */}
        <div style={s.formRow}>
          <label style={s.lbl}>Powód / opis</label>
          <input
            style={s.inp}
            type="text"
            maxLength={500}
            value={form.reason}
            onChange={e => setField("reason", e.target.value)}
            placeholder="np. uszkodzony produkt, nieodpowiedni rozmiar..."
          />
        </div>

        {/* Voucher toggle — hidden only when full amount is being returned */}
        {(form.amount === "" || amt < remaining) && (
        <div style={{ background: "#0a0f1e", borderRadius: 10, padding: "12px 14px", marginBottom: 14, border: "1px solid #1e293b" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: form.hasVoucher ? 12 : 0 }}>
            <input
              type="checkbox"
              checked={form.hasVoucher || false}
              onChange={e => {
                const checked = e.target.checked;
                setForm(p => ({
                  ...p,
                  hasVoucher:       checked,
                  voucherAmount:    checked ? p.voucherAmount : 0,
                  createVoucher:    false,
                  voucherCode:      "",
                  voucherExpiresAt: null,
                }));
              }}
            />
            <span style={{ fontSize: 13, color: "#e2e8f0" }}>🎫 Część zwrotu to voucher</span>
          </label>

          {form.hasVoucher && (
            <>
              {/* Voucher amount + MAX */}
              <div style={{ marginBottom: 12 }}>
                <label style={s.lbl}>Kwota vouchera (PLN)</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.voucherAmount}
                    onChange={e => {
                      const raw = parseFloat(e.target.value) || 0;
                      setField("voucherAmount", raw > maxVoucher ? maxVoucher : raw);
                    }}
                    placeholder={`max. ${fmt(maxVoucher)}`}
                    style={{ ...s.inp, flex: 1 }}
                  />
                  <button
                    onClick={() => setField("voucherAmount", Math.round(maxVoucher * 100) / 100)}
                    title="Maksymalny voucher"
                    style={{
                      ...s.actionBtn("#a78bfa"),
                      padding: "8px 14px", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                      background: vchAmt > 0 && vchAmt === maxVoucher ? "#a78bfa22" : "transparent",
                      borderColor: "#a78bfa66",
                    }}
                  >MAX</button>
                </div>
                {/* Live cash remainder */}
                {vchAmt > 0 && amt > 0 && (
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    Gotówka:{" "}
                    <strong style={{ color: cashAmt > 0 ? "#10b981" : "#475569" }}>
                      {fmt(cashAmt)} PLN
                    </strong>
                  </div>
                )}
              </div>

              {/* Create new voucher toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: form.createVoucher ? 12 : 0 }}>
                <input
                  type="checkbox"
                  checked={form.createVoucher}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(p => ({
                      ...p,
                      createVoucher:    checked,
                      voucherCode:      checked ? p.voucherCode : "",
                      voucherExpiresAt: checked ? p.voucherExpiresAt : null,
                    }));
                  }}
                />
                <span style={{ fontSize: 13, color: "#e2e8f0" }}>
                  ➕ Utwórz nowy voucher ({fmt(vchAmt)} PLN)
                </span>
              </label>

              {form.createVoucher && (
                <>
                  <div style={s.formRow}>
                    <label style={s.lbl}>Kod vouchera</label>
                    <input
                      style={s.inp}
                      type="text"
                      maxLength={100}
                      value={form.voucherCode}
                      onChange={e => setField("voucherCode", e.target.value)}
                      placeholder="np. ALLEGRO-123 (puste = auto)"
                    />
                  </div>
                  <div style={s.formRow}>
                    <label style={s.lbl}>Data ważności (opcjonalna)</label>
                    <AppDatePicker
                      value={form.voucherExpiresAt}
                      onChange={d => setField("voucherExpiresAt", d)}
                      minDate={todayLocal()}
                      maxDate={null}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button style={s.btn("secondary")} onClick={onClose} disabled={saving}>Anuluj</button>
          <button style={s.btn("primary")}   onClick={handleSubmit} disabled={saving}>
            {saving ? "Zapisuję…" : "🔙 Zapisz zwrot"}
          </button>
        </div>
      </div>
    </div>
  );
}