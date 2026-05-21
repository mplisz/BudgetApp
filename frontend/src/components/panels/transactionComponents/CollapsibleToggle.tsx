// ============================================================
// File: src/components/panels/transactionComponents/CollapsibleToggle.tsx
// Generic collapsible section header button.
// Used by VoucherSection and any future collapsible form sections.
// ============================================================

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
        background:    isOpen ? "#1e293b" : "transparent",
        border:        `1px solid ${isOpen ? "#334155" : "#1e293b"}`,
        borderRadius:  8,
        padding:       "8px 12px",
        cursor:        "pointer",
        color:         isOpen ? "#e2e8f0" : "#475569",
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
          fontSize: 11, fontWeight: 700, color: "#a855f7",
          background: "#a855f711", padding: "1px 8px", borderRadius: 20,
        }}>
          {badge}
        </span>
      )}
      <span style={{ fontSize: 10, color: "#475569" }}>{isOpen ? "▲" : "▼"}</span>
    </button>
  );
}
