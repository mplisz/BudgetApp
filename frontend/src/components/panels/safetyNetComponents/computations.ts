// ============================================================
// File: src/components/panels/safetyNetComponents/computations.ts
//
// Pure functions for the Safety Net panel.
// No React, no hooks, no I/O — fully testable.
//
// Inputs are normalised to: array of SnTransaction restricted to the
// lookback window. All averages are computed against the lookback's
// effective month count, NOT the number of months that had data,
// because zero-spend months should pull the average down (otherwise
// a single high month would mislead).
// ============================================================

import { calculateEffectiveAmount } from "../../../utils/returnUtils";
import type {
  BudgetMonth,
  CostLayer,
  IncomeSource,
  LevelDeficit,
  PriorityLevel,
  SnTransaction,
  AssetBucket,
  SavingCapability,
  WhatIfDelta,
  UpcomingPlanned,
} from "./types";
import { LEVEL_META } from "./types";
import type { PlannedDoc } from "../../../hooks/usePlanned";

// ── Month range helpers ──────────────────────────────────────

/**
 * Last N budgetMonths counting backwards from current calendar month
 * (current month INCLUDED, oldest first). Example with months=3 in
 * 2026-05 → ["2026-03", "2026-04", "2026-05"].
 */
export function lastNMonths(n: number, today: Date = new Date()): BudgetMonth[] {
  const out: BudgetMonth[] = [];
  const y = today.getFullYear();
  const m = today.getMonth();        // 0-indexed
  for (let i = n - 1; i >= 0; i--) {
    const idx = m - i;
    const yr  = y + Math.floor(idx / 12);
    const mo  = ((idx % 12) + 12) % 12;
    out.push(`${yr}-${String(mo + 1).padStart(2, "0")}`);
  }
  return out;
}

export function isInWindow(tx: SnTransaction, windowMonths: BudgetMonth[]): boolean {
  return windowMonths.includes(tx.budgetMonth);
}

/**
 * Next N budgetMonths counting forwards from current calendar month
 * (current month INCLUDED, oldest first). Used for upcoming-planned
 * lookups in the horizon window. Example with months=6 in 2026-05 →
 * ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].
 */
export function nextNMonths(n: number, today: Date = new Date()): BudgetMonth[] {
  const out: BudgetMonth[] = [];
  const y = today.getFullYear();
  const m = today.getMonth();        // 0-indexed
  for (let i = 0; i < n; i++) {
    const idx = m + i;
    const yr  = y + Math.floor(idx / 12);
    const mo  = ((idx % 12) + 12) % 12;
    out.push(`${yr}-${String(mo + 1).padStart(2, "0")}`);
  }
  return out;
}

// ── Cost layers (per priority, cumulative) ───────────────────

/**
 * Compute the 4 cost layers (Survival → No Change).
 * For each priority bucket we use the EFFECTIVE amount (after same-month
 * cash returns). Transactions missing a priority are treated as P4 — same
 * convention as PriorityBreakdown.tsx.
 */
export function computeCostLayers(
  txInWindow: SnTransaction[],
  lookbackMonths: number,
): CostLayer[] {
  const buckets: Record<PriorityLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const tx of txInWindow) {
    if (tx.type !== "EXPENSE") continue;
    const prio = (tx.priority ?? 4) as PriorityLevel;
    buckets[prio] += calculateEffectiveAmount(tx, tx.budgetMonth);
  }

  const months = Math.max(1, lookbackMonths);

  // Cumulative running total
  let running = 0;
  return ([1, 2, 3, 4] as PriorityLevel[]).map(level => {
    const bucketAvg = buckets[level] / months;
    running += bucketAvg;
    return {
      level,
      label:       LEVEL_META[level].modeLabel,
      color:       LEVEL_META[level].color,
      monthlyCost: running,
      bucketCost:  bucketAvg,
    };
  });
}

// ── Income sources ───────────────────────────────────────────

/**
 * Aggregate unique income sources from INCOME transactions in the window.
 * Keying strategy: prefer subcategoryId (more granular — "Sopra Steria",
 * "PwC"), fall back to categoryId. Display label combines both names.
 */
export function computeIncomeSources(
  txInWindow: SnTransaction[],
  lookbackMonths: number,
): IncomeSource[] {
  const map = new Map<string, {
    key: string;
    label: string;
    categoryId: string;
    categoryName: string;
    total: number;
    monthsSeenSet: Set<string>;
  }>();

  for (const tx of txInWindow) {
    if (tx.type !== "INCOME") continue;
    const key = tx.subcategoryId || tx.categoryId;
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: tx.subcategoryName
          ? `${tx.categoryName} › ${tx.subcategoryName}`
          : tx.categoryName,
        categoryId:   tx.categoryId,
        categoryName: tx.categoryName,
        total:        0,
        monthsSeenSet: new Set(),
      });
    }
    const entry = map.get(key)!;
    entry.total += tx.amount;
    entry.monthsSeenSet.add(tx.budgetMonth);
  }

  const months = Math.max(1, lookbackMonths);
  return Array.from(map.values())
    .map(e => ({
      key:          e.key,
      label:        e.label,
      categoryId:   e.categoryId,
      categoryName: e.categoryName,
      avgMonthly:   e.total / months,
      monthsSeen:   e.monthsSeenSet.size,
    }))
    .sort((a, b) => b.avgMonthly - a.avgMonthly);
}

// ── Remaining income after losing some sources ───────────────

export function computeRemainingIncome(
  sources: IncomeSource[],
  excludedKeys: string[],
): number {
  const excluded = new Set(excludedKeys);
  return sources
    .filter(s => !excluded.has(s.key))
    .reduce((sum, s) => sum + s.avgMonthly, 0);
}

// ── Upcoming planned expenses (in horizon) ───────────────────

/**
 * Filter active (non-archived, non-purchased) planned expenses down to
 * those that put real cost on the cushion in the next `horizonMonths`.
 *
 * Logic per spec:
 *   - oneoff with plannedMonth in window   → amountInHorizon = totalAmountPLN
 *   - envelope with plannedMonth in window → amountInHorizon = total - sumPaid
 *     (everything we still need to gather to make the goal)
 *   - envelope with plannedMonth beyond window → only the
 *     unpaid + undismissed virtualSavings entries that fall inside the
 *     window (because losing the job means we can just halt remaining
 *     savings on a far-future goal)
 *   - Sorted by plannedMonth ascending (earliest first) for UI display.
 */
export function computeUpcomingPlanned(
  planned:       PlannedDoc[],
  horizonMonths: number,
  today:         Date = new Date(),
): UpcomingPlanned[] {
  if (!Array.isArray(planned) || planned.length === 0) return [];
  const window      = nextNMonths(horizonMonths, today);
  const windowSet   = new Set(window);
  const windowLast  = window[window.length - 1];

  const result: UpcomingPlanned[] = [];

  for (const doc of planned) {
    if (doc.isArchived || doc.isPurchased) continue;

    const paidPLN = (doc.virtualSavings || [])
      .filter(v => v.paidByUser)
      .reduce((s, v) => s + (Number(v.amountPLN) || 0), 0);

    let amountInHorizon = 0;

    if (doc.mode === "oneoff") {
      // Oneoff falls in window — full cost hits cushion.
      if (windowSet.has(doc.plannedMonth)) {
        amountInHorizon = Math.max(0, doc.totalAmountPLN);
      } else {
        continue;
      }
    } else {
      // envelope
      if (windowSet.has(doc.plannedMonth)) {
        // Deadline is inside window → need full remaining
        amountInHorizon = Math.max(0, doc.totalAmountPLN - paidPLN);
      } else if (doc.plannedMonth > windowLast) {
        // Deadline is beyond window → only sum savings due IN the window
        // that haven't been paid or dismissed.
        amountInHorizon = (doc.virtualSavings || [])
          .filter(v =>
            windowSet.has(v.month)
            && !v.paidByUser
            && !v.dismissedByUser,
          )
          .reduce((s, v) => s + (Number(v.amountPLN) || 0), 0);
        if (amountInHorizon === 0) continue;
      } else {
        // plannedMonth in the past — shouldn't normally happen (active).
        // Treat as urgent: full remaining hits cushion now.
        amountInHorizon = Math.max(0, doc.totalAmountPLN - paidPLN);
      }
    }

    if (amountInHorizon <= 0) continue;

    result.push({
      id:              doc.id,
      description:     doc.description,
      categoryName:    doc.targetCategoryName,
      subcategoryName: doc.targetSubcategoryName,
      mode:            doc.mode,
      priority:        doc.priority,
      plannedMonth:    doc.plannedMonth,
      amountInHorizon: Math.round(amountInHorizon * 100) / 100,
      totalAmountPLN:  doc.totalAmountPLN,
      paidPLN:         Math.round(paidPLN * 100) / 100,
    });
  }

  return result.sort((a, b) => a.plannedMonth.localeCompare(b.plannedMonth));
}

/**
 * Sum amountInHorizon of all upcoming planned items at or below the
 * given priority level. P_max=1 (Survival) only includes priority 1
 * items, P_max=4 (No Change) sums everything.
 */
export function sumPlannedForLevel(
  upcoming: UpcomingPlanned[],
  level:    PriorityLevel,
): number {
  return upcoming
    .filter(u => u.priority <= level)
    .reduce((s, u) => s + u.amountInHorizon, 0);
}

// ── Deficit / target / runway per level ──────────────────────

/**
 * Compute deficit, target cushion and runway per priority level.
 *
 * The target cushion is split into TWO components for transparency:
 *   - baseTarget    = monthlyDeficit × horizonMonths
 *                     (cost of staying alive during a crisis)
 *   - plannedTarget = sum of upcoming planned obligations at this level
 *                     (OC, taxes, camps, etc. you've already committed to)
 *   - totalTarget   = baseTarget + plannedTarget (== targetCushion)
 *
 * `upcomingPlanned` is optional — when omitted, plannedTarget is 0 and
 * the result is identical to pre-feature behaviour.
 */
export function computeLevelDeficits(
  layers:          CostLayer[],
  remainingIncome: number,
  horizonMonths:   number,
  assetsTotal:     number,
  upcomingPlanned: UpcomingPlanned[] = [],
): LevelDeficit[] {
  return layers.map(layer => {
    const monthlyDeficit = Math.max(0, layer.monthlyCost - remainingIncome);
    const baseTarget     = monthlyDeficit * horizonMonths;
    const plannedTarget  = sumPlannedForLevel(upcomingPlanned, layer.level);
    const totalTarget    = baseTarget + plannedTarget;

    const runwayMonths = monthlyDeficit > 0 ? assetsTotal / monthlyDeficit : Infinity;
    const runwayDays   = monthlyDeficit > 0 ? assetsTotal / (monthlyDeficit / 30) : Infinity;
    const coveragePercent = totalTarget > 0
      ? (assetsTotal / totalTarget) * 100
      : 100;

    return {
      level:           layer.level,
      monthlyCost:     layer.monthlyCost,
      remainingIncome,
      monthlyDeficit,
      baseTarget,
      plannedTarget,
      targetCushion:   totalTarget,
      runwayMonths,
      runwayDays,
      coveragePercent,
    };
  });
}

// ── Assets ───────────────────────────────────────────────────

export function sumAssets(assets: AssetBucket[]): number {
  return assets.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
}

// ── Average monthly saving capability ────────────────────────

/**
 * Average monthly saving rate across the lookback window.
 * Defined as (sum of INCOME - sum of EXPENSE EFFECTIVE) / months.
 * Negative values mean the user is spending more than they earn —
 * the UI should warn about this.
 */
export function computeSavingCapability(
  txInWindow: SnTransaction[],
  lookbackMonths: number,
): SavingCapability {
  let income = 0;
  let expense = 0;
  for (const tx of txInWindow) {
    if (tx.type === "INCOME")      income  += tx.amount;
    else if (tx.type === "EXPENSE") expense += calculateEffectiveAmount(tx, tx.budgetMonth);
  }
  const months = Math.max(1, lookbackMonths);
  return {
    avgMonthlyIncome:   income / months,
    avgMonthlyExpenses: expense / months,
    avgMonthlySavings:  (income - expense) / months,
  };
}

// ── ETA / what-if ────────────────────────────────────────────

/**
 * Time-to-target estimate, accounting for the what-if sliders.
 *
 * Cost cuts have a DOUBLE effect (the magic part):
 *   1. They increase the saving pace by `cutCostsPerMonth`
 *   2. They reduce the monthly deficit by `cutCostsPerMonth`, which in turn
 *      reduces the targetCushion by `cutCostsPerMonth * horizonMonths`.
 *
 * Returns null when the target is already reached, or NaN when the adjusted
 * saving pace is zero or negative (caller renders "nieosiągalne").
 */
export interface EtaResult {
  // Adjusted (post-what-if) numbers
  adjustedDeficit:      number;
  adjustedTarget:       number;
  adjustedSavingPace:   number;
  // Gap and time
  gapPLN:               number;   // 0 if already reached
  monthsToTarget:       number | null; // null if reached, Infinity if pace<=0
  etaDate:              Date | null;
  isAlreadyReached:     boolean;
  isUnreachable:        boolean;
}

export function computeEta(
  baseDeficit: number,
  horizonMonths: number,
  assetsTotal: number,
  baseSavingPace: number,
  delta: WhatIfDelta,
  today: Date = new Date(),
): EtaResult {
  const adjustedDeficit    = Math.max(0, baseDeficit - delta.cutCostsPerMonth);
  const adjustedTarget     = adjustedDeficit * horizonMonths;
  const adjustedSavingPace = baseSavingPace + delta.extraSavingsPerMonth + delta.cutCostsPerMonth;

  const gapPLN = Math.max(0, adjustedTarget - assetsTotal);

  if (gapPLN <= 0) {
    return {
      adjustedDeficit, adjustedTarget, adjustedSavingPace, gapPLN: 0,
      monthsToTarget: 0, etaDate: today, isAlreadyReached: true, isUnreachable: false,
    };
  }
  if (adjustedSavingPace <= 0) {
    return {
      adjustedDeficit, adjustedTarget, adjustedSavingPace, gapPLN,
      monthsToTarget: Infinity, etaDate: null, isAlreadyReached: false, isUnreachable: true,
    };
  }

  const monthsToTarget = gapPLN / adjustedSavingPace;
  const eta = new Date(today.getFullYear(), today.getMonth() + Math.ceil(monthsToTarget), 1);
  return {
    adjustedDeficit, adjustedTarget, adjustedSavingPace, gapPLN,
    monthsToTarget, etaDate: eta, isAlreadyReached: false, isUnreachable: false,
  };
}

// ── Format helpers ───────────────────────────────────────────

export function formatMonthsPretty(months: number): string {
  if (!isFinite(months)) return "∞";
  if (months < 1)   return "< 1 mies.";
  const rounded = Math.round(months * 10) / 10;
  // 11 vs 11.0 vs 11.3
  return Number.isInteger(rounded) ? `${rounded} mies.` : `${rounded.toFixed(1)} mies.`;
}

export function formatDaysPretty(days: number): string {
  if (!isFinite(days)) return "∞";
  return `${Math.round(days)} dni`;
}

const MONTH_NAMES_PL = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

export function formatEtaDate(d: Date | null): string {
  if (!d) return "—";
  return `${MONTH_NAMES_PL[d.getMonth()]} ${d.getFullYear()}`;
}
