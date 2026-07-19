// ============================================================
// File: src/utils/monthForecast.ts
// Pure logic for the end-of-month run-rate forecast.
//
// Naive run-rate (spent ÷ days × month) lies whenever fixed costs land
// early — rent paid on the 1st would project to 30× rent. The forecast
// therefore splits expenses into two streams:
//   fixed    — recurring-linked transactions; they happen once, so the
//              projection is: already paid + upcoming unconfirmed
//              recurring occurrences of this month (known from the
//              RecurringTransactions schedule — a fact, not a guess),
//   variable — everything else; scales linearly with elapsed days.
//
//   projected = fixedSpent + upcomingFixed + variableSpent × pace
//
// Planned expenses are deliberately NOT part of the projection — they
// are "soft" (may or may not happen), so plannedTotalForMonth feeds a
// separate informational line in the UI instead.
//
// Everything here is a pure function — see monthForecast.test.ts.
// ============================================================

import { calculateEffectiveAmount } from "./returnUtils";
import {
  isActiveInMonth, isConfirmedInMonth, getActiveCost,
} from "../hooks/useRecurring";
import type { RecurringDoc } from "../types/appContext";
import type { PlannedDoc } from "../hooks/usePlanned";

// ── Types ─────────────────────────────────────────────────────

/** Minimal transaction shape the forecast needs (subset of range docs). */
export interface ForecastTransaction {
  type:         string;
  budgetMonth:  string;
  categoryId:   string;
  categoryName: string;
  amount:       number;
  isRecurring?: boolean;
  recurringId?: string | null;
  returns?:     Array<{ moneyReturnedInMonth: string; cashAmount?: number }>;
}

export interface MonthProgress {
  daysInMonth:     number;
  dayOfMonth:      number;   // today for the current month, month length otherwise
  elapsedFraction: number;
  isCurrentMonth:  boolean;
}

export interface UpcomingRecurring {
  id:          string;
  description: string;
  categoryId:  string | null;
  amountPLN:   number;
  day:         number;       // scheduled payment day
}

export interface CategoryForecast {
  categoryId:    string;
  categoryName:  string;
  spent:         number;         // effective (net of in-month returns)
  fixedSpent:    number;
  variableSpent: number;
  upcomingFixed: number;
  projected:     number;
  limit:         number | null;
  overBy:        number;         // max(0, projected − limit); 0 without a limit
  crossingDay:   number | null;  // estimated day-of-month the limit is crossed
}

export interface MonthForecastResult {
  progress:           MonthProgress;
  spent:              number;
  fixedSpent:         number;
  variableSpent:      number;
  upcomingFixedTotal: number;   // includes occurrences without a categoryId
  projected:          number;
  limitTotal:         number;
  lowConfidence:      boolean;  // too few elapsed days for a stable pace
  categories:         CategoryForecast[];  // at-risk first
}

/** Below this many elapsed days the variable pace is noise, not signal. */
export const MIN_PACE_DAYS = 5;

// ── Building blocks ───────────────────────────────────────────

export function monthProgress(month: string, todayStr: string): MonthProgress {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth    = new Date(y, m, 0).getDate();
  const isCurrentMonth = todayStr.slice(0, 7) === month;
  const dayOfMonth     = isCurrentMonth
    ? Math.min(Number(todayStr.slice(8, 10)), daysInMonth)
    : daysInMonth;
  return { daysInMonth, dayOfMonth, elapsedFraction: dayOfMonth / daysInMonth, isCurrentMonth };
}

/** Shared fixed-vs-variable predicate (same rule PanelAnalytics charts use). */
export function isFixedExpense(tx: Pick<ForecastTransaction, "isRecurring" | "recurringId">): boolean {
  return tx.isRecurring === true || (tx.recurringId ?? null) !== null;
}

/**
 * Recurring occurrences of `month` that have no transaction yet.
 * Overdue-but-unconfirmed ones are included on purpose — they are still
 * known obligations that will hit the month.
 */
export function upcomingRecurringForMonth(docs: RecurringDoc[], month: string): UpcomingRecurring[] {
  return docs
    .filter(d => isActiveInMonth(d, month) && !isConfirmedInMonth(d, month))
    .map(d => {
      const cost = getActiveCost(d, month);
      return {
        id:          d.id,
        description: d.description,
        categoryId:  d.categoryId ?? null,
        amountPLN:   cost ? (cost.amountPLN ?? cost.amount) : 0,
        day:         d.plannedDay || 1,
      };
    })
    .filter(u => u.amountPLN > 0);
}

/** "Soft" planned purchases targeting `month` — the informational line. */
export function plannedTotalForMonth(docs: PlannedDoc[], month: string): { total: number; count: number } {
  const eligible = docs.filter(d => !d.isArchived && !d.isPurchased && d.plannedMonth === month);
  return {
    total: eligible.reduce((sum, d) => sum + d.totalAmountPLN, 0),
    count: eligible.length,
  };
}

// ── Forecast ──────────────────────────────────────────────────

/**
 * Day-of-month estimate for crossing the limit. Conservative on purpose:
 * upcoming fixed costs are assumed to land before the crossing, so the
 * warning fires early rather than late.
 */
function crossingDayFor(
  limit: number, spent: number, upcomingFixed: number,
  variablePace: number, dayOfMonth: number, daysInMonth: number,
): number | null {
  if (spent >= limit) return dayOfMonth;                             // already crossed
  const remaining = limit - spent - upcomingFixed;
  if (remaining <= 0) return Math.min(dayOfMonth + 1, daysInMonth);  // fixed alone crosses
  if (variablePace <= 0) return null;
  return Math.min(daysInMonth, dayOfMonth + Math.ceil(remaining / variablePace));
}

export function computeMonthForecast(args: {
  transactions:    ForecastTransaction[];
  month:           string;
  todayStr:        string;
  upcoming:        UpcomingRecurring[];
  /** Active limit per EXPENSE category (resolved for `month` by the caller). */
  limitByCategory: Record<string, number>;
}): MonthForecastResult {
  const { transactions, month, todayStr, upcoming, limitByCategory } = args;
  const progress = monthProgress(month, todayStr);
  const { dayOfMonth, daysInMonth } = progress;

  type Row = Omit<CategoryForecast, "projected" | "limit" | "overBy" | "crossingDay">;
  const byCat = new Map<string, Row>();
  const row = (categoryId: string, categoryName: string): Row => {
    let r = byCat.get(categoryId);
    if (!r) {
      r = { categoryId, categoryName, spent: 0, fixedSpent: 0, variableSpent: 0, upcomingFixed: 0 };
      byCat.set(categoryId, r);
    }
    return r;
  };

  // Seed rows for every limited category so untouched limits still count
  // as "in the green" instead of silently disappearing from the summary.
  for (const categoryId of Object.keys(limitByCategory)) row(categoryId, categoryId);

  for (const tx of transactions) {
    if (tx.type !== "EXPENSE" || tx.budgetMonth !== month) continue;
    const eff = calculateEffectiveAmount(tx, month);
    const r = row(tx.categoryId, tx.categoryName);
    r.categoryName = tx.categoryName;   // upgrade seeded id-only names
    r.spent += eff;
    if (isFixedExpense(tx)) r.fixedSpent += eff;
    else                    r.variableSpent += eff;
  }

  let upcomingFixedTotal = 0;
  for (const u of upcoming) {
    upcomingFixedTotal += u.amountPLN;
    if (u.categoryId) row(u.categoryId, u.categoryId).upcomingFixed += u.amountPLN;
  }

  // Linear pace; for a non-current month dayOfMonth === daysInMonth, so the
  // formula degrades gracefully to "projected = spent + upcoming".
  const project = (r: Row) =>
    r.fixedSpent + r.upcomingFixed + (r.variableSpent / dayOfMonth) * daysInMonth;

  const categories: CategoryForecast[] = [...byCat.values()]
    .map(r => {
      const projected = project(r);
      const limit = limitByCategory[r.categoryId] ?? null;
      const overBy = limit !== null ? Math.max(0, projected - limit) : 0;
      return {
        ...r,
        projected,
        limit,
        overBy,
        crossingDay: limit !== null && overBy > 0
          ? crossingDayFor(limit, r.spent, r.upcomingFixed, r.variableSpent / dayOfMonth, dayOfMonth, daysInMonth)
          : null,
      };
    })
    .sort((a, b) => {
      if ((a.overBy > 0) !== (b.overBy > 0)) return a.overBy > 0 ? -1 : 1;
      if (a.overBy > 0) {
        const ad = a.crossingDay ?? daysInMonth + 1;
        const bd = b.crossingDay ?? daysInMonth + 1;
        if (ad !== bd) return ad - bd;   // soonest crossing first
      }
      return b.projected - a.projected;
    });

  const totals = categories.reduce(
    (acc, r) => ({
      spent:         acc.spent         + r.spent,
      fixedSpent:    acc.fixedSpent    + r.fixedSpent,
      variableSpent: acc.variableSpent + r.variableSpent,
    }),
    { spent: 0, fixedSpent: 0, variableSpent: 0 },
  );

  return {
    progress,
    ...totals,
    upcomingFixedTotal,
    projected: totals.fixedSpent + upcomingFixedTotal
             + (totals.variableSpent / dayOfMonth) * daysInMonth,
    limitTotal: Object.values(limitByCategory).reduce((sum, v) => sum + v, 0),
    lowConfidence: progress.isCurrentMonth && dayOfMonth < MIN_PACE_DAYS,
    categories,
  };
}
