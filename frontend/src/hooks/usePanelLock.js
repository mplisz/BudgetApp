// ============================================================
// File: src/hooks/usePanelLock.js
//
// Returns lock state for panels that respect historical/closed lock.
// Does NOT return JSX — use <LockBanner> component separately.
// ============================================================

import { useMemo } from "react";
import { useMonthStatus }       from "./useMonthStatus";
import { currentCalendarMonth } from "../utils/helpers";

export function usePanelLock(selectedMonth) {
  const { isClosedMonth } = useMonthStatus();

  const isPastMonth      = useMemo(() => selectedMonth < currentCalendarMonth(), [selectedMonth]);
  const isMonthClosed    = isClosedMonth(selectedMonth);
  const isHistoricalLock = isPastMonth || isMonthClosed;

  return { isHistoricalLock, isPastMonth, isMonthClosed };
}
