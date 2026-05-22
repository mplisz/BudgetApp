// ============================================================
// File: src/hooks/useTransactionsRange.ts
// Fetches transactions across a date range with simple cache.
// Cache: keeps the last fetched range only — switching back to it = instant.
// ============================================================

import { useState, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./useToast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

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
}

export function useTransactionsRange(): UseTransactionsRangeResult {
  const { fetchWithAuth } = useAuth() as { fetchWithAuth: typeof fetch };
  const { showError }     = useToast() as { showError: (m: string) => void };

  const [transactions, setTransactions] = useState<RangeTransaction[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [currentRange, setCurrentRange] = useState<{ from: string; to: string } | null>(null);

  // Simple in-hook cache: holds the data for the last successful range
  const cacheRef = useRef<{ from: string; to: string; data: RangeTransaction[] } | null>(null);

  const loadRange = useCallback(async (fromMonth: string, toMonth: string) => {
    // Cache hit — instant return
    if (cacheRef.current && cacheRef.current.from === fromMonth && cacheRef.current.to === toMonth) {
      setTransactions(cacheRef.current.data);
      setCurrentRange({ from: fromMonth, to: toMonth });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetchWithAuth(
        `${API_URL}/api/transactions/range?from=${fromMonth}&to=${toMonth}`
      );
      const data = await (res as Response).json();
      if (!(res as Response).ok) {
        throw new Error(data.error || "Failed to fetch range.");
      }
      cacheRef.current = { from: fromMonth, to: toMonth, data };
      setTransactions(data);
      setCurrentRange({ from: fromMonth, to: toMonth });
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, showError]);

  return { transactions, isLoading, loadRange, currentRange };
}
