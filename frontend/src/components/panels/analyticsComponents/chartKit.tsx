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

// ── Categorical palette ───────────────────────────────────────
// Warm → cool ramp, shared by pies and stacked series. Index with `% length`.
export const CHART_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e",
];

// Named series colours — kept in sync with MonthlyTrendChart so the same
// concept is always the same colour across the whole panel.
export const SERIES = {
  income:     "#10b981",
  transfers:  "#22d3ee",
  expenses:   "#ef4444",
  savings:    "#3b82f6",
  balance:    "#e2e8f0",
  limit:      "#64748b",
  retirement: "#a855f7",
  fixed:      "#6366f1",
  variable:   "#f59e0b",
  over:       "#ef4444",
  movingAvg:  "#fbbf24",   // dashed overlay — 3-month avg of expenses
  up:         "#ef4444",   // spent MORE m/m (worse)
  down:       "#10b981",   // spent LESS m/m (better)
} as const;

// ── Tooltip / axis tokens ─────────────────────────────────────
export const chartTooltipStyle: CSSProperties = {
  background:   "#0d1424",
  border:       "1px solid #1e293b",
  borderRadius: 8,
};
export const chartTooltipLabelStyle: CSSProperties = { color: "#e2e8f0" };
export const chartTooltipItemStyle: CSSProperties = { color: "#e2e8f0" };

export const AXIS_STROKE    = "#475569";
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
    <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
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
