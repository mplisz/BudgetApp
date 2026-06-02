// ============================================================
// File: src/components/ui/summaryUi.tsx
// Shared UI primitives for the summary panel family.
// Kept co-located for now; move to src/components/ui/ when
// other panels need them.
// ============================================================

import React from "react";

// ── ProgressBar ───────────────────────────────────────────────

interface ProgressBarProps {
  /** 0–100 (values above 100 are clamped to 100 for the fill) */
  percent: number;
  color: string;
  /** Height in px. Default: 6 */
  height?: number;
  /** Track background. Default: "#0d1424" */
  trackColor?: string;
  style?: React.CSSProperties;
}

export function ProgressBar({
  percent,
  color,
  height = 6,
  trackColor = "#0d1424",
  style,
}: ProgressBarProps) {
  const fill = Math.min(Math.max(percent, 0), 100);
  return (
    <div style={{
      height,
      background: trackColor,
      borderRadius: 99,
      overflow: "hidden",
      ...style,
    }}>
      <div style={{
        height: "100%",
        width: `${fill}%`,
        background: color,
        borderRadius: 99,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

// ── ColorChip ─────────────────────────────────────────────────

interface ColorChipProps {
  label: string;
  color: string;
  /** Controls opacity of background (hex suffix). Default: "22" */
  bgOpacity?: string;
  /** Controls opacity of border (hex suffix). Default: "44" */
  borderOpacity?: string;
  style?: React.CSSProperties;
}

export function ColorChip({
  label,
  color,
  bgOpacity = "22",
  borderOpacity = "44",
  style,
}: ColorChipProps) {
  return (
    <span style={{
      background: `${color}${bgOpacity}`,
      color,
      border: `1px solid ${color}${borderOpacity}`,
      borderRadius: 6,
      padding: "1px 8px",
      fontSize: 11,
      fontWeight: 700,
      display: "inline-block",
      ...style,
    }}>
      {label}
    </span>
  );
}

// ── EmptyState ────────────────────────────────────────────────

interface EmptyStateProps {
  message: string;
  icon?: string;
  /** Vertical padding in px. Default: 20 */
  padding?: number;
}

export function EmptyState({ message, icon, padding = 20 }: EmptyStateProps) {
  return (
    <div style={{
      color: "#475569",
      fontSize: 13,
      textAlign: "center",
      padding: `${padding}px 0`,
    }}>
      {icon && <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>}
      {message}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────

interface CardProps {
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Card({ title, children, style }: CardProps) {
  return (
    <div style={{
      background: "#1e293b",
      borderRadius: 16,
      padding: 20,
      border: "1px solid #334155",
      overflow: "hidden",
      ...style,
    }}>
      {title && (
        <div style={{
          fontWeight: 700,
          color: "#f1f5f9",
          fontSize: 15,
          marginBottom: 16,
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Divider row ───────────────────────────────────────────────
// Thin separator used inside cards between list items.

interface DividerRowProps {
  children: React.ReactNode;
  isLast: boolean;
  style?: React.CSSProperties;
}

export function DividerRow({ children, isLast, style }: DividerRowProps) {
  return (
    <div style={{
      borderBottom: isLast ? "none" : "1px solid #1e293b",
      ...style,
    }}>
      {children}
    </div>
  );
}
