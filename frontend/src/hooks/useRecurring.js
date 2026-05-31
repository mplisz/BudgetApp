// ============================================================
// File: src/hooks/useRecurring.js
// Single document per recurring expense, costs[] for history.
// State lives in AppContext (recurring/setRecurring) so
// NotificationBell and PanelRecurring share the same data.
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useAuth }       from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";
import { MONTHS,FREQUENCY_OPTIONS}        from "../data/constants";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";


// Short month names from constants (DRY)
export const MONTH_NAMES = MONTHS.map(m => m.slice(0, 3));

// Get the cost entry active for a given month
export function getActiveCost(doc, month) {
  if (!doc?.costs?.length) return null;
  const eligible = doc.costs.filter(c => c.validFrom <= month);
  if (!eligible.length) return doc.costs[0];
  return eligible.sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
}

// Check if recurring doc is active in given month (frequency + validFrom/To)
export function isActiveInMonth(doc, month) {
  if (!doc) return false;
  // Archived — only hide from archivedFrom onwards, still show in past months
  if (doc.isArchived && doc.archivedFrom && doc.archivedFrom <= month) return false;
  if (doc.isArchived && !doc.archivedFrom) return false; // archived without date — hide everywhere
  if (!doc.costs?.length) return false;

  const firstValidFrom = doc.costs[0].validFrom;
  if (month < firstValidFrom) return false;
  if (doc.validTo && month > doc.validTo) return false;

  const [y, m] = month.split("-").map(Number);
  switch (doc.frequency) {
    case "monthly":   return true;
    case "quarterly": {
      const [fy, fm] = firstValidFrom.split("-").map(Number);
      return (((y - fy) * 12 + (m - fm)) % 3) === 0;
    }
    case "biannual": {
      const [fy, fm] = firstValidFrom.split("-").map(Number);
      return (((y - fy) * 12 + (m - fm)) % 6) === 0;
    }
    case "yearly": {
      const [, fm] = firstValidFrom.split("-").map(Number);
      return m === fm;
    }
    case "custom":
      return (doc.activeMonths || []).includes(m);
    default:
      return false;
  }
}

// Bell notification logic
export function shouldNotify(doc, todayStr, daysBefore = 3){
  if (!doc || doc.isArchived) return false;

  const [ty, tm, td] = todayStr.split("-").map(Number);
  const currentMonth  = `${ty}-${String(tm).padStart(2, "0")}`;

  if (!isActiveInMonth(doc, currentMonth)) return false;
  if (doc.lastConfirmedMonth === currentMonth) return false;
  if (doc.notifiedAt && doc.notifiedAt.slice(0, 7) === currentMonth) return false;

  const triggerDay = Math.max(1, (doc.plannedDay || 1) - daysBefore);
  return td >= triggerDay;
}

/**
 * Compute validTo based on validFrom, monthsCount and frequency.
 * For "custom" frequency, counts N occurrences of activeMonths starting from validFrom.
 * For periodic frequencies, counts N actual occurrences (every 3/6/12 months).
 * For "monthly", original simple math is correct.
 */
export function computeValidTo(validFrom, monthsCount, frequency = "monthly", activeMonths = []) {
  if (!monthsCount || monthsCount <= 0 || !validFrom) return null;
 
  const count = parseInt(monthsCount);
  const [startY, startM] = validFrom.split("-").map(Number);
 
  // monthly — simple math, unchanged
  if (frequency === "monthly") {
    const totalMonths = (startY * 12 + startM - 1) + (count - 1);
    const endY = Math.floor(totalMonths / 12);
    const endM = (totalMonths % 12) + 1;
    return `${endY}-${String(endM).padStart(2, "0")}`;
  }
 
  // For all other frequencies: iterate forward, count occurrences
  const step = frequency === "quarterly" ? 3 : frequency === "biannual" ? 6 : frequency === "yearly" ? 12 : 1;
 
  if (frequency === "custom") {
    if (!activeMonths.length) return null;
    // Iterate month by month, count hits in activeMonths
    let hits = 0;
    let y = startY, m = startM;
    for (let i = 0; i < 600; i++) { // max 50 years
      if (activeMonths.includes(m)) {
        hits++;
        if (hits === count) {
          return `${y}-${String(m).padStart(2, "0")}`;
        }
      }
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return null;
  }
 
  // quarterly / biannual / yearly — count N steps of `step` months
  let hits = 0;
  let y = startY, m = startM;
  // First occurrence is validFrom itself
  hits = 1;
  if (hits === count) return `${y}-${String(m).padStart(2, "0")}`;
  for (let i = 1; i < 600; i++) {
    const totalM = (startY * 12 + startM - 1) + i * step;
    y = Math.floor(totalM / 12);
    m = (totalM % 12) + 1;
    hits++;
    if (hits === count) return `${y}-${String(m).padStart(2, "0")}`;
  }
  return null;
}

// ── Hook ─────────────────────────────────────────────────────

export function useRecurring() {
  const { fetchWithAuth }                       = useAuth();
  const { recurring, setRecurring, setTransactions, settings  } = useAppContext();
  const { showSuccess, showError }              = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/recurring/all`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load.");
      setRecurring(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, showError, setRecurring]);

  const loadForMonth = useCallback(async (month) => {
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/recurring?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load.");
      return data;
    } catch (err) {
      showError(err.message);
      return [];
    }
  }, [fetchWithAuth, showError]);

  const addRecurring = useCallback(async (payload) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/recurring`, {
        method: "POST", body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create.");
      setRecurring(prev => [data, ...prev]);
      showSuccess("Wydatek cykliczny dodany! 🔄");
      return data;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, showSuccess, showError, setRecurring]);

  // Update — always patches the single document
  // For cost change: pass updated costs[] with new entry
  const updateRecurring = useCallback(async (id, patch) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/recurring/${id}`, {
        method: "PATCH", body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update.");
      setRecurring(prev => prev.map(r => r.id === id ? data : r));
      showSuccess("Zaktualizowano! ✅");
      return data;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, showSuccess, showError, setRecurring]);

  const archiveRecurring = useCallback(async (id, archivedFrom) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/recurring/${id}`, {
        method: "DELETE", body: JSON.stringify({ archivedFrom }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to archive.");
      setRecurring(prev => prev.map(r =>
        r.id === id ? { ...r, isArchived: true, archivedFrom } : r
      ));
      showSuccess("Zarchiwizowano od " + archivedFrom);
      return true;
    } catch (err) {
      showError(err.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, showSuccess, showError, setRecurring]);

  const confirmRecurring = useCallback(async (id, date, budgetMonth, liveRate, amountPLN) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/recurring/${id}/confirm`, {
        method: "POST",
        body:   JSON.stringify({ date, budgetMonth, fxRate: liveRate, amountPLN }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to confirm.");
      setTransactions(prev => [data.transaction, ...prev]);
      setRecurring(prev => prev.map(r =>
        r.id === id ? { ...r, lastConfirmedMonth: budgetMonth, notifiedAt: null } : r
      ));
      showSuccess("Wydatek zapisany! ✅");
      return data.transaction;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setTransactions, showSuccess, showError, setRecurring]);

  const markNotified = useCallback(async (id) => {
    try {
      await fetchWithAuth(`${API_URL}/api/recurring/${id}/notify`, { method: "POST" });
      setRecurring(prev => prev.map(r =>
        r.id === id ? { ...r, notifiedAt: new Date().toISOString() } : r
      ));
    } catch (_) {}
  }, [fetchWithAuth, setRecurring]);

  // Pending notifications — one per doc (no grouping needed anymore)
  const today = new Date().toISOString().slice(0, 10);
  const daysBefore = settings?.notifyDaysBefore ?? 3;
  const pendingNotifications = useMemo(() =>
    recurring.filter(r => shouldNotify(r, today,daysBefore)),
    [recurring, today,daysBefore]
  );

  return {
    recurring, isLoading, isSaving,
    pendingNotifications,
    loadAll, loadForMonth,
    addRecurring, updateRecurring, archiveRecurring,
    confirmRecurring, markNotified,
    getActiveCost,
  };
}