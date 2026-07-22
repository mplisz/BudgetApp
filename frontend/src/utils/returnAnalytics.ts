// ============================================================
// File: src/utils/returnAnalytics.ts
// Pure logic for the "Analiza zwrotów" analytics section.
//
// Three kinds of money-back live in returns[]:
//   - "store"         : goods went back to the shop — a quality signal,
//                       feeds the per-shop/per-category return rates and
//                       the returned-products ranking;
//   - "reimbursement" : goods/services were KEPT, someone paid the user
//                       back (family covering groceries, LuxMed refunds) —
//                       counted in the totals but NEVER in the store
//                       rankings, where it would smear real shops;
//   - "deposit"       : bottle-deposit refunds (batch endpoint) — money
//                       back by design, not a quality signal either.
// Entries predating the kind field land in the "unknown" bucket: shown
// honestly in the KPI split, treated like store returns in the rankings
// (same rule the price-history exclusion uses) — EXCEPT entries the batch
// panels wrote with their hardcoded reasons ("Zwrot butelek" /
// "Zwrot LuxMed"), which are recognized and bucketed correctly.
//
// TIME AXIS: months are attributed by moneyReturnedInMonth ("when the
// money came back"), clamped to the requested range. The caller loads
// transactions by PURCHASE month, so a return received in-range for a
// purchase before the range is invisible — an edge-of-range caveat the
// UI surfaces, not something this module can fix.
//
// Everything here is a pure function — see returnAnalytics.test.ts.
// ============================================================

import { foldText } from "./productPricing";

export type ReturnKindBucket = "store" | "reimbursement" | "deposit" | "unknown";
export type ReturnSourceBucket = "person" | "company";
/** kindOf × sourceOf flattened — the granularity charts and filters use. */
export type DetailedReturnBucket = "store" | "person" | "company" | "deposit" | "unknown";

export interface AnalyzedReturn {
  amount:               number;
  cashAmount?:          number;
  voucherAmount?:       number;
  surplusAmount?:       number;
  kind?:                string | null;
  source?:              string | null;
  moneyReturnedInMonth: string;
  returnedAt?:          string;
  reason?:              string;
  returnedBy?:          string;
  returnedLineItems?:   Array<{ index: number; description?: string; amount: number }> | null;
}

/** Minimal transaction shape the aggregation needs (subset of range docs). */
export interface ReturnAnalyticsTx {
  type:             string;
  date:             string;
  budgetMonth:      string;
  categoryId:       string;
  categoryName:     string;
  subcategoryName?: string;
  merchant?:        string | null;
  amount:           number;
  lineItems?:       Array<{ description?: string; amount: number; product?: { name?: string | null } | null }> | null;
  returns?:         AnalyzedReturn[] | null;
}

export interface ReturnKpi {
  total:          number;   // Σ return amounts in range (surplus NOT included)
  cash:           number;
  voucher:        number;
  surplus:        number;   // Σ surplus — extra money, always a TRANSFER
  count:          number;   // number of return entries
  store:          number;   // amount split by kind
  reimbursement:  number;   // person + company together
  reimbursementPerson:  number;
  reimbursementCompany: number;
  deposit:        number;   // bottle-deposit refunds
  unknown:        number;   // legacy entries with no kind
  expensesGross:  number;   // Σ gross EXPENSE amounts in range
  returnRate:     number;   // (store + unknown) / expensesGross, in % —
                            // deposits and reimbursements aren't a quality signal
}

export interface ReturnMonthlyPoint {
  month:   string;
  store:   number;
  person:  number;   // reimbursements from people
  company: number;   // reimbursements from companies/institutions
  deposit: number;
  unknown: number;
  surplus: number;
  [key: string]: string | number;   // StackedMonthlyChart-compatible
}

export interface ReturnRankRow {
  id:       string;
  name:     string;
  returned: number;   // Σ store(+unknown) return amounts
  spent:    number;   // Σ gross EXPENSE spend in range
  rate:     number;   // returned / spent, in %
  count:    number;   // return entries
}

export interface ReturnedProductRow {
  name:    string;
  tracked: boolean;   // carries a structured (whitelisted) product identity
  count:   number;    // return allocations
  amount:  number;    // Σ allocated money
}

export interface RecentReturnRow {
  date:            string;   // returnedAt, falling back to the return month
  categoryName:    string;
  subcategoryName: string;
  merchant:        string;
  amount:          number;
  cash:            number;
  voucher:         number;
  surplus:         number;
  kind:            DetailedReturnBucket;
  reason:          string;
  returnedBy:      string;
  lineCount:       number;   // how many receipt lines the return points at
}

export interface ReturnAnalyticsResult {
  kpi:        ReturnKpi;
  monthly:    ReturnMonthlyPoint[];
  byCategory: ReturnRankRow[];
  byMerchant: ReturnRankRow[];
  products:   ReturnedProductRow[];
  recent:     RecentReturnRow[];
}

export const RECENT_LIMIT = 15;

export function kindOf(r: Pick<AnalyzedReturn, "kind" | "reason">): ReturnKindBucket {
  if (r.kind === "reimbursement") return "reimbursement";
  if (r.kind === "deposit")       return "deposit";
  if (r.kind === "store")         return "store";
  // Legacy rescue: the batch panels always wrote these exact reasons, so
  // pre-kind bottle/LuxMed entries can still be bucketed correctly.
  if (r.reason === "Zwrot butelek") return "deposit";
  if (r.reason === "Zwrot LuxMed")  return "reimbursement";
  return "unknown";
}

/** Who reimbursed — only meaningful for the "reimbursement" bucket.
 *  Explicit source wins; legacy LuxMed entries resolve to "company";
 *  everything else defaults to "person" (family/friends is the common case). */
export function sourceOf(r: Pick<AnalyzedReturn, "source" | "reason">): ReturnSourceBucket {
  if (r.source === "company")      return "company";
  if (r.source === "person")       return "person";
  if (r.reason === "Zwrot LuxMed") return "company";
  return "person";
}

export function detailedKindOf(
  r: Pick<AnalyzedReturn, "kind" | "source" | "reason">,
): DetailedReturnBucket {
  const bucket = kindOf(r);
  return bucket === "reimbursement" ? sourceOf(r) : bucket;
}

/** Only store-ish returns feed the store-facing rankings and the rate. */
const countsAsStore = (bucket: ReturnKindBucket) =>
  bucket === "store" || bucket === "unknown";

export function buildReturnAnalytics(
  transactions: ReturnAnalyticsTx[],
  months: string[],
): ReturnAnalyticsResult {
  const monthSet = new Set(months);

  const kpi: ReturnKpi = {
    total: 0, cash: 0, voucher: 0, surplus: 0, count: 0,
    store: 0, reimbursement: 0, reimbursementPerson: 0, reimbursementCompany: 0,
    deposit: 0, unknown: 0,
    expensesGross: 0, returnRate: 0,
  };

  const monthly = new Map<string, ReturnMonthlyPoint>();
  for (const m of months) {
    monthly.set(m, { month: m, store: 0, person: 0, company: 0, deposit: 0, unknown: 0, surplus: 0 });
  }

  const byCategory = new Map<string, ReturnRankRow>();
  const byMerchant = new Map<string, ReturnRankRow>();
  const products   = new Map<string, ReturnedProductRow>();
  const recent: RecentReturnRow[] = [];

  const rankRow = (map: Map<string, ReturnRankRow>, id: string, name: string): ReturnRankRow => {
    let row = map.get(id);
    if (!row) { row = { id, name, returned: 0, spent: 0, rate: 0, count: 0 }; map.set(id, row); }
    return row;
  };

  for (const tx of transactions) {
    const isExpenseInRange = tx.type === "EXPENSE" && monthSet.has(tx.budgetMonth);
    const merchant = (tx.merchant ?? "").trim();

    // Denominators: gross spend per range / category / merchant.
    if (isExpenseInRange) {
      kpi.expensesGross += tx.amount;
      rankRow(byCategory, tx.categoryId, tx.categoryName).spent += tx.amount;
      if (merchant) rankRow(byMerchant, merchant, merchant).spent += tx.amount;
    }

    for (const ret of tx.returns ?? []) {
      if (!monthSet.has(ret.moneyReturnedInMonth)) continue;
      const bucket   = kindOf(ret);
      const detailed = detailedKindOf(ret);
      const surplus  = ret.surplusAmount ?? 0;

      kpi.total   += ret.amount;
      kpi.cash    += ret.cashAmount    ?? 0;
      kpi.voucher += ret.voucherAmount ?? 0;
      kpi.surplus += surplus;
      kpi.count   += 1;
      kpi[bucket] += ret.amount;
      if (detailed === "person")  kpi.reimbursementPerson  += ret.amount;
      if (detailed === "company") kpi.reimbursementCompany += ret.amount;

      const point = monthly.get(ret.moneyReturnedInMonth)!;
      point[detailed] += ret.amount;
      point.surplus   += surplus;

      if (countsAsStore(bucket)) {
        const catRow = rankRow(byCategory, tx.categoryId, tx.categoryName);
        catRow.returned += ret.amount;
        catRow.count    += 1;
        if (merchant) {
          const mRow = rankRow(byMerchant, merchant, merchant);
          mRow.returned += ret.amount;
          mRow.count    += 1;
        }

        for (const r of ret.returnedLineItems ?? []) {
          const li      = tx.lineItems?.[r.index];
          const tracked = !!li?.product?.name;
          const name    = li?.product?.name ?? r.description ?? li?.description ?? "—";
          const key     = foldText(name).trim();
          let row = products.get(key);
          if (!row) { row = { name, tracked, count: 0, amount: 0 }; products.set(key, row); }
          row.count  += 1;
          row.amount += r.amount;
          row.tracked = row.tracked || tracked;
        }
      }

      recent.push({
        date:            ret.returnedAt || ret.moneyReturnedInMonth,
        categoryName:    tx.categoryName,
        subcategoryName: tx.subcategoryName ?? "",
        merchant,
        amount:          ret.amount,
        cash:            ret.cashAmount    ?? 0,
        voucher:         ret.voucherAmount ?? 0,
        surplus,
        kind:            detailed,
        reason:          ret.reason     ?? "",
        returnedBy:      ret.returnedBy ?? "",
        lineCount:       ret.returnedLineItems?.length ?? 0,
      });
    }
  }

  kpi.returnRate = kpi.expensesGross > 0
    ? ((kpi.store + kpi.unknown) / kpi.expensesGross) * 100
    : 0;

  const finishRank = (map: Map<string, ReturnRankRow>) =>
    [...map.values()]
      .filter(r => r.returned > 0)
      .map(r => ({ ...r, rate: r.spent > 0 ? (r.returned / r.spent) * 100 : 0 }))
      .sort((a, b) => b.returned - a.returned || a.name.localeCompare(b.name));

  return {
    kpi,
    monthly:    months.map(m => monthly.get(m)!),
    byCategory: finishRank(byCategory),
    byMerchant: finishRank(byMerchant),
    products:   [...products.values()]
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)),
    recent:     recent
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_LIMIT),
  };
}
