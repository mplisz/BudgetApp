// ============================================================
// File: frontend/src/components/ui/ExpiringVouchersBanner.jsx
// Reusable banner for vouchers expiring within the configured
// warning window. Used in: TransactionForm, PanelVouchers.
//
// Props:
//   vouchers – array of enriched voucher objects (with remainingValue)
//   style    – optional style override for the container
// ============================================================

import { c, alpha } from "../../styles/tokens";
import { fmt } from "../../utils/helpers";
import type { CSSProperties } from "react";
import type { Voucher } from "../../types/transaction";

interface ExpiringVouchersBannerProps {
  vouchers?: Voucher[];
  style?:    CSSProperties;
}

export function ExpiringVouchersBanner({ vouchers = [], style = {} }: ExpiringVouchersBannerProps) {
  if (!vouchers.length) return null;

  return (
    <div style={{
      background:   alpha(c.orange, "11"),
      border:       `1px solid ${alpha(c.orange, "33")}`,
      borderRadius: 8,
      padding:      "10px 14px",
      ...style,
    }}>
      <div style={{ fontSize: 11, color: c.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
        ⚠️ {vouchers.length === 1 ? "Voucher wygasa wkrótce" : `${vouchers.length} vouchery wygasają wkrótce`}
      </div>
      {vouchers.map(v => {
        const days = Math.ceil((new Date(v.expiresAt ?? Date.now()).getTime() - Date.now()) / 86400000);
        return (
          <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginTop: 4 }}>
            <span style={{ color: c.textTertiary }}>
              🎫 <strong style={{ color: c.text }}>{v.description || v.code}</strong>
              {" — za "}
              <span style={{ color: c.orange }}>
                {days} {days === 1 ? "dzień" : "dni"}
              </span>
              {" "}
              <span style={{ color: c.textMuted }}>({v.expiresAt})</span>
            </span>
            <span style={{ color: c.voucherLight, fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>
              {fmt(v.remainingValue)} PLN
            </span>
          </div>
        );
      })}
    </div>
  );
}