// ============================================================
// File: src/styles/theme.js
// Shared inline-style design tokens used across all panels
// ============================================================

export const theme = {
  panel:       { padding: "20px 16px", maxWidth: 480, margin: "0 auto" },
  card:        { background: "#0d1424", border: "1px solid #1e293b", borderRadius: 16, padding: 16, marginBottom: 12 },
  label:       { display: "block", color: "#64748b", fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" },
  input:       { width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 15, outline: "none", boxSizing: "border-box" },
  select:      { width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 15, outline: "none", boxSizing: "border-box", cursor: "pointer" },
  btn:         (color = "#10b981") => ({ background: color, color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", marginTop: 4 }),
  btnSm:       (color = "#10b981") => ({ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  row:         { display: "flex", gap: 10 },
  col:         { flex: 1 },
  sectionTitle:{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", marginBottom: 4, marginTop: 20 },
  sectionSub:  { fontSize: 13, color: "#475569", marginBottom: 16 },
  expenseRow:  { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #1e293b" },
  amount:      (c) => ({ fontWeight: 800, fontSize: 16, color: c || "#10b981" }),
  chip:        (color) => ({ background: (color || "#10b981") + "22", color: color || "#10b981", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }),
  toggle:      (on) => ({ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: on ? "#10b981" : "#475569", fontSize: 13, fontWeight: 600 }),
  toggleBox:   (on) => ({ width: 36, height: 20, background: on ? "#10b981" : "#1e293b", border: `2px solid ${on ? "#10b981" : "#334155"}`, borderRadius: 99, position: "relative", transition: "all 0.2s", flexShrink: 0 }),
  toggleDot:   (on) => ({ position: "absolute", top: 2, left: on ? 16 : 2, width: 12, height: 12, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }),
  statBox:     { background: "#1e293b", borderRadius: 12, padding: "14px 16px", textAlign: "center" },
  statVal:     { fontSize: 22, fontWeight: 800, color: "#10b981" },
  statLab:     { fontSize: 11, color: "#64748b", marginTop: 4 },
  ocrLine:     { background: "#1e293b", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" },
  monthSel:    { display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13 },
  monthBtn:    { background: "#1e293b", border: "none", color: "#94a3b8", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 14 },
};
