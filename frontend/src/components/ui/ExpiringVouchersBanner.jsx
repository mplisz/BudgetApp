// ============================================================
// File: frontend/src/components/ui/ExpiringVouchersBanner.jsx
// Reusable banner for vouchers expiring within the configured
// warning window. Used in: TransactionForm, PanelVouchers.
//
// Props:
//   vouchers – array of enriched voucher objects (with remainingValue)
//   style    – optional style override for the container
// ============================================================

import { fmt } from "../../utils/helpers";

export function ExpiringVouchersBanner({ vouchers = [], style = {} }) {
  if (!vouchers.length) return null;

  return (
    <div style={{
      background:   "#f9731611",
      border:       "1px solid #f9731633",
      borderRadius: 8,
      padding:      "10px 14px",
      ...style,
    }}>
      <div style={{ fontSize: 11, color: "#f97316", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
        ⚠️ {vouchers.length === 1 ? "Voucher wygasa wkrótce" : `${vouchers.length} vouchery wygasają wkrótce`}
      </div>
      {vouchers.map(v => {
        const days = Math.ceil((new Date(v.expiresAt) - new Date()) / 86400000);
        return (
          <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginTop: 4 }}>
            <span style={{ color: "#94a3b8" }}>
              🎫 <strong style={{ color: "#e2e8f0" }}>{v.name}</strong>
              {" — za "}
              <span style={{ color: "#f97316" }}>
                {days} {days === 1 ? "dzień" : "dni"}
              </span>
              {" "}
              <span style={{ color: "#475569" }}>({v.expiresAt})</span>
            </span>
            <span style={{ color: "#a78bfa", fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>
              {fmt(v.remainingValue)} PLN
            </span>
          </div>
        );
      })}
    </div>
  );
}