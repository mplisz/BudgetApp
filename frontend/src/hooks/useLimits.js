// ============================================================
// File: src/hooks/useLimits.js
// Manages limit documents — one per category, limits[] array.
// State lives in AppContext (limits/setLimits).
//
// getActiveLimit(doc, month) — pure helper, same algo as backend:
//   override → exact month match only
//   base     → highest date <= month
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useAuth }       from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Pure helper (mirrors backend) ─────────────────────────────

export function getActiveLimit(doc, month) {
  if (!doc?.limits?.length) return null;

  // Override has priority — exact month only
  const override = doc.limits.find(l => l.type === "override" && l.date === month);
  if (override) return { amount: override.amount, type: "override", date: override.date };

  // Base — highest date <= month
  const bases = doc.limits
    .filter(l => l.type === "base" && l.date <= month)
    .sort((a, b) => b.date.localeCompare(a.date));

  return bases.length
    ? { amount: bases[0].amount, type: "base", date: bases[0].date }
    : null;
}

// Build a categoryId → activeLimit map for a given month
export function buildLimitMap(limitDocs, month) {
  const map = {};
  for (const doc of limitDocs) {
    const active = getActiveLimit(doc, month);
    if (active) map[doc.categoryId] = active;
  }
  return map;
}

// ── Hook ─────────────────────────────────────────────────────

export function useLimits() {
  const { fetchWithAuth }          = useAuth();
  const { limits, setLimits }      = useAppContext();
  const { showSuccess, showError } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  // Load all limit docs
  const loadLimits = useCallback(async () => {
    setIsLoading(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/limits`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load limits.");
      setLimits(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, setLimits, showError]);

  // Upsert a single limit entry
  // type: "base" | "override"
  const saveLimit = useCallback(async (categoryId, date, amount, type) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/limits`, {
        method: "POST",
        body:   JSON.stringify({ categoryId, date, amount, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save limit.");

      // Update local state — replace doc for this category
      setLimits(prev => {
        const exists = prev.some(l => l.categoryId === categoryId);
        return exists
          ? prev.map(l => l.categoryId === categoryId ? data : l)
          : [...prev, data];
      });

      showSuccess(type === "base" ? "Limit bazowy zapisany ✅" : "Nadpisanie zapisane ✅");
      return data;
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setLimits, showSuccess, showError]);

  // Remove a specific entry from limits[]
  const removeLimit = useCallback(async (categoryId, date, type) => {
    setIsSaving(true);
    try {
      const res  = await fetchWithAuth(
        `${API_URL}/api/limits/${categoryId}?date=${date}&type=${type}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove limit.");

      setLimits(prev => prev.map(l => l.categoryId === categoryId ? data : l));
      showSuccess("Limit usunięty.");
      return true;
    } catch (err) {
      showError(err.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [fetchWithAuth, setLimits, showSuccess, showError]);

  // Get limit doc for a specific category
  const getLimitDoc = useCallback((categoryId) =>
    limits.find(l => l.categoryId === categoryId) ?? null,
    [limits]
  );

  // Get active limit for a category in a given month
  const getLimit = useCallback((categoryId, month) => {
    const doc = getLimitDoc(categoryId);
    return getActiveLimit(doc, month);
  }, [getLimitDoc]);

  return {
    limits, isLoading, isSaving,
    loadLimits, saveLimit, removeLimit,
    getLimit, getLimitDoc, buildLimitMap,
    getActiveLimit,
  };
}