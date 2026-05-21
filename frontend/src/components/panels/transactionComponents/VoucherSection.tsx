// ============================================================
// File: src/components/panels/transactionComponents/VoucherSection.tsx
// Collapsible voucher selector for TransactionForm.
// Only rendered when EXPENSE category + active vouchers exist.
// ============================================================

import { fmt, parseDecimal } from "../../../utils/helpers";
import { CollapsibleToggle }  from "./CollapsibleToggle";
import type { Voucher }        from "../../../types/transaction";

const inp: React.CSSProperties = {
  width: "100%", background: "#0a0f1e", border: "1px solid #1e293b",
  borderRadius: 8, color: "#e2e8f0", padding: "9px 12px",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};

const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.6px",
  fontWeight: 700, marginBottom: 6,
};

interface VoucherSectionProps {
  vouchers:      Voucher[];
  isLoading:     boolean;
  isOpen:        boolean;
  onToggle:      () => void;
  // Controlled voucher selection
  voucherId:     string;
  voucherAmount: string;
  amountPLN:     number;
  onSelect:      (id: string) => void;
  onAmountChange: (v: string) => void;
}

export function VoucherSection({
  vouchers, isLoading, isOpen, onToggle,
  voucherId, voucherAmount, amountPLN,
  onSelect, onAmountChange,
}: VoucherSectionProps) {
  const selectedVoucher = vouchers.find(v => v.id === voucherId) ?? null;
  const voucherAmt      = parseDecimal(voucherAmount) || 0;
  const netCash         = voucherId ? Math.max(0, amountPLN - voucherAmt) : amountPLN;

  const badge = voucherId && voucherAmt > 0 ? `−${fmt(voucherAmt)}` : undefined;

  return (
    <div style={{ marginBottom: 16 }}>
      <CollapsibleToggle
        icon="🎫"
        label="Voucher / gift card"
        isOpen={isOpen}
        onToggle={onToggle}
        badge={badge}
      />

      {isOpen && (
        <div style={{
          marginTop: 4,
          background: "#0a0f1e",
          border: "1px solid #1e293b",
          borderRadius: 8,
          padding: "12px",
        }}>
          {/* Voucher select */}
          <label style={lbl}>
            Select voucher
            {isLoading && (
              <span style={{ color: "#475569", fontWeight: 400, textTransform: "none", marginLeft: 6 }}>
                loading…
              </span>
            )}
          </label>
          <select
            style={{ ...inp, color: voucherId ? "#e2e8f0" : "#475569" }}
            value={voucherId}
            onChange={e => onSelect(e.target.value)}
            disabled={isLoading}
          >
            <option value="">— no voucher —</option>
            {vouchers.map(v => (
              <option key={v.id} value={v.id}>
                {v.code} ({fmt(v.remainingValue)} PLN remaining)
                {v.expiresAt ? ` · expires ${v.expiresAt}` : ""}
              </option>
            ))}
          </select>

          {/* Voucher amount input + breakdown */}
          {voucherId && selectedVoucher && (
            <div style={{ marginTop: 10 }}>
              <label style={lbl}>Voucher amount (PLN)</label>
              <input
                type="number" step="0.01" min="0"
                max={selectedVoucher.remainingValue}
                value={voucherAmount}
                onChange={e => {
                  const val = parseDecimal(e.target.value) || 0;
                  const max = Math.min(selectedVoucher.remainingValue, amountPLN || Infinity);
                  onAmountChange(String(Math.min(val, max)));
                }}
                style={{ ...inp, maxWidth: 180, borderColor: "#a855f744" }}
              />
              <div style={{ fontSize: 12, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span style={{ color: "#64748b" }}>
                  Cash: <strong style={{ color: "#10b981" }}>{fmt(netCash)}</strong>
                </span>
                <span style={{ color: "#64748b" }}>
                  Voucher: <strong style={{ color: "#a855f7" }}>{fmt(voucherAmt)}</strong>
                </span>
                <span style={{ color: "#64748b" }}>
                  Remaining on voucher:{" "}
                  <strong style={{ color: "#94a3b8" }}>
                    {fmt(selectedVoucher.remainingValue - voucherAmt)}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
