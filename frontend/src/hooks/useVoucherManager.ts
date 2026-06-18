// ============================================================
// File: src/hooks/useVoucherManager.ts
// Loads vouchers at bootstrap, exposes CRUD + derived state.
// activeVouchers = not archived, usable, not expired today.
//   amount  voucher → usable while it has remaining balance.
//   percent voucher → one-shot: usable only while never used.
// remainingValue is computed dynamically — never stored (0 for percent).
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useAuth }       from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";
import type { Voucher }  from "../types/transaction";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const isPercent = (v: Voucher) => v.valueType === "percent" || v.percentValue != null;

// remainingValue is computed dynamically — never stored.
// Percent vouchers have no depleting balance → 0.
function computeRemaining(v: Voucher): number {
  if (isPercent(v)) return 0;
  const used = (v.usedInTransactions || []).reduce((s, u) => s + u.amount, 0);
  return Math.max(0, v.initialValue - used);
}

// Percent = one-shot (usable only while never used); amount = has balance.
function isUsable(v: Voucher): boolean {
  return isPercent(v)
    ? (v.usedInTransactions || []).length === 0
    : computeRemaining(v) > 0;
}

interface AppCtx {
  vouchers:    Voucher[];
  setVouchers: (v: Voucher[] | ((prev: Voucher[]) => Voucher[])) => void;
}

export function useVoucherManager() {
  const { fetchWithAuth }         = useAuth() as { fetchWithAuth: typeof fetch };
  const { vouchers, setVouchers } = useAppContext() as AppCtx;
  const { showSuccess, showError } = useToast() as {
    showSuccess: (m: string) => void;
    showError:   (m: string) => void;
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  // ── Load ────────────────────────────────────────────────────
  const loadVouchers = useCallback(async (includeArchived = false) => {
    setIsLoading(true);
    try {
      const res  = await fetchWithAuth(
        `${API_URL}/api/vouchers${includeArchived ? "?includeArchived=true" : ""}`,
      );
      const data = await (res as Response).json();
      if (!(res as Response).ok) throw new Error(data.error || "Błąd ładowania voucherów.");
      setVouchers(data.map((v: Voucher) => ({ ...v, remainingValue: computeRemaining(v) })));
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, setVouchers, showError]);

  // ── Derived ─────────────────────────────────────────────────
  const today = todayYMD();

  const activeVouchers = useMemo<Voucher[]>(() =>
    vouchers.filter(v =>
      !v.isArchived &&
      isUsable(v) &&
      (!v.expiresAt || v.expiresAt >= today),
    ),
    [vouchers, today],
  );

  function getVoucherById(id: string): Voucher | null {
    return vouchers.find(v => v.id === id) ?? null;
  }

  // ── CRUD ────────────────────────────────────────────────────
  const addVoucher = useCallback(async (payload: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/vouchers`, {
        method: "POST", body: JSON.stringify(payload),
      });
      const data = await (res as Response).json();
      if (!(res as Response).ok) throw new Error(data.error || "Błąd dodawania vouchera.");
      const enriched = { ...data, remainingValue: computeRemaining(data) };
      setVouchers(prev => [enriched, ...prev]);
      showSuccess("Voucher dodany! 🎫");
      return enriched;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setVouchers, showSuccess, showError]);

  const updateVoucher = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/vouchers/${id}`, {
        method: "PATCH", body: JSON.stringify(patch),
      });
      const data = await (res as Response).json();
      if (!(res as Response).ok) throw new Error(data.error || "Błąd aktualizacji vouchera.");
      const enriched = { ...data, remainingValue: computeRemaining(data) };
      setVouchers(prev => prev.map(v => (v.id === id ? enriched : v)));
      showSuccess("Voucher zaktualizowany! ✅");
      return enriched;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setVouchers, showSuccess, showError]);

  const archiveVoucher = useCallback(async (id: string) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/vouchers/${id}`, { method: "DELETE" });
      const data = await (res as Response).json();
      if (!(res as Response).ok) throw new Error(data.error || "Błąd archiwizacji.");
      setVouchers(prev => prev.map(v => (v.id === id ? { ...v, isArchived: true } : v)));
      showSuccess("Voucher zarchiwizowany.");
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setVouchers, showSuccess, showError]);

  return {
    vouchers, activeVouchers,
    isLoading, isSaving,
    loadVouchers, getVoucherById,
    addVoucher, updateVoucher, archiveVoucher,
    computeRemaining,
  };
}
