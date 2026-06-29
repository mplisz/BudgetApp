// ============================================================
// File: src/hooks/usePlanned.ts
// Manages planned expenses. State in AppContext (planned/setPlanned).
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";
import { useApi }        from "./useApi";
import type { Transaction } from "../types/appContext";

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
  url?: string;
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
  url?: string;
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
  url?: string;
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
  const api                                      = useApi();
  const { planned, setPlanned, setTransactions, settings } = useAppContext();
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
      const data = await api.get<PlannedDoc[]>("/api/planned", { fallback: "Nie udało się pobrać planów." });
      setPlanned(data.filter(d => !d.isArchived));
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [api, setPlanned, showError]);

  // ── Create ─────────────────────────────────────────────────

  const createPlanned = useCallback(async (payload: PlannedPostPayload): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const data = await api.post<PlannedDoc>("/api/planned", payload, { fallback: "Nie udało się utworzyć planu." });
      setPlanned(prev => [...prev, data]);
      showSuccess("Plan dodany! ✅");
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setPlanned, showSuccess, showError]);

  // ── Update — PATCH only changed fields ────────────────────
  // virtualSavings is intentionally NOT sent — backend recomputes it.

  const updatePlanned = useCallback(async (id: string, patch: PlannedPatchPayload): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const data = await api.patch<PlannedDoc>(`/api/planned/${id}`, patch, { fallback: "Nie udało się zaktualizować planu." });
      replacePlanned(data);
      showSuccess("Plan zaktualizowany! ✅");
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setPlanned, showSuccess, showError]);

  // ── Archive ────────────────────────────────────────────────

  const archivePlanned = useCallback(async (id: string): Promise<boolean> => {
    setIsSaving(true);
    try {
      await api.del(`/api/planned/${id}`, undefined, { fallback: "Nie udało się zarchiwizować planu." });
      setPlanned(prev => prev.filter(p => p.id !== id));
      showSuccess("Plan zarchiwizowany.");
      return true;
    } catch (err) {
      showError((err as Error).message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [api, setPlanned, showSuccess, showError]);

  // ── Purchase ───────────────────────────────────────────────

  const purchasePlanned = useCallback(async (id: string, date: string, budgetMonth: string): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const data = await api.post<PlannedDoc & { transactions?: unknown[] }>(
        `/api/planned/${id}/purchase`,
        { date, budgetMonth },
        { fallback: "Nie udało się potwierdzić zakupu." },
      );
      replacePlanned(data);
      if (data.transactions) {
        setTransactions(prev => [...(data.transactions as Transaction[]), ...prev]);
      }
      showSuccess("Zakup potwierdzony! 🛍️");
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setPlanned, setTransactions, showSuccess, showError]);

  // ── Pay month ──────────────────────────────────────────────

  const payMonth = useCallback(async (
    id: string, month: string, amountPLN: number, amount: number, fxRate: number,
  ): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const data = await api.post<PlannedDoc>(
        `/api/planned/${id}/pay`,
        { month, amountPLN, amount, fxRate, dismissed: false },
        { fallback: "Nie udało się zapisać wpłaty." },
      );
      replacePlanned(data);
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setPlanned, showError]);

  // ── Dismiss month ──────────────────────────────────────────

  const dismissMonth = useCallback(async (id: string, month: string): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const data = await api.post<PlannedDoc>(
        `/api/planned/${id}/pay`,
        { month, dismissed: true },
        { fallback: "Nie udało się pominąć miesiąca." },
      );
      replacePlanned(data);
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setPlanned, showError]);

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
