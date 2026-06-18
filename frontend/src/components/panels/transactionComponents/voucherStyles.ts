// ============================================================
// File: src/components/panels/transactionComponents/voucherStyles.ts
// Shared inline-style tokens for the voucher UI
// (VoucherSection + the cart-level voucher picker).
// ============================================================

import type { CSSProperties } from "react";

export const vInp: CSSProperties = {
  width: "100%", background: "#0a0f1e", border: "1px solid #1e293b",
  borderRadius: 8, color: "#e2e8f0", padding: "9px 12px",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};

export const vLbl: CSSProperties = {
  display: "block", fontSize: 11, color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.6px",
  fontWeight: 700, marginBottom: 6,
};

export const vHint: CSSProperties = {
  fontSize: 12, color: "#64748b", padding: "4px 0",
};

export const vBox: CSSProperties = {
  marginTop: 4, background: "#0a0f1e", border: "1px solid #1e293b",
  borderRadius: 8, padding: 12,
};

export const vRow: CSSProperties = {
  display: "flex", gap: 8, alignItems: "flex-start",
};

export const vAmountInput: CSSProperties = {
  ...vInp, maxWidth: 120, borderColor: "#a855f744",
};

export const vRemoveBtn: CSSProperties = {
  border: "1px solid #1e293b", background: "transparent",
  color: "#ef4444", borderRadius: 8, padding: "9px 12px",
  cursor: "pointer", fontWeight: 700, lineHeight: 1,
};

export const vPercentHint: CSSProperties = {
  fontSize: 11, color: "#a855f7", marginTop: 3,
};

export const vAddSelect: CSSProperties = {
  ...vInp, color: "#475569",
};

export const vBreakdown: CSSProperties = {
  fontSize: 12, marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap",
  borderTop: "1px solid #1e293b", paddingTop: 10,
};

export const vWrap: CSSProperties = { marginBottom: 16 };
