// ============================================================
// File: src/hooks/useLimits.ts
// Manages limit documents — one per category, limits[] array.
// State lives in AppContext (limits / setLimits).
//
// Key change vs .js version:
//   saveLimitsBatch() — sends all changes in one request instead
//   of N parallel POST /api/limits calls, avoiding rate limiting.
// ============================================================

import { useState, useCallback } from "react";
import { useAppContext } from "../context/AppContext";
import { useToast }      from "./useToast";
import { useApi }        from "./useApi";

// ── Domain types ──────────────────────────────────────────────

export type LimitType = "base" | "override";

export interface LimitEntry {
  date:   string;   // "YYYY-MM"
  amount: number;
  type:   LimitType;
}

export interface LimitDoc {
  id:         string;
  categoryId: string;
  userId:     string;
  limits:     LimitEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ActiveLimit {
  amount: number;
  type:   LimitType;
  date:   string;
}

export type BatchAction = "upsert" | "delete";

export interface BatchLimitChange {
  categoryId: string;
  date:       string;
  amount:     number;
  type:       LimitType;
  action?:    BatchAction;
}

// ── Pure helpers (mirrors backend logic) ─────────────────────

export function getActiveLimit(doc: LimitDoc | null | undefined, month: string): ActiveLimit | null {
  if (!doc?.limits?.length) return null;

  // Override has priority — exact month match only
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

export function buildLimitMap(limitDocs: LimitDoc[], month: string): Record<string, ActiveLimit> {
  const map: Record<string, ActiveLimit> = {};
  for (const doc of limitDocs) {
    const active = getActiveLimit(doc, month);
    if (active) map[doc.categoryId] = active;
  }
  return map;
}

// ── Hook ─────────────────────────────────────────────────────

interface UseLimitsResult {
  limits:           LimitDoc[];
  isLoading:        boolean;
  isSaving:         boolean;
  loadLimits:       () => Promise<void>;
  saveLimit:        (categoryId: string, date: string, amount: number, type: LimitType) => Promise<LimitDoc | null>;
  saveLimitsBatch:  (changes: BatchLimitChange[]) => Promise<LimitDoc[]>;
  removeLimit:      (categoryId: string, date: string, type: LimitType) => Promise<boolean>;
  getLimitDoc:      (categoryId: string) => LimitDoc | null;
  getLimit:         (categoryId: string, month: string) => ActiveLimit | null;
}

export function useLimits(): UseLimitsResult {
  const api                        = useApi();
  const { limits, setLimits }      = useAppContext();
  const { showSuccess, showError } = useToast() as {
    showSuccess: (msg: string) => void;
    showError:   (msg: string) => void;
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  // ── Load all limit docs ────────────────────────────────────

  const loadLimits = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<LimitDoc[]>("/api/limits", { fallback: "Nie udało się pobrać limitów." });
      setLimits(data);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [api, setLimits, showError]);

  // ── Save single limit entry (kept for compatibility) ───────

  const saveLimit = useCallback(async (
    categoryId: string,
    date: string,
    amount: number,
    type: LimitType,
  ): Promise<LimitDoc | null> => {
    const results = await saveLimitsBatch([{ categoryId, date, amount, type, action: "upsert" }]);
    return results[0] ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Batch save — one request for all changes ───────────────
  // Groups by categoryId on the backend, so N categories = N Cosmos writes
  // instead of N×2 (read+write) separate HTTP requests.

  const saveLimitsBatch = useCallback(async (
    changes: BatchLimitChange[],
  ): Promise<LimitDoc[]> => {
    if (changes.length === 0) return [];
    setIsSaving(true);
    try {
      // 207 = multi-status: some categories saved, some failed. Treat as
      // success so we can read `saved`/`errors` and surface partial errors.
      const data = await api.post<{ saved: LimitDoc[]; errors: Array<{ categoryId: string; error: string }> }>(
        "/api/limits/batch",
        { changes },
        { okStatuses: [207], fallback: "Nie udało się zapisać limitów." },
      );

      // Partial errors — show warning but don't throw
      if (data.errors?.length) {
        const failed = data.errors.map(e => e.categoryId).join(", ");
        showError(`Nie udało się zapisać niektórych kategorii: ${failed}`);
      }

      // Update local state — replace docs for affected categories
      if (data.saved?.length) {
        setLimits(prev => {
          const updated = [...prev];
          for (const doc of data.saved) {
            const idx = updated.findIndex(l => l.categoryId === doc.categoryId);
            if (idx >= 0) updated[idx] = doc;
            else updated.push(doc);
          }
          return updated;
        });
        showSuccess(`Limity zapisane ✅`);
      }

      return data.saved ?? [];
    } catch (err) {
      showError((err as Error).message);
      return [];
    } finally {
      setIsSaving(false);
    }
  }, [api, setLimits, showSuccess, showError]);

  // ── Remove a single limit entry ────────────────────────────

  const removeLimit = useCallback(async (
    categoryId: string,
    date: string,
    type: LimitType,
  ): Promise<boolean> => {
    const results = await saveLimitsBatch([{ categoryId, date, amount: 0, type, action: "delete" }]);
    return results.length > 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Getters ────────────────────────────────────────────────

  const getLimitDoc = useCallback(
    (categoryId: string): LimitDoc | null =>
      limits.find(l => l.categoryId === categoryId) ?? null,
    [limits]
  );

  const getLimit = useCallback(
    (categoryId: string, month: string): ActiveLimit | null =>
      getActiveLimit(getLimitDoc(categoryId), month),
    [getLimitDoc]
  );

  return {
    limits, isLoading, isSaving,
    loadLimits, saveLimit, saveLimitsBatch, removeLimit,
    getLimitDoc, getLimit,
  };
}
