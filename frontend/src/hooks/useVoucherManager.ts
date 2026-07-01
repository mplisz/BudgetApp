// ============================================================
// File: src/hooks/useVoucherManager.ts
// Loads vouchers at bootstrap, exposes CRUD + derived state.
// activeVouchers = not archived, usable, not expired today.
//   amount  voucher → usable while it has remaining balance.
//   percent voucher → one-shot: usable only while never used.
// remainingValue is computed dynamically — never stored (0 for percent).
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";
import { useApi }        from "./useApi";
import { todayYMD }      from "../utils/helpers";
import type { Voucher }  from "../types/transaction";

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

export function useVoucherManager() {
  const api                       = useApi();
  const { vouchers, setVouchers } = useAppContext();
  const { showSuccess, showError } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  // ── Load ────────────────────────────────────────────────────
  const loadVouchers = useCallback(async (includeArchived = false) => {
    setIsLoading(true);
    try {
      const data = await api.get<Voucher[]>(
        `/api/vouchers${includeArchived ? "?includeArchived=true" : ""}`,
        { fallback: "Błąd ładowania voucherów." },
      );
      setVouchers(data.map((v: Voucher) => ({ ...v, remainingValue: computeRemaining(v) })));
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [api, setVouchers, showError]);

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
      const data = await api.post<Voucher>("/api/vouchers", payload, { fallback: "Błąd dodawania vouchera." });
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
  }, [api, setVouchers, showSuccess, showError]);

  const updateVoucher = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const data = await api.patch<Voucher>(`/api/vouchers/${id}`, patch, { fallback: "Błąd aktualizacji vouchera." });
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
  }, [api, setVouchers, showSuccess, showError]);

  const archiveVoucher = useCallback(async (id: string) => {
    setIsSaving(true);
    try {
      await api.del(`/api/vouchers/${id}`, undefined, { fallback: "Błąd archiwizacji." });
      setVouchers(prev => prev.map(v => (v.id === id ? { ...v, isArchived: true } : v)));
      showSuccess("Voucher zarchiwizowany.");
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [api, setVouchers, showSuccess, showError]);

  return {
    vouchers, activeVouchers,
    isLoading, isSaving,
    loadVouchers, getVoucherById,
    addVoucher, updateVoucher, archiveVoucher,
    computeRemaining,
  };
}
