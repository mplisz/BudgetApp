// ============================================================
// File: src/hooks/useToast.js
// Global toast state — no JSX here, provider is in ToastContainer
// ============================================================

import { createContext, useContext, useState, useCallback, useRef } from "react";

export const ToastContext = createContext(null);

export function useToastState() {
  const [toasts, setToasts] = useState([]);
  const timerRefs = useRef({});

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (timerRefs.current[id]) {
      clearTimeout(timerRefs.current[id]);
      delete timerRefs.current[id];
    }
  }, []);

  const show = useCallback((message, type = "error", duration = 4000) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    timerRefs.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const showError   = useCallback((msg) => show(msg, "error",   4000), [show]);
  const showSuccess = useCallback((msg) => show(msg, "success", 3000), [show]);
  const showInfo    = useCallback((msg) => show(msg, "info",    3000), [show]);

  return { toasts, dismiss, showError, showSuccess, showInfo };
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastContainer");
  return ctx;
}