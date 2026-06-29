// ============================================================
// File: src/components/ui/ToastContainer.jsx
// Desktop:  fixed top-right corner (as before).
// Mobile:   fixed top-right, offset below the sticky header.
// Rendered via createPortal → always above every stacking context.
// ============================================================

import { c } from "../../styles/tokens";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ToastContext, useToastState, useToast } from "../../hooks/useToast";
import { useIsMobile } from "../../hooks/useIsMobile";

const STYLES = {
  error: {
    background: "#1a0a0a",
    border:     `1px solid ${c.danger}`,
    color:      c.dangerLight,
    icon:       "✕",
  },
  success: {
    background: "#0a1a10",
    border:     `1px solid ${c.success}`,
    color:      c.successLight,
    icon:       "✓",
  },
  info: {
    background: c.bg,
    border:     `1px solid ${c.info}`,
    color:      c.infoLight,
    icon:       "ℹ",
  },
  warning: {
    background: "#1a1200",
    border:     `1px solid ${c.warning}`,
    color:      c.warningLight,
    icon:       "⚠",
  },
}



// ── Provider ──────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const state = useToastState();
  return (
    <ToastContext.Provider value={state}>
      {children}
    </ToastContext.Provider>
  );
}

// ── Container ─────────────────────────────────────────────────
// Desktop: fixed top-right corner.
// Mobile:  fixed top-right, but offset below the sticky header (~52px).

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  const isMobile = useIsMobile();

  if (toasts.length === 0) return null;

  const containerStyle = isMobile
    ? {
        position:      "fixed",
        top:           56,      // below sticky header (≈44px height + border)
        right:         12,
        left:          12,
        zIndex:        9999,
        display:       "flex",
        flexDirection: "column",
        gap:           8,
        pointerEvents: "none",
      }
    : {
        position:      "fixed",
        top:           16,
        right:         16,
        zIndex:        9999,
        display:       "flex",
        flexDirection: "column",
        gap:           8,
        maxWidth:      360,
        width:         "calc(100vw - 32px)",
        pointerEvents: "none",
      };

  return createPortal(
    <div style={containerStyle}>
      {toasts.map(toast => {
        const st = STYLES[toast.type] || STYLES.error;
        return (
          <div key={toast.id} style={{
            display:       "flex",
            alignItems:    "flex-start",
            gap:           10,
            padding:       "12px 14px",
            borderRadius:  10,
            background:    st.background,
            border:        st.border,
            color:         st.color,
            fontSize:      13,
            fontWeight:    500,
            boxShadow:     "0 4px 24px rgba(0,0,0,0.5)",
            pointerEvents: "all",
            animation:     "toast-in 0.2s ease",
          }}>
            <span style={{
              flexShrink:     0,
              width:          20,
              height:         20,
              borderRadius:   "50%",
              border:         `1px solid ${st.color}`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       11,
              fontWeight:     700,
              marginTop:      1,
            }}>
              {st.icon}
            </span>

            <span style={{ flex: 1, lineHeight: 1.5 }}>{toast.message}</span>

            <button onClick={() => dismiss(toast.id)} style={{
              flexShrink: 0,
              background: "none",
              border:     "none",
              color:      st.color,
              cursor:     "pointer",
              fontSize:   16,
              lineHeight: 1,
              padding:    0,
              opacity:    0.6,
            }}>×</button>
          </div>
        );
      })}

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}