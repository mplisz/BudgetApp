// ============================================================
// File: src/hooks/useVouchers.ts
// Fetches active vouchers and adjusts remaining values
// based on amounts already reserved in the cart.
// ============================================================

import { useState, useMemo, useEffect } from "react";
import { useApi } from "./useApi";
import type { Voucher, CartItem } from "../types/transaction";

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

const isPercent = (v: Voucher) => v.valueType === "percent" || v.percentValue != null;

// Remaining PLN balance — amount vouchers only. Percent vouchers have no
// depleting balance; their availability is one-shot (see isUsable).
function computeRemaining(v: Voucher): number {
  if (isPercent(v)) return 0;
  const used = (v.usedInTransactions || []).reduce((s, u) => s + u.amount, 0);
  return Math.max(0, v.initialValue - used);
}

// Percent = one-shot → usable only while never used; amount → has balance.
function isUsable(v: Voucher): boolean {
  return isPercent(v)
    ? (v.usedInTransactions || []).length === 0
    : computeRemaining(v) > 0;
}

interface UseVouchersResult {
  vouchers:  Voucher[];   // active vouchers, adjusted for cart reservations
  isLoading: boolean;
}

export function useVouchers(cart: CartItem[] = []): UseVouchersResult {
  const api = useApi();

  const [rawVouchers, setRawVouchers] = useState<Voucher[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);

  // Fetch active vouchers on mount
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data  = await api.get<Voucher[]>("/api/vouchers");
        const today = todayYMD();
        setRawVouchers(
          data
            .map(v => ({ ...v, remainingValue: computeRemaining(v) }))
            .filter(v => !v.isArchived && isUsable(v) && (!v.expiresAt || v.expiresAt >= today))
        );
      } catch {
        // Silently fail — voucher dropdown stays empty
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [api]);

  // Sum voucher amounts already reserved in the cart, per voucherId.
  // Reads the new allocations array, falling back to legacy scalar fields.
  const cartReserved = useMemo<Record<string, number>>(() => {
    const reserved: Record<string, number> = {};
    for (const item of cart) {
      const allocs = item.voucherAllocations
        ?? (item.useVoucher && item.voucherId
              ? [{ voucherId: item.voucherId, amount: item.voucherAmount || 0 }]
              : []);
      for (const a of allocs) {
        reserved[a.voucherId] = (reserved[a.voucherId] || 0) + (a.amount || 0);
      }
    }
    return reserved;
  }, [cart]);

  // Adjust availability for in-cart reservations:
  //   - percent voucher already in the cart → one-shot, so it's gone
  //   - amount  voucher → subtract the reserved amount from its balance
  const vouchers = useMemo<Voucher[]>(() =>
    rawVouchers
      .filter(v => !(isPercent(v) && cartReserved[v.id] != null))
      .map(v => isPercent(v)
        ? v
        : { ...v, remainingValue: Math.max(0, v.remainingValue - (cartReserved[v.id] || 0)) })
      .filter(v => isPercent(v) || v.remainingValue > 0),
    [rawVouchers, cartReserved]
  );

  return { vouchers, isLoading };
}
