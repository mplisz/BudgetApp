// ============================================================
// File: src/hooks/usePlanned.ts
// Manages planned expenses. State in AppContext (planned/setPlanned).
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";
import { useApi }        from "./useApi";
import { useMonthFromUrl } from "./useMonthFromUrl";
import { fmt }           from "../utils/helpers";
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
  /** Undecided idea: no month, no committed price. Kept in the same container
   *  but filtered out of the shared list server-side — see loadWishes. */
  isWish?:              boolean;
  /** Ballpark price on a wish. Informational ONLY — never summed anywhere;
   *  it exists so the promotion form opens with a number already in it. */
  estimatedAmount?:     number | null;
  promotedAt?:          string | null;
  archivedAt?:          string | null;
  archivedBy?:          string | null;
  archivedReason?:      string | null;   // optional "why we dropped this" note
  /** Envelope dropped with money in it: the budget month the earlier rates
   *  came back in (as one TRANSFER). Its presence means those earlier rates
   *  still lock their own months — see keepsEnvelopeHistory. */
  releasedInMonth?:     string | null;
  /** Rates from months before releasedInMonth, returned by the transfer. */
  releasedAmountPLN?:   number | null;
  /** The releasedInMonth rate that was simply unlocked (no transfer). */
  unlockedAmountPLN?:   number | null;
  releaseTransferId?:   string | null;
  notifiedAt?:          string | null;   // bell reminder dismissed at (ISO)
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

export interface WishPostPayload {
  description:           string;
  estimatedAmount?:      number | null;
  originalCurrency?:     string;
  targetCategoryId?:     string;
  targetCategoryName?:   string;
  targetSubcategoryId?:  string;
  targetSubcategoryName?:string;
  tags?:                 string[];
  priority?:             number;
  url?:                  string;
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

/**
 * Whether an envelope's paid rates still lock money in the months they were
 * set aside. Active ones do; so do purchased ones and ones dropped after this
 * rule existed (releasedInMonth) — their money came back as a TRANSFER in a
 * later month, so the earlier months' results must stay put. Envelopes
 * archived before that left no transfer, so their rates no longer count.
 */
export function keepsEnvelopeHistory(p: PlannedDoc): boolean {
  if (p.mode !== "envelope") return false;
  return !p.isArchived || !!p.isPurchased || !!p.releasedInMonth;
}

/**
 * Money set aside into virtual envelopes in `month` — rates the user marked
 * paid. Purchased and released envelopes count too: their rates locked money
 * in the month they were set aside, so a past month's balance stays put after
 * the purchase or the drop. Part of Saldo (see utils/monthTotals monthBalance).
 * Pass `envelopeHistory` from usePlanned, not just the active list.
 */
export function envelopePaidInMonth(planned: PlannedDoc[], month: string): number {
  return planned
    .filter(keepsEnvelopeHistory)
    .reduce((sum, p) => sum + ((p.virtualSavings || [])
      .find(v => v.month === month && v.paidByUser)?.amountPLN || 0), 0);
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

/**
 * Whether the bell should nag about this plan. `budgetMonth` is the ACTIVE
 * budget month, not the calendar one: after closing a month the whole app
 * moves to the next open one, and the reminder (like the payment itself)
 * has to follow — otherwise the bell keeps pointing at a closed month while
 * every panel already shows the new one. `todayStr` stays the real date; it
 * only answers "are we within daysBefore of the saving day".
 */
export function shouldNotifyPlanned(
  doc: PlannedDoc, todayStr: string, budgetMonth: string, daysBefore = 3,
): boolean {
  if (doc.isArchived || doc.isPurchased) return false;

  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  const [by, bm] = budgetMonth.split("-").map(Number);

  // Bell ✕ dismissed this month's reminder — hide until the budget month moves on.
  if (doc.notifiedAt && doc.notifiedAt.slice(0, 7) === budgetMonth) return false;

  if (isReadyToPurchase(doc)) return true;   // ← zawsze pokazuj gdy gotowe do zakupu

  // oneoff mode
  if (doc.mode === "oneoff") {
    if (doc.plannedMonth !== budgetMonth) return false;
    return checkTrigger(today, by, bm, doc.monthlySavingDay, daysBefore);
  }

  // envelope mode
  const entry = (doc.virtualSavings || []).find(v => v.month === budgetMonth);
  if (!entry || entry.paidByUser || entry.dismissedByUser) return false;
  return checkTrigger(today, by, bm, doc.monthlySavingDay, daysBefore);
}

// Helper to avoid duplication. No lower clamp on the trigger date: when the
// budget month runs AHEAD of the calendar (a month closed early), the rate is
// already actionable, so the reminder is due. A budget month further out still
// stays quiet — its trigger date simply hasn't arrived yet.
function checkTrigger(today: Date, year: number, month: number, plannedDay: number | undefined, daysBefore: number): boolean {
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(plannedDay || 1, lastDay);
  const plannedDate = new Date(year, month - 1, day);
  const triggerDate = new Date(plannedDate);
  triggerDate.setDate(triggerDate.getDate() - daysBefore);

  return today >= triggerDate;
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

// Edited expense fields sent when realizing a planned expense through the
// transaction form (#2). All optional — omitted fields fall back to the doc.
export interface PurchaseOverride {
  amount?:           number;
  originalAmount?:   number;
  originalCurrency?: string;
  fxRate?:           number;
  categoryId?:       string;
  categoryName?:     string;
  subcategoryId?:    string;
  subcategoryName?:  string;
  description?:      string;
  tags?:             string[];
  priority?:         number;
  merchant?:         string | null;
}

// ── Hook ─────────────────────────────────────────────────────

interface UsePlannedResult {
  planned:         PlannedDoc[];
  /** Active plans plus the archived envelopes whose rates still lock their
   *  months. Feed THIS (not `planned`) to anything that sums envelope rates
   *  per month — envelopePaidInMonth, the analytics balance. */
  envelopeHistory: PlannedDoc[];
  isLoading:       boolean;
  isSaving:        boolean;
  pendingNotifications: PlannedDoc[];
  loadAll:         () => Promise<void>;
  /** Archived docs only — fetched on demand, NOT stored in AppContext. */
  loadArchived:    () => Promise<PlannedDoc[]>;
  /** Wishes only — fetched on demand, NOT stored in AppContext (same reason). */
  loadWishes:      () => Promise<PlannedDoc[]>;
  createWish:      (payload: WishPostPayload) => Promise<PlannedDoc | null>;
  /** Wish → real plan. The result DOES join the shared list. */
  promoteWish:     (id: string, payload: PlannedPostPayload) => Promise<PlannedDoc | null>;
  createPlanned:   (payload: PlannedPostPayload) => Promise<PlannedDoc | null>;
  updatePlanned:   (id: string, patch: PlannedPatchPayload) => Promise<PlannedDoc | null>;
  /** `month` — the budget month an envelope's savings come back in
   *  (defaults to the month in the URL). */
  archivePlanned:  (id: string, reason?: string, month?: string) => Promise<boolean>;
  purchasePlanned: (id: string, date: string, budgetMonth: string, override?: PurchaseOverride) => Promise<PlannedDoc | null>;
  payMonth:        (id: string, month: string, amountPLN: number, amount: number, fxRate: number) => Promise<PlannedDoc | null>;
  dismissMonth:    (id: string, month: string) => Promise<PlannedDoc | null>;
  markNotified:    (id: string) => Promise<void>;
}

export function usePlanned(): UsePlannedResult {
  const api                                      = useApi();
  const {
    planned, setPlanned, archivedEnvelopes, setArchivedEnvelopes, setTransactions, settings,
  } = useAppContext();
  const { showSuccess, showError } = useToast();
  // Reminders follow the active budget month, same as the payment itself
  // (useMonthFromUrl directly — useMonthStatus would be a needless round trip).
  const { budgetMonth } = useMonthFromUrl();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  function replacePlanned(doc: PlannedDoc) {
    setPlanned(prev => prev.map(p => p.id === doc.id ? doc : p));
  }

  // ── Load all ───────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      // Archived docs come along so the envelopes whose rates still lock past
      // months can be split off — they never join `planned`.
      const data = await api.get<PlannedDoc[]>("/api/planned?includeArchived=true", { fallback: "Nie udało się pobrać planów." });
      setPlanned(data.filter(d => !d.isArchived));
      setArchivedEnvelopes(data.filter(d => d.isArchived && keepsEnvelopeHistory(d)));
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [api, setPlanned, setArchivedEnvelopes, showError]);

  // ── Load archived (on demand) ─────────────────────────────
  // Kept OUT of AppContext on purpose: every other consumer (forecast,
  // envelopes, notifications) expects the active-only list.

  const loadArchived = useCallback(async (): Promise<PlannedDoc[]> => {
    try {
      const data = await api.get<PlannedDoc[]>(
        "/api/planned?includeArchived=true",
        { fallback: "Nie udało się pobrać zarchiwizowanych planów." },
      );
      return data.filter(d => d.isArchived);
    } catch (err) {
      showError((err as Error).message);
      return [];
    }
  }, [api, showError]);

  // ── Wishes ─────────────────────────────────────────────────
  // Same container, same document shape — undecided fields are null. The
  // backend keeps them out of the default listing, so they can never reach
  // the forecast, the Baza budżetu column, the safety net or the bell.

  const loadWishes = useCallback(async (): Promise<PlannedDoc[]> => {
    try {
      return await api.get<PlannedDoc[]>(
        "/api/planned?wishes=true",
        { fallback: "Nie udało się pobrać potencjalnych zakupów." },
      );
    } catch (err) {
      showError((err as Error).message);
      return [];
    }
  }, [api, showError]);

  const createWish = useCallback(async (payload: WishPostPayload): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      // Deliberately NOT added to `planned` — a wish has no amount and no
      // month, and every consumer of that list assumes both.
      const data = await api.post<PlannedDoc>("/api/planned/wish", payload, { fallback: "Nie udało się dodać potencjalnego zakupu." });
      showSuccess("Dodano do potencjalnych zakupów! 👀");
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, showSuccess, showError]);

  const promoteWish = useCallback(async (id: string, payload: PlannedPostPayload): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const data = await api.post<PlannedDoc>(`/api/planned/${id}/promote`, payload, { fallback: "Nie udało się zaplanować potencjalnego zakupu." });
      setPlanned(prev => [...prev, data]);   // now a real plan → joins the shared list
      showSuccess("Potencjalny zakup zaplanowany! 📅");
      return data;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setPlanned, showSuccess, showError]);

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

  // An envelope with money in it gives the earlier months' rates back as one
  // TRANSFER in `month` and unlocks `month`'s own rate (backend releaseSavings).
  const archivePlanned = useCallback(async (id: string, reason?: string, month?: string): Promise<boolean> => {
    setIsSaving(true);
    try {
      const trimmed = reason?.trim();
      const data = await api.del<{ planned?: PlannedDoc; transfer?: Transaction | null }>(
        `/api/planned/${id}`,
        {
          ...(trimmed ? { reason: trimmed } : {}),
          budgetMonth: month ?? budgetMonth,
          date:        new Date().toISOString().slice(0, 10),
        },
        { fallback: "Nie udało się zarchiwizować planu." },
      );
      setPlanned(prev => prev.filter(p => p.id !== id));
      if (data?.planned && keepsEnvelopeHistory(data.planned)) {
        const doc = data.planned;
        setArchivedEnvelopes(prev => [...prev.filter(p => p.id !== doc.id), doc]);
      }
      if (data?.transfer) {
        const tx = data.transfer;
        setTransactions(prev => [tx, ...prev]);
      }
      showSuccess(data?.transfer
        ? `Plan zarchiwizowany. Odblokowano ${fmt(data.transfer.amount)}.`
        : "Plan zarchiwizowany.");
      return true;
    } catch (err) {
      showError((err as Error).message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [api, budgetMonth, setPlanned, setArchivedEnvelopes, setTransactions, showSuccess, showError]);

  // ── Purchase ───────────────────────────────────────────────

  const purchasePlanned = useCallback(async (id: string, date: string, budgetMonth: string, override?: PurchaseOverride): Promise<PlannedDoc | null> => {
    setIsSaving(true);
    try {
      const data = await api.post<{ planned: PlannedDoc; expense?: Transaction; transfer?: Transaction }>(
        `/api/planned/${id}/purchase`,
        override ? { date, budgetMonth, override } : { date, budgetMonth },
        { fallback: "Nie udało się potwierdzić zakupu." },
      );
      replacePlanned(data.planned);
      const newTx = [data.expense, data.transfer].filter(Boolean) as Transaction[];
      if (newTx.length) {
        setTransactions(prev => [...newTx, ...prev]);
      }
      showSuccess("Zakup potwierdzony! 🛍️");
      return data.planned;
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

  // ── Dismiss bell reminder (✕) ──────────────────────────────
  // Suppresses this month's notification without touching the plan.

  const markNotified = useCallback(async (id: string): Promise<void> => {
    try {
      await api.post(`/api/planned/${id}/notify`);
      setPlanned(prev => prev.map(p =>
        p.id === id ? { ...p, notifiedAt: new Date().toISOString() } : p
      ));
    } catch { /* best-effort */ }
  }, [api, setPlanned]);

  const today = new Date().toISOString().slice(0, 10);

  const daysBefore = settings?.notifyDaysBefore ?? 3;
  const pendingNotifications = useMemo(
    () => (planned || []).filter(p => shouldNotifyPlanned(p, today, budgetMonth, daysBefore)),
    [planned, today, budgetMonth, daysBefore]
  );

  const envelopeHistory = useMemo(
    () => [...(planned || []), ...(archivedEnvelopes || [])],
    [planned, archivedEnvelopes],
  );

  return {
    planned, envelopeHistory, isLoading, isSaving,
    pendingNotifications,
    loadAll, loadArchived, loadWishes, createWish, promoteWish,
    createPlanned, updatePlanned,
    archivePlanned, purchasePlanned,
    payMonth, dismissMonth, markNotified,
  };
}
