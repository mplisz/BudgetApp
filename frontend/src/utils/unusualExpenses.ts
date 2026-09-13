// ============================================================
// File: src/utils/unusualExpenses.ts
//
// "Nietypowo duże" — which one-off expenses of a month are big FOR WHAT
// THEY ARE. A flat "above the month's average" threshold doesn't work here:
// the cart splits every receipt into one small transaction per subcategory,
// so the average sits low and a normal weekly shop clears it, while 250 zł
// is routine for groceries but a real outlier for the cinema.
//
// So every expense is compared with the typical (median) amount of its own
// subcategory over the previous months:
//
//   unusual  ⇔  one-off EXPENSE  ∧  amount ≥ multiplier × typical  ∧  amount ≥ 100 zł
//
// The 100 zł floor keeps 12 zł of sweets (vs the usual 5 zł) from being an
// alarm. A subcategory with too little history borrows the norm of its
// category, and failing that the median expense of the month itself.
//
// Recurring expenses never count (same rule as the forecast and the
// fixed-vs-variable charts: isFixedExpense) — the rent is big, not a surprise.
//
// Amounts are tx.amount — what the Kwota column shows and what sorts it.
// Single source for the Wydatki filter, its row badge and the Podsumowanie
// section; everything here is pure (see unusualExpenses.test.ts).
// ============================================================

import { isFixedExpense } from "./monthForecast";

export const UNUSUAL_MIN_AMOUNT     = 100;
export const UNUSUAL_LOOKBACK_MONTHS = 6;
/** Fewer past expenses than this and a median is anecdote, not a norm. */
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
}

/** Where an expense's norm came from — shown in the badge's tooltip. */
export type NormSource = "subcategory" | "category" | "month";

export interface UnusualInfo {
  /** Typical amount the expense is compared with (a median). */
  typical: number;
  /** How many expenses that median was taken over. */
  basis:   number;
  source:  NormSource;
  /** amount ÷ typical */
  ratio:   number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const isVariableExpense = (tx: UnusualSourceTx) =>
  tx.type === "EXPENSE" && !tx.isArchived && !isFixedExpense(tx) && tx.amount > 0;

function groupAmounts(txs: UnusualSourceTx[], keyOf: (tx: UnusualSourceTx) => string | undefined) {
  const map = new Map<string, number[]>();
  for (const tx of txs) {
    const key = keyOf(tx);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(tx.amount); else map.set(key, [tx.amount]);
  }
  return map;
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

  const bySub = groupAmounts(history, tx => tx.subcategoryId);
  const byCat = groupAmounts(history, tx => tx.categoryId);
  const monthNorm = month.length >= UNUSUAL_MIN_HISTORY
    ? { typical: median(month.map(tx => tx.amount)), basis: month.length, source: "month" as const }
    : null;

  const normOf = (tx: UnusualSourceTx) => {
    const sub = tx.subcategoryId ? bySub.get(tx.subcategoryId) : undefined;
    if (sub && sub.length >= UNUSUAL_MIN_HISTORY) return { typical: median(sub), basis: sub.length, source: "subcategory" as const };
    const cat = tx.categoryId ? byCat.get(tx.categoryId) : undefined;
    if (cat && cat.length >= UNUSUAL_MIN_HISTORY) return { typical: median(cat), basis: cat.length, source: "category" as const };
    return monthNorm;
  };

  const out = new Map<string, UnusualInfo>();
  for (const tx of month) {
    if (tx.amount < UNUSUAL_MIN_AMOUNT) continue;
    const norm = normOf(tx);
    if (!norm || norm.typical <= 0) continue;
    const ratio = tx.amount / norm.typical;
    if (ratio >= multiplier) out.set(tx.id, { ...norm, ratio });
  }
  return out;
}

const NORM_SOURCE_TEXT: Record<NormSource, string> = {
  subcategory: "subkategorii",
  category:    "kategorii (subkategoria ma za mało historii)",
  month:       "wydatków tego miesiąca (za mało historii)",
};

/** Tooltip: what the expense was compared with. */
export function unusualTitle(info: UnusualInfo): string {
  const months = info.source === "month" ? "" : ` z ${UNUSUAL_LOOKBACK_MONTHS} mies.`;
  return `Mediana ${NORM_SOURCE_TEXT[info.source]}${months}: ${info.typical.toFixed(2).replace(".", ",")} zł ` +
    `(${info.basis} wydatków). Cykliczne się nie liczą.`;
}

/** "2,5×" — multipliers and ratios as the UI writes them. */
export function formatMultiplier(x: number): string {
  return `${(Math.round(x * 10) / 10).toString().replace(".", ",")}×`;
}
