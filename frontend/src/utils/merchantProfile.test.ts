// ============================================================
// File: src/utils/merchantProfile.test.ts
//
// Unit tests for the pure logic of the merchant profile card.
//
// Run with:   npm test
// Watch:      npm run test:watch
//
// Coverage targets:
//   - buildMerchantProfile: grouping, netting returns, share math,
//     visit frequency, last visit, sparkline series, months filter
//   - micro-spending detection: frequency + below-average basket rule
// ============================================================

import { describe, it, expect } from "vitest";
import {
  buildMerchantProfile,
  MICRO_MIN_VISITS_PER_MONTH,
  MICRO_TOP_N,
  type MerchantTx,
} from "./merchantProfile";

// ── Fixtures ─────────────────────────────────────────────────

const MONTHS = ["2026-05", "2026-06"];

function tx(o: Partial<MerchantTx> & Pick<MerchantTx, "amount">): MerchantTx {
  return {
    type:        o.type ?? "EXPENSE",
    date:        o.date ?? "2026-06-10",
    budgetMonth: o.budgetMonth ?? "2026-06",
    merchant:    o.merchant ?? "Żabka",
    amount:      o.amount,
    receiptId:   o.receiptId,
    returns:     o.returns,
  };
}

/** N same-shop visits of `amount`, spread across days of 2026-06. */
function visits(merchant: string, amounts: number[]): MerchantTx[] {
  return amounts.map((amount, i) =>
    tx({ merchant, amount, date: `2026-06-${String(i + 1).padStart(2, "0")}` }));
}

// ── buildMerchantProfile ─────────────────────────────────────

describe("buildMerchantProfile", () => {
  it("aggregates visits, totals, averages and share per shop", () => {
    const { rows } = buildMerchantProfile(
      [...visits("Żabka", [10, 20]), ...visits("Lidl", [70])],
      MONTHS,
    );
    expect(rows.map(r => r.merchant)).toEqual(["Lidl", "Żabka"]);   // by total desc
    const zabka = rows[1];
    expect(zabka).toMatchObject({ visits: 2, total: 30, avgBasket: 15, share: 30 });
  });

  it("computes visit frequency over the range length", () => {
    const { rows } = buildMerchantProfile(visits("Żabka", [10, 10, 10, 10]), MONTHS);
    expect(rows[0].visitsPerMonth).toBe(2);   // 4 visits / 2 months
  });

  it("counts one visit per receipt, not per split transaction", () => {
    // OCR cart: one Auchan receipt split into 3 category transactions.
    const { rows } = buildMerchantProfile([
      tx({ merchant: "Auchan", amount: 120, receiptId: "rcp_1" }),
      tx({ merchant: "Auchan", amount: 60,  receiptId: "rcp_1" }),
      tx({ merchant: "Auchan", amount: 20,  receiptId: "rcp_1" }),
      tx({ merchant: "Auchan", amount: 90,  receiptId: "rcp_2", date: "2026-06-20" }),
    ], MONTHS);
    expect(rows[0].visits).toBe(2);
    expect(rows[0].avgBasket).toBe(145);   // (200 + 90) / 2 receipts
  });

  it("falls back to merchant+date for manual entries without receiptId", () => {
    const { rows } = buildMerchantProfile([
      tx({ amount: 10, date: "2026-06-10" }),
      tx({ amount: 5,  date: "2026-06-10" }),   // same day → same visit
      tx({ amount: 8,  date: "2026-06-11" }),
    ], MONTHS);
    expect(rows[0].visits).toBe(2);
  });

  it("tracks the last visit date and per-month series", () => {
    const { rows } = buildMerchantProfile([
      tx({ amount: 10, date: "2026-05-20", budgetMonth: "2026-05" }),
      tx({ amount: 30, date: "2026-06-02" }),
    ], MONTHS);
    expect(rows[0].lastVisit).toBe("2026-06-02");
    expect(rows[0].byMonth).toEqual({ "2026-05": 10, "2026-06": 30 });
  });

  it("nets returns like the Top sklepy bar", () => {
    const { rows } = buildMerchantProfile([
      tx({ amount: 100, returns: [{ moneyReturnedInMonth: "2026-06", cashAmount: 40 }] }),
    ], MONTHS);
    expect(rows[0].total).toBe(60);
  });

  it("skips non-expenses, untagged shops and months outside the range", () => {
    const { rows } = buildMerchantProfile([
      tx({ amount: 10, type: "INCOME" }),
      tx({ amount: 10, merchant: "  " }),
      tx({ amount: 10, budgetMonth: "2026-04" }),
    ], MONTHS);
    expect(rows).toHaveLength(0);
  });
});

// ── Micro-spending detection ─────────────────────────────────

describe("micro-spending detection", () => {
  it("flags frequent shops with a below-average basket", () => {
    const { micro } = buildMerchantProfile(
      [...visits("Żabka", [14, 14, 14, 14]), ...visits("Auchan", [300])],
      MONTHS,
    );
    expect(micro.map(m => m.merchant)).toEqual(["Żabka"]);
    expect(MICRO_MIN_VISITS_PER_MONTH).toBe(2);
  });

  it("ignores frequent shops with a big basket", () => {
    const { micro } = buildMerchantProfile(
      [...visits("Auchan", [300, 300, 300, 300]), ...visits("Kiosk", [5])],
      MONTHS,
    );
    expect(micro).toHaveLength(0);   // Auchan frequent but above the average
  });

  it("ignores rare shops regardless of basket size", () => {
    const { micro } = buildMerchantProfile(
      [...visits("Kiosk", [5]), ...visits("Auchan", [300])],
      MONTHS,
    );
    expect(micro).toHaveLength(0);
  });

  it("finds nothing with a single shop (average = its own basket)", () => {
    const { micro } = buildMerchantProfile(visits("Żabka", [10, 10, 10, 10]), MONTHS);
    expect(micro).toHaveLength(0);
  });

  it("caps the list at MICRO_TOP_N, most visits first", () => {
    const { micro } = buildMerchantProfile([
      ...visits("A", [5, 5, 5, 5, 5, 5]),
      ...visits("B", [5, 5, 5, 5, 5]),
      ...visits("C", [5, 5, 5, 5, 5]),
      ...visits("D", [4, 4, 4, 4]),
      ...visits("Auchan", [500, 500]),
    ], MONTHS);
    expect(micro.map(m => m.merchant)).toEqual(["A", "B", "C"]);
    expect(MICRO_TOP_N).toBe(3);
  });
});
