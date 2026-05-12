// ============================================================
// File: src/components/ui/ConfirmModal.jsx
// Reusable confirmation modal replacing native window.confirm
// ============================================================

import React from "react";
import { theme as s } from "../../styles/theme";

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(15, 23, 42, 0.85)", // Dark overlay matching your theme
      backdropFilter: "blur(4px)",
      zIndex: 9999,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "20px"
    }}>
      <div style={{
        backgroundColor: "#1e293b", // s.card background
        borderRadius: "12px",
        padding: "24px",
        maxWidth: "400px",
        width: "100%",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        border: "1px solid #334155"
      }}>
        <h3 style={{ margin: "0 0 12px 0", color: "#f8fafc", fontSize: "18px" }}>
          {title}
        </h3>
        <p style={{ margin: "0 0 24px 0", color: "#94a3b8", fontSize: "14px", lineHeight: "1.5" }}>
          {message}
        </p>
        
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button 
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "1px solid #475569",
              color: "#cbd5e1",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "600",
              transition: "0.2s"
            }}
          >
            Anuluj
          </button>
          <button 
            onClick={onConfirm}
            style={{
              background: "#ef4444", // Red for destructive/archive action
              border: "none",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "600",
              boxShadow: "0 4px 6px -1px rgba(239, 68, 68, 0.2)",
              transition: "0.2s"
            }}
          >
            Tak, zarchiwizuj
          </button>
        </div>
      </div>
    </div>
  );
}