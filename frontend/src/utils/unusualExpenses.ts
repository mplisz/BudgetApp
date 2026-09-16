// ============================================================
// File: src/utils/unusualExpenses.ts
//
// "Nietypowo duże" — which one-off expenses of a month hold something that is
// expensive FOR WHAT IT IS. A flat "above the month's average" threshold
// doesn't work: the cart splits every receipt into one small transaction per
// subcategory, so the average sits low, while 250 zł is routine for
// groceries but a real outlier for the cinema.
//
// What gets judged
//   A receipt transaction with a breakdown (2+ lineItems) is judged LINE BY
//   LINE: a 20-item weekly shop is naturally bigger than a 3-item one, and
//   that size is not a surprise — one 149 zł bottle among them is. A line is
//   taken as printed, so a multipack counts as the whole pack.
//   Anything else (typed in by hand, or one amount) is judged by its total.
//
//   The two are never mixed: lines are compared with past LINES of the same
//   subcategory, totals with past TOTALS — a hand-typed 200 zł "zakupy" would
//   otherwise look like a 25× outlier next to 8 zł receipt lines.
//
// The rule
//   unusual  ⇔  one-off EXPENSE  ∧  some measured amount ≥ 100 zł
//                                ∧  that amount ≥ multiplier × its norm
//
// The norm is the 75th percentile of past amounts of the same kind in the
// subcategory — the amount 3 in 4 past ones stayed under. (The median let
// small top-ups drag it down: groceries came out at 17 zł.) Too little
// history borrows the category's norm, then the month's own amounts.
//
// The 100 zł floor keeps a 12 zł chocolate (vs the usual 5 zł) from being an
// alarm. Recurring expenses never count, and never shape a norm (isFixedExpense,
// the rule the forecast uses) — the rent is big, not a surprise.
//
// Single source for the Wydatki filter, its row badge and the Podsumowanie
// section; everything here is pure (see unusualExpenses.test.ts).
// ============================================================

import { isFixedExpense } from "./monthForecast";
import { addMonthsToYM } from "../hooks/useMonthFromUrl";

export const UNUSUAL_MIN_AMOUNT     = 100;
export const UNUSUAL_LOOKBACK_MONTHS = 6;
/** The norm: the amount this share of past amounts stayed at or under. */
export const UNUSUAL_NORM_PERCENTILE = 0.75;
/** Fewer past amounts than this and a percentile is anecdote, not a norm. */
export const UNUSUAL_MIN_HISTORY    = 3;
export const UNUSUAL_MULTIPLIER = { default: 2, min: 1.5, max: 4, step: 0.5 } as const;

export interface UnusualSourceTx {
  id:             string;
  type:           string;
  amount:         number;
  categoryId?:    string;
  subcategoryId?: string;
  isRecurring?:   boolean;
  recurringId?:   string | null;
  isArchived?:    boolean;
  lineItems?:     Array<{ description?: string; amount: number }> | null;
}

/** Where an expense's norm came from — shown in the badge's tooltip. */
export type NormSource = "subcategory" | "category" | "month";

/** "line" = one receipt line; "total" = a transaction without a breakdown. */
export type MeasureKind = "line" | "total";

export interface UnusualInfo {
  /** The norm the amount is compared with (UNUSUAL_NORM_PERCENTILE of past amounts). */
  typical: number;
  /** How many past amounts that norm was taken over. */
  basis:   number;
  source:  NormSource;
  kind:    MeasureKind;
  /** The amount judged: the flagged receipt line, or the whole transaction. */
  amount:  number;
  /** Name of the flagged receipt line (kind "line" only). */
  item?:   string;
  /** amount ÷ typical */
  ratio:   number;
}

/** Linear-interpolated percentile (as a spreadsheet's PERCENTILE.INC). */
export function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  const rank = p * (s.length - 1);
  const lo = Math.floor(rank);
  return lo + 1 < s.length ? s[lo] + (rank - lo) * (s[lo + 1] - s[lo]) : s[lo];
}

const normAmount = (values: number[]) => percentile(values, UNUSUAL_NORM_PERCENTILE);

const isVariableExpense = (tx: UnusualSourceTx) =>
  tx.type === "EXPENSE" && !tx.isArchived && !isFixedExpense(tx) && tx.amount > 0;

interface Measure { kind: MeasureKind; amount: number; item?: string }

/** What of a transaction is judged: its receipt lines, or its total. */
export function measuresOf(tx: UnusualSourceTx): Measure[] {
  const lines = tx.lineItems ?? [];
  // A single line is not a breakdown: it is the "one product" identity a
  // hand-typed or single-item transaction carries, i.e. its total.
  if (lines.length < 2) return [{ kind: "total", amount: tx.amount }];
  return lines
    .filter(l => l && l.amount > 0)            // discounts, deposit refunds
    .map(l => ({ kind: "line" as const, amount: l.amount, item: l.description?.trim() || undefined }));
}

/**
 * The unusual expenses of a month, by transaction id.
 *
 * @param monthTx    the month being looked at (any types — non-expenses are skipped)
 * @param historyTx  the previous UNUSUAL_LOOKBACK_MONTHS months, NOT including this one:
 *                   a norm is what came before, not what is being judged
 * @param multiplier the threshold (settings.unusualExpenseMultiplier)
 */
export function findUnusualExpenses(
  monthTx: UnusualSourceTx[],
  historyTx: UnusualSourceTx[],
  multiplier: number,
): Map<string, UnusualInfo> {
  const history = historyTx.filter(isVariableExpense);
  const month   = monthTx.filter(isVariableExpense);

  // Past amounts by kind + subcategory / category.
  const pools = new Map<string, number[]>();
  const add = (key: string, value: number) => {
    const list = pools.get(key);
    if (list) list.push(value); else pools.set(key, [value]);
  };
  for (const tx of history) {
    for (const m of measuresOf(tx)) {
      if (tx.subcategoryId) add(`${m.kind}|sub|${tx.subcategoryId}`, m.amount);
      if (tx.categoryId)    add(`${m.kind}|cat|${tx.categoryId}`, m.amount);
    }
  }
  const monthPool: Record<MeasureKind, number[]> = { line: [], total: [] };
  for (const tx of month) for (const m of measuresOf(tx)) monthPool[m.kind].push(m.amount);

  const normOf = (kind: MeasureKind, tx: UnusualSourceTx) => {
    const sub = tx.subcategoryId ? pools.get(`${kind}|sub|${tx.subcategoryId}`) : undefined;
    if (sub && sub.length >= UNUSUAL_MIN_HISTORY) return { typical: normAmount(sub), basis: sub.length, source: "subcategory" as const };
    const cat = tx.categoryId ? pools.get(`${kind}|cat|${tx.categoryId}`) : undefined;
    if (cat && cat.length >= UNUSUAL_MIN_HISTORY) return { typical: normAmount(cat), basis: cat.length, source: "category" as const };
    const own = monthPool[kind];
    if (own.length >= UNUSUAL_MIN_HISTORY) return { typical: normAmount(own), basis: own.length, source: "month" as const };
    return null;
  };

  const out = new Map<string, UnusualInfo>();
  for (const tx of month) {
    let best: UnusualInfo | null = null;
    for (const m of measuresOf(tx)) {
      if (m.amount < UNUSUAL_MIN_AMOUNT) continue;
      const norm = normOf(m.kind, tx);
      if (!norm || norm.typical <= 0) continue;
      const ratio = m.amount / norm.typical;
      if (ratio >= multiplier && (!best || ratio > best.ratio)) {
        best = { ...norm, kind: m.kind, amount: m.amount, item: m.item, ratio };
      }
    }
    if (best) out.set(tx.id, best);
  }
  return out;
}

// ── Month summaries (Podsumowanie) ────────────────────────────

export interface UnusualMonthStats {
  month:  string;
  /** Transactions with something unusual in them. */
  count:  number;
  /** Sum of the unusual amounts (the flagged line, or the whole transaction). */
  total:  number;
  /** How much of `total` sits above the norms (Σ amount − typical). */
  excess: number;
  /** Sum of all the month's expenses (tx.amount) — the share's denominator. */
  expenses: number;
  /** total ÷ expenses, 0–1 */
  share:  number;
}

/** The `n` months before `month`, oldest first. */
function monthsBefore(month: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonthsToYM(month, i - n));
}

export function unusualMonthStats(
  month: string,
  monthTx: Array<UnusualSourceTx & { budgetMonth?: string }>,
  unusual: Map<string, UnusualInfo>,
): UnusualMonthStats {
  let expenses = 0, total = 0, excess = 0, count = 0;
  for (const tx of monthTx) {
    if (tx.type !== "EXPENSE" || tx.isArchived) continue;
    expenses += tx.amount;
    const info = unusual.get(tx.id);
    if (!info) continue;
    count++;
    total  += info.amount;
    excess += info.amount - info.typical;
  }
  return { month, count, total, excess, expenses, share: expenses > 0 ? total / expenses : 0 };
}

/**
 * Stats for each of `months` (oldest first), every month judged against ITS
 * OWN previous UNUSUAL_LOOKBACK_MONTHS — so a trend point means the same as
 * the current month's figure. `allTx` must cover those months plus their
 * look-back; `budgetMonth` routes each transaction to its month.
 */
export function unusualTrend(
  months: string[],
  allTx: Array<UnusualSourceTx & { budgetMonth?: string }>,
  multiplier: number,
): UnusualMonthStats[] {
  const byMonth = new Map<string, typeof allTx>();
  for (const tx of allTx) {
    if (!tx.budgetMonth) continue;
    const list = byMonth.get(tx.budgetMonth);
    if (list) list.push(tx); else byMonth.set(tx.budgetMonth, [tx]);
  }
  return months.map(month => {
    const own     = byMonth.get(month) ?? [];
    const history = monthsBefore(month, UNUSUAL_LOOKBACK_MONTHS).flatMap(m => byMonth.get(m) ?? []);
    return unusualMonthStats(month, own, findUnusualExpenses(own, history, multiplier));
  });
}

const NORM_SOURCE_TEXT: Record<NormSource, string> = {
  subcategory: "Norma subkategorii",
  category:    "Norma kategorii (subkategoria ma za mało historii)",
  month:       "Norma z tego miesiąca (za mało historii)",
};

const zl2 = (v: number) => `${v.toFixed(2).replace(".", ",")} zł`;

/** Tooltip (multi-line): what was judged, against what, and why. */
export function unusualTitle(info: UnusualInfo): string {
  const pct    = Math.round(UNUSUAL_NORM_PERCENTILE * 100);
  const period = info.source === "month" ? "" : ` (${UNUSUAL_LOOKBACK_MONTHS} mies.)`;
  const what   = info.kind === "line" ? "pozycji z paragonów" : "wydatków bez rozbicia na pozycje";
  return [
    info.kind === "line"
      ? `Pozycja: ${info.item ?? "bez nazwy"} — ${zl2(info.amount)}`
      : `Wydatek: ${zl2(info.amount)}`,
    `${NORM_SOURCE_TEXT[info.source]}: ${zl2(info.typical)}`,
    `${pct}. percentyl z ${info.basis} ${what}${period}`,
    `${formatMultiplier(info.ratio)} normy · cykliczne się nie liczą`,
  ].join("\n");
}

/** "2,5×" — multipliers and ratios as the UI writes them. */
export function formatMultiplier(x: number): string {
  return `${(Math.round(x * 10) / 10).toString().replace(".", ",")}×`;
}
