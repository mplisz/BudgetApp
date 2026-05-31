// ============================================================
// File: src/hooks/usePlanned.ts
// Manages planned expenses. State in AppContext (planned/setPlanned).
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useAuth }       from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Domain types ──────────────────────────────────────────────

export interface VirtualSaving {
  month:           string;   // "YYYY-MM"
  amount:          number;   // in original currency
  amountPLN:       number;
  fxRate:          number;
  paidByUser:      boolean;
  dismissedByUser: boolean;
}

export interface PlannedDoc {
  id:                   string;
  userId:               string;
  description:          string;
  totalAmount:          number;
  originalCurrency:     string;
  fxRate:               number;
  totalAmountPLN:       number;
  targetCategoryId:     string;
  targetCategoryName:   string;
  targetSubcategoryId:  string;
  targetSubcategoryName:string;
  tags:                 string[];
  priority:             1 | 2 | 3 | 4;
  mode:                 "oneoff" | "envelope";
  plannedMonth:         string;
  monthlySavingDay:     number;
  virtualSavings:       VirtualSaving[];
  isPurchased:          boolean;
  purchasedMonth:       string | null;
  isArchived:           boolean;
  createdAt?:           string;
  updatedAt?:           string;
}

export interface PlannedPostPayload {
  description:          string;
  totalAmount:          number;
  originalCurrency:     string;
  fxRate:               number;
  totalAmountPLN:       number;
  targetCategoryId:     string;
  targetCategoryName:   string;
  targetSubcategoryId:  string;
  targetSubcategoryName:string;
  tags:                 string[];
  priority:             number;
  mode:                 "oneoff" | "envelope";
  plannedMonth:         string;
  monthlySavingDay:     number;
  virtualSavings:       VirtualSaving[];
}

export interface PlannedPatchPayload {
  description?:         string;
  totalAmount?:         number;
  originalCurrency?:    string;
  fxRate?:              number;
  totalAmountPLN?:      number;
  targetCategoryId?:    string;
  targetCategoryName?:  string;
  targetSubcategoryId?: string;
  targetSubcategoryName?: string;
  tags?:                string[];
  priority?:            number;
  mode?:                "oneoff" | "envelope";
  plannedMonth?:        string;
  monthlySavingDay?:    number;
  // Note: virtualSavings is intentionally NOT in patch payload —
  // backend recomputes it from totalAmountPLN / plannedMonth changes.
  // Sending it from frontend would bypass backend recalculation logic.
}

// ── Pure helpers ──────────────────────────────────────────────

export function sumPaid(virtualSavings: VirtualSaving[] | undefined): number {
  return (virtualSavings || [])
    .filter(v => v.paidByUser)
    .reduce((s, v) => s + v.amountPLN, 0);
}

export function computeSuggestion(doc: PlannedDoc, currentMonth: string): number | null {
  if (doc.mode !== "envelope") return null;
  const paid      = sumPaid(doc.virtualSavings);
  const remaining = doc.totalAmountPLN - paid;
  const future    = (doc.virtualSavings || []).filter(v =>
    v.month >= currentMonth && !v.paidByUser && !v.dismissedByUser
  );
  if (future.length === 0) return Math.max(0, remaining);
  return Math.max(0, Math.round(remaining / future.length * 100) / 100);
}

export function isReadyToPurchase(doc: PlannedDoc): boolean {
  if (doc.isPurchased || doc.isArchived) return false;
  return sumPaid(doc.virtualSavings) >= doc.totalAmountPLN;
}

export function shouldNotifyPlanned(doc: PlannedDoc, todayStr: string, daysBefore = 3): boolean {
  if (doc.isArchived || doc.isPurchased) return false;
  if (isReadyToPurchase(doc)) return true;   // ← zawsze pokazuj gdy gotowe do zakupu

  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  const currentMonth = `${ty}-${String(tm).padStart(2, "0")}`;

  // oneoff mode
  if (doc.mode === "oneoff") {
    if (doc.plannedMonth !== currentMonth) return false;
    return checkTrigger(today, ty, tm, doc.monthlySavingDay, daysBefore);
  }

  // envelope mode
  const entry = (doc.virtualSavings || []).find(v => v.month === currentMonth);
  if (!entry || entry.paidByUser || entry.dismissedByUser) return false;
  return checkTrigger(today, ty, tm, doc.monthlySavingDay, daysBefore);
}

// Helper to avoid duplication
function checkTrigger(today: Date, year: number, month: number, plannedDay: number | undefined, daysBefore: number): boolean {
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(plannedDay || 1, lastDay);
  const plannedDate = new Date(year, month - 1, day);
  const triggerDate = new Date(plannedDate);
  triggerDate.setDate(triggerDate.getDate() - daysBefore);

  const firstOfMonth = new Date(year, month - 1, 1);
  const effectiveTrigger = triggerDate < firstOfMonth ? firstOfMonth : triggerDate;

  return today >= effectiveTrigger;
}

// Generate virtualSavings months from startMonth to plannedMonth.
// Only used when CREATING a new planned expense.
export function generateSavingsMonths(
  startMonth:    string,
  plannedMonth:  string,
  suggestion:    number,
  fxRate:        number = 1,
): VirtualSaving[] {
  const months: VirtualSaving[] = [];
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

// ── Hook ─────────────────────────────────────────────────────

interface UsePlannedResult {
  planned:         PlannedDoc[];
  isLoading:       boolean;
  isSaving:        boolean;
  pendingNotifications: PlannedDoc[];
  loadAll:         () => Promise<void>;
  createPlanned:   (payload: PlannedPostPayload) => Promise<PlannedDoc | null>;
  updatePlanned:   (id: string, patch: PlannedPatchPayload) => Promise<PlannedDoc | null>;
  archivePlanned:  (id: string) => Promise<boolean>;
  purchasePlanned: (id: string, date: string, budgetMonth: string) => Promise<PlannedDoc | null>;
  payMonth:        (id: string, month: string, amountPLN: number, amount: number, fxRate: number) => Promise<PlannedDoc | null>;
  dismissMonth:    (id: string, month: string) => Promise<PlannedDoc | null>;
}

export function usePlanned(): UsePlannedResult {
  const { fetchWithAuth }                        = useAuth() as { fetchWithAuth: typeof fetch };
  const { planned, setPlanned, setTransactions, settings} = useAppContext() as {
    planned:         PlannedDoc[];
    setPlanned:      (v: PlannedDoc[] | ((p: PlannedDoc[]) => PlannedDoc[])) => void;
    setTransactions: (v: unknown[] | ((p: unknown[]) => unknown[])) => void;
    settings:        { notifyDaysBefore?: number } | null;
  };
  const { showSuccess, showError } = useToast() as {
    showSuccess: (m: string) => void;
    showError:   (m: string) => void;
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  function replacePlanned(doc: PlannedDoc) {
    setPlanned(prev => prev.map(p => p.id === doc.id ? doc : p));
  }

  // ── Load all ───────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned`);
      const data = await (res as Response).json() as PlannedDoc[];
      if (!(res as Response).ok) throw new Error((data as unknown as { error: string }).error || "Failed to load.");
      setPlanned(data.filter(d => !d.isArchived));
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, setPlanned, showError]);

  // ── Create ─────────────────────────────────────────────────

  const createPlanned = useCallback(async (payload: PlannedPostPayload): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await (res as Response).json() as PlannedDoc;
      if (!(res as Response).ok) throw new Error((data as unknown as { error: string }).error || "Failed to create.");
      setPlanned(prev => [...prev, data]);
      showSuccess("Plan dodany! ✅");
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, showSuccess, showError]);

  // ── Update — PATCH only changed fields ────────────────────
  // virtualSavings is intentionally NOT sent — backend recomputes it.

  const updatePlanned = useCallback(async (id: string, patch: PlannedPatchPayload): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await (res as Response).json() as PlannedDoc;
      if (!(res as Response).ok) throw new Error((data as unknown as { error: string }).error || "Failed to update.");
      replacePlanned(data);
      showSuccess("Plan zaktualizowany! ✅");
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, showSuccess, showError]);

  // ── Archive ────────────────────────────────────────────────

  const archivePlanned = useCallback(async (id: string): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/planned/${id}`, { method: "DELETE" });
      if (!(res as Response).ok) {
        const data = await (res as Response).json() as { error: string };
        throw new Error(data.error || "Failed to archive.");
      }
      setPlanned(prev => prev.filter(p => p.id !== id));
      showSuccess("Plan zarchiwizowany.");
      return true;
    } catch (err) {
      showError((err as Error).message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, showSuccess, showError]);

  // ── Purchase ───────────────────────────────────────────────

  const purchasePlanned = useCallback(async (id: string, date: string, budgetMonth: string): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned/${id}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, budgetMonth }),
      });
      const data = await (res as Response).json() as PlannedDoc & { transactions?: unknown[] };
      if (!(res as Response).ok) throw new Error((data as unknown as { error: string }).error || "Failed to purchase.");
      replacePlanned(data);
      if (data.transactions) {
        setTransactions(prev => [...(prev as unknown[]), ...data.transactions!]);
      }
      showSuccess("Zakup potwierdzony! 🛍️");
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, setTransactions, showSuccess, showError]);

  // ── Pay month ──────────────────────────────────────────────

  const payMonth = useCallback(async (
    id: string, month: string, amountPLN: number, amount: number, fxRate: number,
  ): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned/${id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, amountPLN, amount, fxRate, dismissed: false }),
      });
      const data = await (res as Response).json() as PlannedDoc;
      if (!(res as Response).ok) throw new Error((data as unknown as { error: string }).error || "Failed to pay.");
      replacePlanned(data);
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, showError]);

  // ── Dismiss month ──────────────────────────────────────────

  const dismissMonth = useCallback(async (id: string, month: string): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/planned/${id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, dismissed: true }),
      });
      const data = await (res as Response).json() as PlannedDoc;
      if (!(res as Response).ok) throw new Error((data as unknown as { error: string }).error || "Failed to dismiss.");
      replacePlanned(data);
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setPlanned, showError]);

  const today = new Date().toISOString().slice(0, 10);

  const daysBefore = settings?.notifyDaysBefore ?? 3;
  const pendingNotifications = useMemo(
    () => (planned || []).filter(p => shouldNotifyPlanned(p, today, daysBefore)),
    [planned, today, daysBefore]
  );

  return {
    planned, isLoading, isSaving,
    pendingNotifications,
    loadAll, createPlanned, updatePlanned,
    archivePlanned, purchasePlanned,
    payMonth, dismissMonth,
  };
}
