// ============================================================
// File: src/utils/timePatterns.ts
// Pure logic for the "Wzorce czasowe" analytics section.
//
// Views:
//   - weekdayProfile: average spend per weekday occurrence (a range has
//     an unequal number of Fridays vs Mondays — totals would lie),
//   - dayOfMonthProfile: average spend per day-of-month occurrence
//     (days 29–31 exist only in some months),
//   - detectPaydays: recurring income-day clusters — supports multiple
//     paydays in a household (e.g. two salaries on different days),
//   - postPaydayAnalysis: spend-rate multiplier in the days right after
//     each payday vs the rest of the month.
//
// Deliberate choices:
//   - VARIABLE expenses only by default (isFixedExpense filter) — rent
//     on the 1st and scheduled subscriptions are not impulse spending,
//   - RAW amounts, not net of returns: this is a behavioural view — a
//     returned impulse buy was still an impulse on the day it happened,
//   - the current month is only counted up to `todayStr`, so days that
//     have not happened yet don't drag the averages down.
//
// Everything here is a pure function — see timePatterns.test.ts.
// ============================================================

import { isFixedExpense } from "./monthForecast";

// ── Types ─────────────────────────────────────────────────────

/** Minimal transaction shape the aggregations need (subset of range docs). */
export interface TimeTx {
  type:             string;
  date:             string;   // "YYYY-MM-DD"
  budgetMonth:      string;
  amount:           number;
  isRecurring?:     boolean;
  recurringId?:     string | null;
  subcategoryName?: string;
  description?:     string;
}

export interface WeekdayRow {
  weekday:   number;   // 0 = Monday .. 6 = Sunday
  total:     number;
  count:     number;   // transactions
  days:      number;   // occurrences of this weekday in range
  avgPerDay: number;
  avgBasket: number;
}

export interface DayOfMonthRow {
  day:       number;   // 1..31
  total:     number;
  days:      number;   // months in range containing this day (elapsed only)
  avgPerDay: number;
}

export interface Payday {
  day:        number;   // representative day-of-month
  label:      string;   // dominant income subcategory/description
  share:      number;   // % of significant income in range
  monthsSeen: number;
}

export interface PaydayImpact extends Pick<Payday, "day" | "label"> {
  multiplier: number | null;   // post-payday spend rate vs baseline; null = no baseline
}

export const WEEKDAY_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
export const WEEKDAY_FULL  = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

/** Payday clustering knobs (see detectPaydays). */
export const PAYDAY_DAY_TOLERANCE   = 2;     // ±days — weekend drift of salaries
export const PAYDAY_MIN_MONTH_SHARE = 0.6;   // cluster must recur in this share of months
export const PAYDAY_MIN_RANGE       = 3;     // months of data required for detection
export const PAYDAY_MAX_COUNT       = 3;
export const POST_PAYDAY_WINDOW     = 5;     // days after a payday

// ── Date helpers ──────────────────────────────────────────────

/** Monday-first weekday index for "YYYY-MM-DD" (local, no TZ pitfalls). */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** Every elapsed date of the range: full months, current month up to today. */
function* elapsedDates(months: string[], todayStr: string): Generator<string> {
  for (const month of months) {
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      if (date > todayStr) return;   // months are sorted — nothing later counts
      yield date;
    }
  }
}

// ── Weekday profile ───────────────────────────────────────────

function isCounted(tx: TimeTx, monthsSet: Set<string>, includeFixed: boolean): boolean {
  if (tx.type !== "EXPENSE" || !monthsSet.has(tx.budgetMonth)) return false;
  return includeFixed || !isFixedExpense(tx);
}

export function weekdayProfile(
  transactions: TimeTx[],
  months: string[],
  todayStr: string,
  includeFixed = false,
): WeekdayRow[] {
  const monthsSet = new Set(months);
  const rows: WeekdayRow[] = Array.from({ length: 7 }, (_, weekday) =>
    ({ weekday, total: 0, count: 0, days: 0, avgPerDay: 0, avgBasket: 0 }));

  for (const date of elapsedDates(months, todayStr)) rows[weekdayOf(date)].days++;
  for (const tx of transactions) {
    if (!isCounted(tx, monthsSet, includeFixed)) continue;
    const row = rows[weekdayOf(tx.date)];
    row.total += tx.amount;
    row.count += 1;
  }
  for (const row of rows) {
    row.avgPerDay = row.days  > 0 ? row.total / row.days  : 0;
    row.avgBasket = row.count > 0 ? row.total / row.count : 0;
  }
  return rows;
}

export interface WeekdayInsights {
  top:           WeekdayRow | null;   // priciest weekday
  topAbovePct:   number;              // % above the all-days average
  weekendAvg:    number;              // Sat+Sun zł/day
  workdayAvg:    number;              // Mon–Fri zł/day
}

export function weekdayInsights(rows: WeekdayRow[]): WeekdayInsights {
  const active = rows.filter(r => r.days > 0);
  const totalSpend = active.reduce((s, r) => s + r.total, 0);
  const totalDays  = active.reduce((s, r) => s + r.days, 0);
  const mean = totalDays > 0 ? totalSpend / totalDays : 0;
  const top = active.length ? [...active].sort((a, b) => b.avgPerDay - a.avgPerDay)[0] : null;

  const avgOf = (part: WeekdayRow[]) => {
    const days = part.reduce((s, r) => s + r.days, 0);
    return days > 0 ? part.reduce((s, r) => s + r.total, 0) / days : 0;
  };
  return {
    top,
    topAbovePct: top && mean > 0 ? ((top.avgPerDay - mean) / mean) * 100 : 0,
    weekendAvg:  avgOf(rows.slice(5)),
    workdayAvg:  avgOf(rows.slice(0, 5)),
  };
}

// ── Day-of-month profile ──────────────────────────────────────

export function dayOfMonthProfile(
  transactions: TimeTx[],
  months: string[],
  todayStr: string,
  includeFixed = false,
): DayOfMonthRow[] {
  const monthsSet = new Set(months);
  const rows: DayOfMonthRow[] = Array.from({ length: 31 }, (_, i) =>
    ({ day: i + 1, total: 0, days: 0, avgPerDay: 0 }));

  for (const date of elapsedDates(months, todayStr)) rows[Number(date.slice(8, 10)) - 1].days++;
  for (const tx of transactions) {
    if (!isCounted(tx, monthsSet, includeFixed)) continue;
    rows[Number(tx.date.slice(8, 10)) - 1].total += tx.amount;
  }
  for (const row of rows) row.avgPerDay = row.days > 0 ? row.total / row.days : 0;
  return rows;
}

// ── Payday detection ──────────────────────────────────────────

const DAY_CYCLE = 31;

function cyclicGap(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, DAY_CYCLE - d);
}

/**
 * Recurring income-day clusters. Multiple household paydays come out as
 * separate clusters (each salary has its own day). Cyclic ±tolerance
 * clustering absorbs weekend drift and month-end wrap (31st ~ 1st).
 * One-off inflows fail the recurrence bar; small ones fail the
 * significance bar. Under PAYDAY_MIN_RANGE months: no detection at all.
 */
export function detectPaydays(transactions: TimeTx[], months: string[]): Payday[] {
  if (months.length < PAYDAY_MIN_RANGE) return [];
  const monthsSet = new Set(months);

  const incomes = transactions.filter(tx =>
    tx.type === "INCOME" && monthsSet.has(tx.budgetMonth) && tx.amount > 0);
  const totalIncome = incomes.reduce((s, tx) => s + tx.amount, 0);
  // Significance bar: refunds and pocket-money transfers must not pass as salaries.
  const minAmount = (totalIncome / months.length) * 0.1;
  const events = incomes.filter(tx => tx.amount >= minAmount);
  if (events.length === 0) return [];
  const significantTotal = events.reduce((s, tx) => s + tx.amount, 0);

  // Cluster the present days (cyclically) within the tolerance.
  const days = [...new Set(events.map(tx => Number(tx.date.slice(8, 10))))].sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const day of days) {
    const last = clusters[clusters.length - 1];
    if (last && day - last[last.length - 1] <= PAYDAY_DAY_TOLERANCE) last.push(day);
    else clusters.push([day]);
  }
  if (clusters.length > 1) {
    const first = clusters[0], last = clusters[clusters.length - 1];
    if (cyclicGap(first[0], last[last.length - 1]) <= PAYDAY_DAY_TOLERANCE) {
      clusters.pop();
      first.push(...last);
    }
  }

  const required = Math.ceil(months.length * PAYDAY_MIN_MONTH_SHARE);
  return clusters
    .map(clusterDays => {
      const daySet = new Set(clusterDays);
      const clusterEvents = events.filter(tx => daySet.has(Number(tx.date.slice(8, 10))));
      const amount = clusterEvents.reduce((s, tx) => s + tx.amount, 0);

      // Representative day = the one carrying the most money in the cluster.
      const byDay = new Map<number, number>();
      const byLabel = new Map<string, number>();
      for (const tx of clusterEvents) {
        const day = Number(tx.date.slice(8, 10));
        byDay.set(day, (byDay.get(day) ?? 0) + tx.amount);
        const label = tx.subcategoryName?.trim() || tx.description?.trim() || "Wpływ";
        byLabel.set(label, (byLabel.get(label) ?? 0) + tx.amount);
      }
      const pick = <K,>(map: Map<K, number>): K => [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];

      return {
        day:        pick(byDay),
        label:      pick(byLabel),
        share:      significantTotal > 0 ? (amount / significantTotal) * 100 : 0,
        monthsSeen: new Set(clusterEvents.map(tx => tx.budgetMonth)).size,
        amount,
      };
    })
    .filter(p => p.monthsSeen >= required)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, PAYDAY_MAX_COUNT)
    .map(({ amount: _drop, ...payday }) => payday)
    .sort((a, b) => a.day - b.day);
}

// ── Post-payday spending rate ─────────────────────────────────

/**
 * Spend-rate multiplier for the days right after each payday. A window
 * runs from the payday for POST_PAYDAY_WINDOW days but stops early at
 * the next payday, so windows never overlap. Baseline = all remaining
 * days. null multiplier when there is no baseline to compare against.
 */
export function postPaydayAnalysis(
  dayRows: DayOfMonthRow[],
  paydays: Payday[],
): PaydayImpact[] {
  if (paydays.length === 0) return [];
  const paydayDays = new Set(paydays.map(p => p.day));

  const windowOf = (p: Payday): number[] => {
    const result: number[] = [];
    for (let k = 0; k < POST_PAYDAY_WINDOW; k++) {
      const day = ((p.day - 1 + k) % DAY_CYCLE) + 1;
      if (k > 0 && paydayDays.has(day)) break;   // next payday opens its own window
      result.push(day);
    }
    return result;
  };

  const inAnyWindow = new Set(paydays.flatMap(windowOf));
  const rateOf = (rows: DayOfMonthRow[]): number => {
    const days = rows.reduce((s, r) => s + r.days, 0);
    return days > 0 ? rows.reduce((s, r) => s + r.total, 0) / days : 0;
  };
  const baseline = rateOf(dayRows.filter(r => r.days > 0 && !inAnyWindow.has(r.day)));

  return paydays.map(p => {
    const windowSet = new Set(windowOf(p));
    const rate = rateOf(dayRows.filter(r => windowSet.has(r.day)));
    return { day: p.day, label: p.label, multiplier: baseline > 0 ? rate / baseline : null };
  });
}

// ── Weekday × month heatmap rows ──────────────────────────────

export interface WeekdayHeatmapRow {
  weekday: number;
  byMonth: Record<string, number>;
}

export function weekdayHeatmap(
  transactions: TimeTx[],
  months: string[],
  includeFixed = false,
): WeekdayHeatmapRow[] {
  const monthsSet = new Set(months);
  const rows: WeekdayHeatmapRow[] = Array.from({ length: 7 }, (_, weekday) => ({ weekday, byMonth: {} }));
  for (const tx of transactions) {
    if (!isCounted(tx, monthsSet, includeFixed)) continue;
    const row = rows[weekdayOf(tx.date)];
    row.byMonth[tx.budgetMonth] = (row.byMonth[tx.budgetMonth] ?? 0) + tx.amount;
  }
  return rows;
}
