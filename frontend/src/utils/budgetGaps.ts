// ============================================================
// File: src/utils/budgetGaps.ts
//
// Is an expense category's budget set too low? The one rule behind the
// warnings in Baza budżetu — the row highlight and the banner above the
// table read from here, so they can't disagree.
//
// Two levels:
//   - "short" / "noBase" (red): the limit doesn't cover what the month has
//     ALREADY committed — spent so far + planned purchases not yet made +
//     recurring costs not yet confirmed. A confirmed recurring cost and a
//     realised plan are in `spent` by then, so nothing counts twice.
//   - "belowAverage" (amber): nothing committed exceeds the limit, but it
//     sits clearly under what the category has cost over the last year.
//
// Only for EXPENSE: saving more than planned is not a problem to flag.
//
// Pure — see budgetGaps.test.ts.
// ============================================================

import { round2 } from "./helpers";

/** The limit has to be under this share of the yearly average to warn… */
export const BELOW_AVERAGE_SHARE = 0.85;
/** …and at least this many złote under it, so small categories stay quiet. */
export const BELOW_AVERAGE_MIN = 50;

export interface BudgetGapInput {
  /** Active limit (override or base) as it stands in the form; null = none. */
  limit:         number | null;
  spent:         number;
  /** Planned purchases for the month not yet bought. */
  plannedOpen:   number;
  /** Recurring costs active in the month not yet confirmed. */
  recurringOpen: number;
  /** Mean monthly cost over the last year, when there is history. */
  average?:      number;
}

export type BudgetGap =
  | { kind: "short";        committed: number; shortBy: number }
  | { kind: "noBase";       committed: number; shortBy: number }
  | { kind: "belowAverage"; average:   number; shortBy: number };

export function budgetGap({ limit, spent, plannedOpen, recurringOpen, average }: BudgetGapInput): BudgetGap | null {
  const committed = round2(spent + plannedOpen + recurringOpen);

  if (limit === null) {
    return committed > 0.005 ? { kind: "noBase", committed, shortBy: committed } : null;
  }
  if (committed - limit > 0.005) {
    return { kind: "short", committed, shortBy: round2(committed - limit) };
  }
  if (average !== undefined && limit < average * BELOW_AVERAGE_SHARE && average - limit >= BELOW_AVERAGE_MIN) {
    return { kind: "belowAverage", average, shortBy: round2(average - limit) };
  }
  return null;
}

/** A gap that means the month can't fit its limit — red, as opposed to amber. */
export const isHardGap = (gap: BudgetGap | null | undefined): gap is Extract<BudgetGap, { committed: number }> =>
  gap?.kind === "short" || gap?.kind === "noBase";
