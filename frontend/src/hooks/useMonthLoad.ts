import { useEffect, useState } from "react";

/**
 * Reloads data whenever the active budget month changes and exposes an
 * `isFirstLoad` flag (true until the current month's data has arrived).
 *
 * Generic by design: pass any `load(month)` — works for the transaction
 * panels today and any future per-month panel.
 *
 * @param activeBudgetMonth "YYYY-MM" currently selected month.
 * @param load              loader called with the month (sync or async).
 * @param onMonthChange     optional side effect fired before each load
 *                          (e.g. reset month-specific filters).
 */
export function useMonthLoad(
  activeBudgetMonth: string,
  load: (month: string) => void | Promise<void>,
  onMonthChange?: () => void,
): boolean {
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);

  useEffect(() => {
    setLoadedMonth(null);
    onMonthChange?.();
    // Promise.resolve tolerates loaders that don't return a promise.
    Promise.resolve(load(activeBudgetMonth)).then(() => setLoadedMonth(activeBudgetMonth));
    // Keyed only on the month — we deliberately ignore identity changes of
    // load/onMonthChange so we don't reload on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBudgetMonth]);

  return loadedMonth !== activeBudgetMonth; // isFirstLoad
}