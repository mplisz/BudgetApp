// ============================================================
// File: src/hooks/useMonthFromUrl.ts
//
// Single source of truth for "which month is the user viewing" —
// reads / writes the `?m=YYYY-MM` query parameter via React Router.
//
// Why a hook instead of context:
//   - useSearchParams already gives us reactive read + write
//   - keeps the URL as the SOLE source of truth (no parallel state)
//   - panels that don't care about month don't pay any subscription cost
//
// Returns:
//   - budgetMonth: "YYYY-MM" string (current calendar month when ?m= absent or invalid)
//   - setBudgetMonth(next): updates `?m=` keeping all other query params intact
//   - month / year: convenience numerics (0-indexed month for compat with old code)
// ============================================================

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentMonthYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parseBudgetMonth(s: string | null | undefined): {
  valid: boolean; year: number; month: number; ymd: string;
} {
  if (!s || !MONTH_RE.test(s)) {
    const d = new Date();
    return {
      valid: false,
      year:  d.getFullYear(),
      month: d.getMonth(),       // 0-indexed
      ymd:   currentMonthYMD(),
    };
  }
  const [y, m] = s.split("-").map(Number);
  return { valid: true, year: y, month: m - 1, ymd: s };
}

export interface UseMonthFromUrlResult {
  /** "YYYY-MM" string, always defined. Falls back to current calendar month. */
  budgetMonth: string;
  /** 0-indexed month (legacy compat with old setMonth calls) */
  month:       number;
  year:        number;
  /** True when ?m= is present AND parses correctly */
  isExplicit:  boolean;
  /** Update ?m=, preserving other query params */
  setBudgetMonth: (next: string) => void;
}

export function useMonthFromUrl(): UseMonthFromUrlResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("m");
  const parsed = parseBudgetMonth(raw);

  const setBudgetMonth = useCallback((next: string) => {
    setSearchParams(prev => {
      const out = new URLSearchParams(prev);
      out.set("m", next);
      return out;
    }, { replace: false });
  }, [setSearchParams]);

  return {
    budgetMonth: parsed.ymd,
    month:       parsed.month,
    year:        parsed.year,
    isExplicit:  parsed.valid,
    setBudgetMonth,
  };
}

// ── Month arithmetic helpers (independent of URL state) ──────

export function addMonthsToYM(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = (y * 12 + (m - 1)) + n;
  const newY = Math.floor(idx / 12);
  const newM = ((idx % 12) + 12) % 12;
  return `${newY}-${String(newM + 1).padStart(2, "0")}`;
}
