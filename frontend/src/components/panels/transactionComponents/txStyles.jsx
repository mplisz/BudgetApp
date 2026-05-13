// ============================================================
// File: frontend/src/components/panels/transactionComponents/txStyles.jsx
// Shared style constants and helpers for the transactions panel.
// Imported by: PanelTransactions, EditableRow, ReturnModal.
// ============================================================

export const PRIO_COLORS = { 1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#6b7280" };

export const s = {
  card:        { background: "#0d1424", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden", marginBottom: 8 },
  groupHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", cursor: "pointer", userSelect: "none", background: "#0a0f1e" },
  groupTitle:  { fontWeight: 700, color: "#e2e8f0", fontSize: 14, display: "flex", alignItems: "center", gap: 8 },
  groupSum:    { fontSize: 13, color: "#94a3b8", fontWeight: 600 },
  table:       { width: "100%", borderCollapse: "collapse" },
  th:          { padding: "8px 12px", fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700, textAlign: "left", borderBottom: "1px solid #1e293b", background: "#090e1b" },
  td:          { padding: "10px 12px", fontSize: 13, color: "#cbd5e1", borderBottom: "1px solid #0f172a", verticalAlign: "middle" },
  badge:       (color) => ({ display: "inline-block", padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: color + "22", color, border: `1px solid ${color}44`, marginRight: 3, whiteSpace: "nowrap" }),
  actionBtn:   (color = "#475569") => ({ background: "transparent", border: `1px solid ${color}44`, color, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11, fontWeight: 600 }),
  filterRow:   { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" },
  filterBox:   { display: "flex", flexDirection: "column", gap: 4 },
  filterLabel: { fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700 },
  select:      { background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 8, color: "#e2e8f0", padding: "7px 10px", fontSize: 13, outline: "none", minWidth: 120 },
  inp:         { background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 8, color: "#e2e8f0", padding: "7px 10px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" },
  totalRow:    { display: "flex", justifyContent: "flex-end", padding: "12px 16px", gap: 24 },
  totalLabel:  { fontSize: 12, color: "#64748b" },
  totalVal:    { fontSize: 15, fontWeight: 800, color: "#e2e8f0" },
  modal:       { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center" },
  modalBox:    { background: "#0d1424", border: "1px solid #1e293b", borderRadius: 14, padding: "24px 28px", maxWidth: 460, width: "90vw", maxHeight: "80vh", overflowY: "auto" },
  modalTitle:  { fontWeight: 800, color: "#e2e8f0", fontSize: 16, marginBottom: 16 },
  lbl:         { display: "block", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700, marginBottom: 5 },
  formRow:     { marginBottom: 14 },
  btn:         (variant = "primary") => ({
    padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border:     variant === "primary" ? "none" : "1px solid #1e293b",
    background: variant === "primary" ? "#3b82f6" : "transparent",
    color:      variant === "primary" ? "#fff"   : "#94a3b8",
  }),
};

// Derives return totals and status flags from a transaction document
export function calcReturns(tx) {
  const returns = tx.returns || [];
  const totalReturnedAmount  = returns.reduce((sum, r) => sum + r.amount, 0);
  const totalReturnedCash    = returns.reduce((sum, r) => sum + (r.cashAmount    || 0), 0);
  const totalReturnedVoucher = returns.reduce((sum, r) => sum + (r.voucherAmount || 0), 0);
  const isFullyReturned     = totalReturnedAmount >= tx.amount;
  const isPartiallyReturned = totalReturnedAmount > 0 && !isFullyReturned;
  return { totalReturnedAmount, totalReturnedCash, totalReturnedVoucher, isFullyReturned, isPartiallyReturned };
}

export function PrioBadge({ value }) {
  return <span style={s.badge(PRIO_COLORS[value] || "#6b7280")}>P{value}</span>;
}