// ============================================================
// File: src/utils/merchantProfile.ts
// Pure logic for the "Profil sklepów" analytics card.
//
// Aggregates expense transactions per merchant (OCR-populated) into
// visit/basket statistics plus a per-month series for sparklines, and
// flags "micro-spending" shops: visited often, small average basket —
// the classic place where money leaks unnoticed.
//
// The micro threshold is relative (below the average basket across all
// tagged spend), not a fixed amount, so it scales with the user's
// spending. A per-shop median would sit exactly on the typical small
// basket and the strict comparison would flag nothing.
// Amounts are NET of all returns (calculateNetAmount) — consistent with
// the "Top sklepy" bar in PanelAnalytics.
//
// Everything here is a pure function — see merchantProfile.test.ts.
// ============================================================

import { calculateNetAmount } from "./returnUtils";

// ── Types ─────────────────────────────────────────────────────

/** Minimal transaction shape the aggregation needs (subset of range docs). */
export interface MerchantTx {
  type:        string;
  date:        string;
  budgetMonth: string;
  merchant?:   string | null;
  amount:      number;
  returns?:    Array<{ moneyReturnedInMonth: string; cashAmount?: number }>;
}

export interface MerchantRow {
  merchant:       string;
  visits:         number;
  total:          number;   // PLN, net of returns
  avgBasket:      number;
  share:          number;   // % of merchant-tagged spend in range
  visitsPerMonth: number;
  lastVisit:      string;   // "YYYY-MM-DD"
  byMonth:        Record<string, number>;   // sparkline series source
}

export interface MerchantProfileResult {
  rows:  MerchantRow[];   // sorted by total desc
  micro: MerchantRow[];   // micro-spending shops, most visits first
}

/** A shop qualifies as a micro-spending candidate from this visit rate. */
export const MICRO_MIN_VISITS_PER_MONTH = 2;
/** How many micro-spending shops to surface. */
export const MICRO_TOP_N = 3;

// ── Aggregation ───────────────────────────────────────────────

export function buildMerchantProfile(
  transactions: MerchantTx[],
  months: string[],
): MerchantProfileResult {
  const monthsSet = new Set(months);
  const byShop = new Map<string, MerchantRow>();
  let taggedTotal = 0;

  for (const tx of transactions) {
    if (tx.type !== "EXPENSE" || !monthsSet.has(tx.budgetMonth)) continue;
    const merchant = (tx.merchant ?? "").trim();
    if (!merchant) continue;

    let row = byShop.get(merchant);
    if (!row) {
      row = { merchant, visits: 0, total: 0, avgBasket: 0, share: 0, visitsPerMonth: 0, lastVisit: "", byMonth: {} };
      byShop.set(merchant, row);
    }
    const net = calculateNetAmount(tx);
    row.visits += 1;
    row.total  += net;
    row.byMonth[tx.budgetMonth] = (row.byMonth[tx.budgetMonth] ?? 0) + net;
    if (tx.date > row.lastVisit) row.lastVisit = tx.date;
    taggedTotal += net;
  }

  const monthCount = Math.max(months.length, 1);
  const rows = [...byShop.values()]
    .map(row => ({
      ...row,
      avgBasket:      row.visits > 0 ? row.total / row.visits : 0,
      share:          taggedTotal > 0 ? (row.total / taggedTotal) * 100 : 0,
      visitsPerMonth: row.visits / monthCount,
    }))
    .sort((a, b) => b.total - a.total);

  // Micro-spending: frequent visits AND a basket below the overall
  // average. With a single shop the strict comparison against its own
  // average correctly yields no findings.
  const totalVisits = rows.reduce((sum, r) => sum + r.visits, 0);
  const avgBasketOverall = totalVisits > 0 ? taggedTotal / totalVisits : 0;
  const micro = rows
    .filter(r => r.visitsPerMonth >= MICRO_MIN_VISITS_PER_MONTH && r.avgBasket < avgBasketOverall)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, MICRO_TOP_N);

  return { rows, micro };
}
