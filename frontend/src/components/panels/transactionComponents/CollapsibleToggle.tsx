// ============================================================
// File: src/components/panels/transactionComponents/CollapsibleToggle.tsx
// Generic collapsible section header button.
// Used by VoucherSection and any future collapsible form sections.
// ============================================================

import { c, alpha } from "../../../styles/tokens";

interface CollapsibleToggleProps {
  icon:     string;
  label:    string;
  isOpen:   boolean;
  onToggle: () => void;
  /** Optional badge shown on the right (e.g. "−25,00 zł") */
  badge?:   string;
}

export function CollapsibleToggle({ icon, label, isOpen, onToggle, badge }: CollapsibleToggleProps) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        background:    isOpen ? c.border : "transparent",
        border:        `1px solid ${isOpen ? c.borderStrong : c.border}`,
        borderRadius:  8,
        padding:       "8px 12px",
        cursor:        "pointer",
        color:         isOpen ? c.text : c.textMuted,
        fontSize:      13,
        fontWeight:    600,
        marginBottom:  isOpen ? 12 : 0,
        transition:    "all 0.15s",
      }}
    >
      <span>{icon}</span>
      <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 11, fontWeight: 700, color: c.voucher,
          background: alpha(c.voucher, "11"), padding: "1px 8px", borderRadius: 20,
        }}>
          {badge}
        </span>
      )}
      <span style={{ fontSize: 10, color: c.textMuted }}>{isOpen ? "▲" : "▼"}</span>
    </button>
  );
}
