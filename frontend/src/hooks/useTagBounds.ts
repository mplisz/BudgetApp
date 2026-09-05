// ============================================================
// File: src/hooks/useTagBounds.ts
// Which tags exist, how much they carry and when — over all history.
//
// Cheap enough to load on mount: the endpoint reads three fields off tagged
// expenses, not whole documents, and is not subject to the 24-month ceiling
// that /range enforces. That is what lets the tag panel offer every trip
// ever recorded and then fetch only the months the chosen one spans.
//
// Carries NO money on purpose — see the route's comment. Totals are net of
// returns, and that rule stays on the client.
// ============================================================

import { useState, useCallback } from "react";
import { useApi } from "./useApi";
import { useToast } from "./useToast";

export interface TagBounds {
  tagId:      string;
  count:      number;
  firstDate:  string;   // "YYYY-MM-DD"
  lastDate:   string;
  /** Budget-month span — what a /range fetch for this tag has to cover.
   *  Not derivable from the dates: a purchase dated the 30th can be booked
   *  into the next month. */
  firstMonth: string;   // "YYYY-MM"
  lastMonth:  string;
}

export interface UseTagBounds {
  bounds:    TagBounds[] | null;   // null = not loaded yet
  isLoading: boolean;
  load:      () => Promise<void>;
}

export function useTagBounds(): UseTagBounds {
  const api = useApi();
  const { showError } = useToast();

  const [bounds, setBounds] = useState<TagBounds[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<TagBounds[]>(
        "/api/transactions/tag-bounds",
        { fallback: "Nie udało się pobrać listy tagów." },
      );
      setBounds(data);
    } catch (err) {
      showError((err as Error).message);
      setBounds([]);
    } finally {
      setIsLoading(false);
    }
  }, [api, showError]);

  return { bounds, isLoading, load };
}
