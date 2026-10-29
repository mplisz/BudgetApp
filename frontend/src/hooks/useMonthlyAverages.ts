// ============================================================
// File: src/hooks/useMonthlyAverages.ts
// Averages (mean + median) of the previous AVERAGE_MONTHS months, per type,
// category and subcategory — computed with utils/monthTotals, the same
// arithmetic as the month they are shown next to. null while loading.
//
// useCategoryReferences: the longer view Baza budżetu plans against — the
// yearly average and the same month in earlier years, per category.
// ============================================================

import { useMemo } from "react";
import { usePreviousMonths } from "./usePreviousMonths";
import {
  monthlyAverages, categoryReferences, REFERENCE_MONTHS,
  type MonthlyAverages, type CategoryReferences, type TotalsTx,
} from "../utils/monthTotals";

export const AVERAGE_MONTHS = 6;

export function useMonthlyAverages(month: string): MonthlyAverages | null {
  const { months, transactions, ready } = usePreviousMonths(month, AVERAGE_MONTHS);
  return useMemo(
    () => (ready ? monthlyAverages(transactions as unknown as TotalsTx[], months) : null),
    [ready, transactions, months],
  );
}

export function useCategoryReferences(month: string): CategoryReferences | null {
  const { months, transactions, ready } = usePreviousMonths(month, REFERENCE_MONTHS);
  return useMemo(
    () => (ready ? categoryReferences(transactions as unknown as TotalsTx[], months, month) : null),
    [ready, transactions, months, month],
  );
}
