// ============================================================
// File: src/hooks/useTransactionSearch.ts
// The "all months" scope of the Wydatki product search: asks the backend
// for every expense whose description or a receipt line has the query
// (GET /api/transactions/search), debounced while typing.
//
// The results live here, not in AppContext — the shared `transactions` array
// is the active month, and mixing other months into it would leak them into
// every panel. So edits made on a search result are patched in via update().
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useApi } from "./useApi";
import { useToast } from "./useToast";
import { searchTokens } from "../utils/textSearch";
import type { Transaction } from "../types/appContext";

const DEBOUNCE_MS = 350;

interface SearchResponse { items: Transaction[]; total: number; }

export function useTransactionSearch(query: string, enabled: boolean) {
  const api           = useApi();
  const { showError } = useToast();

  const [items,     setItems]     = useState<Transaction[]>([]);
  const [total,     setTotal]     = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Keyed on the normalised words, so "Guanciale" → "guanciale " refetches nothing.
  const key = enabled ? searchTokens(query).join(" ") : "";

  useEffect(() => {
    if (!key) { setItems([]); setTotal(0); setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<SearchResponse>(
          `/api/transactions/search?q=${encodeURIComponent(key)}`,
          { fallback: "Nie udało się przeszukać transakcji." },
        );
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      } catch (err) {
        if (!cancelled) showError((err as Error).message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, api, showError]);

  /** Replace an edited result (keeps the list in step with the edit modals). */
  const update = useCallback((tx: Transaction) => {
    setItems(prev => prev.map(t => t.id === tx.id ? tx : t));
  }, []);

  /** Drop an archived result. */
  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(t => t.id !== id));
    setTotal(n => Math.max(0, n - 1));
  }, []);

  return { items, total, isLoading, update, remove };
}
