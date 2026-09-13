// ============================================================
// File: src/utils/monthTotals.ts
//
// What a month adds up to, the way Podsumowanie counts it — and the same
// figures averaged over previous months.
//
// One definition on purpose. The summary's headline and its category bars
// deliberately count returns differently:
//   - type totals (Wpływy / Transfery / Wydatki / Oszczędności) are
//     CASH-FLOW figures: EXPENSE and SAVING net only the returns received in
//     the same month (cross-month ones arrive as a TRANSFER);
//   - category and subcategory totals are COST figures: net of every cash
//     return, whenever it came back.
// An average only means something next to the number it is compared with
// if both went through the same arithmetic, so the current month and the
// history are both computed here.
// ============================================================

import { calculateEffectiveAmount, calculateNetAmount } from "./returnUtils";

export type TotalsType = "INCOME" | "TRANSFER" | "EXPENSE" | "SAVING";

export interface TotalsTx {
  id?:            string;
  type:           string;
  budgetMonth:    string;
  amount:         number;
  netAmount?:     number;
  categoryId?:    string;
  subcategoryId?: string;
  isArchived?:    boolean;
  returns?:       unknown[];
}

export interface MonthTotals {
  types:         Record<TotalsType, number>;
  /** EXPENSE cost per categoryId (net of all cash returns). */
  categories:    Map<string, number>;
  /** EXPENSE cost per subcategoryId (net of all cash returns). */
  subcategories: Map<string, number>;
}

const add = (map: Map<string, number>, key: string | undefined, value: number) => {
  if (key) map.set(key, (map.get(key) ?? 0) + value);
};

/** Totals of `month`; transactions of other months or archived ones are ignored. */
export function monthTotals(txs: TotalsTx[], month: string): MonthTotals {
  const types: Record<TotalsType, number> = { INCOME: 0, TRANSFER: 0, EXPENSE: 0, SAVING: 0 };
  const categories    = new Map<string, number>();
  const subcategories = new Map<string, number>();

  for (const tx of txs) {
    if (tx.budgetMonth !== month || tx.isArchived) continue;
    switch (tx.type) {
      case "INCOME":
      case "TRANSFER":
        types[tx.type] += tx.amount;
        break;
      case "SAVING":
        types.SAVING += calculateEffectiveAmount(tx, month);
        break;
      case "EXPENSE": {
        types.EXPENSE += calculateEffectiveAmount(tx, month);
        const cost = calculateNetAmount(tx);
        add(categories, tx.categoryId, cost);
        add(subcategories, tx.subcategoryId, cost);
        break;
      }
    }
  }
  return { types, categories, subcategories };
}

// ── Averages ──────────────────────────────────────────────────

export interface AverageStat {
  mean:   number;
  median: number;
  /** Months averaged over. */
  months: number;
}

export function averageOf(values: number[]): AverageStat {
  if (values.length === 0) return { mean: 0, median: 0, months: 0 };
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return {
    mean:   s.reduce((sum, v) => sum + v, 0) / s.length,
    median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    months: s.length,
  };
}

export interface MonthlyAverages {
  months:        string[];
  types:         Record<TotalsType, AverageStat>;
  categories:    Map<string, AverageStat>;
  subcategories: Map<string, AverageStat>;
}

/**
 * Averages of monthTotals over `months`. A month with no transactions at all
 * is left out — it is a month before the family used the app, not a month
 * of zero spending. A category missing from a month that DID have data
 * counts as 0 there: not buying anything in it that month is real.
 */
export function monthlyAverages(txs: TotalsTx[], months: string[]): MonthlyAverages {
  const withData = months.filter(m => txs.some(tx => tx.budgetMonth === m && !tx.isArchived));
  const totals   = withData.map(m => monthTotals(txs, m));

  const typeKeys: TotalsType[] = ["INCOME", "TRANSFER", "EXPENSE", "SAVING"];
  const types = Object.fromEntries(
    typeKeys.map(k => [k, averageOf(totals.map(t => t.types[k]))]),
  ) as Record<TotalsType, AverageStat>;

  const perKey = (pick: (t: MonthTotals) => Map<string, number>) => {
    const keys = new Set(totals.flatMap(t => [...pick(t).keys()]));
    return new Map([...keys].map(k => [k, averageOf(totals.map(t => pick(t).get(k) ?? 0))]));
  };

  return {
    months:        withData,
    types,
    categories:    perKey(t => t.categories),
    subcategories: perKey(t => t.subcategories),
  };
}
