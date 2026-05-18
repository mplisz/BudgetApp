// ============================================================
// File: src/hooks/usePlanned.js
// Manages planned expenses. State in AppContext (planned/setPlanned).
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useAuth }       from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Pure helpers ──────────────────────────────────────────────

export function sumPaid(virtualSavings) {
  return (virtualSavings || [])
    .filter(v => v.paidByUser)
    .reduce((s, v) => s + v.amountPLN, 0);
}

export function computeSuggestion(doc, currentMonth) {
  if (doc.mode !== "envelope") return null;
  const paid      = sumPaid(doc.virtualSavings);
  const remaining = doc.totalAmountPLN - paid;
  const future    = (doc.virtualSavings || []).filter(v =>
    v.month >= currentMonth && !v.paidByUser && !v.dismissedByUser
  );
  if (future.length === 0) return Math.max(0, remaining);
  return Math.max(0, Math.round(remaining / future.length * 100) / 100);
}

export function isReadyToPurchase(doc) {
  if (doc.isPurchased || doc.isArchived) return false;
  return sumPaid(doc.virtualSavings) >= doc.totalAmountPLN;
}

// Generate savings months array from startMonth to plannedMonth
export function generateSavingsMonths(startMonth, plannedMonth, suggestion, fxRate = 1) {
  const months = [];
  let [y, m] = startMonth.split("-").map(Number);
  const [ey, em] = plannedMonth.split("-").map(Number);

  while (y < ey || (y === ey && m <= em)) {
    months.push({
      month:           `${y}-${String(m).padStart(2, "0")}`,
      amount:          suggestion,
      amountPLN:       0,
      fxRate,
      paidByUser:      false,
      dismissedByUser: false,
    });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// Recompute virtualSavings when totalAmountPLN or plannedMonth changes
export function recomputeSavings(existing, newTotalPLN, newPlannedMonth, currentMonth, fxRate) {
  const paidEntries  = (existing || []).filter(v => v.paidByUser);
  const paidPLN      = paidEntries.reduce((s, v) => s + v.amountPLN, 0);
  const remaining    = newTotalPLN - paidPLN;

  // Keep unpaid entries up to newPlannedMonth
  const keptUnpaid = (existing || []).filter(v =>
    !v.paidByUser && v.month <= newPlannedMonth
  );

  const allKept        = [...paidEntries, ...keptUnpaid];
  const existingMonths = new Set(allKept.map(v => v.month));

  // Find start for new months
  const lastMonth = allKept.length
    ? allKept.sort((a, b) => b.month.localeCompare(a.month))[0].month
    : null;

  const startFill = lastMonth
    ? (() => {
        const [y, m] = lastMonth.split("-").map(Number);
        const nm = m === 12 ? 1 : m + 1;
        const ny = m === 12 ? y + 1 : y;
        return `${ny}-${String(nm).padStart(2, "0")}`;
      })()
    : currentMonth;

  // Count future months for suggestion
  const [sy, sm] = startFill.split("-").map(Number);
  const [ey, em] = newPlannedMonth.split("-").map(Number);
  const futureCount = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
  const suggestion  = Math.max(0, Math.round(remaining / futureCount * 100) / 100);

  // Generate missing months
  const newMonths = generateSavingsMonths(startFill, newPlannedMonth, suggestion, fxRate)
    .filter(v => !existingMonths.has(v.month));

  return [...allKept, ...newMonths].sort((a, b) => a.month.localeCompare(b.month));
}

// Should show bell notification for this doc in current month?
export function shouldNotifyPlanned(doc, todayStr) {
  if (doc.isArchived || doc.isPurchased) return false;

  const [ty, tm, td] = todayStr.split("-").map(Number);
  const currentMonth  = `${ty}-${String(tm).padStart(2, "0")}`;

  // Ready to purchase — always show
  if (isReadyToPurchase(doc)) return true;

  if (doc.mode === "oneoff") {
    // Show 3 days before plannedMonth start
    if (doc.plannedMonth !== currentMonth) return false;
    const triggerDay = Math.max(1, (doc.monthlySavingDay || 1) - 3);
    return td >= triggerDay;
  }

  // Envelope — show on saving day
  const entry = (doc.virtualSavings || []).find(v => v.month === currentMonth);
  if (!entry || entry.paidByUser || entry.dismissedByUser) return false;
  const triggerDay = Math.max(1, (doc.monthlySavingDay || 1) - 3);
  return td >= triggerDay;
}

// ── Hook ─────────────────────────────────────────────────────

export function usePlanned() {
  const { fetchWithAuth }                          = useAuth();
  const { planned, setPlanned, setTransactions }   = useAppContext();
  const { showSuccess, showError }                 = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load.");
      setPlanned(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, setPlanned, showError]);

  const addPlanned = useCallback(async (payload) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned`, {
        method: "POST", body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create.");
      setPlanned(prev => [data, ...prev]);
      showSuccess("Wydatek planowany dodany! 📅");
      return data;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, showSuccess, showError]);

  const updatePlanned = useCallback(async (id, patch) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned/${id}`, {
        method: "PATCH", body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update.");
      setPlanned(prev => prev.map(p => p.id === id ? data : p));
      showSuccess("Zaktualizowano! ✅");
      return data;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, showSuccess, showError]);

  const archivePlanned = useCallback(async (id) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to archive.");
      setPlanned(prev => prev.map(p => p.id === id ? { ...p, isArchived: true } : p));
      showSuccess("Zarchiwizowano.");
      return true;
    } catch (err) {
      showError(err.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, showSuccess, showError]);

  // Mark saving month as paid or dismissed
  const paySavingMonth = useCallback(async (id, month, opts = {}) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned/${id}/pay`, {
        method: "POST", body: JSON.stringify({ month, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to pay.");
      setPlanned(prev => prev.map(p => p.id === id ? data : p));
      showSuccess(opts.dismissed ? "Miesiąc pominięty." : "Odkładanie potwierdzone! 💰");
      return data;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, showSuccess, showError]);

  // Finalize purchase
  const purchasePlanned = useCallback(async (id, date, budgetMonth) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned/${id}/purchase`, {
        method: "POST", body: JSON.stringify({ date, budgetMonth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to purchase.");
      setPlanned(prev => prev.map(p => p.id === id ? data.planned : p));
      setTransactions(prev => [data.expense, data.transfer, ...prev]);
      showSuccess("Zakup potwierdzony! 🎉");
      return data;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, setTransactions, showSuccess, showError]);

  // Bell notifications
  const pendingNotifications = useMemo(() =>
    planned.filter(p => shouldNotifyPlanned(p, today)),
    [planned, today]
  );

  return {
    planned, isLoading, isSaving,
    pendingNotifications,
    loadAll, addPlanned, updatePlanned, archivePlanned,
    paySavingMonth, purchasePlanned,
    sumPaid, computeSuggestion, isReadyToPurchase,
  };
}
