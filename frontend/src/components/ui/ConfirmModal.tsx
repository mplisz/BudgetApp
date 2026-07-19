// ============================================================
// File: src/components/ui/ConfirmModal.jsx
// ============================================================

import { c } from "../../styles/tokens";
import type { ReactNode } from "react";

interface ConfirmModalProps {
  isOpen:    boolean;
  title:     string;
  message:   string;
  onConfirm: () => void;
  onCancel:  () => void;
  /** Optional extra content (inputs etc.) rendered between message and buttons. */
  children?: ReactNode;
}

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, children }: ConfirmModalProps) {
  if (!isOpen) return null;
  return (
    <div
      data-modal="true"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex", justifyContent: "center", alignItems: "center",
        padding: "20px",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: c.border,
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "400px",
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: `1px solid ${c.borderStrong}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 12px 0", color: c.textBrightest, fontSize: "18px" }}>
          {title}
        </h3>
        <p style={{ margin: "0 0 24px 0", color: c.textTertiary, fontSize: "14px", lineHeight: "1.5", whiteSpace: "pre-line" }}>
          {message}
        </p>

        {children && <div style={{ marginBottom: 20 }}>{children}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button
            onClick={onCancel}
            style={{
              background: "transparent", border: `1px solid ${c.textMuted}`,
              color: c.textBody, padding: "8px 16px", borderRadius: "6px",
              cursor: "pointer", fontWeight: "600",
            }}
          >
            Anuluj
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: c.danger, border: "none",
              color: c.white, padding: "8px 16px", borderRadius: "6px",
              cursor: "pointer", fontWeight: "600",
            }}
          >
            Tak, zarchiwizuj
          </button>
        </div>
      </div>
    </div>
  );
}