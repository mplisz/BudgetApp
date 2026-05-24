// ============================================================
// File: src/hooks/useMonthStatus.js
// Manages fiscal month open/close state.
// Closed months are stored in Cosmos DB (Months container).
// Open months are implicit — no document = open.
// ============================================================

import { useCallback } from "react";
import { useAppContext } from "../context/AppContext";
import { useAuth }       from "../context/AuthContext";
import { useToast }      from "./useToast";
import { nextCalendarMonth } from "../utils/helpers";
import { useMonthFromUrl} from "./useMonthFromUrl";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function useMonthStatus() {
  const { closedMonths, setClosedMonths } = useAppContext();
  const { budgetMonth, setBudgetMonth }  = useMonthFromUrl();

  const { fetchWithAuth }          = useAuth();
  const { showError, showSuccess } = useToast();

  const activeBudgetMonth = budgetMonth;

  // ── Derived state ─────────────────────────────────────────

  const isClosedMonth = useCallback((budgetMonth) => {
    return closedMonths.has(budgetMonth);
  }, [closedMonths]);

  const isActiveMonthClosed = isClosedMonth(activeBudgetMonth);

  // Check if active month is too far in the future
  const isFutureMonth = activeBudgetMonth > nextCalendarMonth();

  // ── Close month ───────────────────────────────────────────

  const closeMonth = useCallback(async (budgetMonth) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/months`, {
        method: "POST",
        body:   JSON.stringify({ budgetMonth }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Nie udało się zamknąć miesiąca.");
      }

      const saved = await res.json();

      // Update local Set
      setClosedMonths(prev => new Set([...prev, budgetMonth]));
      showSuccess(`Miesiąc ${budgetMonth} zamknięty! 🔒`);

      // Auto-navigate to next open month
      navigateToFirstOpenMonth(new Set([...closedMonths, budgetMonth]));

      return saved;
    } catch (err) {
      showError(err.message);
      return null;
    }
  }, [fetchWithAuth, closedMonths, setClosedMonths, showSuccess, showError]);

  // ── Reopen month ──────────────────────────────────────────

  const openMonth = useCallback(async (budgetMonth) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/months/${budgetMonth}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Nie udało się otworzyć miesiąca.");
      }

      setClosedMonths(prev => {
        const next = new Set(prev);
        next.delete(budgetMonth);
        return next;
      });

      showSuccess(`Miesiąc ${budgetMonth} ponownie otwarty! 🔓`);
      return true;
    } catch (err) {
      showError(err.message);
      return false;
    }
  }, [fetchWithAuth, setClosedMonths, showSuccess, showError]);

  // ── Auto-navigate to first open month ────────────────────
  // Starting from current calendar month, find first non-closed month

 const navigateToFirstOpenMonth = useCallback((closed = closedMonths) => {
   const now = new Date();
   let y = now.getFullYear();
   let m = now.getMonth();

   for (let i = 0; i < 24; i++) {
     const bm = `${y}-${String(m + 1).padStart(2, "0")}`;
     if (!closed.has(bm)) {
      setBudgetMonth(bm);
      return;
     }     m++;
     if (m > 11) { m = 0; y++; } 
    }
  }, [closedMonths, setBudgetMonth]);

  return {
    closedMonths,
    activeBudgetMonth,
    isClosedMonth,
    isActiveMonthClosed,
    isFutureMonth,
    closeMonth,
    openMonth,
    navigateToFirstOpenMonth,
  };
}