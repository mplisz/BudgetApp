// ============================================================
// File: src/components/ui/ToastContainer.jsx
// ToastProvider wraps the app and provides toast context.
// ToastContainer renders active toasts fixed top-right.
// Both live here because this is the only file that needs JSX
// from the toast system.
// ============================================================

import { ToastContext, useToastState, useToast } from "../../hooks/useToast";

const STYLES = {
  error: {
    background: "#1a0a0a",
    border:     "1px solid #ef4444",
    color:      "#f87171",
    icon:       "✕",
  },
  success: {
    background: "#0a1a10",
    border:     "1px solid #10b981",
    color:      "#34d399",
    icon:       "✓",
  },
  info: {
    background: "#0a0f1e",
    border:     "1px solid #3b82f6",
    color:      "#93c5fd",
    icon:       "ℹ",
  },
  warning: {
    background: "#1a1200",
    border:     "1px solid #f59e0b",
    color:      "#fbbf24",
    icon:       "⚠",
  },
}

// ── Provider ──────────────────────────────────────────────────
// Wrap your app once with this — provides toast context to all children.

export function ToastProvider({ children }) {
  const state = useToastState();
  return (
    <ToastContext.Provider value={state}>
      {children}
    </ToastContext.Provider>
  );
}

// ── Container ─────────────────────────────────────────────────
// Mount once inside App — renders toasts in top-right corner.

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div style={{
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
    }}>
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
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}