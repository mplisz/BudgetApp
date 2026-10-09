// ============================================================
// File: src/hooks/useTransactions.ts
// Custom hook to manage transactions: load, add, batch-add, update, delete.
// Uses global toast (useToast) for user feedback — no local list state
// (the list lives in AppContext).
// ============================================================

import { useState, useCallback } from "react";
import { useAppContext }  from "../context/AppContext";
import { useToast }       from "./useToast";
import { useApi }         from "./useApi";
import { ApiError }       from "../data/api/client";
import type { TransactionPayload } from "../types/transaction";
import type { Transaction } from "../types/appContext";

// Stored transaction as returned by the API — the canonical Transaction shape.
export type StoredTx = Transaction;

// Backend can answer 409 with a "please confirm" sentinel instead of a doc
// (e.g. archiving a transaction that has linked returns/transfers).
type ConfirmSentinel = { _requiresConfirmation: true; [key: string]: unknown };

type UpdateResult = StoredTx | ConfirmSentinel | null;
type DeleteResult = ConfirmSentinel | { success: boolean; id: string } | null;

// Detects the backend's 409 "please confirm" sentinel on a thrown ApiError.
function confirmSentinelFrom(err: unknown): ConfirmSentinel | null {
  if (err instanceof ApiError && err.status === 409
      && err.body && typeof err.body === "object"
      && (err.body as { requiresConfirmation?: boolean }).requiresConfirmation) {
    return { _requiresConfirmation: true, ...(err.body as Record<string, unknown>) };
  }
  return null;
}

export function useTransactions() {
  const api                               = useApi();
  const { transactions, setTransactions } = useAppContext();
  const { showSuccess, showError, showInfo } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  // ── Load transactions for a given budgetMonth (YYYY-MM) ──────────────────────
  const loadTransactions = useCallback(async (budgetMonth: string): Promise<void> => {
    if (!budgetMonth) return;
    setIsLoading(true);
    try {
      const data = await api.get<StoredTx[]>(
        `/api/transactions?budgetMonth=${budgetMonth}`,
        { fallback: "Nie udało się pobrać transakcji." },
      );
      setTransactions(data);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [api, setTransactions, showError]);

  // ── Add new transaction ──────────────────────────────────────────────────────
  const addTransaction = useCallback(async (payload: TransactionPayload): Promise<StoredTx | null> => {
    setIsSaving(true);
    try {
      const saved = await api.post<StoredTx>("/api/transactions", payload, {
        fallback: "Nie udało się dodać transakcji.",
      });
      setTransactions(prev => [saved, ...prev]);
      showSuccess("Transakcja dodana! ✅");
      return saved;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setTransactions, showSuccess, showError]);

  // ── Add a batch of transactions (OCR / cart) ─────────────────────────────────
  // Sends the whole cart to /batch so the backend can split selected vouchers
  // proportionally and run the save as one atomic saga. Returns the created
  // transactions array, or null on failure. Caller owns the success toast.
  const addTransactionBatch = useCallback(async (
    { transactions: items, voucherIds = [] }:
    { transactions: TransactionPayload[]; voucherIds?: string[] },
  ): Promise<StoredTx[] | null> => {
    setIsSaving(true);
    try {
      const saved = await api.post<StoredTx[]>(
        "/api/transactions/batch",
        { transactions: items, voucherIds },
        { fallback: "Nie udało się zapisać transakcji." },
      );
      setTransactions(prev => [...saved, ...prev]);
      return saved;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setTransactions, showError]);

  // ── Update existing transaction ──────────────────────────────────────────────
  const updateTransaction = useCallback(async (
    id: string,
    patch: Partial<TransactionPayload> & Record<string, unknown>,
  ): Promise<UpdateResult> => {
    setIsSaving(true);
    try {
      const updated = await api.patch<StoredTx>(`/api/transactions/${id}`, patch, {
        fallback: "Nie udało się zaktualizować transakcji.",
      });
      setTransactions(prev => prev.map(t => (t.id === id ? updated : t)));
      showSuccess("Transakcja zaktualizowana! ✅");
      return updated;
    } catch (err) {
      // Backend requires confirmation before archiving linked items —
      // surface the sentinel so EditTransactionModal can prompt the user.
      const sentinel = confirmSentinelFrom(err);
      if (sentinel) return sentinel;
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setTransactions, showSuccess, showError]);

  // ── Re-tag receipt lines of a saved transaction ──────────────────────────────
  // The backend moves the picked lines to the transaction carrying `tags`
  // (an existing sibling, or a new one) — so the response can hold a tx the
  // list has not seen yet. `target` is null when the whole tx was retagged.
  const moveLines = useCallback(async (
    id: string,
    indices: number[],
    tags: string[],
  ): Promise<{ source: StoredTx; target: StoredTx | null } | null> => {
    setIsSaving(true);
    try {
      const { source, target } = await api.post<{ source: StoredTx; target: StoredTx | null }>(
        `/api/transactions/${id}/move-lines`,
        { indices, tags },
        { fallback: "Nie udało się zmienić tagów pozycji." },
      );
      setTransactions(prev => {
        const next = prev.map(t => (t.id === source.id ? source : target && t.id === target.id ? target : t));
        return target && !prev.some(t => t.id === target.id) ? [target, ...next] : next;
      });
      showSuccess("Tagi pozycji zmienione! ✅");
      return { source, target };
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setTransactions, showSuccess, showError]);

  // ── Mark many expenses as paid with a credit card (null clears it) ───────────
  // One request for the whole selection. The backend skips rows it may not
  // touch (closed month, edited meanwhile) and says how many; the updated
  // ones come back and replace their copies here. Null on failure.
  const setCardPayment = useCallback(async (
    ids: string[],
    cardId: string | null,
  ): Promise<StoredTx[] | null> => {
    setIsSaving(true);
    try {
      const { updated, skipped } = await api.post<{ updated: StoredTx[]; skipped: number }>(
        "/api/transactions/card-payment",
        { ids, cardId },
        { fallback: "Nie udało się zmienić transakcji." },
      );
      const byId = new Map(updated.map(t => [t.id, t]));
      setTransactions(prev => prev.map(t => byId.get(t.id) ?? t));
      const what = cardId ? "Oznaczono kartą" : "Zdjęto oznaczenie karty z";
      if (skipped > 0) showInfo(`${what}: ${updated.length}. Pominięto ${skipped} — zamknięty miesiąc albo zmiana w międzyczasie.`);
      else             showSuccess(`${what}: ${updated.length} ✅`);
      return updated;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setTransactions, showSuccess, showInfo, showError]);

  // ── Soft-delete transaction ──────────────────────────────────────────────────
  const deleteTransaction = useCallback(async (
    id: string,
    options: Record<string, unknown> = {},
  ): Promise<DeleteResult> => {
    setIsSaving(true);
    try {
      const body = await api.del<{ success: boolean; id: string }>(
        `/api/transactions/${id}`,
        Object.keys(options).length ? options : undefined,
        { fallback: "Nie udało się zarchiwizować transakcji." },
      );
      setTransactions(prev => prev.filter(t => t.id !== id));
      showSuccess("Transakcja zarchiwizowana.");
      return body;
    } catch (err) {
      const sentinel = confirmSentinelFrom(err);
      if (sentinel) return sentinel;
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [api, setTransactions, showSuccess, showError]);

  return {
    transactions,
    isLoading,
    isSaving,
    loadTransactions,
    addTransaction,
    addTransactionBatch,
    updateTransaction,
    moveLines,
    setCardPayment,
    deleteTransaction,
  };
}
