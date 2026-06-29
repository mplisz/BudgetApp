// ============================================================
// File: src/components/panels/transactionComponents/ReturnModal.jsx
// Refund entry form — supports:
//   - Same-month returns (reduces effectiveAmount)
//   - Cross-month returns (creates TRANSFER in target month)
//   - Cash + voucher split
//   - Voucher creation on return
// ============================================================

import { c, alpha } from "../../../styles/tokens";
import { useState } from "react";
import { useToast }       from "../../../hooks/useToast";
import { useApi }         from "../../../hooks/useApi";
import { AppDatePicker, toYMD, todayLocal } from "../../ui/AppDatePicker";
import { fmt }            from "../../../utils/helpers";
import {
  calculateTotalReturned,
  remainingToReturn,
  canAddReturn,
  isCrossMonthReturn,
  getReturnMonthBounds,
  isReturnMonthAllowed,
} from "../../../utils/returnUtils";
import { s } from "./txStyles";
import type { Transaction } from "../../../types/appContext";

interface MonthInputProps {
  value:    string | null;
  onChange: (value: string) => void;
  minMonth: string;
}

interface ReturnFormState {
  amount:               string | number;
  voucherAmount:        string | number;
  cashAmount:           number;
  hasVoucher:           boolean;
  moneyReturnedInMonth: string;
  returnedAt:           Date | null;
  reason:               string;
  createVoucher:        boolean;
  voucherCode:          string;
  voucherExpiresAt:     Date | null;
}

interface ReturnSideEffects {
  transferCreated?: boolean;
  voucherCreated?:  boolean;
}

interface ReturnResponse {
  warning?:     string;
  transaction:  Transaction;
  sideEffects?: ReturnSideEffects;
}

interface ReturnModalProps {
  tx:                Transaction;
  activeBudgetMonth: string;
  onClose:           () => void;
  onSaved:           (transaction: Transaction, sideEffects?: ReturnSideEffects) => void;
}

// ── Month input — free text YYYY-MM, min = minMonth, no upper limit ──
function MonthInput({ value, onChange, minMonth }: MonthInputProps) {
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
          background: c.bg, border: `1px solid ${isValid ? c.border : alpha(c.danger, "88")}`,
          borderRadius: 8, color: c.text, padding: "9px 12px",
          fontSize: 14, outline: "none",
          colorScheme: "dark",
        }}
      />
      {!isValid && value && (
        <div style={{ fontSize: 11, color: c.dangerLight, marginTop: 4 }}>
          Miesiąc nie może być wcześniejszy niż {minMonth}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ReturnModal
// ─────────────────────────────────────────────────────────────
export function ReturnModal({ tx, activeBudgetMonth, onClose, onSaved }: ReturnModalProps) {
  const api                        = useApi();
  const { showError, showSuccess } = useToast();

  const { minMonth, currentMonth } = getReturnMonthBounds();
  const remaining = Math.round(remainingToReturn(tx) * 100) / 100;
  const totalAlreadyReturned = calculateTotalReturned(tx);

  const [form, setForm] = useState<ReturnFormState>({
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

  function setField(k: keyof ReturnFormState, v: unknown) { setForm(p => ({ ...p, [k]: v })); }

  // Pure cap logic:
  // CAP = remaining
  // amount  <= CAP - voucherAmount
  // voucher <= CAP - amount
  const amt     = parseFloat(String(form.amount))        || 0;
  const vchAmt  = form.hasVoucher ? (parseFloat(String(form.voucherAmount)) || 0) : 0;
  const cashAmt = Math.max(0, amt - vchAmt);

  const maxAmount  = remaining - vchAmt;   // how much left for cash return
  const maxVoucher = remaining - amt;      // how much left for voucher

  const crossMonth = isCrossMonthReturn(tx, form.moneyReturnedInMonth);

  async function handleSubmit() {
    const amount = parseFloat(String(form.amount));
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
      const data = await api.post<ReturnResponse>(`/api/transactions/${tx.id}/returns`, payload, { fallback: "Błąd zapisu zwrotu." });

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
      showError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!canAddReturn(tx)) {
    return (
      <div style={s.modal} onClick={onClose}>
        <div style={s.modalBox} onClick={e => e.stopPropagation()}>
          <div style={s.modalTitle}>🔙 Zwrot</div>
          <div style={{ color: c.dangerLight, fontSize: 14 }}>
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
        <div style={{ background: c.bg, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: c.textTertiary }}>
          <strong style={{ color: c.text }}>{tx.categoryName} › {tx.subcategoryName}</strong>
          {tx.description && <span style={{ color: c.textSecondary }}> — {tx.description}</span>}
          <div style={{ marginTop: 4, display: "flex", gap: 16 }}>
            <span>Kwota: <strong style={{ color: c.text }}>{fmt(tx.amount)} PLN</strong></span>
            {totalAlreadyReturned > 0 && (
              <span style={{ color: c.orange }}>
                Już zwrócono: {fmt(totalAlreadyReturned)} PLN
              </span>
            )}
            <span style={{ color: c.success }}>
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
                color: c.textTertiary, fontSize: 12,
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
                ...s.actionBtn(c.success),
                padding: "8px 14px", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                background: amt > 0 && amt === remaining ? alpha(c.success, "22") : "transparent",
                borderColor: alpha(c.success, "66"),
              }}
            >MAX</button>
          </div>
          {amt > 0 && amt < remaining && (
            <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 4 }}>
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
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#1a1200", border: `1px solid ${alpha(c.warning, "44")}`, borderRadius: 8, fontSize: 12, color: c.warning }}>
              ℹ️ Zwrot w innym miesiącu niż zakup — system automatycznie utworzy transakcję
              <strong> TRANSFER › Zwroty</strong> na{" "}
              <strong>
                {form.moneyReturnedInMonth < currentMonth ? currentMonth : form.moneyReturnedInMonth}
              </strong>{" "}
              ({fmt(cashAmt)} PLN gotówka).
              {form.moneyReturnedInMonth < currentMonth && (
                <span style={{ color: c.textTertiary }}> Kasa wróciła w {form.moneyReturnedInMonth}, ale TRANSFER ląduje w bieżącym miesiącu.</span>
              )}
            </div>
          )}
          {crossMonth && cashAmt === 0 && vchAmt > 0 && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#0a1a0a", border: `1px solid ${alpha(c.success, "44")}`, borderRadius: 8, fontSize: 12, color: c.success }}>
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
        <div style={{ background: c.bg, borderRadius: 10, padding: "12px 14px", marginBottom: 14, border: `1px solid ${c.border}` }}>
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
            <span style={{ fontSize: 13, color: c.text }}>🎫 Część zwrotu to voucher</span>
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
                      ...s.actionBtn(c.voucherLight),
                      padding: "8px 14px", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                      background: vchAmt > 0 && vchAmt === maxVoucher ? alpha(c.voucherLight, "22") : "transparent",
                      borderColor: alpha(c.voucherLight, "66"),
                    }}
                  >MAX</button>
                </div>
                {/* Live cash remainder */}
                {vchAmt > 0 && amt > 0 && (
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    Gotówka:{" "}
                    <strong style={{ color: cashAmt > 0 ? c.success : c.textMuted }}>
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
                <span style={{ fontSize: 13, color: c.text }}>
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