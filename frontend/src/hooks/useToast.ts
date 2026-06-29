// ============================================================
// File: src/hooks/useToast.js
// Global toast state — no JSX here, provider is in ToastContainer
// ============================================================

import { createContext, useContext, useState, useCallback, useRef } from "react";

export type ToastType = "error" | "success" | "info" | "warning";

export interface Toast {
  id:      string;
  message: string;
  type:    ToastType;
}

export interface ToastContextValue {
  toasts:      Toast[];
  dismiss:     (id: string) => void;
  showError:   (msg: string) => void;
  showSuccess: (msg: string) => void;
  showInfo:    (msg: string) => void;
  showWarning: (msg: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToastState(): ToastContextValue {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (timerRefs.current[id]) {
      clearTimeout(timerRefs.current[id]);
      delete timerRefs.current[id];
    }
  }, []);

  const show = useCallback((message: string, type: ToastType = "error", duration = 4000) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    timerRefs.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const showError   = useCallback((msg: string) => show(msg, "error",   4000), [show]);
  const showSuccess = useCallback((msg: string) => show(msg, "success", 3000), [show]);
  const showInfo    = useCallback((msg: string) => show(msg, "info",    3000), [show]);
  const showWarning = useCallback((msg: string) => show(msg, "warning", 4000), [show]);


  return { toasts, dismiss, showError, showSuccess, showInfo, showWarning };
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastContainer");
  return ctx;
}