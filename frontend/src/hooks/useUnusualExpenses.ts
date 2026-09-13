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
//   useUnusualExpenses(monthTx, month, multiplier, trendMonths?) — loads the
//     norm's history (the previous UNUSUAL_LOOKBACK_MONTHS months, never
//     before appStartMonth) and returns the month's unusual expenses, plus
//     optionally a trend. Both are null until that history is in: judging
//     against a half-loaded norm would flash wrong badges.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { useApi } from "./useApi";
import { useToast } from "./useToast";
import { usePreviousMonths } from "./usePreviousMonths";
import { addMonthsToYM } from "./useMonthFromUrl";
import {
  findUnusualExpenses, unusualTrend, UNUSUAL_LOOKBACK_MONTHS, UNUSUAL_MULTIPLIER,
  type UnusualInfo, type UnusualMonthStats, type UnusualSourceTx,
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

type MonthTx = UnusualSourceTx & { budgetMonth?: string };

/**
 * @param trendMonths  also return a trend over this many months ending with
 *                     `month` (0 = none). Each trend month needs its own
 *                     look-back, so the history loaded grows to match.
 */
export function useUnusualExpenses(monthTx: MonthTx[], month: string, multiplier: number, trendMonths = 0) {
  // A failed history load leaves `history` empty: everything falls back to
  // the month's own norm instead of waiting forever.
  const { transactions, ready, floor } =
    usePreviousMonths(month, UNUSUAL_LOOKBACK_MONTHS + Math.max(trendMonths - 1, 0));
  const history = transactions as unknown as MonthTx[];

  const unusual = useMemo<Map<string, UnusualInfo> | null>(() => {
    if (!ready) return null;
    const lookbackFrom = addMonthsToYM(month, -UNUSUAL_LOOKBACK_MONTHS);
    return findUnusualExpenses(monthTx, history.filter(tx => (tx.budgetMonth ?? "") >= lookbackFrom), multiplier);
  }, [ready, month, monthTx, history, multiplier]);

  const trend = useMemo<UnusualMonthStats[] | null>(() => {
    if (!ready || trendMonths <= 0) return null;
    const months = Array.from({ length: trendMonths }, (_, i) => addMonthsToYM(month, i - trendMonths + 1))
      .filter(m => !floor || m >= floor);
    return unusualTrend(months, [...history, ...monthTx], multiplier);
  }, [ready, trendMonths, month, floor, history, monthTx, multiplier]);

  return { unusual, trend };
}
