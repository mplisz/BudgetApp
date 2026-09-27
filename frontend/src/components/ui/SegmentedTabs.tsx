// ============================================================
// File: src/components/ui/SegmentedTabs.tsx
// A full-width segmented switch: equal segments, the active one filled.
//
// Built for the shopping list, where it is both the tab bar of the panel
// and the "na już / na termin / rozglądam się" choice in a row's ⏱
// picker — one control, so the choice looks the same wherever it is
// made. Generic on purpose: nothing here knows about shopping.
//
// Segments are 44px+ tall — this is tapped one-handed on a phone.
// ============================================================

import { c, alpha } from "../../styles/tokens";
import type { CSSProperties, ReactNode } from "react";

export interface SegmentOption<T extends string> {
  id:     T;
  label:  ReactNode;
  /** Second line under the label — a count, a hint. */
  sub?:   ReactNode;
}

interface SegmentedTabsProps<T extends string> {
  options:   SegmentOption<T>[];
  value:     T | null;
  onChange:  (id: T) => void;
  ariaLabel: string;
  color?:    string;
  style?:    CSSProperties;
}

export function SegmentedTabs<T extends string>({
  options, value, onChange, ariaLabel, color = c.success, style,
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "grid", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 4,
        background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 4,
        ...style,
      }}
    >
      {options.map(o => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            style={{
              minHeight: 44, padding: "6px 4px", borderRadius: 9, cursor: "pointer",
              border: `1px solid ${active ? alpha(color, "88") : "transparent"}`,
              background: active ? alpha(color, "22") : "transparent",
              color: active ? color : c.textSecondary,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 2, lineHeight: 1.15, minWidth: 0,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {o.label}
            </span>
            {o.sub !== undefined && o.sub !== null && (
              <span style={{ fontSize: 11, fontWeight: 600, color: active ? color : c.textMuted }}>{o.sub}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
