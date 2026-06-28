// ============================================================
// File: src/components/panels/transactionComponents/VoucherSection.tsx
// Collapsible MULTI-voucher selector.
//
//   - Several vouchers can be stacked on one transaction (or, when reused
//     by the cart, on the whole cart total).
//   - Only vouchers whose store matches the merchant are offered (store is
//     mandatory on vouchers now). No merchant → no list.
//   - Percent vouchers are one-shot: their PLN amount is computed from the
//     gross amount and is not editable.
//   - Fixed (amount) vouchers: editable, capped at remaining balance and
//     at the leftover budget.
// Styles live in ./voucherStyles.
// ============================================================

import { fmt, parseDecimal, round2 } from "../../../utils/helpers";
import { CollapsibleToggle }         from "./CollapsibleToggle";
import {
  vInp, vLbl, vHint, vBox, vRow, vAmountInput, vRemoveBtn,
  vPercentHint, vAddSelect, vBreakdown, vWrap,
} from "./voucherStyles";
import type { Voucher, VoucherAllocation } from "../../../types/transaction";

// UI-side canonicalization for the store filter. The server enforces the
// real rule via cleanMerchant; this only needs to hide non-matching vouchers.
const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

const isPercent = (v: Voucher) => v.valueType === "percent" || v.percentValue != null;

// "description — expiry — value", e.g. "Karta Medicover — 2026-12-31 — −20%"
function voucherLabel(v: Voucher): string {
  const expiry = v.expiresAt || "bezterminowy";
  const value  = isPercent(v) ? `−${v.percentValue}%` : `${fmt(v.remainingValue)} PLN`;
  return `${v.description} — ${expiry} — ${value}`;
}

interface VoucherSectionProps {
  vouchers:    Voucher[];           // active vouchers (already usable-filtered upstream)
  merchant:    string;              // current shop — drives the store filter
  isLoading:   boolean;
  isOpen:      boolean;
  onToggle:    () => void;
  allocations: VoucherAllocation[]; // controlled selection
  amountPLN:   number;
  onChange:    (allocations: VoucherAllocation[]) => void;
}

export function VoucherSection({
  vouchers, merchant, isLoading, isOpen, onToggle,
  allocations, amountPLN, onChange,
}: VoucherSectionProps) {
  const m        = norm(merchant);
  const byId     = (id: string) => vouchers.find(v => v.id === id) ?? null;
  const eligible = vouchers.filter(v => m !== "" && norm(v.store) === m);
  const selected = new Set(allocations.map(a => a.voucherId));
  const addable  = eligible.filter(v => !selected.has(v.id));

  const totalVoucher = round2(allocations.reduce((s, a) => s + (a.amount || 0), 0));
  const netCash      = Math.max(0, round2(amountPLN - totalVoucher));
  const badge        = totalVoucher > 0 ? `−${fmt(totalVoucher)}` : undefined;

  // Leftover budget, optionally excluding one row (for that row's cap).
  const budgetExcluding = (skipIdx = -1) =>
    Math.max(0, round2(amountPLN - allocations.reduce(
      (s, a, i) => (i === skipIdx ? s : s + (a.amount || 0)), 0,
    )));

  // PLN value of a voucher given a remaining budget (+ optional requested
  // amount for editable fixed vouchers).
  function valueFor(v: Voucher, budget: number, requested?: number): number {
    if (isPercent(v)) {
      return round2(Math.min(round2(amountPLN * (v.percentValue || 0) / 100), budget));
    }
    const req = requested != null ? requested : v.remainingValue;
    return round2(Math.min(req, v.remainingValue, budget));
  }

  function addRow(id: string) {
    const v = byId(id);
    if (!v) return;
    onChange([...allocations, { voucherId: id, amount: valueFor(v, budgetExcluding()) }]);
  }
  function removeRow(idx: number) {
    onChange(allocations.filter((_, i) => i !== idx));
  }
  function changeVoucher(idx: number, id: string) {
    if (!id) return removeRow(idx);
    const v = byId(id);
    if (!v) return;
    onChange(allocations.map((a, i) =>
      i === idx ? { voucherId: id, amount: valueFor(v, budgetExcluding(idx)) } : a));
  }
  function changeAmount(idx: number, raw: string) {
    const v = byId(allocations[idx].voucherId);
    if (!v) return;
    const amount = valueFor(v, budgetExcluding(idx), parseDecimal(raw) || 0);
    onChange(allocations.map((a, i) => (i === idx ? { ...a, amount } : a)));
  }

  return (
    <div style={vWrap}>
      <CollapsibleToggle
        icon="🎫"
        label="Vouchery / karty podarunkowe"
        isOpen={isOpen}
        onToggle={onToggle}
        badge={badge}
      />

      {isOpen && (
        <div style={vBox}>
          {isLoading && <div style={vHint}>ładowanie…</div>}

          {!isLoading && m === "" && (
            <div style={vHint}>Wybierz sklep, aby zobaczyć dostępne vouchery.</div>
          )}

          {!isLoading && m !== "" && eligible.length === 0 && (
            <div style={vHint}>Brak voucherów dla tego sklepu.</div>
          )}

          {/* Selected voucher rows */}
          {allocations.map((a, idx) => {
            const v       = byId(a.voucherId);
            const percent = v ? isPercent(v) : false;
            const options = eligible.filter(o => o.id === a.voucherId || !selected.has(o.id));
            return (
              <div key={`${a.voucherId}_${idx}`} style={{ marginBottom: 10 }}>
                <div style={vRow}>
                  <select
                    style={{ ...vInp, flex: 1 }}
                    value={a.voucherId}
                    onChange={e => changeVoucher(idx, e.target.value)}
                  >
                    {!v && <option value={a.voucherId}>(voucher niedostępny)</option>}
                    {options.map(o => (
                      <option key={o.id} value={o.id}>{voucherLabel(o)}</option>
                    ))}
                  </select>

                  <input
                    type="number" step="0.01" min="0"
                    value={a.amount}
                    disabled={percent}
                    title={percent ? "Procent liczony od kwoty transakcji" : undefined}
                    onChange={e => changeAmount(idx, e.target.value)}
                    style={{
                      ...vAmountInput,
                      opacity: percent ? 0.7 : 1,
                      cursor:  percent ? "not-allowed" : "text",
                    }}
                  />

                  <button onClick={() => removeRow(idx)} title="Usuń voucher" style={vRemoveBtn}>✕</button>
                </div>
                {percent && v && (
                  <div style={vPercentHint}>
                    −{v.percentValue}% z {fmt(amountPLN)} PLN = {fmt(a.amount)} PLN
                  </div>
                )}
              </div>
            );
          })}

          {/* Add another voucher */}
          {addable.length > 0 && (
            <div style={{ marginTop: allocations.length ? 4 : 0 }}>
              <label style={vLbl}>Dodaj voucher</label>
              <select
                style={vAddSelect}
                value=""
                onChange={e => { if (e.target.value) addRow(e.target.value); }}
              >
                <option value="">— wybierz —</option>
                {addable.map(v => (
                  <option key={v.id} value={v.id}>{voucherLabel(v)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Breakdown */}
          {allocations.length > 0 && (
            <div style={vBreakdown}>
              <span style={{ color: "#64748b" }}>
                Gotówka: <strong style={{ color: "#10b981" }}>{fmt(netCash)}</strong>
              </span>
              <span style={{ color: "#64748b" }}>
                Vouchery: <strong style={{ color: "#a855f7" }}>{fmt(totalVoucher)}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
