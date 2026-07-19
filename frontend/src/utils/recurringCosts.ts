// ============================================================
// File: src/utils/recurringCosts.ts
// Pure logic for the "Pełzanie kosztów stałych" analytics card.
//
// RecurringDoc.costs[] is already a price-change history (one entry per
// {validFrom, amount}), so nothing is inferred from transactions here —
// this module only reads the definitions:
//   - monthlyEquivalent: normalizes any frequency to a monthly cost, so
//     a yearly insurance and a monthly subscription add up honestly,
//   - costTimeline: month-by-month "cost of living" baseline,
//   - priceChanges: raises/decreases straight from costs[] pairs,
//   - subscriptionRows: current per-subscription table with annual cost.
//
// In-force vs occurrence: isActiveInMonth (useRecurring) answers "does a
// payment HAPPEN this month" (quarterly docs hit 4× a year). The cost
// baseline needs "is the obligation IN FORCE this month" instead —
// that's isInForce below, sharing the same validity fields.
//
// Everything here is a pure function — see recurringCosts.test.ts.
// ============================================================

import { getActiveCost } from "../hooks/useRecurring";
import type { RecurringDoc } from "../types/appContext";

type RecurringCost = NonNullable<RecurringDoc["costs"]>[number];

// ── Types ─────────────────────────────────────────────────────

export interface CostTimelinePoint {
  month: string;
  total: number;   // PLN / month, normalized across frequencies
}

export interface PriceChange {
  id:           string;
  description:  string;
  categoryName: string;
  validFrom:    string;   // month the new price starts
  fromAmount:   number;   // PLN, raw (per occurrence)
  toAmount:     number;
  deltaPct:     number;   // (to − from) / from × 100
  monthlyDelta: number;   // PLN / month, normalized — comparable across docs
}

export interface SubscriptionRow {
  id:            string;
  description:   string;
  categoryName:  string;
  monthlyCost:   number;
  annualCost:    number;
  sinceFirstPct: number | null;   // price drift vs the first cost entry; null = never changed
}

// ── Building blocks ───────────────────────────────────────────

const costPLN = (entry: RecurringCost | null): number =>
  entry ? (entry.amountPLN ?? entry.amount) : 0;

/** Per-occurrence amount → PLN per month for the doc's frequency. */
export function monthlyFactor(doc: RecurringDoc): number {
  switch (doc.frequency) {
    case "quarterly": return 1 / 3;
    case "biannual":  return 1 / 6;
    case "yearly":    return 1 / 12;
    case "custom":    return (doc.activeMonths?.length ?? 0) / 12;
    case "monthly":
    default:          return 1;
  }
}

export function monthlyEquivalent(doc: RecurringDoc, month: string): number {
  return costPLN(getActiveCost(doc, month)) * monthlyFactor(doc);
}

/** The obligation exists in `month` (regardless of whether a payment lands). */
export function isInForce(doc: RecurringDoc, month: string): boolean {
  if (!doc.costs?.length) return false;
  if (doc.isArchived && (!doc.archivedFrom || doc.archivedFrom <= month)) return false;
  if (month < doc.costs[0].validFrom) return false;
  if (doc.validTo && month > doc.validTo) return false;
  return true;
}

// ── Aggregations ──────────────────────────────────────────────

/** Month-by-month normalized cost baseline over the given months. */
export function costTimeline(docs: RecurringDoc[], months: string[]): CostTimelinePoint[] {
  return months.map(month => ({
    month,
    total: docs.reduce(
      (sum, doc) => sum + (isInForce(doc, month) ? monthlyEquivalent(doc, month) : 0),
      0,
    ),
  }));
}

/** Every price change across all docs, newest first. Decreases included. */
export function priceChanges(docs: RecurringDoc[]): PriceChange[] {
  const changes: PriceChange[] = [];
  for (const doc of docs) {
    const costs = [...(doc.costs ?? [])].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    const factor = monthlyFactor(doc);
    for (let i = 1; i < costs.length; i++) {
      const from = costPLN(costs[i - 1]);
      const to   = costPLN(costs[i]);
      if (from <= 0 || from === to) continue;
      changes.push({
        id:           doc.id,
        description:  doc.description,
        categoryName: doc.categoryName,
        validFrom:    costs[i].validFrom,
        fromAmount:   from,
        toAmount:     to,
        deltaPct:     ((to - from) / from) * 100,
        monthlyDelta: (to - from) * factor,
      });
    }
  }
  return changes.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
}

/** Changes whose new price starts inside the [first, last] month window. */
export function changesInRange(changes: PriceChange[], months: string[]): PriceChange[] {
  if (months.length === 0) return [];
  const first = months[0], last = months[months.length - 1];
  return changes.filter(ch => ch.validFrom >= first && ch.validFrom <= last);
}

/** Per-subscription table for the obligations in force at `month`. */
export function subscriptionRows(docs: RecurringDoc[], month: string): SubscriptionRow[] {
  return docs
    .filter(doc => isInForce(doc, month))
    .map(doc => {
      const monthlyCost = monthlyEquivalent(doc, month);
      const first   = costPLN(doc.costs?.[0] ?? null);
      const current = costPLN(getActiveCost(doc, month));
      return {
        id:            doc.id,
        description:   doc.description,
        categoryName:  doc.categoryName,
        monthlyCost,
        annualCost:    monthlyCost * 12,
        sinceFirstPct: first > 0 && first !== current ? ((current - first) / first) * 100 : null,
      };
    })
    .sort((a, b) => b.monthlyCost - a.monthlyCost);
}
