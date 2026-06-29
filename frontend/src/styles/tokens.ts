// ============================================================
// File: src/styles/tokens.ts
// Single source of truth for the app's color palette.
//
// Until now the same ~6 hex values were copy-pasted ~850 times across
// 100+ files. This module names them semantically so there is ONE place
// to retune the theme (or add a light mode later). The values are the
// existing Tailwind-derived palette — no shade changes, just extraction.
//
// Usage:
//   import { c, alpha } from "../styles/tokens";
//   style={{ background: c.surface, border: `1px solid ${c.border}` }}
//   style={{ background: alpha(c.success, 0x22) }}   // tinted fill
// ============================================================

export const c = {
  // ── Surfaces (dark → light) ────────────────────────────────
  bgDeepest:   "#090e1b",   // table headers, deepest wells
  bg:          "#0a0f1e",   // app background, inputs
  surface:     "#0d1424",   // cards, panels, dropdowns, modals
  surfaceAlt:  "#0f172a",   // subtle row dividers / alt surface
  surfaceAlt2: "#131a2c",   // raised alt surface (rare)
  raised:      "#1e293b",   // chips, stat boxes, raised rows

  // ── Borders ────────────────────────────────────────────────
  border:       "#1e293b",  // default hairline border (same value as `raised`)
  borderStrong: "#334155",  // input / control borders

  // ── Text (faint → bright) ──────────────────────────────────
  textFaint:     "#334155", // de-emphasized meta (same value as borderStrong)
  textMuted:     "#475569",
  textSecondary: "#64748b",
  textTertiary:  "#94a3b8",
  textBody:      "#cbd5e1",
  text:          "#e2e8f0", // primary body text
  textStrong:    "#f1f5f9", // headings
  textBrightest: "#f8fafc",
  white:         "#fff",

  // ── Brand / status ─────────────────────────────────────────
  success:      "#10b981",  // primary action, positive amounts
  successLight: "#34d399",
  successDark:  "#064e3b",
  successBrite: "#22c55e",

  danger:       "#ef4444",
  dangerLight:  "#f87171",
  dangerSoft:   "#fca5a5",
  rose:         "#f43f5e",

  warning:      "#f59e0b",
  warningLight: "#fbbf24",
  warningDark:  "#92710a",
  amber:        "#eab308",
  orange:       "#f97316",

  info:         "#3b82f6",
  infoSky:      "#60a5fa",
  infoLight:    "#93c5fd",

  voucher:      "#a855f7",  // purple — vouchers / gift cards
  voucherLight: "#a78bfa",
  purpleDeep:   "#7c3aed",
  indigo:       "#6366f1",

  cyan:         "#06b6d4",
  cyanLight:    "#22d3ee",
  lime:         "#84cc16",
  pink:         "#ec4899",
  gray:         "#6b7280",  // neutral (e.g. lowest priority)
} as const;

export type ColorToken = keyof typeof c;

// Append an 8-bit alpha channel to a 6-digit hex color, mirroring the
// existing `color + "22"` tint idiom. Accepts a number (0x00–0xff) or a
// raw 2-char hex string.
//   alpha(c.success, 0x22)  → "#10b98122"
//   alpha(c.info, "55")     → "#3b82f655"
export function alpha(hex: string, a: number | string): string {
  const hh = typeof a === "number" ? a.toString(16).padStart(2, "0") : a;
  return `${hex}${hh}`;
}
