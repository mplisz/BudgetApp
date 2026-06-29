// ============================================================
// File: src/components/panels/transactionComponents/txStyles.tsx
// Shared style constants and helpers for the transactions panel.
// Imported by: PanelTransactions, EditableRow, ReturnModal, …
// Values typed as CSSProperties so consumers use `s.x` without casts.
// ============================================================
import type { CSSProperties } from "react";
import {
  calculateTotalReturned,
  calculateTotalCashReturned,
  calculateTotalVoucherReturned,
  isFullyReturned,
  isPartiallyReturned,
} from "../../../utils/returnUtils";
import { c, alpha } from "../../../styles/tokens";
import type { Transaction } from "../../../types/summary";

export const PRIO_COLORS: Record<number, string> = { 1: c.danger, 2: c.orange, 3: c.amber, 4: c.gray };

export const s = {
  card:        { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 8 } as CSSProperties,
  groupHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", cursor: "pointer", userSelect: "none", background: c.bg } as CSSProperties,
  groupTitle:  { fontWeight: 700, color: c.text, fontSize: 14, display: "flex", alignItems: "center", gap: 8 } as CSSProperties,
  groupSum:    { fontSize: 13, color: c.textTertiary, fontWeight: 600 } as CSSProperties,
  table:       { width: "100%", borderCollapse: "collapse" } as CSSProperties,
  th:          { padding: "8px 12px", fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700, textAlign: "left", borderBottom: `1px solid ${c.border}`, background: c.bgDeepest } as CSSProperties,
  td:          { padding: "10px 12px", fontSize: 13, color: c.textBody, borderBottom: `1px solid ${c.surfaceAlt}`, verticalAlign: "middle" } as CSSProperties,
  badge:       (color: string): CSSProperties => ({ display: "inline-block", padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: alpha(color, "22"), color, border: `1px solid ${alpha(color, "44")}`, marginRight: 3, whiteSpace: "nowrap" }),
  actionBtn:   (color: string = c.textMuted): CSSProperties => ({ background: "transparent", border: `1px solid ${alpha(color, "44")}`, color, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11, fontWeight: 600 }),
  filterRow:   { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" } as CSSProperties,
  filterBox:   { display: "flex", flexDirection: "column", gap: 4 } as CSSProperties,
  filterLabel: { fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700 } as CSSProperties,
  select:      { background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, padding: "7px 10px", fontSize: 13, outline: "none", minWidth: 120 } as CSSProperties,
  inp:         { background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, padding: "7px 10px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" } as CSSProperties,
  totalRow:    { display: "flex", justifyContent: "flex-end", padding: "12px 16px", gap: 24 } as CSSProperties,
  totalLabel:  { fontSize: 12, color: c.textSecondary } as CSSProperties,
  totalVal:    { fontSize: 15, fontWeight: 800, color: c.text } as CSSProperties,
  modal:       { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center" } as CSSProperties,
  modalBox:    { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: "24px 28px", maxWidth: 460, width: "90vw", maxHeight: "80vh", overflowY: "auto" } as CSSProperties,
  modalTitle:  { fontWeight: 800, color: c.text, fontSize: 16, marginBottom: 16 } as CSSProperties,
  lbl:         { display: "block", fontSize: 11, color: c.textSecondary, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 5 } as CSSProperties,
  formRow:     { marginBottom: 14 } as CSSProperties,
  btn:         (variant: string = "primary"): CSSProperties => ({
    padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border:     variant === "primary" ? "none" : `1px solid ${c.border}`,
    background: variant === "primary" ? c.info  : "transparent",
    color:      variant === "primary" ? c.white : c.textTertiary,
  }),
};

export function calcReturns(tx: Transaction) {
  return {
    totalReturnedAmount:  calculateTotalReturned(tx),
    totalReturnedCash:    calculateTotalCashReturned(tx),
    totalReturnedVoucher: calculateTotalVoucherReturned(tx),
    isFullyReturned:      isFullyReturned(tx),
    isPartiallyReturned:  isPartiallyReturned(tx),
  };
}

export function PrioBadge({ value }: { value: number }) {
  return <span style={s.badge(PRIO_COLORS[value] || c.gray)}>P{value}</span>;
}
