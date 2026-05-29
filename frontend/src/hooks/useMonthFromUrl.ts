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
// Clamp (appStartMonth):
//   The URL is user-editable — someone can type ?m=2026-04 directly.
//   We must NOT trust it blindly. useMonthGuard() (below) enforces the
//   appStartMonth floor: if the URL month is earlier than the configured
//   start month, it redirects (replace) to the start month. Call it once
//   near the top of the app (AuthenticatedLayout) so every route honours
//   the floor regardless of how the user arrived.
//
// Returns:
//   - budgetMonth: "YYYY-MM" string (current calendar month when ?m= absent or invalid)
//   - setBudgetMonth(next): updates `?m=` keeping all other query params intact
//   - month / year: convenience numerics (0-indexed month for compat with old code)
// ============================================================

import { useCallback, useEffect } from "react";
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

// ── Clamp guard ──────────────────────────────────────────────
//
// Enforces the appStartMonth floor on the ?m= param. Mount once high in
// the tree. If the current URL month is below `minMonth`, it rewrites
// the URL (replace) to `minMonth` so:
//   - deep links like ?m=2026-04 self-correct to ?m=2026-06
//   - the back button isn't polluted by the bad entry (replace, not push)
//   - every panel downstream sees a valid month, no per-panel checks
//
// `minMonth` is null/undefined → no floor (feature disabled). Pass
// settings.appStartMonth from the caller (it has AppContext access).

export function useMonthGuard(minMonth: string | null | undefined): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("m");

  useEffect(() => {
    if (!minMonth || !MONTH_RE.test(minMonth)) return;     // floor disabled
    // Only act when ?m= is explicitly present AND below the floor.
    // When ?m= is absent we leave it alone — the default-month logic
    // (navigateToFirstOpenMonth) handles the no-param case elsewhere.
    if (!raw || !MONTH_RE.test(raw)) return;
    if (raw >= minMonth) return;                            // already valid

    setSearchParams(prev => {
      const out = new URLSearchParams(prev);
      out.set("m", minMonth);
      return out;
    }, { replace: true });                                 // replace — no history spam
  }, [raw, minMonth, setSearchParams]);
}

// ── Month arithmetic helpers (independent of URL state) ──────

export function addMonthsToYM(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = (y * 12 + (m - 1)) + n;
  const newY = Math.floor(idx / 12);
  const newM = ((idx % 12) + 12) % 12;
  return `${newY}-${String(newM + 1).padStart(2, "0")}`;
}

// True if ym is strictly before floor ("YYYY-MM" lexicographic compare is safe)
export function isBeforeMonth(ym: string, floor: string): boolean {
  return ym < floor;
}
