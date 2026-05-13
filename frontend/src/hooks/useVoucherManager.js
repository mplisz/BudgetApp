// ============================================================
// File: frontend/src/hooks/useVoucherManager.js
// Loads vouchers at bootstrap, exposes CRUD + derived state.
// activeVouchers = not archived, not used, not expired today.
// ============================================================

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAuth }       from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// remainingValue is computed dynamically — never stored
function computeRemaining(v) {
  const used = (v.usedInTransactions || []).reduce((s, u) => s + u.amount, 0);
  return Math.max(0, v.initialValue - used);
}

export function useVoucherManager() {
  const { fetchWithAuth }             = useAuth();
  const { vouchers, setVouchers }     = useAppContext();
  const { showSuccess, showError }    = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  // ── Load ────────────────────────────────────────────────────
  const loadVouchers = useCallback(async (includeArchived = false) => {
    setIsLoading(true);
    try {
      const res  = await fetchWithAuth(
        `${API_URL}/api/vouchers${includeArchived ? "?includeArchived=true" : ""}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd ładowania voucherów.");
      setVouchers(data.map(v => ({ ...v, remainingValue: computeRemaining(v) })));
    } catch (err) {
      showError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, setVouchers, showError]);

  // ── Derived ─────────────────────────────────────────────────
  const today = todayYMD();

  const activeVouchers = useMemo(() =>
    vouchers.filter(v =>
      !v.isArchived &&
      v.remainingValue > 0 &&
      (!v.expiresAt || v.expiresAt >= today)
    ),
    [vouchers, today]
  );

  const expiringVouchers = useMemo(() => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const soonYMD = `${soon.getFullYear()}-${String(soon.getMonth()+1).padStart(2,"0")}-${String(soon.getDate()).padStart(2,"0")}`;
    return activeVouchers.filter(v => v.expiresAt && v.expiresAt <= soonYMD);
  }, [activeVouchers]);

  function getVoucherById(id) {
    return vouchers.find(v => v.id === id) ?? null;
  }

  // ── CRUD ────────────────────────────────────────────────────
  const addVoucher = useCallback(async (payload) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/vouchers`, {
        method: "POST", body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd dodawania vouchera.");
      const enriched = { ...data, remainingValue: computeRemaining(data) };
      setVouchers(prev => [enriched, ...prev]);
      showSuccess("Voucher dodany! 🎫");
      return enriched;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setVouchers, showSuccess, showError]);

  const updateVoucher = useCallback(async (id, patch) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/vouchers/${id}`, {
        method: "PATCH", body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd aktualizacji vouchera.");
      const enriched = { ...data, remainingValue: computeRemaining(data) };
      setVouchers(prev => prev.map(v => v.id === id ? enriched : v));
      showSuccess("Voucher zaktualizowany! ✅");
      return enriched;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setVouchers, showSuccess, showError]);

  const archiveVoucher = useCallback(async (id) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/vouchers/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd archiwizacji.");
      setVouchers(prev => prev.map(v => v.id === id ? { ...v, isArchived: true } : v));
      showSuccess("Voucher zarchiwizowany.");
    } catch (err) {
      showError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setVouchers, showSuccess, showError]);

  return {
    vouchers, activeVouchers, expiringVouchers,
    isLoading, isSaving,
    loadVouchers, getVoucherById,
    addVoucher, updateVoucher, archiveVoucher,
    computeRemaining,
  };
}