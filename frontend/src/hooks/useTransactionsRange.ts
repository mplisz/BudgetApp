// ============================================================
// File: src/hooks/useTransactionsRange.ts
// Fetches transactions across a date range with multi-range cache.
//
// Cache policy:
//   - Holds up to MAX_CACHE_ENTRIES recent ranges (LRU eviction).
//   - Keyed by "from|to" — switching between PanelAnalytics (6 mies.)
//     and PanelSafetyNet (6 mies.) is now instant in both directions.
//   - In-flight dedup: if two effects request the same range
//     simultaneously, only one network call is made.
//   - Each hook instance has its OWN cache (useRef). If we ever want a
//     truly shared cache across components, move the Map to module scope.
// ============================================================

import { useState, useCallback, useRef } from "react";
import { useToast } from "./useToast";
import { useApi } from "./useApi";

// Use a loose type — the panel computes its own enriched shape
export type RangeTransaction = Record<string, unknown> & {
  id:          string;
  type:        string;
  date:        string;
  budgetMonth: string;
  amount:      number;
};

interface UseTransactionsRangeResult {
  transactions: RangeTransaction[];
  isLoading:    boolean;
  loadRange:    (fromMonth: string, toMonth: string) => Promise<void>;
  currentRange: { from: string; to: string } | null;
  /** Force-evict cached data for a range (or all ranges). Use after mutations. */
  invalidate:   (fromMonth?: string, toMonth?: string) => void;
}

// Tuned for typical user behaviour — usually 2-3 panels using ranges at once.
const MAX_CACHE_ENTRIES = 6;

function rangeKey(from: string, to: string): string {
  return `${from}|${to}`;
}

export function useTransactionsRange(): UseTransactionsRangeResult {
  const api               = useApi();
  const { showError }     = useToast();

  const [transactions, setTransactions] = useState<RangeTransaction[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [currentRange, setCurrentRange] = useState<{ from: string; to: string } | null>(null);

  // LRU cache: Map preserves insertion order, so we re-insert on access to
  // make the entry "most recently used".
  const cacheRef    = useRef<Map<string, RangeTransaction[]>>(new Map());
  // Dedup map: key → in-flight Promise resolving with the data.
  const inFlightRef = useRef<Map<string, Promise<RangeTransaction[]>>>(new Map());

  function touchCache(key: string, data: RangeTransaction[]) {
    // Move-to-end semantics: delete then re-insert.
    cacheRef.current.delete(key);
    cacheRef.current.set(key, data);
    // Evict the oldest entries until under the cap.
    while (cacheRef.current.size > MAX_CACHE_ENTRIES) {
      const oldestKey = cacheRef.current.keys().next().value;
      if (oldestKey === undefined) break;
      cacheRef.current.delete(oldestKey);
    }
  }

  const loadRange = useCallback(async (fromMonth: string, toMonth: string) => {
    const key = rangeKey(fromMonth, toMonth);

    // ── Cache hit ────────────────────────────────────────────
    const cached = cacheRef.current.get(key);
    if (cached) {
      touchCache(key, cached);              // mark as recently used
      setTransactions(cached);
      setCurrentRange({ from: fromMonth, to: toMonth });
      return;
    }

    // ── In-flight dedup ──────────────────────────────────────
    // Two panels can request the same range in the same tick (e.g. on
    // hydration). We share the same promise so the backend sees one call.
    const existing = inFlightRef.current.get(key);
    if (existing) {
      setIsLoading(true);
      try {
        const data = await existing;
        setTransactions(data);
        setCurrentRange({ from: fromMonth, to: toMonth });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // ── Fresh fetch ──────────────────────────────────────────
    setIsLoading(true);
    const promise = api.get<RangeTransaction[]>(
      `/api/transactions/range?from=${fromMonth}&to=${toMonth}`,
      { fallback: "Nie udało się pobrać zakresu transakcji." },
    );
    inFlightRef.current.set(key, promise);

    try {
      const data = await promise;
      touchCache(key, data);
      setTransactions(data);
      setCurrentRange({ from: fromMonth, to: toMonth });
    } catch (err) {
      showError((err as Error).message);
    } finally {
      inFlightRef.current.delete(key);
      setIsLoading(false);
    }
  }, [api, showError]);

  // Manual invalidation — e.g. after a user adds/edits/deletes a transaction
  // we want the next range fetch to bypass cache.
  const invalidate = useCallback((fromMonth?: string, toMonth?: string) => {
    if (fromMonth && toMonth) {
      cacheRef.current.delete(rangeKey(fromMonth, toMonth));
    } else {
      cacheRef.current.clear();
    }
  }, []);

  return { transactions, isLoading, loadRange, currentRange, invalidate };
}
