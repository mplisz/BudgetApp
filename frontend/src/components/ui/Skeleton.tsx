// ============================================================
// File: src/components/ui/Skeleton.tsx
//
// Loading placeholders that replace "Ładowanie..." text with
// shape-preserving grey blocks. Pulses with a subtle CSS animation
// so the user sees the app is alive while data fetches.
//
// Design notes:
//   - Pulse keyframes injected ONCE at module level via a tagged
//     <style> element. No external dependencies, no global CSS file
//     to touch.
//   - Colors picked to match the dark theme (#1e293b → #334155
//     pulse on #0d1424 cards).
//   - "Mix" API: low-level <Skeleton> primitive for one-off shapes
//     and 4 composition components for the patterns we actually use:
//
//     <SkeletonText />      — single greyed-out line (paragraph-like)
//     <SkeletonKpiCard />   — KPI card with icon, value, label slots
//     <SkeletonListRow />   — table/list row with several columns
//     <SkeletonChart />     — block shape for chart/graph area
//
// Usage:
//   const { isLoading, data } = useSomething();
//   if (isLoading) return <SkeletonKpiCard />;
//   return <RealCard data={data} />;
//
// Or render alongside real content when only PART of a panel is loading.
// ============================================================

import { CSSProperties, ReactNode, useEffect } from "react";

// ── Inject pulse animation once ──────────────────────────────
// Marked with an ID so we don't add it multiple times even with
// React StrictMode / HMR double-mounting.

const PULSE_STYLE_ID = "skeleton-pulse-keyframes";
const PULSE_CSS = `
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}
`;

function ensurePulseStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = PULSE_STYLE_ID;
  tag.textContent = PULSE_CSS;
  document.head.appendChild(tag);
}

// ── Primitive ────────────────────────────────────────────────

interface SkeletonProps {
  width?:    number | string;
  height?:   number | string;
  /** Border radius in px. Use 999 for pill. Default 6. */
  rounded?:  number;
  /** Background color — defaults to a value matching the dark theme. */
  color?:    string;
  /** Inline margin / display tweaks. */
  style?:    CSSProperties;
}

export function Skeleton({
  width    = "100%",
  height   = 14,
  rounded  = 6,
  color    = "#1e293b",
  style,
}: SkeletonProps) {
  // Inject keyframes lazily. Hooks rules say useEffect, but we want this
  // to run synchronously during render so the first paint already has
  // the animation. ensurePulseStyle is idempotent.
  ensurePulseStyle();

  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        background:   color,
        borderRadius: rounded,
        animation:    "skeleton-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

// ── SkeletonText ─────────────────────────────────────────────
// Multiple lines of text — use for description paragraphs.

interface SkeletonTextProps {
  /** Number of lines. Default 1. */
  lines?:     number;
  /** Height of each line. Default 12. */
  lineHeight?: number;
  /** Vertical gap between lines. Default 8. */
  gap?:       number;
  /** Make the last line shorter (more realistic). Default true. */
  lastShort?: boolean;
  style?:     CSSProperties;
}

export function SkeletonText({
  lines      = 1,
  lineHeight = 12,
  gap        = 8,
  lastShort  = true,
  style,
}: SkeletonTextProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={lastShort && i === lines - 1 && lines > 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}

// ── SkeletonKpiCard ──────────────────────────────────────────
// Mimics a KPI tile: icon block + value + label.
// Use in Summary, Safety Net dashboards.

interface SkeletonKpiCardProps {
  /** Card height. Default 90. */
  height?: number;
  style?:  CSSProperties;
}

export function SkeletonKpiCard({ height = 90, style }: SkeletonKpiCardProps) {
  return (
    <div style={{
      background:   "#0d1424",
      border:       "1px solid #1e293b",
      borderRadius: 12,
      padding:      14,
      height,
      display:      "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      ...style,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Skeleton width={28} height={28} rounded={8} />
        <Skeleton width={80} height={10} />
      </div>
      <Skeleton width="70%" height={22} />
    </div>
  );
}

// ── SkeletonListRow ──────────────────────────────────────────
// Table row with N "columns" — use in Transactions, lists.

interface SkeletonListRowProps {
  /** Number of column-blocks per row. Default 4. */
  columns?:    number;
  /** Row height. Default 50. */
  height?:     number;
  /** Render N copies of this row. Default 1. */
  count?:      number;
  style?:      CSSProperties;
}

export function SkeletonListRow({
  columns = 4,
  height  = 50,
  count   = 1,
  style,
}: SkeletonListRowProps) {
  // Build a "looks-like-a-row" template: first col wider (icon + label),
  // last col narrow (amount/right-aligned), middle ones medium.
  const widths = Array.from({ length: columns }).map((_, i) => {
    if (i === 0) return "30%";
    if (i === columns - 1) return "15%";
    return "20%";
  });

  const rows = Array.from({ length: count });
  return (
    <div style={style}>
      {rows.map((_, rowIdx) => (
        <div key={rowIdx} style={{
          display:        "flex",
          alignItems:     "center",
          gap:            12,
          padding:        "12px 0",
          borderBottom:   rowIdx === rows.length - 1 ? "none" : "1px solid #1e293b",
          height,
          boxSizing:      "border-box",
        }}>
          {widths.map((w, colIdx) => (
            <div key={colIdx} style={{ width: w }}>
              <Skeleton height={12} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── SkeletonChart ────────────────────────────────────────────
// Big block in card shape — for chart placeholders.

interface SkeletonChartProps {
  /** Chart area height in px. Default 200. */
  height?: number;
  /** Show fake legend dots above? Default true. */
  legend?: boolean;
  style?:  CSSProperties;
}

export function SkeletonChart({ height = 200, legend = true, style }: SkeletonChartProps) {
  return (
    <div style={style}>
      {legend && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Skeleton width={10} height={10} rounded={2} />
              <Skeleton width={60} height={10} />
            </div>
          ))}
        </div>
      )}
      <Skeleton height={height} rounded={10} />
    </div>
  );
}

// ── SkeletonCard ─────────────────────────────────────────────
// Full-card skeleton (title + body) — generic catch-all for sections
// where we don't have a specific composition.

interface SkeletonCardProps {
  /** Card body height. Default 120. */
  height?:   number;
  /** Show title row. Default true. */
  title?:    boolean;
  children?: ReactNode;
  style?:    CSSProperties;
}

export function SkeletonCard({ height = 120, title = true, children, style }: SkeletonCardProps) {
  return (
    <div style={{
      background:   "#0d1424",
      border:       "1px solid #1e293b",
      borderRadius: 14,
      padding:      18,
      ...style,
    }}>
      {title && <Skeleton width="40%" height={16} style={{ marginBottom: 14 }} />}
      {children ?? <Skeleton height={height} rounded={8} />}
    </div>
  );
}
