// ============================================================
// File: src/utils/returnAnalytics.test.ts
//
// Unit tests for the pure logic of the "Analiza zwrotów" section.
//
// Coverage targets:
//   - KPI totals: amount/cash/voucher/surplus, kind buckets, return rate
//   - month attribution by moneyReturnedInMonth, out-of-range dropped
//   - store rankings: reimbursements excluded, unknown treated as store,
//     per-category / per-merchant rates against gross spend
//   - returned products from returnedLineItems (tracked flag, name fold)
//   - recent list: newest first, capped
// ============================================================

import { describe, it, expect } from "vitest";
import {
  buildReturnAnalytics,
  kindOf,
  sourceOf,
  detailedKindOf,
  RECENT_LIMIT,
  type AnalyzedReturn,
  type ReturnAnalyticsTx,
} from "./returnAnalytics";

// ── Fixtures ─────────────────────────────────────────────────

function ret(o: Partial<AnalyzedReturn> & { amount: number }): AnalyzedReturn {
  return {
    moneyReturnedInMonth: "2026-01",
    cashAmount:           o.cashAmount ?? o.amount,
    ...o,
  };
}

function tx(o: Partial<ReturnAnalyticsTx> & { amount: number }): ReturnAnalyticsTx {
  const budgetMonth = o.budgetMonth ?? "2026-01";
  return {
    type:         "EXPENSE",
    date:         `${budgetMonth}-10`,
    categoryId:   "cat_food",
    categoryName: "Jedzenie",
    ...o,
    budgetMonth,
  };
}

const MONTHS = ["2026-01", "2026-02", "2026-03"];

// ── kindOf ───────────────────────────────────────────────────

describe("kindOf", () => {
  it("maps the field to buckets, legacy entries to unknown", () => {
    expect(kindOf({ kind: "store" })).toBe("store");
    expect(kindOf({ kind: "reimbursement" })).toBe("reimbursement");
    expect(kindOf({ kind: "deposit" })).toBe("deposit");
    expect(kindOf({})).toBe("unknown");
    expect(kindOf({ kind: null })).toBe("unknown");
  });

  it("rescues legacy batch entries by their hardcoded reasons", () => {
    expect(kindOf({ reason: "Zwrot butelek" })).toBe("deposit");
    expect(kindOf({ reason: "Zwrot LuxMed" })).toBe("reimbursement");
    expect(kindOf({ reason: "uszkodzony produkt" })).toBe("unknown");
    // An explicit kind always wins over the reason heuristic.
    expect(kindOf({ kind: "store", reason: "Zwrot butelek" })).toBe("store");
  });
});

describe("sourceOf / detailedKindOf", () => {
  it("resolves who reimbursed, with person as the default", () => {
    expect(sourceOf({ source: "company" })).toBe("company");
    expect(sourceOf({ source: "person" })).toBe("person");
    expect(sourceOf({})).toBe("person");
    expect(sourceOf({ reason: "Zwrot LuxMed" })).toBe("company");   // legacy LuxMed
  });

  it("flattens kind × source for charts and filters", () => {
    expect(detailedKindOf({ kind: "store" })).toBe("store");
    expect(detailedKindOf({ kind: "reimbursement" })).toBe("person");
    expect(detailedKindOf({ kind: "reimbursement", source: "company" })).toBe("company");
    expect(detailedKindOf({ reason: "Zwrot LuxMed" })).toBe("company");
    expect(detailedKindOf({ kind: "deposit" })).toBe("deposit");
    expect(detailedKindOf({})).toBe("unknown");
  });
});

// ── KPI ──────────────────────────────────────────────────────

describe("buildReturnAnalytics — KPI", () => {
  it("sums amounts, splits cash/voucher/surplus and kind buckets", () => {
    const txs = [
      tx({ amount: 100, returns: [
        ret({ amount: 30, cashAmount: 20, voucherAmount: 10, kind: "store" }),
        ret({ amount: 15, kind: "reimbursement", surplusAmount: 2 }),
      ] }),
      tx({ amount: 50, budgetMonth: "2026-02", returns: [
        ret({ amount: 5, moneyReturnedInMonth: "2026-02" }),   // legacy, no kind
      ] }),
    ];
    const { kpi } = buildReturnAnalytics(txs, MONTHS);
    expect(kpi.total).toBe(50);
    expect(kpi.cash).toBe(40);
    expect(kpi.voucher).toBe(10);
    expect(kpi.surplus).toBe(2);
    expect(kpi.count).toBe(3);
    expect(kpi.store).toBe(30);
    expect(kpi.reimbursement).toBe(15);
    expect(kpi.reimbursementPerson).toBe(15);   // no source → person by default
    expect(kpi.reimbursementCompany).toBe(0);
    expect(kpi.unknown).toBe(5);
    expect(kpi.expensesGross).toBe(150);
    // Rate counts only store-ish returns — reimbursements aren't a quality signal.
    expect(kpi.returnRate).toBeCloseTo((35 / 150) * 100, 5);
  });

  it("buckets deposits and legacy batch entries out of the store rate", () => {
    const txs = [
      tx({ amount: 100, returns: [
        ret({ amount: 10, kind: "deposit" }),
        ret({ amount: 8,  reason: "Zwrot butelek" }),   // legacy bottle deposit
        ret({ amount: 20, reason: "Zwrot LuxMed" }),    // legacy LuxMed refund
        ret({ amount: 5,  kind: "store" }),
      ] }),
    ];
    const { kpi, byCategory, recent } = buildReturnAnalytics(txs, MONTHS);
    expect(kpi.deposit).toBe(18);
    expect(kpi.depositCount).toBe(2);
    expect(kpi.reimbursement).toBe(20);
    expect(kpi.reimbursementCompany).toBe(20);   // legacy LuxMed → company
    expect(kpi.store).toBe(5);
    expect(kpi.unknown).toBe(0);
    expect(kpi.returnRate).toBeCloseTo(5, 5);           // 5 / 100
    expect(byCategory[0].returned).toBe(5);             // rankings: store only
    // Deposits stay out of the recent list (bottle batches flood it).
    expect(recent).toHaveLength(2);
    expect(recent.every(r => r.kind !== "deposit")).toBe(true);
  });

  it("drops returns whose return month is outside the range", () => {
    const txs = [
      tx({ amount: 100, returns: [
        ret({ amount: 30, moneyReturnedInMonth: "2025-12" }),  // before range
        ret({ amount: 10, moneyReturnedInMonth: "2026-03" }),
      ] }),
    ];
    const { kpi } = buildReturnAnalytics(txs, MONTHS);
    expect(kpi.total).toBe(10);
    expect(kpi.count).toBe(1);
  });

  it("counts gross expenses only for purchase months inside the range", () => {
    const txs = [
      tx({ amount: 100 }),
      tx({ amount: 999, budgetMonth: "2025-11" }),
      tx({ amount: 40, type: "TRANSFER" }),   // not an expense
    ];
    const { kpi } = buildReturnAnalytics(txs, MONTHS);
    expect(kpi.expensesGross).toBe(100);
  });
});

// ── Monthly attribution ──────────────────────────────────────

describe("buildReturnAnalytics — monthly", () => {
  it("attributes by moneyReturnedInMonth, not the purchase month", () => {
    const txs = [
      tx({ amount: 100, budgetMonth: "2026-01", returns: [
        ret({ amount: 30, moneyReturnedInMonth: "2026-03", kind: "store", surplusAmount: 5 }),
        ret({ amount: 10, moneyReturnedInMonth: "2026-01", kind: "reimbursement" }),
      ] }),
    ];
    const { monthly } = buildReturnAnalytics(txs, MONTHS);
    expect(monthly.map(m => m.month)).toEqual(MONTHS);
    expect(monthly[2]).toMatchObject({ store: 30, surplus: 5, person: 0 });
    expect(monthly[0]).toMatchObject({ store: 0, person: 10 });
    expect(monthly[1]).toMatchObject({ store: 0, person: 0, company: 0, unknown: 0, surplus: 0 });
  });
});

// ── Store rankings ───────────────────────────────────────────

describe("buildReturnAnalytics — rankings", () => {
  const txs = [
    tx({ amount: 200, merchant: "Reserved", categoryId: "cat_cloth", categoryName: "Ubrania", returns: [
      ret({ amount: 50, kind: "store" }),
    ] }),
    tx({ amount: 100, merchant: "Reserved", categoryId: "cat_cloth", categoryName: "Ubrania" }),
    tx({ amount: 80, merchant: "Biedronka", returns: [
      ret({ amount: 40, kind: "reimbursement" }),   // mom — must not smear the shop
    ] }),
    tx({ amount: 60, merchant: "Lidl", returns: [
      ret({ amount: 6 }),                            // legacy → counts as store
    ] }),
  ];

  it("excludes reimbursements, keeps legacy entries, computes rates", () => {
    const { byMerchant } = buildReturnAnalytics(txs, MONTHS);
    expect(byMerchant.map(r => r.name)).toEqual(["Reserved", "Lidl"]);   // no Biedronka
    const reserved = byMerchant[0];
    expect(reserved.returned).toBe(50);
    expect(reserved.spent).toBe(300);
    expect(reserved.rate).toBeCloseTo((50 / 300) * 100, 5);
  });

  it("aggregates by category the same way", () => {
    const { byCategory } = buildReturnAnalytics(txs, MONTHS);
    expect(byCategory.map(r => r.name)).toEqual(["Ubrania", "Jedzenie"]);
    expect(byCategory[1].returned).toBe(6);   // only Lidl's legacy return
  });
});

// ── Returned products ────────────────────────────────────────

describe("buildReturnAnalytics — products", () => {
  it("names allocations from the tracked product, folds duplicates, skips reimbursements", () => {
    const items = [
      { description: "MasloOrzech 500g", amount: 13.49, product: { name: "Masło Orzechowe" } },
      { description: "Por", amount: 5.99 },
    ];
    const txs = [
      tx({ amount: 19.48, lineItems: items, returns: [
        ret({ amount: 13.49, kind: "store", returnedLineItems: [{ index: 0, description: "MasloOrzech 500g", amount: 13.49 }] }),
      ] }),
      tx({ amount: 19.48, budgetMonth: "2026-02", lineItems: items, returns: [
        ret({ amount: 19.48, moneyReturnedInMonth: "2026-02", kind: "store", returnedLineItems: [
          { index: 0, description: "MasloOrzech 500g", amount: 13.49 },
          { index: 1, description: "Por", amount: 5.99 },
        ] }),
        ret({ amount: 5, moneyReturnedInMonth: "2026-02", kind: "reimbursement", returnedLineItems: [
          { index: 1, description: "Por", amount: 5 },
        ] }),
      ] }),
    ];
    const { products } = buildReturnAnalytics(txs, MONTHS);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ name: "Masło Orzechowe", tracked: true, count: 2 });
    expect(products[0].amount).toBeCloseTo(26.98, 2);
    expect(products[1]).toMatchObject({ name: "Por", tracked: false, count: 1, amount: 5.99 });
  });
});

// ── Recent list ──────────────────────────────────────────────

describe("buildReturnAnalytics — recent", () => {
  it("sorts newest first and caps the list", () => {
    const manyReturns = Array.from({ length: RECENT_LIMIT + 5 }, (_, i) =>
      ret({ amount: 1, returnedAt: `2026-01-${String(i + 1).padStart(2, "0")}` }));
    const txs = [tx({ amount: 100, returns: manyReturns })];
    const { recent } = buildReturnAnalytics(txs, MONTHS);
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent[0].date).toBe(`2026-01-${RECENT_LIMIT + 5}`);
    expect(recent[0].date > recent[1].date).toBe(true);
  });

  it("carries the breakdown, kind and line count", () => {
    const txs = [
      tx({ amount: 100, merchant: "Rossmann", subcategoryName: "Kosmetyki", returns: [
        ret({
          amount: 20, cashAmount: 15, voucherAmount: 5, surplusAmount: 1,
          kind: "reimbursement", reason: "mama", returnedBy: "mp",
          returnedAt: "2026-01-15",
          returnedLineItems: [{ index: 0, description: "x", amount: 20 }],
        }),
      ] }),
    ];
    const { recent } = buildReturnAnalytics(txs, MONTHS);
    expect(recent[0]).toMatchObject({
      date: "2026-01-15", merchant: "Rossmann", subcategoryName: "Kosmetyki",
      amount: 20, cash: 15, voucher: 5, surplus: 1,
      kind: "person", reason: "mama", returnedBy: "mp", lineCount: 1,
    });
  });
});
