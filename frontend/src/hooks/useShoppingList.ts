// ============================================================
// File: src/hooks/useShoppingList.ts
// Owns the shopping list: the items and the suggestion catalog that
// feeds the "Najczęstsze" pills and the autocomplete.
//
// Every mutation is OPTIMISTIC and rolls back on failure. This panel is
// used one-handed in a shop, on whatever signal the building has — a
// tick-off that waits for a round-trip before moving feels broken, and
// the cost of being wrong is one item flipping back with a toast.
//
// Deliberately NOT in AppContext: nothing outside this panel reads the
// list, and bootstrapping it on every app start would spend a request
// on data most sessions never open.
// ============================================================

import { useState, useCallback, useRef } from "react";
import { useApi } from "./useApi";
import { useToast } from "./useToast";

export type ShoppingStatus = "open" | "bought" | "skipped";

export interface ShoppingItem {
  id:           string;
  key:          string;
  name:         string;
  qty:          number;
  unit:         string | null;
  note:         string;
  /** Shop section id — see data/constants/shoppingSections. Assigned by
   *  the server (remembered per product, else guessed from the name). */
  section:      string;
  status:       ShoppingStatus;
  missedAt:     string | null;
  missedCount:  number;
  sourceWishId: string | null;
  addedBy:      string | null;
  addedAt:      string;
  resolvedBy:   string | null;
  resolvedAt:   string | null;
}

export interface CatalogEntry {
  key:         string;
  name:        string;
  unit:        string | null;
  /** Last section this product was filed under, once someone corrected
   *  it by hand. null means the guesser still decides. */
  section:     string | null;
  count:       number;
  firstUsedAt: string;
  lastUsedAt:  string;
}

interface PanelState {
  items:   ShoppingItem[];
  catalog: CatalogEntry[];
}

export interface AddItemPayload {
  name:          string;
  qty?:          number;
  unit?:         string | null;
  note?:         string;
  /** Omit to let the server work it out — an explicit value is the user
   *  overruling both the remembered section and the guesser. */
  section?:      string | null;
  sourceWishId?: string | null;
}

export function useShoppingList() {
  const api = useApi();
  const { showError, showSuccess } = useToast();

  const [items,     setItems]     = useState<ShoppingItem[]>([]);
  const [catalog,   setCatalog]   = useState<CatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // First load done? Distinguishes "empty list" from "not fetched yet",
  // so the panel shows a skeleton instead of "Pusto" on arrival.
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<PanelState>("/api/shopping", {
        fallback: "Nie udało się pobrać listy zakupów.",
      });
      setItems(data.items ?? []);
      setCatalog(data.catalog ?? []);
      loadedRef.current = true;
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [api, showError]);

  // ── Add ───────────────────────────────────────────────────
  // No optimistic insert here: the server decides whether this is a new
  // row or a quantity bump on one that is already open, and guessing
  // wrong would flash a duplicate. The request is small and the pill
  // gives its own feedback, so the wait is not felt.

  const addItem = useCallback(async (payload: AddItemPayload): Promise<ShoppingItem | null> => {
    const name = payload.name.trim();
    if (!name) return null;
    try {
      const saved = await api.post<ShoppingItem>("/api/shopping", { ...payload, name }, {
        fallback: "Nie udało się dodać pozycji.",
      });
      setItems(prev => {
        const idx = prev.findIndex(i => i.id === saved.id);
        return idx === -1 ? [saved, ...prev] : prev.map(i => i.id === saved.id ? saved : i);
      });
      // The catalog is deliberately NOT patched here. Re-implementing the
      // server's count/recency bookkeeping client-side would be a second
      // copy of the ranking rules, free to drift — and it would buy
      // nothing: the product just added is visible on the list right
      // below, and "Najczęstsze" is about the long run. Next load has the
      // truth.
      return saved;
    } catch (err) {
      showError((err as Error).message);
      return null;
    }
  }, [api, showError]);

  // ── Patch (shared by every status change and inline edit) ──

  const patchItem = useCallback(async (
    id: string,
    patch: Partial<Pick<ShoppingItem, "name" | "qty" | "unit" | "note" | "section" | "status">> & { missed?: boolean },
  ): Promise<ShoppingItem | null> => {
    const before = items.find(i => i.id === id);
    if (!before) return null;

    // Optimistic: every key of `patch` except `missed` IS an item field,
    // so spreading it applies them all — one less list to keep in step
    // with the PATCH schema. `missed` is the exception: it is a verb, and
    // what it writes is a timestamp. Server-computed fields (resolvedAt,
    // missedCount) arrive with the response.
    const { missed, ...fields } = patch;
    setItems(prev => prev.map(i => i.id === id
      ? { ...i, ...fields,
          ...(missed === true  ? { missedAt: new Date().toISOString() } : {}),
          ...(missed === false ? { missedAt: null } : {}),
        }
      : i));

    try {
      const saved = await api.patch<ShoppingItem>(`/api/shopping/${id}`, patch, {
        fallback: "Nie udało się zapisać zmiany.",
      });
      setItems(prev => prev.map(i => i.id === id ? saved : i));
      return saved;
    } catch (err) {
      setItems(prev => prev.map(i => i.id === id ? before : i));   // roll back
      showError((err as Error).message);
      return null;
    }
  }, [api, items, showError]);

  const markBought  = useCallback((id: string) => patchItem(id, { status: "bought" }), [patchItem]);
  // "Nie było" keeps the item OPEN — we still want it; it is only flagged
  // so it stands out on the next trip.
  const markMissed  = useCallback((id: string) => patchItem(id, { status: "open", missed: true }), [patchItem]);
  const reopenItem  = useCallback((id: string) => patchItem(id, { status: "open", missed: false }), [patchItem]);

  // ── Delete ────────────────────────────────────────────────

  const removeItem = useCallback(async (id: string): Promise<boolean> => {
    const before = items.find(i => i.id === id);
    if (!before) return false;
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      await api.del(`/api/shopping/${id}`, undefined, { fallback: "Nie udało się usunąć pozycji." });
      return true;
    } catch (err) {
      setItems(prev => [before, ...prev]);   // roll back
      showError((err as Error).message);
      return false;
    }
  }, [api, items, showError]);

  // ── Catalog pruning ───────────────────────────────────────

  const forgetSuggestion = useCallback(async (key: string): Promise<boolean> => {
    const before = catalog;
    setCatalog(prev => prev.filter(e => e.key !== key));
    try {
      const next = await api.del<CatalogEntry[]>(`/api/shopping/catalog/${encodeURIComponent(key)}`, undefined, {
        fallback: "Nie udało się usunąć podpowiedzi.",
      });
      setCatalog(next);
      showSuccess("Podpowiedź usunięta.");
      return true;
    } catch (err) {
      setCatalog(before);
      showError((err as Error).message);
      return false;
    }
  }, [api, catalog, showError, showSuccess]);

  return {
    items, catalog, isLoading, hasLoaded: loadedRef.current,
    load, addItem, patchItem, markBought, markMissed, reopenItem,
    removeItem, forgetSuggestion,
  };
}
