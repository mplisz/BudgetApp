// ============================================================
// File: src/styles/theme.ts
// Shared inline-style design tokens used across all panels.
// Colors come from ./tokens (the single source of truth) — no raw
// hex literals should live here anymore.
//
// Every value is typed as CSSProperties so consumers can use `s.input`
// directly (no `(s as any)` casts): the explicit type preserves the CSS
// literal unions (e.g. textTransform: "uppercase") that a plain object
// literal would widen to `string`.
// ============================================================

import type { CSSProperties } from "react";
import { c, alpha } from "./tokens";

export const theme = {
  panel:       { padding: "20px 16px", maxWidth: 480, margin: "0 auto" } as CSSProperties,
  card:        { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 16, marginBottom: 12 } as CSSProperties,
  label:       { display: "block", color: c.textSecondary, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" } as CSSProperties,
  input:       { width: "100%", background: c.raised, border: `1px solid ${c.borderStrong}`, borderRadius: 10, padding: "10px 14px", color: c.text, fontSize: 15, outline: "none", boxSizing: "border-box" } as CSSProperties,
  select:      { width: "100%", background: c.raised, border: `1px solid ${c.borderStrong}`, borderRadius: 10, padding: "10px 14px", color: c.text, fontSize: 15, outline: "none", boxSizing: "border-box", cursor: "pointer" } as CSSProperties,
  btn:         (color: string = c.success): CSSProperties => ({ background: color, color: c.white, border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", marginTop: 4 }),
  btnSm:       (color: string = c.success): CSSProperties => ({ background: alpha(color, "22"), color, border: `1px solid ${alpha(color, "44")}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  row:         { display: "flex", gap: 10 } as CSSProperties,
  col:         { flex: 1 } as CSSProperties,
  sectionTitle:{ fontSize: 20, fontWeight: 800, color: c.textStrong, marginBottom: 4, marginTop: 20 } as CSSProperties,
  sectionSub:  { fontSize: 13, color: c.textMuted, marginBottom: 16 } as CSSProperties,
  expenseRow:  { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${c.border}` } as CSSProperties,
  amount:      (col?: string): CSSProperties => ({ fontWeight: 800, fontSize: 16, color: col || c.success }),
  chip:        (color?: string): CSSProperties => ({ background: alpha(color || c.success, "22"), color: color || c.success, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }),
  toggle:      (on: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: on ? c.success : c.textMuted, fontSize: 13, fontWeight: 600 }),
  toggleBox:   (on: boolean): CSSProperties => ({ width: 36, height: 20, background: on ? c.success : c.raised, border: `2px solid ${on ? c.success : c.borderStrong}`, borderRadius: 99, position: "relative", transition: "all 0.2s", flexShrink: 0 }),
  toggleDot:   (on: boolean): CSSProperties => ({ position: "absolute", top: 2, left: on ? 16 : 2, width: 12, height: 12, background: c.white, borderRadius: "50%", transition: "left 0.2s" }),
  statBox:     { background: c.raised, borderRadius: 12, padding: "14px 16px", textAlign: "center" } as CSSProperties,
  statVal:     { fontSize: 22, fontWeight: 800, color: c.success } as CSSProperties,
  statLab:     { fontSize: 11, color: c.textSecondary, marginTop: 4 } as CSSProperties,
  ocrLine:     { background: c.raised, borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" } as CSSProperties,
  monthSel:    { display: "flex", alignItems: "center", gap: 8, color: c.textSecondary, fontSize: 13 } as CSSProperties,
  monthBtn:    { background: c.raised, border: "none", color: c.textTertiary, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 14 } as CSSProperties,
};
