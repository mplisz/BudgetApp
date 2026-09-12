// ============================================================
// File: src/components/ui/StatTile.tsx
// A compact label / value tile for a row of headline numbers.
//
// Lived in safetyNetComponents/uiBits.tsx while the safety net was its
// only user, under a note calling it too domain-specific for /ui. The
// shopping list's "Szacunkowo" tile made it a second consumer, which
// settled that: it is a generic tile, and a copy would have been the
// second of two drifting implementations.
// ============================================================

import { c } from "../../styles/tokens";
import type { ReactNode } from "react";

interface StatTileProps {
  label:  string;
  value:  ReactNode;
  sub?:   ReactNode;
  color?: string;
  align?: "left" | "right" | "center";
  flex?:  number;
}

export function StatTile({
  label, value, sub, color = c.text, align = "left", flex = 1,
}: StatTileProps) {
  return (
    <div style={{
      flex,
      background:   c.surface,
      border:       `1px solid ${c.border}`,
      borderRadius: 10,
      padding:      "10px 12px",
      minWidth:     0,
    }}>
      <div style={{
        fontSize: 10, color: c.textMuted, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.5px",
        marginBottom: 4, textAlign: align,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 16, fontWeight: 800, color, textAlign: align,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </div>
      {sub !== undefined && sub !== null && sub !== "" && (
        <div style={{
          fontSize: 10, color: c.textMuted, marginTop: 3, textAlign: align,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}
