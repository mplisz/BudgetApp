// ============================================================
// File: src/hooks/usePreviousMonths.ts
//
// The transactions of the `count` months before `month` — the history that
// norms and averages are measured against (Nietypowo duże, średnie in
// Podsumowanie). Never reaches before settings.appStartMonth.
//
// `ready` flips once the load has FINISHED, successfully or not:
// useTransactionsRange reports its own errors (toast) and never throws, and a
// failed load must not leave its consumers waiting forever — they get an
// empty history instead and degrade to what the month alone can tell.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { useTransactionsRange, type RangeTransaction } from "./useTransactionsRange";
import { addMonthsToYM } from "./useMonthFromUrl";

export function usePreviousMonths(month: string, count: number) {
  const { settings } = useAppContext();
  const { transactions: loaded, loadRange, currentRange } = useTransactionsRange();

  const floor = settings?.appStartMonth ?? null;
  const to    = addMonthsToYM(month, -1);
  const back  = addMonthsToYM(month, -count);
  const from  = floor && back < floor ? floor : back;
  const hasHistory = count > 0 && from <= to;

  const rangeKey = `${from}|${to}`;
  const [attempted, setAttempted] = useState<string | null>(null);
  useEffect(() => {
    if (!hasHistory) return;
    let live = true;
    loadRange(from, to).finally(() => { if (live) setAttempted(rangeKey); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHistory, rangeKey, loadRange]);

  const loadedThis = currentRange?.from === from && currentRange?.to === to;

  const months = useMemo(() => {
    if (!hasHistory) return [];
    const out: string[] = [];
    for (let m = from; m <= to; m = addMonthsToYM(m, 1)) out.push(m);
    return out;
  }, [hasHistory, from, to]);

  const transactions = useMemo<RangeTransaction[]>(
    () => (hasHistory && loadedThis ? loaded : []),
    [hasHistory, loadedThis, loaded],
  );

  return {
    /** Oldest first; empty when there is no history to load. */
    months,
    transactions,
    ready: !hasHistory || loadedThis || attempted === rangeKey,
    /** settings.appStartMonth — callers building their own month lists clamp to it. */
    floor,
  };
}
