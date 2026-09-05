// ============================================================
// File: src/utils/tagBreakdown.ts
// Pure aggregation behind the "Analiza tagów" panel — what a single tag
// (in practice: one trip) actually cost, broken down by category.
//
// Conventions inherited from the rest of the analytics layer:
//   - EXPENSE only. Income and transfers carry no tags in this app.
//   - Amounts are NET of every return (calculateNetAmount), so a holiday
//     purchase that came back doesn't inflate the trip.
//   - A transaction carrying N tags counts once per tag, so totals across
//     DIFFERENT tags may overlap. Within one tag — the only thing this
//     module reports — there is no double counting.
//
// Dates: the trip timeline is built from `tx.date`, not `budgetMonth`. A
// purchase on the 30th can be booked into the next month, and bucketing a
// trip by budget month would tear it in half.
//
// Everything here is a pure function — see tagBreakdown.test.ts.
// ============================================================

import { calculateNetAmount, calculateTotalCashReturned } from "./returnUtils";

/** Structural on purpose: any transaction-shaped object works, no cast. */
export interface TagTransaction {
  type:             string;
  date:             string;          // "YYYY-MM-DD"
  budgetMonth:      string;
  amount:           number;
  /** Voucher-adjusted amount when present — calculateNetAmount prefers it. */
  netAmount?:       number;
  description?:     string;
  categoryId?:      string;
  categoryName?:    string;
  subcategoryId?:   string;
  subcategoryName?: string;
  merchant?:        string | null;
  tags?:            string[];        // tag IDs
  returns?:         Array<{ moneyReturnedInMonth?: string; cashAmount?: number }> | null;
}

/** A slice of the breakdown: category, subcategory or merchant. */
export interface BreakdownSlice {
  id:     string;
  name:   string;
  total:  number;
  count:  number;
  share:  number;   // 0–100, of the tag's total
}

/** The three figures a returned purchase has, kept apart so the UI never has
 *  to pick one and hide the rest. `net` is what the thing actually cost. */
export interface MoneySplit {
  /** What left the account — voucher-adjusted, before any refund came back. */
  paid:     number;
  /** Cash refunded, across any month. Voucher refunds are a separate asset
   *  and deliberately excluded, matching calculateNetAmount. */
  returned: number;
  net:      number;
}

export interface TagBreakdown {
  /** Net of returns — the figure every share and slice below is based on. */
  total:         number;
  /** Same total, split into paid / returned / net for display. */
  money:         MoneySplit;
  count:         number;
  firstDate:     string | null;
  lastDate:      string | null;
  /** Distinct calendar days that actually carry a transaction. Labelled as
   *  "days with spend" in the UI — it is NOT the length of the trip, which
   *  we cannot know from transactions alone. */
  spendingDays:  number;
  /** Calendar days from first to last transaction, inclusive. */
  spanDays:      number;
  /** The single purchase that cost the most — ranked by what it ACTUALLY
   *  cost, so a fully refunded item can't top a trip it contributed nothing
   *  to. All three figures travel with it, so nothing is hidden by the
   *  choice. */
  biggest:       ({ description: string; date: string } & MoneySplit) | null;
  categories:    BreakdownSlice[];
  subcategories: BreakdownSlice[];
  merchants:     BreakdownSlice[];
  /** Dense day-by-day series from first to last date — zero-spend days
   *  included, because a quiet day is information on a trip. */
  daily:         Array<{ date: string; amount: number }>;
  /** Fallback series for tags that span months rather than a trip. */
  monthly:       Array<{ month: string; amount: number }>;
}

/** Beyond this many days the day-by-day series stops being readable and the
 *  panel switches to months. Two months of daily bars is already a lot. */
export const DAILY_SERIES_MAX_DAYS = 62;

export const NO_MERCHANT = "(bez sklepu)";

function isTaggedExpense(tx: TagTransaction, tagId: string): boolean {
  return tx.type === "EXPENSE" && (tx.tags ?? []).includes(tagId);
}

/** Inclusive day count between two "YYYY-MM-DD" dates. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

function addDay(ymd: string): string {
  const t = Date.parse(`${ymd}T00:00:00Z`) + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Roll a map of id → accumulator into a sorted, shared-out slice list. */
function toSlices(
  map: Map<string, { name: string; total: number; count: number }>,
  total: number,
): BreakdownSlice[] {
  return [...map.entries()]
    .map(([id, v]) => ({
      id,
      name:  v.name,
      total: v.total,
      count: v.count,
      share: total > 0 ? (v.total / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Everything the panel shows for ONE tag. Returns an empty-but-valid shape
 * when the tag has no transactions, so callers never branch on null.
 */
export function buildTagBreakdown(
  transactions: TagTransaction[],
  tagId: string,
): TagBreakdown {
  const rows = transactions.filter(tx => isTaggedExpense(tx, tagId));

  const empty: TagBreakdown = {
    total: 0, money: { paid: 0, returned: 0, net: 0 },
    count: 0, firstDate: null, lastDate: null,
    spendingDays: 0, spanDays: 0, biggest: null,
    categories: [], subcategories: [], merchants: [], daily: [], monthly: [],
  };
  if (rows.length === 0) return empty;

  const cats  = new Map<string, { name: string; total: number; count: number }>();
  const subs  = new Map<string, { name: string; total: number; count: number }>();
  const shops = new Map<string, { name: string; total: number; count: number }>();
  const byDay   = new Map<string, number>();
  const byMonth = new Map<string, number>();

  let total = 0;
  let paidTotal = 0;
  let returnedTotal = 0;
  let firstDate = rows[0].date;
  let lastDate  = rows[0].date;
  let biggest: TagBreakdown["biggest"] = null;

  const bump = (
    map: Map<string, { name: string; total: number; count: number }>,
    id: string, name: string, net: number,
  ) => {
    const cur = map.get(id);
    if (cur) { cur.total += net; cur.count += 1; }
    else map.set(id, { name, total: net, count: 1 });
  };

  for (const tx of rows) {
    const net      = calculateNetAmount(tx);
    const returned = calculateTotalCashReturned(tx);
    // What actually left the account: netAmount when a voucher covered part
    // of it, otherwise the sticker price. Mirrors calculateNetAmount's base.
    const paid     = tx.netAmount ?? tx.amount;

    total         += net;
    paidTotal     += paid;
    returnedTotal += returned;

    if (tx.date < firstDate) firstDate = tx.date;
    if (tx.date > lastDate)  lastDate  = tx.date;

    if (!biggest || net > biggest.net) {
      biggest = { description: tx.description || "—", date: tx.date, paid, returned, net };
    }

    bump(cats,  tx.categoryId    || "brak", tx.categoryName    || "Bez kategorii",    net);
    bump(subs,  tx.subcategoryId || "brak", tx.subcategoryName || "Bez podkategorii", net);
    const shop = (tx.merchant ?? "").trim() || NO_MERCHANT;
    bump(shops, shop, shop, net);

    byDay.set(tx.date, (byDay.get(tx.date) ?? 0) + net);
    byMonth.set(tx.budgetMonth, (byMonth.get(tx.budgetMonth) ?? 0) + net);
  }

  // Dense daily series — walk the calendar so quiet days render as gaps
  // rather than silently closing up.
  const daily: Array<{ date: string; amount: number }> = [];
  for (let d = firstDate; d <= lastDate; d = addDay(d)) {
    daily.push({ date: d, amount: byDay.get(d) ?? 0 });
    if (daily.length > 800) break;   // guard against a malformed date range
  }

  return {
    total,
    money: { paid: paidTotal, returned: returnedTotal, net: total },
    count: rows.length,
    firstDate,
    lastDate,
    spendingDays: byDay.size,
    spanDays: daysBetween(firstDate, lastDate),
    biggest,
    categories:    toSlices(cats,  total),
    subcategories: toSlices(subs,  total),
    merchants:     toSlices(shops, total),
    daily,
    monthly: [...byMonth.entries()]
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}
