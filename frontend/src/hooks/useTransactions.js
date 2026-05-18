// ============================================================
// File: src/hooks/useTransactions.js
// Custom hook to manage transactions: load, add, update, delete
// ============================================================

import { useState, useCallback, useRef } from "react";
import { useAuth }       from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";
import { translateError } from "../data/constants/errorMessages";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function useTransactions() {
  const { fetchWithAuth }           = useAuth();
  const { transactions, setTransactions } = useAppContext();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);
  const [errorMsg,  setErrorMsg]  = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const errorTimerRef   = useRef(null);
  const successTimerRef = useRef(null);

  function showError(msg) {
    setErrorMsg(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(""), 4000);
  }

  function showSuccess(msg) {
    setSuccessMsg(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessMsg(""), 3000);
  }

  // ── Load transactions for a given budgetMonth (YYYY-MM) ──────────────────────
  const loadTransactions = useCallback(async (budgetMonth) => {
    if (!budgetMonth) return;
    setIsLoading(true);
    setErrorMsg("");
    try {
      const res = await fetchWithAuth(
        `${API_URL}/api/transactions?budgetMonth=${budgetMonth}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Nie udało się pobrać transakcji.");
      }
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, setTransactions]);

  // ── Add new transaction ──────────────────────────────────────────────────────
  const addTransaction = useCallback(async (payload) => {
    setIsSaving(true);
    setErrorMsg("");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/transactions`, {
        method: "POST",
        body:   JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(translateError(err.error, "Nie udało się dodać transakcji."));
      }
      const saved = await res.json();
      setTransactions(prev => [saved, ...prev]);
      showSuccess("Transakcja dodana! ✅");
      return saved;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setTransactions]);

  // ── Update existing transaction ──────────────────────────────────────────────
  const updateTransaction = useCallback(async (id, patch) => {
  setIsSaving(true);
  setErrorMsg("");
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
 
    const updated = await res.json();
    setTransactions(prev => prev.map(t => t.id === id ? updated : t));
    showSuccess("Transakcja zaktualizowana! ✅");
    return updated;
  } catch (err) {
    showError(err.message);
    return null;
  } finally {
    setIsSaving(false);
  }
}, [fetchWithAuth, setTransactions]);

  // ── Soft-delete transaction ──────────────────────────────────────────────────
const deleteTransaction = useCallback(async (id, options = {}) => {
  setIsSaving(true);
  setErrorMsg("");
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
 
    const body = await res.json();
    setTransactions(prev => prev.filter(t => t.id !== id));
    showSuccess("Transakcja zarchiwizowana.");
    return body;
  } catch (err) {
    showError(err.message);
    return null;
  } finally {
    setIsSaving(false);
  }
}, [fetchWithAuth, setTransactions]);

  return {
    transactions,
    isLoading,
    isSaving,
    errorMsg,
    successMsg,
    loadTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}