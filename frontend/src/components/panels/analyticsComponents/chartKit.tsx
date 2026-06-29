// ============================================================
// File: src/components/panels/analyticsComponents/chartKit.tsx
// Shared chart primitives for the multi-month analytics panel.
//
// Single source of truth for the dark-theme recharts styling that was
// previously copy-pasted into every chart (tooltip box, axis colours,
// categorical palette, PLN / percent formatters, empty-state). New charts
// import from here; existing ones (AnalyticsPieChart, TopCategoriesBar) can
// be migrated onto these tokens over time to finish the de-duplication.
// ============================================================

import type { CSSProperties } from "react";
import { fmt } from "../../../utils/helpers";
import { c } from "../../../styles/tokens";

// ── Categorical palette ───────────────────────────────────────
// Warm → cool ramp, shared by pies and stacked series. Index with `% length`.
// Deliberately NOT derived from semantic tokens (`c.*`): this is a
// distinguishability ramp ("category N's hue"), a different axis from the
// UI's semantic palette. Kept as raw values so retuning UI semantics can't
// silently collapse two adjacent series into the same colour.
export const CHART_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e",
];

// Named series colours — semantic (income=green, expenses=red, …), so they
// derive from the shared token palette and follow any future re-theme.
export const SERIES = {
  income:     c.success,
  transfers:  c.cyanLight,
  expenses:   c.danger,
  savings:    c.info,
  balance:    c.text,
  limit:      c.textSecondary,
  retirement: c.voucher,
  fixed:      c.indigo,
  variable:   c.warning,
  over:       c.danger,
  movingAvg:  c.warningLight,   // dashed overlay — 3-month avg of expenses
  up:         c.danger,         // spent MORE m/m (worse)
  down:       c.success,        // spent LESS m/m (better)
} as const;

// ── Tooltip / axis tokens ─────────────────────────────────────
export const chartTooltipStyle: CSSProperties = {
  background:   c.surface,
  border:       `1px solid ${c.border}`,
  borderRadius: 8,
};
export const chartTooltipLabelStyle: CSSProperties = { color: c.text };
export const chartTooltipItemStyle: CSSProperties = { color: c.text };

export const AXIS_STROKE    = c.textMuted;
export const AXIS_FONT_SIZE = 11;

// ── Formatters ────────────────────────────────────────────────
export function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}
/** "1 234 zł" — matches the convention already used across analyticsComponents. */
export const plnLabel = (v: unknown): string => `${fmt(toNum(v))} zł`;
/** Bare formatted number, for axis ticks. */
export const plnTick = (v: unknown): string => fmt(toNum(v));
/** "12.3%" */
export const pctLabel = (v: unknown): string => `${toNum(v).toFixed(1)}%`;

// ── Empty state ───────────────────────────────────────────────
export function ChartEmpty({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 0", color: c.textFaint }}>
      {message}
    </div>
  );
}

// ── Domain helper ─────────────────────────────────────────────
/**
 * Retirement savings are identified by category name (IKE / IKZE / PPK live
 * under the "Emerytura" category). Matching on name keeps this robust to
 * category-id changes; swap for a dedicated flag here if one is ever added.
 */
export function isRetirementCategory(name: string | undefined): boolean {
  return /emerytur/i.test(name ?? "");
}
