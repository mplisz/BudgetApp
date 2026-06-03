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
  activeColor:  "#10b981",
  activeBorder: "#10b981",
  style: { padding: "6px 14px", fontWeight: 700 },
};

export function ToggleBtn({
  active,
  onClick,
  children,
  activeColor  = "#1e293b",
  activeBorder = "#334155",
  style        = {},
}: ToggleBtnProps) {
  return (
    <button
      onClick={onClick}
      style={{
        background:   active ? activeColor  : "transparent",
        border:       `1px solid ${active ? activeBorder : "#1e293b"}`,
        borderRadius: 6,
        color:        active ? "#fff"       : "#475569",
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
