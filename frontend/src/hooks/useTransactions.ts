// ============================================================
// File: src/hooks/useTransactions.ts
// Custom hook to manage transactions: load, add, batch-add, update, delete.
// Uses global toast (useToast) for user feedback — no local list state
// (the list lives in AppContext).
// ============================================================

import { useState, useCallback } from "react";
import { useAuth }        from "../context/AuthContext";
import { useAppContext }  from "../context/AppContext";
import { useToast }       from "./useToast";
import { translateError } from "../data/constants/errorMessages";
import type { TransactionPayload } from "../types/transaction";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Stored transaction as returned by the API. Kept structurally loose — the
// app treats transaction documents dynamically; only `id` is relied on here.
export type StoredTx = { id: string; [key: string]: unknown };

// Backend can answer 409 with a "please confirm" sentinel instead of a doc
// (e.g. archiving a transaction that has linked returns/transfers).
type ConfirmSentinel = { _requiresConfirmation: true; [key: string]: unknown };

type UpdateResult = StoredTx | ConfirmSentinel | null;
type DeleteResult = ConfirmSentinel | { success: boolean; id: string } | null;

interface AppCtx {
  transactions:    StoredTx[];
  setTransactions: (v: StoredTx[] | ((prev: StoredTx[]) => StoredTx[])) => void;
}

export function useTransactions() {
  const { fetchWithAuth }                 = useAuth() as { fetchWithAuth: typeof fetch };
  const { transactions, setTransactions } = useAppContext() as AppCtx;
  const { showSuccess, showError }        = useToast() as {
    showSuccess: (m: string) => void;
    showError:   (m: string) => void;
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  // ── Load transactions for a given budgetMonth (YYYY-MM) ──────────────────────
  const loadTransactions = useCallback(async (budgetMonth: string): Promise<void> => {
    if (!budgetMonth) return;
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/transactions?budgetMonth=${budgetMonth}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Nie udało się pobrać transakcji.");
      }
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, setTransactions, showError]);

  // ── Add new transaction ──────────────────────────────────────────────────────
  const addTransaction = useCallback(async (payload: TransactionPayload): Promise<StoredTx | null> => {
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/transactions`, {
        method: "POST",
        body:   JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(translateError(err.error, "Nie udało się dodać transakcji."));
      }
      const saved = await res.json() as StoredTx;
      setTransactions(prev => [saved, ...prev]);
      showSuccess("Transakcja dodana! ✅");
      return saved;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setTransactions, showSuccess, showError]);

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
      const res = await fetchWithAuth(`${API_URL}/api/transactions/batch`, {
        method: "POST",
        body:   JSON.stringify({ transactions: items, voucherIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(translateError(err.error, "Nie udało się zapisać transakcji."));
      }
      const saved = await res.json() as StoredTx[];
      setTransactions(prev => [...saved, ...prev]);
      return saved;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setTransactions, showError]);

  // ── Update existing transaction ──────────────────────────────────────────────
  const updateTransaction = useCallback(async (
    id: string,
    patch: Partial<TransactionPayload> & Record<string, unknown>,
  ): Promise<UpdateResult> => {
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/transactions/${id}`, {
        method: "PATCH",
        body:   JSON.stringify(patch),
      });

      // Special case: backend requires confirmation before archiving linked items
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        if (body.requiresConfirmation) {
          // Return sentinel object — EditTransactionModal detects this
          return { _requiresConfirmation: true, ...body };
        }
        throw new Error(translateError(body.error, "Nie udało się zaktualizować transakcji."));
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(translateError(err.error, "Nie udało się zaktualizować transakcji."));
      }

      const updated = await res.json() as StoredTx;
      setTransactions(prev => prev.map(t => (t.id === id ? updated : t)));
      showSuccess("Transakcja zaktualizowana! ✅");
      return updated;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setTransactions, showSuccess, showError]);

  // ── Soft-delete transaction ──────────────────────────────────────────────────
  const deleteTransaction = useCallback(async (
    id: string,
    options: Record<string, unknown> = {},
  ): Promise<DeleteResult> => {
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/transactions/${id}`, {
        method: "DELETE",
        body:   Object.keys(options).length ? JSON.stringify(options) : undefined,
      });

      // Special case: backend requires confirmation
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        if (body.requiresConfirmation) {
          return { _requiresConfirmation: true, ...body };
        }
        throw new Error(translateError(body.error, "Nie udało się zarchiwizować transakcji."));
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(translateError(err.error, "Nie udało się zarchiwizować transakcji."));
      }

      const body = await res.json() as { success: boolean; id: string };
      setTransactions(prev => prev.filter(t => t.id !== id));
      showSuccess("Transakcja zarchiwizowana.");
      return body;
    } catch (err) {
      showError((err as Error).message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setTransactions, showSuccess, showError]);

  return {
    transactions,
    isLoading,
    isSaving,
    loadTransactions,
    addTransaction,
    addTransactionBatch,
    updateTransaction,
    deleteTransaction,
  };
}
