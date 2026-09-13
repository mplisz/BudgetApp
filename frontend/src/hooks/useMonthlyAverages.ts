// ============================================================
// File: src/hooks/useMonthlyAverages.ts
// Averages (mean + median) of the previous AVERAGE_MONTHS months, per type,
// category and subcategory — computed with utils/monthTotals, the same
// arithmetic as the month they are shown next to. null while loading.
// ============================================================

import { useMemo } from "react";
import { usePreviousMonths } from "./usePreviousMonths";
import { monthlyAverages, type MonthlyAverages, type TotalsTx } from "../utils/monthTotals";

export const AVERAGE_MONTHS = 6;

export function useMonthlyAverages(month: string): MonthlyAverages | null {
  const { months, transactions, ready } = usePreviousMonths(month, AVERAGE_MONTHS);
  return useMemo(
    () => (ready ? monthlyAverages(transactions as unknown as TotalsTx[], months) : null),
    [ready, transactions, months],
  );
}
