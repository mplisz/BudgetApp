// ============================================================
// File: src/components/panels/transactionComponents/voucherStyles.ts
// Shared inline-style tokens for the voucher UI
// (VoucherSection + the cart-level voucher picker).
// Colors come from ../../../styles/tokens.
// ============================================================

import type { CSSProperties } from "react";
import { c, alpha } from "../../../styles/tokens";

export const vInp: CSSProperties = {
  width: "100%", background: c.bg, border: `1px solid ${c.border}`,
  borderRadius: 8, color: c.text, padding: "9px 12px",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};

export const vLbl: CSSProperties = {
  display: "block", fontSize: 11, color: c.textSecondary,
  textTransform: "uppercase", letterSpacing: "0.6px",
  fontWeight: 700, marginBottom: 6,
};

export const vHint: CSSProperties = {
  fontSize: 12, color: c.textSecondary, padding: "4px 0",
};

export const vBox: CSSProperties = {
  marginTop: 4, background: c.bg, border: `1px solid ${c.border}`,
  borderRadius: 8, padding: 12,
};

export const vRow: CSSProperties = {
  display: "flex", gap: 8, alignItems: "flex-start",
};

export const vAmountInput: CSSProperties = {
  ...vInp, maxWidth: 120, borderColor: alpha(c.voucher, "44"),
};

export const vRemoveBtn: CSSProperties = {
  border: `1px solid ${c.border}`, background: "transparent",
  color: c.danger, borderRadius: 8, padding: "9px 12px",
  cursor: "pointer", fontWeight: 700, lineHeight: 1,
};

export const vPercentHint: CSSProperties = {
  fontSize: 11, color: c.voucher, marginTop: 3,
};

export const vAddSelect: CSSProperties = {
  ...vInp, color: c.textMuted,
};

export const vBreakdown: CSSProperties = {
  fontSize: 12, marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap",
  borderTop: `1px solid ${c.border}`, paddingTop: 10,
};

export const vWrap: CSSProperties = { marginBottom: 16 };
