// ============================================================
// File: src/hooks/useVouchers.ts
// Fetches active vouchers and adjusts remaining values
// based on amounts already reserved in the cart.
// ============================================================

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import type { Voucher, CartItem } from "../types/transaction";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function computeRemaining(v: Voucher): number {
  const used = (v.usedInTransactions || []).reduce((s, u) => s + u.amount, 0);
  return Math.max(0, v.initialValue - used);
}

interface UseVouchersResult {
  vouchers:  Voucher[];   // active vouchers, adjusted for cart reservations
  isLoading: boolean;
}

export function useVouchers(cart: CartItem[] = []): UseVouchersResult {
  const { fetchWithAuth } = useAuth() as { fetchWithAuth: typeof fetch };

  const [rawVouchers, setRawVouchers] = useState<Voucher[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);

  // Fetch active vouchers on mount
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const res  = await fetchWithAuth(`${API_URL}/api/vouchers`);
        const data = await (res as Response).json() as Voucher[];
        if (!(res as Response).ok) return;
        const today = todayYMD();
        setRawVouchers(
          data
            .map(v => ({ ...v, remainingValue: computeRemaining(v) }))
            .filter(v => !v.isArchived && v.remainingValue > 0 && (!v.expiresAt || v.expiresAt >= today))
        );
      } catch {
        // Silently fail — voucher dropdown stays empty
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [fetchWithAuth]);

  // Sum voucher amounts already reserved in the cart (per voucherId)
  const cartReserved = useMemo<Record<string, number>>(() => {
    const reserved: Record<string, number> = {};
    for (const item of cart) {
      if (!item.useVoucher || !item.voucherId) continue;
      reserved[item.voucherId] = (reserved[item.voucherId] || 0) + (item.voucherAmount || 0);
    }
    return reserved;
  }, [cart]);

  // Adjust remaining values for in-cart reservations
  const vouchers = useMemo<Voucher[]>(() =>
    rawVouchers
      .map(v => ({ ...v, remainingValue: Math.max(0, v.remainingValue - (cartReserved[v.id] || 0)) }))
      .filter(v => v.remainingValue > 0),
    [rawVouchers, cartReserved]
  );

  return { vouchers, isLoading };
}
