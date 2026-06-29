// ============================================================
// File: src/components/ui/ToggleBtn.tsx
// Generic active/inactive toggle button used across panels.
//
// Props:
//   active       – boolean, controls highlighted state
//   onClick      – handler
//   activeColor  – background when active  (default: "#1e293b")
//   activeBorder – border color when active (default: "#334155")
//   style        – optional extra CSSProperties
//   children     – label / content
//
// Presets (pass as spread):
//   <ToggleBtn {...VIEW_TOGGLE_STYLE} active={...} onClick={...}>...</ToggleBtn>
//
// Usage examples:
//   Sort buttons:   <ToggleBtn active={sortBy === "day"} onClick={() => setSortBy("day")}>📅 Dzień</ToggleBtn>
//   Status filter:  <ToggleBtn active={status === "confirmed"} onClick={...}>✅ Potwierdzone</ToggleBtn>
//   View switcher:  <ToggleBtn {...VIEW_TOGGLE_STYLE} active={view === "list"} onClick={...}>☰ Lista</ToggleBtn>
// ============================================================

import { c } from "../../styles/tokens";
import type { CSSProperties } from "react";

interface ToggleBtnProps {
  active:        boolean;
  onClick:       () => void;
  children:      React.ReactNode;
  activeColor?:  string;
  activeBorder?: string;
  style?:        CSSProperties;
}

// ── Shared preset — green view-mode switcher (Lista / Kalendarz / Grupy)
// Used in PanelRecurring and PanelTransactions header.
export const VIEW_TOGGLE_STYLE: Pick<ToggleBtnProps, "activeColor" | "activeBorder" | "style"> = {
  activeColor:  c.success,
  activeBorder: c.success,
  style: { padding: "6px 14px", fontWeight: 700 },
};

export function ToggleBtn({
  active,
  onClick,
  children,
  activeColor  = c.border,
  activeBorder = c.borderStrong,
  style        = {},
}: ToggleBtnProps) {
  return (
    <button
      onClick={onClick}
      style={{
        background:   active ? activeColor  : "transparent",
        border:       `1px solid ${active ? activeBorder : c.border}`,
        borderRadius: 6,
        color:        active ? c.white       : c.textMuted,
        padding:      "5px 10px",
        fontSize:     12,
        cursor:       "pointer",
        fontWeight:   active ? 700 : 400,
        transition:   "all 0.15s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
