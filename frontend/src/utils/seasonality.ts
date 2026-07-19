// ============================================================
// File: src/utils/seasonality.ts
// Pure logic for the "Sezonowość" analytics section.
//
// Two views:
//   - yearOverlay: expenses pivoted to calendar months (Sty..Gru) with
//     one column per year — the classic seasonality overlay,
//   - yoyComparison: one month vs the same month a year earlier, per
//     category — feeds the existing MonthlyDeltaChart.
//
// Amount conventions match the rest of PanelAnalytics: monthly totals
// are cash-flow (calculateEffectiveAmount), per-category comparisons
// are net of all returns (calculateNetAmount).
//
// Everything here is a pure function — see seasonality.test.ts.
// ============================================================

import { calculateEffectiveAmount, calculateNetAmount } from "./returnUtils";

// ── Types ─────────────────────────────────────────────────────

/** Minimal transaction shape the aggregations need (subset of range docs). */
export interface SeasonalityTx {
  type:         string;
  budgetMonth:  string;
  categoryId:   string;
  categoryName: string;
  amount:       number;
  returns?:     Array<{ moneyReturnedInMonth: string; cashAmount?: number }>;
}

/** One calendar month; dynamic per-year columns hold that year's total. */
export interface YearOverlayRow {
  monthIdx: number;    // 1..12
  [year: string]: number;
}

export interface YoyDelta {
  categoryId:   string;
  categoryName: string;
  current:      number;
  previous:     number;   // same month, one year earlier
  delta:        number;
}

// ── Month arithmetic ──────────────────────────────────────────

/** "2026-01" + (-2) → "2025-11". */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12 + 12) % 12 + 1).padStart(2, "0")}`;
}

/** Inclusive "YYYY-MM" list, oldest first. (Moved from PanelAnalytics.) */
export function enumerateMonths(fromYM: string, toYM: string): string[] {
  const result: string[] = [];
  for (let ym = fromYM; ym <= toYM; ym = shiftMonth(ym, 1)) result.push(ym);
  return result;
}

// ── Year overlay ──────────────────────────────────────────────

/**
 * Pivot: rows = calendar months 1..12, one column per year present in
 * `months`. Months outside the window get NO key at all, so recharts
 * renders a gap instead of a misleading zero.
 */
export function yearOverlay(
  transactions: SeasonalityTx[],
  months: string[],
): { rows: YearOverlayRow[]; years: string[] } {
  const monthsSet = new Set(months);
  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort();

  const rows: YearOverlayRow[] = Array.from({ length: 12 }, (_, i) => ({ monthIdx: i + 1 }));
  for (const ym of months) {
    const [year, mm] = ym.split("-");
    rows[Number(mm) - 1][year] = 0;
  }
  for (const tx of transactions) {
    if (tx.type !== "EXPENSE" || !monthsSet.has(tx.budgetMonth)) continue;
    const [year, mm] = tx.budgetMonth.split("-");
    rows[Number(mm) - 1][year] += calculateEffectiveAmount(tx, tx.budgetMonth);
  }
  return { rows, years };
}

// ── Year-over-year comparison ─────────────────────────────────

/** Months from the list that also have their year-earlier month in it. */
export function yoyEligibleMonths(months: string[]): string[] {
  const set = new Set(months);
  return months.filter(m => set.has(shiftMonth(m, -12)));
}

/**
 * Default pick for the YoY dropdown: the latest FULL month (strictly
 * before `currentMonth`) so a half-elapsed month doesn't fake a drop;
 * falls back to the latest eligible one.
 */
export function defaultYoyMonth(eligible: string[], currentMonth: string): string | null {
  if (eligible.length === 0) return null;
  const full = eligible.filter(m => m < currentMonth);
  return full[full.length - 1] ?? eligible[eligible.length - 1];
}

/** First month YoY becomes possible: a year after the first data month. */
export function yoyUnlockMonth(firstDataMonth: string): string {
  return shiftMonth(firstDataMonth, 12);
}

export function yoyComparison(
  transactions: SeasonalityTx[],
  month: string,
): { deltas: YoyDelta[]; totals: { current: number; previous: number } } {
  const prevMonth = shiftMonth(month, -12);
  const acc = new Map<string, YoyDelta>();
  const totals = { current: 0, previous: 0 };

  for (const tx of transactions) {
    if (tx.type !== "EXPENSE") continue;
    const isCur = tx.budgetMonth === month;
    if (!isCur && tx.budgetMonth !== prevMonth) continue;
    const net = calculateNetAmount(tx);

    let row = acc.get(tx.categoryId);
    if (!row) {
      row = { categoryId: tx.categoryId, categoryName: tx.categoryName, current: 0, previous: 0, delta: 0 };
      acc.set(tx.categoryId, row);
    }
    if (isCur) { row.current  += net; totals.current  += net; }
    else       { row.previous += net; totals.previous += net; }
  }

  const deltas = [...acc.values()]
    .map(r => ({ ...r, delta: r.current - r.previous }))
    .filter(r => Math.abs(r.delta) > 0.005);
  return { deltas, totals };
}
