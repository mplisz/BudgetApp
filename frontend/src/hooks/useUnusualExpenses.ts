// ============================================================
// File: src/hooks/useUnusualExpenses.ts
//
// React side of utils/unusualExpenses.ts, shared by the Wydatki panel and
// Podsumowanie:
//
//   useUnusualMultiplier() — the family-wide threshold from settings, with a
//     live value for the slider and a debounced save (dragging 1,5× → 4×
//     must not fire a PATCH per step).
//
//   useUnusualExpenses(monthTx, month, multiplier) — loads the norm's history
//     (the previous UNUSUAL_LOOKBACK_MONTHS months, never before
//     appStartMonth) and returns the month's unusual expenses. `unusual` is
//     null until that history is in: judging against a half-loaded norm
//     would flash wrong badges.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { useApi } from "./useApi";
import { useToast } from "./useToast";
import { useTransactionsRange } from "./useTransactionsRange";
import { addMonthsToYM } from "./useMonthFromUrl";
import {
  findUnusualExpenses, UNUSUAL_LOOKBACK_MONTHS, UNUSUAL_MULTIPLIER,
  type UnusualInfo, type UnusualSourceTx,
} from "../utils/unusualExpenses";
import type { AppSettings } from "../types/appContext";

const SAVE_DELAY_MS = 600;

export function useUnusualMultiplier() {
  const { settings, setSettings } = useAppContext();
  const api           = useApi();
  const { showError } = useToast();

  const saved = settings?.unusualExpenseMultiplier ?? UNUSUAL_MULTIPLIER.default;
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const setMultiplier = useCallback((value: number) => {
    setDraft(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const previous = settings;
      // Optimistic: every consumer of settings sees the new threshold at once.
      setSettings(prev => (prev ? { ...prev, unusualExpenseMultiplier: value } : prev));
      try {
        const next = await api.patch<AppSettings>("/api/settings", { unusualExpenseMultiplier: value },
          { fallback: "Nie udało się zapisać progu." });
        setSettings(next);
      } catch (err) {
        setSettings(previous);
        showError((err as Error).message);
      } finally {
        setDraft(null);
      }
    }, SAVE_DELAY_MS);
  }, [api, settings, setSettings, showError]);

  return { multiplier: draft ?? saved, setMultiplier };
}

export function useUnusualExpenses(monthTx: UnusualSourceTx[], month: string, multiplier: number) {
  const { settings } = useAppContext();
  const { transactions: history, loadRange, currentRange } = useTransactionsRange();

  const floor = settings?.appStartMonth ?? null;
  const to    = addMonthsToYM(month, -1);
  const back  = addMonthsToYM(month, -UNUSUAL_LOOKBACK_MONTHS);
  const from  = floor && back < floor ? floor : back;
  const hasHistory = from <= to;

  useEffect(() => {
    if (hasHistory) loadRange(from, to);
  }, [hasHistory, from, to, loadRange]);

  const historyReady = !hasHistory || (currentRange?.from === from && currentRange?.to === to);

  const unusual = useMemo<Map<string, UnusualInfo> | null>(() => {
    if (!historyReady) return null;
    return findUnusualExpenses(monthTx, hasHistory ? (history as unknown as UnusualSourceTx[]) : [], multiplier);
  }, [historyReady, hasHistory, monthTx, history, multiplier]);

  return { unusual };
}
